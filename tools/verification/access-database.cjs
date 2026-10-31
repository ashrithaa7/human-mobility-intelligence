const path = require('node:path')
const repositoryRoot = path.resolve(__dirname, '../..')
process.chdir(repositoryRoot)
const artifacts = path.join(__dirname, 'artifacts')
require('fs').mkdirSync(artifacts, { recursive: true })
const { PGlite } = require('@electric-sql/pglite')
const fs = require('fs'), assert = require('node:assert/strict')
;(async()=>{
 const db=new PGlite(), checks=[]
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`)
 await db.exec(fs.readFileSync('database/migrations/001_initial_schema.sql','utf8'))
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003']
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,'old@example.invalid')",[ids[0]])
 const migration=fs.readFileSync('database/migrations/002_access_workflow.sql','utf8')
 await db.exec(migration)
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[ids[0]])).rows[0].role,'public_user')
 await db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'new@example.invalid','{"role":"admin"}'),($2,'admin@example.invalid','{}')`,[ids[1],ids[2]])
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[ids[1]])).rows[0].role,'public_user')
 await db.query("UPDATE users SET role='admin' WHERE id=$1",[ids[2]])
 const as=async(id)=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')}
 await as(ids[0])
 assert.equal((await db.query('SELECT * FROM users')).rows.length,1)
 await assert.rejects(db.exec("UPDATE users SET role='admin'"),/permission denied/)
 await assert.rejects(db.exec("INSERT INTO planner_requests(user_id) VALUES(auth.uid())"),/permission denied/)
 checks.push('Legacy profile backfill; signup ignores role metadata; nonrecursive self-only RLS; direct escalation denied')
 const request=(await db.query("SELECT * FROM submit_planner_request('City Planning','Planner','I need to analyse transit stop coverage in the city.')")).rows[0]
 await assert.rejects(db.exec("SELECT submit_planner_request('City Planning','','A second request while the first is still pending.')"),/pending/)
 await assert.rejects(db.query("SELECT review_planner_request($1,'approved')",[request.id]),/Administrator/)
 await as(ids[1]);assert.equal((await db.query('SELECT * FROM planner_requests')).rows.length,0)
 await as(ids[2]);assert.equal((await db.query('SELECT * FROM users')).rows.length,3)
 const reviewed=(await db.query("SELECT * FROM review_planner_request($1,'approved','Verified organization')",[request.id])).rows[0]
 assert.equal(reviewed.reviewed_by,ids[2]);assert.equal(reviewed.status,'approved');assert.ok(reviewed.reviewed_at)
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[ids[0]])).rows[0].role,'planner')
 await assert.rejects(db.query("SELECT review_planner_request($1,'rejected')",[request.id]),/already been reviewed/)
 checks.push('Duplicate submission and cross-account reads denied; public cannot approve; admin approval grants role atomically with audit metadata')
 await as(ids[1]);const second=(await db.exec("SELECT * FROM submit_planner_request('Research Institute','','I need access for public transport service research.')"))[0].rows[0]
 await as(ids[2]);await db.query("SELECT review_planner_request($1,'rejected','Please give project details')",[second.id])
 await as(ids[1]);const third=(await db.exec("SELECT * FROM submit_planner_request('Research Institute','','Revised application with specific city planning project details.')"))[0].rows[0]
 await db.exec('RESET ROLE');await db.query('UPDATE users SET is_active=false WHERE id=$1',[ids[1]])
 await as(ids[2]);await assert.rejects(db.query("SELECT review_planner_request($1,'approved')",[third.id]),/inactive/)
 assert.equal((await db.query('SELECT status FROM planner_requests WHERE id=$1',[third.id])).rows[0].status,'pending')
 await as(ids[1]);await assert.rejects(db.exec("SELECT submit_planner_request('Research Institute','','Trying to submit from an inactive account profile.')"),/active account/)
 checks.push('Rejection preserves history and permits reapplication; inactive accounts blocked; failed approval leaves request unchanged')
 await db.exec('RESET ROLE');await db.exec(migration)
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[ids[0]])).rows[0].role,'planner')
 checks.push('Migration reruns without resetting existing roles')
 console.log(JSON.stringify({checks},null,2));fs.writeFileSync('tools/verification/artifacts/access-database-results.json',JSON.stringify({checks},null,2));await db.close()
})().catch(e=>{console.error(e);process.exit(1)})
