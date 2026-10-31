# Map, account workflow, and dataset review

This revision keeps the established slate/purple gradients, real data importer, GTFS relationships, analytics and reports. Source snapshots before changes are in `.implementation-backup/20261029-map-auth/`. No Git recovery was used.

## Map and usability fixes

- Replaced the legacy country-outline demonstration style with attributed OpenStreetMap street tiles. Custom full MapLibre styles remain configurable.
- Fit the view to actual coordinates, native geometry or the selected road route. A Fit to data button restores the extent. Switching between point and density views preserves the current camera.
- Removed external glyph loading from cluster counts. Previously, a delayed glyph request could hold the entire clustered source tile, leaving a basemap without any visible points. Counts now use the application's font through DOM labels.
- Default to clustered points; show named-stop popups, a scale, lighter density colours, and a legend. Density counts each displayed location equally; it does not measure passenger demand.
- Bound the area panel's height, enable independent scrolling, search names, highlight selection, and provide Show all. Counts for GTFS now say stops, including multiple platforms sharing a name. The map remains a bounded 5,000-location preview; selecting an area fetches that area from the server.
- Disable timetable filters that cannot change a static-stop map. Describe scheduled service separately from observed movement.

## Account workflow

`database/migrations/002_access_workflow.sql` was applied successfully to the live Supabase project. The initial checked-in schema had recursive role policies, no signup profile trigger, no allowed request insertion, and no atomic request/role approval. Live inspection found a newer signup trigger and request policy already present, so the migration was adapted to preserve their profile/phone behavior and audit access while adding the missing transactional workflow. The migration:

- Backfills missing profiles and creates public-user profiles on signup without trusting user-editable role metadata.
- Establishes public_user, planner and admin as the authoritative database roles. Inactive profiles cannot use protected operations.
- Replaces recursive profile/request policies with self/admin read policies and disables direct client role/status writes.
- Allows request submission and review only through narrowly scoped database functions. One pending request is enforced per user; rejected requests remain in history and allow reapplication.
- Atomically approves the request and promotes the profile, records the reviewer/date/note, and writes an audit entry. A repeated review cannot overwrite an earlier decision.
- Preserves existing roles, checks authenticated identities, and keeps existing orphan profiles rather than deleting account history during migration.

The frontend uses the current profile role, including admin access to planner tools, and shows actionable profile/schema errors. Request pages handle pending, rejected and approved states. Admin review shows the applicant and allows a review note. Session-aware API clients use Supabase's refreshed token rather than a stale duplicate local-storage token. Email confirmation returns to the browser that owns the session.

The backend now verifies the Supabase token and active profile for imports, source activation, report access and administrative operations. Former placeholder admin endpoints now query the real database/RPC. Next.js relays forward the verified bearer token. General source exploration and read-only analysis remain available through the existing data APIs; those datasets are not treated as private personal records.

## What the current data supports

The supplied `telangana_opendata_gtfs_tgsrtc_08_february_2026.zip` has **5,028 stops, 1,031 routes, 44,892 scheduled trips and 1,132,807 stop-time events**, with zero rejected or duplicate rows in the project's importer. It has no `shapes.txt`, passenger observations or configured realtime feed. Its service calendar runs from 2026-02-01 to 2031-02-01; that broad range does not establish that the timetable remains current.

This is sufficient for useful transit stop maps, stop distribution, timetable summaries, route/stop relationships and straight-line stop proximity. It cannot establish road-accurate bus paths, live vehicle movement, congestion, passenger demand, population accessibility, or the representativeness of observed human mobility. Import validation establishes structural consistency, not independent real-world accuracy.

Recommended data strategy:

1. **For the Hyderabad/Telangana transit experience:** keep this source, and obtain updates from [TGSRTC's official open-data page](https://tgsrtc.telangana.gov.in/open-data). Ask for current schedules and shapes where available. The agency explicitly publishes static transit data and does not guarantee update timeliness. Attribute TGSRTC; do not imply endorsement.
2. **For observed-movement demonstrations:** [Microsoft Research GeoLife](https://www.microsoft.com/en-us/research/project/geolife-building-social-networks-using-human-location-history/) provides a separate historical trajectory research source compatible with this project's GeoLife importer. It is not a substitute for current Hyderabad demand. Keep its geography, date range, provenance and limitations explicit.
3. **For actual local planning claims:** add authorized aggregate boarding/ridership counts, population data, and a suitable street/walking network. No single replacement file can supply all of those measurements reliably.

No new dataset was substituted simply to make a chart look more impressive. Original source data remains selected. The street basemap supplies geographic context independently of the mobility dataset. Browser tile requests preserve attribution and normal caching under the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/); configure a suitable provider/full style for a larger deployment.

## Verification and limits

- Backend: the map/access phase passed 80 tests; the final handoff passed 83 including configuration/readiness checks, actual parsing/analytics workflows and unauthenticated/incorrect-role rejection on privileged endpoints.
- Isolated PostgreSQL engine: profile backfill, signup role protection, RLS isolation, duplicate requests, admin approval, audit metadata, rejection/reapplication, failed approval rollback, inactive profiles and repeat migration passed.
- Headless browser: real active-source API responses and actual street tiles; desktop/mobile width, list scrolling/search, area focus, cluster/density views. Account UI tests use intercepted test sessions and do not change real user accounts.
- Frontend type check and production build passed. The final handoff resolved Next configuration/viewport warnings; backend dependency deprecation warnings remain.
- Live migration verification confirmed zero missing profiles, zero duplicate pending requests and both request/review functions present. A subsequent transaction tested actual signup/RLS/submission/approval/audit behavior and rolled back every temporary test identity and request. Existing accounts were preserved. Local connection files and maintenance snapshots are excluded from the repository.

New deployments must apply both migrations; the existing implementation project is already migrated. Configure `/auth/confirm` as an allowed authentication redirect for deployed origins. Actual email delivery and real user credentials are not validated by fixture-based browser tests. Use the reproducible tools and instructions in [TESTING.md](TESTING.md).
