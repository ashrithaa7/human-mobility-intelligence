-- Apply after 001 in the project's Supabase SQL editor. All changes are transactional.
BEGIN;
UPDATE public.users SET role = 'public_user' WHERE role IS NULL;
UPDATE public.users SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN is_active SET NOT NULL;
UPDATE public.planner_requests SET status='pending' WHERE status IS NULL;
ALTER TABLE public.planner_requests ALTER COLUMN status SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND confrelid='auth.users'::regclass AND contype='f') THEN
   ALTER TABLE public.users ADD CONSTRAINT hmi_users_auth_identity FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
 END IF;
END; $$;

-- Keep roles in the database, never in editable auth user_metadata.
CREATE OR REPLACE FUNCTION public.hmi_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active);
$$;
REVOKE ALL ON FUNCTION public.hmi_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hmi_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.hmi_create_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.users(id,email,first_name,last_name,phone,organization,role,is_active)
 VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name',
         nullif(regexp_replace(coalesce(NEW.raw_user_meta_data->>'phone',''),'[^0-9+]','','g'),''),
         NEW.raw_user_meta_data->>'organization', 'public_user', true)
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hmi_create_profile() FROM PUBLIC;
DROP TRIGGER IF EXISTS hmi_auth_profile ON auth.users;
-- Existing deployed profile trigger has been inspected; replace its equivalent
-- provisioning action, rather than running two inserts for every new account.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER hmi_auth_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.hmi_create_profile();
INSERT INTO public.users(id,email,first_name,last_name,organization,role,is_active)
 SELECT id,email,raw_user_meta_data->>'first_name',raw_user_meta_data->>'last_name',raw_user_meta_data->>'organization','public_user',true
 FROM auth.users WHERE email IS NOT NULL ON CONFLICT(id) DO NOTHING;

-- Repair recursive legacy policies and disallow client-side role/status writes.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('users','planner_requests','audit_logs') LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END; $$;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.planner_requests, public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.users, public.planner_requests, public.audit_logs TO authenticated;
CREATE POLICY hmi_audit_read ON public.audit_logs FOR SELECT TO authenticated USING (public.hmi_is_admin());
CREATE POLICY hmi_profile_read ON public.users FOR SELECT TO authenticated USING (id=auth.uid() OR public.hmi_is_admin());
CREATE POLICY hmi_request_read ON public.planner_requests FOR SELECT TO authenticated USING (
 public.hmi_is_admin() OR (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active))
);

-- Preserve request history while closing older duplicate pending submissions.
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY requested_at DESC,id DESC) AS n
 FROM public.planner_requests WHERE status='pending')
UPDATE public.planner_requests SET status='rejected',reviewed_at=now(),review_notes='Superseded by a newer pending request during workflow repair.'
 WHERE id IN (SELECT id FROM ranked WHERE n>1);
CREATE UNIQUE INDEX IF NOT EXISTS hmi_one_pending_request ON public.planner_requests(user_id) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.submit_planner_request(p_organization text,p_position text,p_reason text)
RETURNS public.planner_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile public.users; result public.planner_requests;
BEGIN
 SELECT * INTO profile FROM public.users WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT profile.is_active THEN RAISE EXCEPTION 'An active account profile is required.' USING ERRCODE='42501'; END IF;
 IF profile.role <> 'public_user' THEN RAISE EXCEPTION 'Your role already includes planner access.' USING ERRCODE='22023'; END IF;
 IF length(trim(coalesce(p_organization,''))) NOT BETWEEN 2 AND 255 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 20 AND 4000
    OR length(coalesce(p_position,''))>255 THEN RAISE EXCEPTION 'Provide an organization (2–255 characters) and a reason (20–4000 characters).' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.planner_requests WHERE user_id=auth.uid() AND status='pending') THEN
   RAISE EXCEPTION 'You already have a pending request.' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.planner_requests(user_id,organization,position,request_reason,status)
 VALUES(auth.uid(),trim(p_organization),nullif(trim(p_position),''),trim(p_reason),'pending') RETURNING * INTO result;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id) VALUES(auth.uid(),'planner_request_submitted','planner_request',result.id::text);
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.review_planner_request(p_request_id uuid,p_decision text,p_notes text DEFAULT NULL)
RETURNS public.planner_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.planner_requests; target public.users;
BEGIN
 IF NOT public.hmi_is_admin() THEN RAISE EXCEPTION 'Administrator access required.' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approved','rejected') OR p_decision IS NULL THEN RAISE EXCEPTION 'Invalid decision.' USING ERRCODE='22023'; END IF;
 SELECT * INTO result FROM public.planner_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.' USING ERRCODE='P0002'; END IF;
 IF result.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been reviewed.' USING ERRCODE='22023'; END IF;
 SELECT * INTO target FROM public.users WHERE id=result.user_id FOR UPDATE;
 IF NOT FOUND OR NOT target.is_active THEN RAISE EXCEPTION 'The requesting account is inactive or missing.' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' THEN
   UPDATE public.users SET role=CASE WHEN role='admin' THEN role ELSE 'planner'::public.user_role END,updated_at=now() WHERE id=result.user_id;
 END IF;
 UPDATE public.planner_requests SET status=p_decision::public.request_status,reviewed_at=now(),reviewed_by=auth.uid(),review_notes=left(p_notes,4000)
 WHERE id=p_request_id RETURNING * INTO result;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id) VALUES(auth.uid(),'planner_request_'||p_decision,'planner_request',result.id::text);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.submit_planner_request(text,text,text), public.review_planner_request(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_planner_request(text,text,text), public.review_planner_request(uuid,text,text) TO authenticated;
COMMIT;
