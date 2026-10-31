# Deployment and operations

This repository currently targets a local or small single-instance deployment. It is not a complete production hosting configuration.

## Runtime requirements

- Deploy Next.js and FastAPI as separate services, with a persistent writable directory for `backend/data`.
- Build Next.js using the intended `NEXT_PUBLIC_*` values; public values are baked into browser assets. Some planner calls reach FastAPI directly, so use a browser-reachable HTTPS API URL and exact allowed frontend origins.
- Use the same Supabase project URL/public anon key in both runtimes. Never place a database password or service-role key in `NEXT_PUBLIC_*` variables.
- Apply the ordered database migrations to new environments; configure Auth site/callback URLs, including `/auth/confirm`.
- Import and activate a licensed data source after deployment. A successful application build does not provision source data.

## Persistent state

Back up the complete local source directory and SQLite catalog consistently, including the active-source marker. Use SQLite's backup facility or stop writers; copying a live database file alone can omit pending WAL state. Supabase account/request/audit data has its own backup requirements.

Do not use ephemeral serverless storage for this SQLite implementation. Million-row GTFS import and initial summary preparation can take time and consume substantial disk space. The tested 10.5 MB transit archive produces a much larger indexed database. Multiple application instances need a deliberate shared-storage/database design; independently copied catalogs will diverge.

## Access model

Privileged imports/activation, admin actions and report APIs require verified sessions/roles on FastAPI as well as the relevant frontend relays. General active-source data and read-only analysis endpoints are public. Do not load confidential location histories into a publicly reachable instance without changing that authorization boundary and implementing the necessary privacy controls.

Planner reports are shared per dataset, not per-user private documents. Account deactivation and broader role administration currently use a trusted database operator. There is no approval-notification email job.

## External services

- Use a street-tile provider appropriate for expected usage, with required attribution and caching. The default OpenStreetMap service is best-effort, not a guaranteed commercial SLA. Full MapLibre styles can be configured without changing application code.
- Configure a suitable OSRM-compatible routing endpoint for sustained use. Road times are estimates, not live traffic predictions.
- Configure only authorized, documented GTFS-Realtime feeds and inject provider secrets through the deployment environment. The app does not invent a live feed.

## Health and verification

`/api/health` reports the catalog check and authentication configuration separately. `/api/health/ready` requires catalog availability and configured account verification; it does not probe every remote provider or prove a key is valid. Monitor request failures as well.

Run backend tests, frontend type checks/builds, SQL-policy tests and browser checks described in [TESTING.md](TESTING.md). For a release, validate real account login/email-confirmation settings and authorized data import in the target environment. Review dependency updates and provider terms as part of release operations.

## Repository hygiene

The `.gitignore` excludes environment credentials, source archives, local catalogs, ad-hoc backups, investigation dumps, logs and generated test/build output. Commit the application code, dependency manifests/lockfiles, SQL migrations, small test fixtures and documentation. Keep deployment configuration examples free of real secrets.

## Planning data persistence

Keep `backend/data/planning/hyderabad.gpkg`, its `manifest.json` and `scenarios.sqlite3` on persistent storage. The first two are reproducible public-source layers; the scenario database contains private user decision notes and must not be published or served as a static asset. Prepare layers before exposing planner assessments. A missing preparation reports unavailable rather than fabricated example metrics. Back up the scenario database consistently with SQLite before maintenance.
