# Local setup

Run commands from the directory containing `frontend`, `backend`, `database` and this `docs` directory. If the repository was cloned into a parent workspace, enter `mobility-intelligence` first.

## Prerequisites

- Node.js 22 and npm. The verified workstation used Node 22.16; `frontend/package-lock.json` records frontend dependencies.
- Python 3.11 or newer. The implementation was tested using Python 3.14.3; scientific dependency wheels must be available for your chosen Python/platform.
- A Supabase project with email/password authentication and access to its SQL editor for initial setup.
- Internet access for Supabase, street tiles and optional routing; mobility analysis itself uses the local catalog.

## 1. Configure accounts

For a **new** Supabase database, apply `database/migrations/001_initial_schema.sql`, then `002_access_workflow.sql` in the SQL editor. Migration 001 creates types/tables and is not a repeatedly runnable reset script. Migration 002 repairs the initial policies and adds profile creation and transactional request submission/review.

For an existing project, inspect its schema before applying migrations. The implementation project's live database has already received migration 002; do not run 001 over it.

In Supabase Auth URL configuration, add the frontend origin as the site URL and allow these local callback URLs as appropriate:

```text
http://localhost:3000/auth/confirm
http://127.0.0.1:3000/auth/confirm
```

Add your HTTPS deployment origin later. If email confirmation is enabled, users must follow the email link before signing in. Do not disable confirmation merely to work around a configuration error.

The runtime needs the project URL and public anon key, **not** a service-role key or database password. Keep database-owner connection strings outside committed files. For the first administrator, see [AUTHENTICATION.md](AUTHENTICATION.md).

## 2. Backend

PowerShell:

```powershell
cd backend
py -3 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` locally. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the same project used by the frontend. `FRONTEND_ORIGINS` is a JSON array, for example:

```env
FRONTEND_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

Start the backend:

```powershell
$env:DEBUG = 'false'
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Using the virtual environment executable directly avoids activation-policy problems. Shell environment variables override `.env`; the explicit boolean above also avoids an inherited `DEBUG=release` value causing a settings error.

On macOS/Linux, create the environment using `python3 -m venv venv` and use `venv/bin/python` instead.

## 3. Frontend

In a second terminal:

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
```

Edit `frontend/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`: the same Supabase project URL as the backend.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: that project's public anon key.
- `NEXT_PUBLIC_API_BASE_URL`: `http://127.0.0.1:8000` locally.
- Leave `NEXT_PUBLIC_MAP_STYLE_URL` empty for the street basemap. The legacy MapLibre demo-style URL is also mapped to the street default.

Then run `npm.cmd run dev` and open **http://localhost:3000**. Use `npm` without `.cmd` on other platforms. Restart Next.js after changing its environment file.

## 4. Import the first source

1. Register and sign in; bootstrap one administrator through the SQL editor.
2. Open **Admin → Data sources** (`/admin/data`).
3. Select a supported file, preview its detected format/fields, and resolve any ambiguous mappings or ZIP table selection.
4. Record its source, timezone, license and attribution. Confirm import.
5. Import activates the source. For an already imported source, select it from the catalog and activate it.
6. Open `/dashboard/maps` and `/dashboard/insights`. Test a selected area, then reset with **Show all**.

A fresh clone has no active source. Raw downloaded archives and the workstation's 374 MB SQLite database are intentionally excluded. Use the [data guide](MOBILITY_DATASETS.md) to obtain suitable licensed input; do not present an unknown sample as measured population movement.

## 5. Verify

- `http://127.0.0.1:8000/api/health` checks the actual SQLite catalog and separately reports account configuration.
- `/api/health/ready` returns 503 when the catalog or required authentication configuration is unavailable. It does not prove that a supplied Supabase key or remote service is healthy.
- `http://127.0.0.1:8000/docs` exposes the FastAPI contract.
- Run the checks in [TESTING.md](TESTING.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Account profile missing / workflow migration required | Both migrations and the signup trigger; inspect Supabase errors rather than inventing a client role |
| Request fails | Active public profile, no pending request, organization length 2–255, reason length 20–4000, current RPC schema |
| Admin cannot approve | Current active admin role; RPC must update request and role in one transaction |
| Data unavailable | Backend running, source imported and explicitly activated, correct API base URL |
| Map lacks local streets | Custom style configuration, tile-provider access and attribution; use the default street style |
| No passenger-demand chart | Static GTFS is insufficient evidence; this is a data limitation |
| No realtime vehicles | No valid provider is configured by default |
| `npm.ps1` execution-policy error | Use `npm.cmd` in PowerShell |
| Build interferes with dev | Set `HMI_NEXT_DIST_DIR` for an isolated verification build as shown in TESTING.md |

Do not copy local passwords, `.env` files or account snapshots into issue reports.

## Prepare the city-planning workspace

Follow [HYDERABAD_DATA_CATALOG.md](HYDERABAD_DATA_CATALOG.md) to reproduce the nine layers. From the repository root: `backend/venv/Scripts/python.exe tools/prepare_planning_data.py --download`. This uses installed geospatial dependencies and does not change the active public dataset. Prepared data and private planning briefs need persistent `backend/data/planning` storage. A fresh clone contains code and validation evidence, not the multi-gigabyte source archives. Approved planners enter `/planner/dashboard`; public users requesting that workspace are directed to request access.
