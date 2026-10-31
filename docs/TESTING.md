# Verification

The latest completed run is recorded in [verification-results.json](verification-results.json); the commands below reproduce the maintained checks.

Run these from the project root unless a command changes directory. Runtime services are separate from production-build verification. Do not replace a running dev server's `.next` output during a build.

## Backend

```powershell
cd backend
$env:DEBUG = 'false'
.\venv\Scripts\python.exe -m pytest -q
```

Coverage includes file-content detection, flexible mapping, Excel/JSON/GeoJSON/ZIP/GeoLife/GTFS handling, unsafe archives, relationship errors, failed-import preservation, source activation, aggregate semantics, shared reports and privileged endpoint rejection. Configuration tests check the example environment, realtime settings and honest readiness behavior.

## Frontend

```powershell
cd frontend
npm.cmd run type-check
$env:HMI_NEXT_DIST_DIR = '.next-verification'
npm.cmd run build
Remove-Item Env:HMI_NEXT_DIST_DIR
```

Next may add that temporary output's types path to `tsconfig.json`; do not commit a developer-specific output path. With development stopped, plain `npm.cmd run build` uses the default output. `npm.cmd test` in the frontend runs the browser regression below and requires its tools and running services. There is no configured Jest suite or standalone lint command; misleading legacy scripts have been removed/replaced.

## Isolated SQL-policy tests

This uses PGlite's PostgreSQL engine and does not connect to or mutate a real Supabase project.

```powershell
cd tools/verification
npm.cmd ci
npm.cmd test
```

The test initializes the checked-in migrations and verifies profile backfill, default roles, self-only reads, denied escalation, one pending request, approved/rejected transitions, audit fields, inactive-account rejection and repeat migration behavior.

## Browser regression

Run both application services first and activate the TGSRTC source described in the data guide. The runner uses the **real active-source data API and street tiles** while intercepting test authentication and request responses. It never signs up or modifies real accounts.

```powershell
cd tools/verification
npm.cmd run test:browser
```

Windows uses installed Chrome when available. Otherwise install the Playwright browser with `npx playwright install chromium`, or set `HMI_CHROME_EXECUTABLE` to your browser executable. Set `HMI_TEST_BASE_URL` to override the local frontend origin.

Checks include actual rendered point/cluster features, cluster click-to-zoom, Fit to data, density toggle, area search/selection, independent list scrolling, mobile overflow, request submission/pending/reapplication, admin access to planner tools and public-role denial of protected pages. It collects page errors and tile HTTP failures. Results/screenshots are written to ignored `tools/verification/artifacts/`.

The browser fixture expects a GTFS source with matching Abids stop names and multiple areas. Use a separate small test fixture when adapting the runner to a different dataset; do not silently change production source data to satisfy a test.

## Live migration verification

During implementation, the configured Supabase database was tested inside a transaction with temporary identities. Signup/profile creation, RLS, duplicate rejection, non-admin rejection, atomic approval and audit records passed. The transaction was rolled back and test rows were confirmed absent. This is separate from mocked browser auth; it does not establish email delivery or a real user's login credentials.

Live database connection strings and maintenance snapshots stay local, outside the shareable repository. Do not point a routine test suite at a production database.

## Before sharing

With ripgrep installed, run:

```powershell
node tools/check-repository.cjs
```

It evaluates the ignore-aware file list without Git commands, checks for accidentally included local runtime files, and compares included text against credential values found in local environment files without printing those values. It is a scoped check, not a general secret-scanner replacement. Review the intended files before your own push.

## Planner regression checks

The backend suite includes metric length/distance/area tests, polygon-union checks, out-of-envelope rejection, request bounds, authentication and owner-isolated briefs. Once the data is prepared and both servers are running, generate real-data browser fixtures and run:

```powershell
.\backend\venv\Scripts\python.exe tools/verification/planning-fixtures.py
node tools/verification/planning-workflow.cjs
```

Install `tools/verification` dependencies first as described above. Browser authentication and planning HTTP are intercepted; calculated metrics originate from the actual prepared layers. This verifies route behavior, six objectives, rendered map evidence, comparison/export, stale-result protection and mobile width. Server authorization and database isolation are tested separately. This does not sign in to the real user's account or submit a real-user brief.
