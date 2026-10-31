# API guide

FastAPI is the canonical analytical API. Run it locally at `http://127.0.0.1:8000`; browse `/docs` for current request schemas and `/openapi.json` for the machine-readable contract. Next.js on port 3000 relays selected paths and implements road routing.

## Authentication

Protected endpoints require `Authorization: Bearer <current Supabase access token>`. They verify both identity and the current active database role. Never send a public anon key as the user's bearer token. Missing sessions return 401, insufficient role/account state returns 403, and unavailable account configuration/services can return 503.

| FastAPI endpoint | Access / purpose |
| --- | --- |
| `GET /api/health`, `/api/health/ready` | Public process/catalog/configuration status |
| `GET /api/data` | Public active-source record preview; maximum 5,000 rows per request |
| `GET /api/data/available`, `/api/data/summary` | Public catalog/coverage summaries |
| `GET /api/data/overview`, `/api/data/features` | Public computed suitability/quality and bounded geographic features |
| `GET /api/data/mapping-profiles` | Mapping profile metadata; do not store secrets in profiles |
| `POST /api/data/preview`, `/api/data/import` | Admin; stream raw file body and filename/metadata query parameters |
| `POST /api/data/activate?filename=…` | Admin; choose a ready catalog source |
| `POST /api/analytics/spatial`, `/temporal`, `/hotspots`, `/corridors`, `/accessibility`, `/recommendations`, `/compare` | Public source-supported computations |
| `GET/POST/DELETE /api/analytics/reports` | Planner/admin; shared reports for the active source |
| `GET /api/admin/users`, `/api/admin/requests` | Admin; actual Supabase records |
| `POST /api/admin/requests/{id}/approve`, `/reject` | Admin; transactional review RPC |
| `GET /api/realtime/feeds`, `/api/realtime/feeds/{id}` | Configured provider metadata/results; no provider enabled by default |

## Data queries

`GET /api/data` accepts `limit`, `offset`, `region`, `country`, `state`, `city`, `start`, `end`, `hour`, and a bounding box (`west`, `south`, `east`, `north`). A supplied `dataset` must match the admin-selected active source. `end` is exclusive where date filtering is supported. Response metadata includes returned/matching counts and whether more rows exist. GTFS previews contain static stops; date/hour controls do not convert those stops into observed trips.

For import, send the actual file bytes with `filename`. Additional options include source metadata, `dataset_type`, `column_mapping` JSON, timezone/date format, reusable profile information and `archive_member` for mixed ZIPs. The administrator UI is the preferred client because it previews and submits the current supported parameter set. Validation errors include an import report where available; failed imports preserve the previous source.

## Analysis requests

```json
{
  "data_mode": "historical",
  "parameters": {
    "region": "Abids Gpo"
  }
}
```

Example PowerShell:

```powershell
$body = @{ data_mode = 'historical'; parameters = @{ region = 'Abids Gpo' } } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8000/api/analytics/spatial -Method Post -ContentType application/json -Body $body
```

Accessibility accepts `latitude`, `longitude`, and `radius_meters`. Comparison accepts a `regions` array. Results describe their measurement basis; temporal responses include hourly/daily/weekly/monthly structures when supported. Do not assume a corridor always contains coordinate arrays: named origin/destination flows, trajectories, GTFS connections and native shapes have different schemas. Synthetic fallback is not silently substituted.

## Next.js-specific routes

- `/api/data/import?operation=preview|activate`: authenticated admin relay. The usual import operation is the default. It forwards the user's bearer token to FastAPI.
- `/api/analytics/reports`: planner/admin relay, also forwarding the bearer token.
- `/api/auth/user`: verified profile. `/api/auth/callback` forwards to the browser-owned `/auth/confirm` session flow.
- `/api/travel/route?from=longitude,latitude&to=longitude,latitude`: validated coordinate pairs sent to the configured OSRM-compatible service. Returns route geometry, distance and estimated duration, explicitly not live traffic.

The API base URL is configured in the frontend environment. Browser-facing direct FastAPI calls require the correct CORS origins. An active source is global to the deployment, and report visibility is shared across planners/admins, not tenant-scoped.

## Planning endpoints (31 October 2026)

All `/api/planning/*` routes require an active planner/admin Bearer session. The Next.js relay uses the same paths and also verifies the role.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/planning/catalog` | Prepared layer inventory, provenance and readiness |
| POST | `/api/planning/assess` | One/two-site spatial screening, metrics and map features |
| GET | `/api/planning/scenarios` | Current user's latest 50 saved decision briefs |
| POST | `/api/planning/scenarios` | Recompute and save a private decision brief |

Assessment body: `{"objective":"amenities","radius_m":1000,"sites":[{"name":"Abids","latitude":17.3913,"longitude":78.4768}]}`. Radius 250?3000 m; one or two sites; objective `landuse`, `infrastructure`, `amenities`, `active_mobility`, `roads`, or `policy`. Saving adds `title` (3?150 characters) and `notes` (up to 5000 characters). A full study circle must fit within the prepared envelope. Invalid parameters return 422, unavailable prepared data 503, absent session 401, disallowed role 403.
