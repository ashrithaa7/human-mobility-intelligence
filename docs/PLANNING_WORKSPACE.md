# Hyderabad city planning workspace

Implemented 31 October 2026. This is decision support for comparing locations, not a statutory approval service or an optimisation solver.

## Roles and entry points

Public users enter `/dashboard`; approved planners enter `/planner/dashboard`; administrators enter `/admin/dashboard` and can also open the planning workspace. Visiting the generic `/dashboard` now redirects planners and administrators to their role home. Public exploration subpages remain accessible to planners.

The landing page's planner button opens `/login?next=/planner/dashboard`. Login checks the **active database profile**, not a selected role or signup metadata. A public account using that entry point goes to `/request-access`. Missing or inactive profiles display an error instead of silently falling back to the public dashboard. Both the routed login page and shared login component follow this behavior.

For normal onboarding: register → confirm email if required → request access → administrator reviews → approved role becomes planner. One existing account was explicitly granted planner access by the project owner during setup; the change was verified and audited. No personal account details or credentials are included in this repository.

## Planner workflow

1. Choose one of six objectives: land use, infrastructure, amenity siting, active mobility, roads, or policy/master planning.
2. Name one or two candidate locations. Enter WGS84 latitude/longitude, or select a candidate's placement button and click the map. Normal map clicks inspect feature details.
3. Select a 250–3,000 metre study radius and click **Assess locations**.
4. Compare calculated metrics and inspect the objective's map layers and review priorities. Changing inputs invalidates the displayed result and disables saving it until recomputed.
5. Record the preferred alternative, rationale, trade-offs and field checks. Save a private decision brief or export Markdown for team discussion, reports and presentations.

Existing mobility analytics, source exploration, realtime status and mobility reports remain available. The separate prepared planning layers do not replace the administrator's globally active mobility dataset.

## What each objective supports

| Objective | Implemented evidence | Additional evidence needed for a final decision |
| --- | --- | --- |
| Land use | Mapped use classes, union area by class, coverage percentage, uses intersecting the candidate | Official zoning, cadastral ownership, development permissions, environmental constraints |
| Infrastructure | Scheduled stop counts/proximity, roads and waterways | Utilities capacity, operational service checks, population and investment costs |
| Amenity siting | Mapped education, health and open-space features; nearest straight-line distance | Facility capacity, opening hours, missing facilities, catchment population, accessibility |
| Active mobility | Explicit footway, pedestrian, cycleway, path and steps lengths; map context | Sidewalk inventory, safe crossings, gradients, shade, disability access, network continuity |
| Road networks | Clipped centreline length by road class, rail/waterway context | Traffic counts, junction movements, turn restrictions, lane capacity, right-of-way and engineering design |
| Policy/master planning | Comparative evidence, water intersection flag, documented reasoning, saved/exported brief | Official plans and amendments, statutory buffers, consultation, impact appraisal |

## Computation and interpretation

Geometries are stored in EPSG:4326 and projected into UTM 44N (EPSG:32644) for metre-based buffers, lengths and areas. The complete geometry intersecting the study circle is queried with the GeoPackage spatial index and clipped before measurement. Land-use coverage is the area of the union of all mapped land-use polygons divided by circle area. Each class also uses a union; overlapping classes can still overlap each other and must not be summed as an exclusive land budget.

Nearest facilities and stops are measured only inside the requested circle. A missing result means **not mapped within the radius**, not proof that no facility exists. Distances are to mapped geometries; a polygon-edge distance is not a building entrance distance. Amenity nodes and polygons are retained separately and may represent the same establishment. Counts are mapped features, not unique facilities or people. Steps are included in explicit active paths but are not evidence of wheelchair access. Ordinary roads may have unmapped sidewalks.

The map shows at most 1,500 features per layer per site, with displayed/total counts. Metrics use all intersecting records. Geometry is simplified by 3 metres for display only. Overlapping candidate circles are separate alternatives; their totals must not be added together.

The study envelope is `[77.8, 16.8, 79.2, 18.1]` (west, south, east, north). It covers a broad Hyderabad metropolitan study area, not an official HMDA polygon. Assessments crossing the prepared extent are rejected to prevent silently incomplete metrics.

## Storage, API and code

- `tools/prepare_planning_data.py`: reproducible layer preparation and quality report.
- `backend/data/planning/hyderabad.gpkg`: spatially indexed prepared layers, excluded from Git.
- `backend/data/planning/manifest.json`: source dates, hashes, attribution and validation.
- `backend/app/services/planning.py`: spatial calculations and owner-isolated scenario storage.
- `backend/app/routers/planning.py`: planner/admin-only catalog, assessment and scenario endpoints.
- `frontend/app/api/planning/[resource]/route.ts`: authenticated relay, verifies current role on every request.
- `frontend/components/dashboard/PlanningWorkspace.tsx`: objectives, alternatives, comparison and briefs.
- `frontend/components/map/PlanningMap.tsx`: thematic evidence map and location selection.
- `backend/data/planning/scenarios.sqlite3`: private briefs keyed by the authenticated user ID, excluded from Git; retain on persistent storage and back up with the other databases.

`GET /api/planning/catalog`, `POST /api/planning/assess`, `GET /api/planning/scenarios`, and `POST /api/planning/scenarios` require a verified active planner/admin bearer session. Assessment input contains `objective`, `radius_m` and one or two `sites` (`name`, `latitude`, `longitude`). Saving adds `title` and `notes`; the backend recomputes the assessment instead of trusting client-supplied results. Listing returns the current user's latest 50 briefs, including for administrators. Briefs contain source evidence, metrics and notes but exclude the large map geometry payload.

## Remaining limits

No population-weighted optimisation, engineering road design, network walking isochrones, traffic simulation, statutory zoning validation or causal policy forecasting is implemented. The interface provides real screening calculations and a review workflow for these objectives. Additional authoritative inputs and validated models are needed before expanding the claims. No actual live passenger-demand or utility-capacity data is currently configured.
