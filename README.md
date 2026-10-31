# Human Mobility Intelligence

A source-aware mobility and transit analysis application for exploring geographic coverage, timetable patterns, trajectories, and planning evidence. It uses real imported data and explains when a source cannot support an analysis.

The current local demonstration uses a historical Telangana TGSRTC GTFS feed. **Scheduled services are not observed passenger journeys.** The project does not claim to measure live congestion or passenger demand from static schedules.

## Start here

| Document | Purpose |
| --- | --- |
| [Setup](docs/SETUP.md) | Install, configure Supabase, run both services, import the first dataset |
| [Architecture](docs/ARCHITECTURE.md) | Components, storage, request flow, and code ownership |
| [Project story and flow](docs/PROJECT_STORY_AND_FLOW.md) | PPT/report material, diagrams, demonstration script and team responsibilities |
| [Planner guide](docs/PLANNING_WORKSPACE.md) | Six objectives, candidate comparisons, methods and decision briefs |
| [Hyderabad data catalog](docs/HYDERABAD_DATA_CATALOG.md) | Nine cleaned layers, provenance, preparation commands and evidence gaps |
| [Push to GitHub](docs/PUBLISH_TO_GITHUB.md) | First-push commands and teammate onboarding |
| [Project status and handoff](docs/PROJECT_STATUS.md) | Completed work, validation, limitations, next priorities |
| [Authentication and roles](docs/AUTHENTICATION.md) | Account lifecycle, permissions, migrations, administrator setup |
| [Data guide](docs/MOBILITY_DATASETS.md) | Supported formats, measurements, limits, and data recommendations |
| [API guide](docs/API.md) | Endpoints, authentication, parameters, errors |
| [Testing](docs/TESTING.md) | Reproducible backend, database-policy, browser and build checks |
| [Deployment](docs/DEPLOYMENT.md) | Persistent storage, configuration, operational constraints |
| [Contributing](CONTRIBUTING.md) | Team workflow and change expectations |

## What users can do

- **Public users:** explore mapped points and geographic features, search covered areas, compare source-supported temporal/spatial patterns, and obtain road-route estimates.
- **Planners:** compare candidate locations across six city-planning objectives, inspect real prepared geospatial layers, save private decision briefs, export Markdown, and use the existing mobility analytics/reports.
- **Administrators:** import and activate datasets, inspect import quality, review planner requests, and view accounts. Administrators also have planner access.

The interface keeps the established slate/purple gradients. Maps show street context, clustered stops, named-location popups, a lighter density view, and a searchable coverage list that scrolls independently.

## Technology and storage

| Layer | Implementation |
| --- | --- |
| Frontend | Next.js App Router, React, TypeScript, Tailwind, MapLibre GL, Recharts |
| Backend | FastAPI, Python, pandas and geospatial services |
| Accounts | Supabase Auth and PostgreSQL profiles, requests, policies and audit logs |
| Mobility data | Local SQLite catalog, indexed observations, related GTFS tables and analysis caches |
| External services | OpenStreetMap street tiles, configurable OSRM routing, optional GTFS-Realtime providers |

```text
frontend/             Pages, shared UI, maps, and Next.js API relays
backend/app/          API routes, authorization, importers and analytical services
backend/tests/        Automated backend regression tests and small fixtures
database/migrations/  Ordered Supabase SQL migrations
tools/verification/   Isolated SQL-policy and browser test tools
docs/                 Setup, architecture, API, status and handoff documents
```

## Run locally

Follow [SETUP.md](docs/SETUP.md) for first-time credentials and schema setup. After configuration, use two terminals:

```powershell
# Terminal 1, from the repository root
cd backend
$env:DEBUG = 'false'
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2, from the repository root
cd frontend
npm.cmd run dev
```

Open **http://localhost:3000**. Backend API documentation is at **http://127.0.0.1:8000/docs**.

## Repository boundaries

Environment files, passwords, local account snapshots, raw downloaded datasets, the SQLite catalog, logs, build outputs and investigation backups are excluded. Copy `.env.example` files and provision your own Supabase project or obtain authorized team configuration. Download/import licensed data separately; a fresh clone does not contain the current workstation's selected dataset.

The live Supabase access-workflow repair was applied and transactionally verified during the October 2026 implementation. New environments still need both migrations. See the [status document](docs/PROJECT_STATUS.md) for exactly what was tested and what remains outside the implementation's claims.
