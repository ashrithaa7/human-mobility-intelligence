# Accounts, roles and planner access

Supabase Auth establishes identity. `public.users.role` and `is_active` determine application privileges. JWT user metadata and old request statuses are not substitutes for the current profile role.

## Permission matrix

| Action | Public user | Planner | Admin |
| --- | --- | --- | --- |
| Public dashboard / map / temporal / insights / road planner | Yes | Yes | Yes |
| Apply for planner access | Yes, if active and no pending request | Already has access | Already has access |
| Planner pages and shared report management | No | Yes | Yes |
| Preview/import/activate datasets | No | No | Yes |
| View all profiles and planner requests | No | No | Yes |
| Approve/reject planner applications | No | No | Yes |
| Direct client writes to roles or request status | No | No | No; use the review RPC |

The UI requires a signed-in active profile for dashboard pages. The underlying general data and read-only analytics APIs currently serve the active **public** source without requiring a user token. This is an intentional deployment boundary, not protection for confidential location data. Import/activation, admin actions, and report APIs are independently protected on FastAPI and the applicable Next.js relays.

## Lifecycle

1. Signup inserts an Auth identity. `hmi_auth_profile` creates a public profile, ignoring any attempted role in signup metadata.
2. The user verifies their email when enabled, signs in, and receives the public dashboard.
3. `/request-access` calls `submit_planner_request`. PostgreSQL checks account state, input lengths and the unique pending-request constraint.
4. `/admin/users` shows the applicant, organization, reason and history. Review notes are visible to the applicant.
5. `review_planner_request` locks the request/account, checks the current admin, promotes an approved profile and records status/reviewer/time/notes in one transaction. It writes audit records as well.
6. Rejected users can revise and reapply. A pending request cannot be duplicated. Already reviewed requests cannot be reviewed a second time.
7. Planner/admin navigation derives from the current profile. Refreshing or refocusing a protected page rechecks access.

There is no implemented email notification for approval/rejection. Applicants revisit the request page or sign in again to see their current access. Do not promise an approval email in UI copy.

## Database migrations

- `001_initial_schema.sql`: original types and tables. Apply once to a new database.
- `002_access_workflow.sql`: self/admin RLS, signup/backfill, account constraints, one-pending index, request/review functions and audit rules. It preserves existing roles and history. Older duplicate pending requests are marked superseded; they are not deleted.

The live project was inspected before migration 002: it already contained one admin, a profile trigger, and newer read/insert policies than migration 001 described. The replacement trigger preserves profile/phone handling and avoids double inserts. A local role/request/policy snapshot was saved before application; it is deliberately excluded from Git.

Migration 002 was applied successfully. Actual PostgreSQL transaction tests verified signup, scoped reads, denied role escalation, duplicate prevention, non-admin denial, atomic approval and audit entries. All temporary identities and requests were rolled back. Existing real roles were preserved.

## First administrator on a new project

Register normally first. A trusted database owner can then run the following in the Supabase SQL editor, replacing the example email with the intended account. This is a provisioning operation, not an endpoint available to normal users.

```sql
UPDATE public.users
SET role = 'admin', updated_at = now()
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'your-admin@example.com'
)
RETURNING id, role;
```

Confirm that exactly the intended row was updated, then sign in again. Do not commit a real administrator's password or a hardcoded privileged seed account. `database/seed.sql` intentionally creates no users.

## Runtime and maintenance credentials

Frontend: Supabase URL/public anon key. Backend: same URL/public anon key. Protected requests send the user's current bearer token; FastAPI verifies it with Supabase Auth and reads the active profile under that user's authorization.

Database-owner passwords are only for migrations/maintenance and are not needed to run the application. The workstation's connection file and snapshots remain in ignored local tooling. Use TLS verification with Supabase's CA when connecting directly. Store deployment secrets in the hosting platform's secret manager.

Role removal and account deactivation currently require a trusted database administrator; there is no general role-editor UI. The system does not yet implement per-user private analytical reports or private-source tenancy.
