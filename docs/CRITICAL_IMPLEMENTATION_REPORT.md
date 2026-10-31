> Historical implementation-phase record. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the completed handoff, current validation and known limits.

# Critical implementation report

Completed against the existing application on 29 October 2026. No Git history or recovery commands were used.

## Running website and backup

- Frontend: `http://localhost:3000`; backend: `http://127.0.0.1:8000`. The old non-reloading backend was serving obsolete API responses; it was replaced with the current project service. Other project services were left alone.
- Source/config backup: `.implementation-backup/20261029-195951/` (108 files). A consistent SQLite backup was also saved under its `backend/data/` directory before schema migration.
- The included Telangana archive was copied to staging and imported. The original archive remains at the project root. The local catalog now has a ready, active historical GTFS feed with **5,028 stops, 1,031 routes, 44,892 trips and 1,132,807 stop-time records**, with **zero rejected or duplicate rows**. These are scheduled services, not passenger journeys or live traffic.

## Import formats and schema mapping

Implemented and fixture-tested CSV, TSV, delimited/whitespace TXT, XLSX, XLS, JSON object/array/records/data tables, JSON Lines/NDJSON, GeoJSON, generic tabular ZIPs, static GTFS ZIPs and GeoLife PLT/ZIPs. Existing direct GeoLife-folder support remains. Binary signatures, JSON structure, ZIP contents and table headers participate in format detection; a GTFS ZIP or Excel workbook renamed to `.csv` is still parsed by its native reader.

ZIP inspection handles containing directories and validates member paths, Windows device/stream paths, symlinks, encryption, duplicate paths, entry/member/total sizes and compression ratios. Files are read from the archive into private staging basenames; archive paths are never extracted into the project. Compatible generic tables can be combined. Mixed schemas require the administrator to select a particular table in the preview rather than silently joining unrelated data. GTFS feeds are recognised and joined automatically.

The admin page previews columns, inferred types, null counts and sample rows. Canonical field mapping uses case/spacing normalisation, aliases and conservative fuzzy suggestions with confidence. Ambiguous fields require a deliberate choice; explicit skipped fields are preserved. Profiles save mappings, dataset type and date format. Manual date formats resolve ambiguous day/month order. A clock time without a date, an unqualified numeric epoch, or an incomplete year/month is not silently turned into an observation timestamp.

Schemas are separate for trajectories, geographic data, temporal events, indicators, named/coordinate OD flows and general tables. Static coordinates do not require dates. City/indicator/value/year/unit tables do not require GPS. GeoJSON boundaries and static routes can be activated and displayed without timestamped observations. Static line vertices are not treated as observed journeys; per-point timestamp arrays are required before line trajectories are inferred.

## GTFS validation and analysis

The dedicated importer inventories tables, validates columns/types and reports recognised files, row counts, missing requirements, warnings, errors, rejected rows and duplicate/invalid core-table differences. Core stop/route/trip/stop-time relationships remain in related SQLite tables. Agency, calendar exceptions, shapes, frequencies, feed information and recognised additional standard tables are retained; agency, service, parent-stop, shape and supported optional-table references are checked.

Times beyond 24:00 are retained as service seconds. Hourly charts fold them into clock hours and explicitly retain scheduled-service semantics. Recurring weekday totals describe service patterns; calendar exceptions are retained without inventing calendar-day passenger counts. Frequency windows and supplied headways are reported separately.

Large-file processing runs in worker threads. Timetable aggregation groups stop events before joining trip metadata. Exact static timetable/corridor summaries are persisted with source-update invalidation and a bounded cache. New GTFS imports prepare those summaries before activation when possible. On the included million-row feed, repeated store reads matched the computed results and took approximately 12 ms (temporal) and 25 ms (corridors); complete HTTP requests have additional overhead. First preparation still takes longer on large files.

## Dashboard sections

| Section | Computed result / limitation |
| --- | --- |
| Public, planner and admin overview | Source record counts, valid geocoded/dated records, geographic extent, time span, source metadata, import quality and actual analysis capabilities. GTFS shows separate stop/route/trip/event counts. |
| Spatial and hotspots | SQL grid aggregation and neighbouring high-weight-cell clusters, source point/stop semantics, geometry coverage and explanatory insufficient-data states. Angular cells are not presented as equal-area density. |
| Temporal | Hour/day/week/month distributions when source dates support them; date-only records do not invent an hour; GTFS patterns are labelled as scheduled stop events. |
| Corridors | Coordinate/named OD flows, first/last timed track inference, scheduled GTFS stop-to-stop segments, or static geometry length according to available evidence. Displays handle these schemas without assuming every row has coordinate arrays. |
| Urban indicators | Indicator min/mean/max grouped by indicator, unit, area and year. General fields expose quality/diversity and supported numeric summaries. Unlike units are not mixed. |
| Accessibility | Geocoded GTFS stop counts and selectable straight-line nearby-stop calculations. No claim of population coverage, walking-network access or passenger demand. |
| Reports | Saved backend-computed snapshots, recommendations with evidence/limitations, JSON export and deletion. Existing result JSON exports remain. |
| Maps and travel | Source points, heatmaps, native geometry/GTFS shapes, routes, markers, popups, controls and legends. Filtered bounded point previews are requested from the server; existing OSRM routing remains. |
| Live / near-real-time | Separate provider status/read workflow for explicitly declared Hyderabad feeds. No such feed is currently configured, so live analysis is correctly reported unavailable. |

## Floating-map root cause and structural fix

Actual browser DOM/computed-layout inspection reproduced the defect before editing: React changed the map root's `className` after loading, discarding MapLibre's added `maplibregl-map` class. Its position became `static`, while the child canvas remained `absolute` at page coordinates `(0, 0)` instead of the section's coordinates.

Both map components now keep a stable, measurable map root inside a scoped relative container with responsive height, overflow containment and stacking isolation. Loading/error layers are siblings inside that frame. ResizeObserver calls resize after layout changes; cleanup disconnects observers/removes old instances, and stale callbacks are guarded. Cluster expansion uses MapLibre 4's Promise API. No arbitrary offsets or excessive z-index values were added.

## Design and preserved behavior

The slate–purple gradient, purple/pink accents, translucent cards, borders, muted typography and responsive layouts from the source-based restoration are retained. New controls use the same theme. Map controls have a scoped dark-surface rule that survives library stylesheet ordering. The earlier design-only investigation remains documented in `DESIGN_RESTORATION.md`; its styling-only fingerprint result describes that earlier phase, not the functional implementation in this report.

Supabase sign-in, role checks, routing, existing upload metadata, API integration, result exports and road-route functionality remain. Source preview/import/activation still pass through the administrator-checked frontend route; report management checks planner/admin access. No real account was created or modified. Backend/catalog changes are additive. No frontend runtime dependencies were changed; only the necessary `openpyxl` and `xlrd` readers were added to backend requirements. The small XLS fixture is stored as a binary test asset; its generation tool is not a runtime dependency.

## Verification

- Backend: **66 tests passed**, including auth/API, all claimed formats, alternate mappings, date safeguards, valid/incomplete/corrupt/malicious ZIPs, GTFS references, static-geometry semantics, cache invalidation, catalog activation and report creation/list/delete.
- Frontend: `npm.cmd run type-check` passed.
- Production: `$env:HMI_NEXT_DIST_DIR = '.next-implementation-production'; npm.cmd run build` passed, including application/API compilation, type validation and page generation. Separate output protects the running development site.
- Browser: desktop/mobile map containment, scrolling, zoom, point popup, mode and dataset changes passed. Public GTFS maps, planner corridor/report UI, indicator-only dashboards, admin sample/manual mapping and mixed-schema ZIP table selection passed with **zero uncaught page errors**.
- Browser accounts/auth responses were test fixtures, with external authentication intercepted. These checks do not claim to validate a real user's Supabase credentials. Map tiles were replaced with a local test style for deterministic layout checks; external provider uptime is not guaranteed.
- Real local API checks returned HTTP 200 for the active source, overview, spatial, hotspots, temporal, corridors, accessibility, recommendations and live-feed configuration. The real source produced 1,948 spatial cells, 49 configured-method hotspots and 7 stops within the tested 500 m central-Hyderabad radius; these are source/stop metrics, not demand.
- Temporary verification routes were removed from application source and production output. Evidence/scripts/screenshots are under `.verification-tools/` (`map-layout-before.json`, `map-layout-after.json`, `workflow-results.json`).
- Final checks on the normal port returned HTTP 200 for all 15 application page URLs and the active catalog, and HTTP 401 for unauthenticated import/report mutations. Results are saved in `.verification-tools/final-site-check.json`.

## Deliberate limitations

Excel imports currently require one non-empty data sheet (one sheet for XLS). UTF-8 text is required. JSON/GeoJSON and workbooks are capped at 256 MB, JSON Lines rows at 8 MB, uploads at 1 GB, and ZIP expansion at 2 GB/100,000 members with additional per-member/ratio limits. Nested directories work; recursively nested archives are not expanded. Parquet, GeoPackage and shapefile imports are not claimed.

Legacy GTFS feeds missing agency identity or service calendars are accepted with explicit warnings where the four core tables are usable, preserving existing compatibility. This is not a claim of complete official GTFS conformance certification. Calendar exceptions/frequency windows are retained without expanding every operating date. Map/geometry/coverage previews are bounded. Geometry uses WGS84; projected-coordinate transformation and automatic geocoding of named OD zones are not implemented.

Existing Next configuration/viewport warnings and dependency deprecation warnings remain. The exact pre-damage headline/shadow/font treatment cannot be proven from the surviving source; the consistent reconstructed theme has been preserved. Live Hyderabad data remains unavailable until a provider is configured.

## Changed files

See the generated inventory below (relative to the project root). Runtime additions also include the ready GTFS copy in `backend/data/`, the additive catalog schema/summary cache, its active-source marker and backend log files. Original project-root datasets were not moved or overwritten.

- `backend/app/routers/analytics.py`
- `backend/app/routers/data.py`
- `backend/app/services/csv_loader.py`
- `backend/app/services/dataset_errors.py`
- `backend/app/services/dataset_insights.py`
- `backend/app/services/dataset_readers.py`
- `backend/app/services/gtfs_realtime.py`
- `backend/app/services/gtfs_validation.py`
- `backend/app/services/mobility_store.py`
- `backend/app/services/schema_mapping.py`
- `backend/app/services/tabular_reader.py`
- `backend/requirements.txt`
- `backend/tests/fixtures/tabular.xls`
- `backend/tests/test_flexible_datasets.py`
- `backend/tests/test_ingestion.py`
- `docs/DESIGN_RESTORATION.md`
- `frontend/app/(protected)/admin/dashboard/page.tsx`
- `frontend/app/(protected)/admin/data/page.tsx`
- `frontend/app/(protected)/dashboard/page.tsx`
- `frontend/app/(protected)/planner/analysis/page.tsx`
- `frontend/app/(protected)/planner/dashboard/page.tsx`
- `frontend/app/(protected)/planner/reports/page.tsx`
- `frontend/app/api/analytics/reports/route.ts`
- `frontend/app/api/data/[resource]/route.ts`
- `frontend/app/api/data/import/route.ts`
- `frontend/app/api/realtime/[...resource]/route.ts`
- `frontend/app/globals.css`
- `frontend/components/admin/DatasetImporter.tsx`
- `frontend/components/admin/SystemStatus.tsx`
- `frontend/components/analysis/AccessibilityAnalysis.tsx`
- `frontend/components/analysis/CorridorAnalysis.tsx`
- `frontend/components/analysis/ResultDetails.tsx`
- `frontend/components/charts/ActivityChart.tsx`
- `frontend/components/dashboard/AdminDashboard.tsx`
- `frontend/components/dashboard/DatasetOverview.tsx`
- `frontend/components/dashboard/PlannerDashboard.tsx`
- `frontend/components/dashboard/PublicDashboard.tsx`
- `frontend/components/dashboard/PublicFeatureWorkspace.tsx`
- `frontend/components/dashboard/RealtimeStatus.tsx`
- `frontend/components/dashboard/ReportsPanel.tsx`
- `frontend/components/map/HotspotMap.tsx`
- `frontend/components/map/InteractiveMap.tsx`
- `frontend/lib/api-client.ts`
