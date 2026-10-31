# Project status and team handoff

Updated: **31 October 2026**. This is the current context document; earlier implementation reports describe individual phases.

## Intended outcome

An understandable mobility/transit exploration and planning application whose maps, charts and reports are derived from the selected source and whose account workflows consistently enforce public, planner and administrator roles. The existing interface is retained, including its visual richness and gradients.

## Latest phase: Hyderabad city planning

- Fixed the routed login page's silent public fallback and generic dashboard role routing; the planner landing link now preserves planning intent.
- Granted the one explicitly authorised existing account planner access, verified the stored active role, and recorded the grant in the database audit log. Other accounts were unchanged.
- Replaced duplicated planner dashboard links with six-objective site screening, metric-radius comparison, thematic maps, owner-scoped saved briefs and Markdown export. Existing analytics and reports remain linked.
- Prepared nine real Hyderabad layers from the existing dated Geofabrik archive and TGSRTC feed. Removed 75 exact duplicates; no invalid output geometry remains. See [validation evidence](planning-data-validation.json).
- Added [project story / flow / PPT guide](PROJECT_STORY_AND_FLOW.md), [planner methods](PLANNING_WORKSPACE.md), [dataset catalog](HYDERABAD_DATA_CATALOG.md), and [GitHub publication instructions](PUBLISH_TO_GITHUB.md).
- These are preliminary planning tools. Population-weighted optimisation, engineering design, traffic simulation and official zoning validation remain outside the implementation.
- The owner chose to push locally after the GitHub connector reported read-only access. No remote commit or deployment was made by the assistant.

## Completed work

| Area | Delivered behavior |
| --- | --- |
| Visual restoration | Consistent slate/purple gradients, surfaces, navigation, forms and dashboard styling reconstructed from remaining source evidence |
| Ingestion | Flexible supported tabular/Excel/JSON/GeoJSON/GeoLife/ZIP import, preview and manual schema mapping; reusable mappings and clear validation reports |
| GTFS | Related tables and optional records preserved, required relationships checked, schedule semantics and after-midnight service times retained |
| Analytics | Source-derived overview, spatial/temporal summaries, corridors, proximity, comparisons, reports and recommendations; expensive GTFS summaries cached |
| Maps | Contained responsive canvas, street context, fitted bounds, reset-view control, functional point clusters, native geometry, popups and lighter density view |
| Coverage panel | Search, selected-area focus, accurate stop/row labels and independent bounded scrolling on desktop/mobile |
| Planner application | Pending/rejected/approved handling, no duplicate pending submission, reapplication, applicant details and reviewer notes |
| Authorization | Current active profile is authoritative; admin can use planner tools; public users cannot perform admin/report actions; server and SQL checks remain independent of navigation |
| Supabase | Live migration 002 applied after schema inspection/snapshot; signup/backfill, RLS and atomic approval/review audit verified; existing real roles preserved |
| Setup and operations | Parseable environment example, real local-catalog readiness, optional realtime settings wired, duplicate CDN map resources removed, valid Next viewport/build configuration |
| Team handoff | README, setup, architecture, roles, APIs, data guidance, testing, deployment and contribution docs; reproducible isolated test tools and repository exclusions |

## Validation evidence

The final machine-readable record is [verification-results.json](verification-results.json). It contains test outcomes without credentials, real account identifiers, or local connection strings.

- The final full backend run passed **94 tests**, including spatial planning and owner-isolated brief coverage, on 31 October 2026.
- Frontend type check and production build passed for the final handoff; all 33 static-generation units completed. The obsolete Next configuration/viewport warnings were resolved.
- Real-source browser checks confirmed rendered point/cluster features, click-to-zoom, density toggle, area search/focus, scrollable coverage and mobile width without page errors. Test authentication is intercepted; mobility data and street tiles are real.
- Isolated PostgreSQL tests cover schema creation, signup role protection, RLS reads, role escalation denial, duplicate requests, approval/rejection/reapplication, inactive accounts and repeat migration behavior.
- Live Supabase transaction checks passed signup, self-only reads, denied role escalation, duplicate prevention, non-admin review denial, atomic admin approval and audit records. Temporary identities/requests were rolled back and confirmed absent.
- The ignore-aware repository check excludes local environment files, credentials, catalogs, downloaded sources, backups, logs and generated output. No detected local credential values were found in shareable files.

## Current demonstration data

The historical TGSRTC archive has 5,028 stops, 1,031 routes, 44,892 scheduled trips and 1,132,807 stop-time events. It supports a useful transit coverage/timetable demonstration. It does not contain route shapes, real passenger movements or live traffic. Keep this distinction visible when presenting the project. See [MOBILITY_DATASETS.md](MOBILITY_DATASETS.md) for alternatives and next data requirements.

## Known limits and next priorities

1. Obtain current agency schedules and shape geometry if exact bus paths/current service claims are required. Add authorized aggregate passenger/population/network sources before making demand or population-accessibility claims.
2. Configure a documented realtime provider and validate its availability/credentials if live vehicle views are required. None is currently configured.
3. Validate target-environment email delivery and callback allowlists with real accounts. Database/RPC and fixture browser tests do not prove delivery of confirmation emails.
4. Excel currently supports one nonempty data sheet; previews and feature maps are bounded. The generic uploader does not accept Parquet, GeoPackage or shapefiles. The dedicated planner preparation pipeline now reads GeoPackage, transforms CRS and clips polygons; this does not extend the generic uploader.
5. The active mobility source is global and its older mobility reports are shared per dataset. New planning decision briefs are owner-scoped. Private datasets and full tenant separation require further design.
6. SQLite requires persistent storage and suits the current local/single-instance deployment. Distributed deployments, background job queues and import-progress streaming are future work.
7. General read-only data/analysis endpoints expose the active public source. Do not use the present access model for confidential personal trajectories.
8. The exact pre-damage visual design cannot be proven without historical source. The restoration follows surviving internal styles; it is not a claimed pixel-perfect recovery.
9. Password-reset UI, approval notification emails and a general role/deactivation editor are not implemented. Database operators can manage roles/account state deliberately.

## Team entry points

Frontend work: `frontend/components/dashboard`, `components/map`, `app/(auth)`, `app/(protected)` and `lib/access.ts`. Data/analysis work: `backend/app/services` and `routers`. Account rules: `database/migrations` and `backend/app/auth.py`. New contributors should follow [SETUP.md](SETUP.md), then [TESTING.md](TESTING.md).

The repository is prepared for the user's own Git push; no remote repository, deployment or publication was performed by this implementation task. Secrets and local account/database snapshots must remain local. Distribution licensing for the code is still a team decision.
