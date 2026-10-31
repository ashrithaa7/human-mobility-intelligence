# Data formats, meaning and source selection

The app analyzes the administrator-selected source. It stores normalized records, native geometry and related GTFS tables in `backend/data/mobility_catalog.sqlite3`. Record previews are bounded; summaries run against the indexed catalog. Source files, licenses and attribution remain important even when an import succeeds.

## Supported input

| Input | Supported behavior | Limits |
| --- | --- | --- |
| CSV / TSV / delimited TXT | Content/delimiter detection, chunked parsing, aliases and manual field mappings | UTF-8 text; malformed/ambiguous fields require correction or confirmation |
| XLSX / XLS | Excel readers and schema preview | One nonempty data sheet; no interactive sheet selector |
| JSON / JSONL / NDJSON | Supported record containers, line-delimited records, schema mapping | JSON/workbooks bounded to 256 MB; individual JSONL line up to 8 MB |
| GeoJSON | Preserve WGS84 points, lines and polygons; native feature map | No projected-coordinate conversion or polygon-to-observation joins |
| GeoLife PLT / ZIP | GPS trajectory coordinates/timestamps; folder-aware track IDs | Historic research data, not automatic local demand coverage |
| GTFS static ZIP | Dedicated multi-table importer, relationship checks, service times beyond 24:00 | Not a complete official GTFS conformance certification; some legacy core feeds receive warnings |
| Generic ZIP | Safe nested paths, supported table preview, explicit selection for mixed schemas | Nested directories supported; recursive ZIP-in-ZIP is not expanded |

Uploads are capped at 1 GB. ZIP checks also bound member/total expansion, compression ratio and entry count, and reject traversal, unsafe Windows filenames, duplicate paths, encrypted entries and links. Unsupported formats are rejected; **Parquet, GeoPackage and shapefile import are not implemented**, even if archives of those formats are present on someone's workstation.

## Mapping and suitability

Exact/normalized aliases are preferred. Ambiguous coordinates such as `x`/`y` require confirmation. Reusable mapping profiles simplify repeated imports. Date formats and source timezones must be explicit when ambiguous; the importer must not fabricate timestamps.

- Trajectories need identified coordinates and time ordering for meaningful inferred paths.
- Geographic sources can be useful without timestamps.
- Indicator tables can use area, indicator, value, unit and year without GPS columns.
- Named origin/destination flows can be summarized without silently geocoding names.
- GTFS uses its own stops/trips/routes/stop-times relationships rather than a forced trajectory schema.

Import reports expose recognized files, validation warnings, accepted/rejected/duplicate counts and errors. Their meaning is structural validity, not proof of real-world accuracy.

## Current transit demonstration

The historical file `telangana_opendata_gtfs_tgsrtc_08_february_2026.zip` was already present in the project and remains the selected local source:

| Measure | Count |
| --- | ---: |
| Stops | 5,028 |
| Routes | 1,031 |
| Scheduled trips | 44,892 |
| Scheduled stop-time events | 1,132,807 |
| Import-rejected / duplicate rows | 0 / 0 |

It is sufficient for transit-stop maps, service distribution, timetable patterns, route/stop relationships and straight-line stop proximity. It has **no `shapes.txt`**, so exact bus paths along streets cannot be reconstructed from this feed. Its calendar extends from 2026-02-01 to 2031-02-01; that range does not guarantee the schedule is current.

The map preview shows up to 5,000 locations, labels this bound, and fetches a selected area from the server. Nearby platforms may share a name; the area panel reports stop counts rather than population. Heatmap points have equal display weight, while analytical source event weights depend on the source schema.

## Recommended next data

- Obtain updated local static schedules and route shapes through [TGSRTC's official open-data page](https://tgsrtc.telangana.gov.in/open-data). Attribute TGSRTC and retain the published terms. The agency does not guarantee update timeliness.
- Use [Microsoft Research GeoLife](https://www.microsoft.com/en-us/research/project/geolife-building-social-networks-using-human-location-history/) as a separately labelled historical movement demonstration if trajectory analysis is needed. It is not current Hyderabad ridership evidence.
- For actual local planning decisions, seek authorized aggregate passenger boardings, population coverage and street/walking-network data. Do not replace these missing measurements with schedule counts or attractive synthetic charts.

No single file makes every analysis valid. Choose the measurement first, then obtain an appropriate source and document its geography, date range, sampling and license.

## Realtime and road routing

`GTFS_RT_FEEDS` accepts a JSON list in the backend environment/settings. Each entry specifies `id`, `name`, `city`, `type` (`vehicle_positions`, `trip_updates`, `service_alerts`), `url` and attribution. Provider secrets referenced by `api_key_env`/`headers_env` must be supplied as process/deployment environment variables. The frontend exposes provider status and available timestamps; none is configured by default.

Realtime requests have a timeout and short cache; stale cached results are identified. A transit operations feed still does not measure passenger demand. Road routing uses a separately configured OSRM-compatible provider and reports estimated distance/duration, not live traffic.

## Storage and reproducibility

The active-source marker, SQLite database, caches, mapping profiles, source files and reports under `backend/data` are deployment state, excluded from Git. Back them up consistently. A fresh clone must import its own licensed source through the admin UI; see [SETUP.md](SETUP.md).

## Hyderabad planning update ? 31 October 2026

The current planning workspace now has nine prepared layers, independently of the active mobility source. See [HYDERABAD_DATA_CATALOG.md](HYDERABAD_DATA_CATALOG.md) for exact files, counts, licences, reproduction instructions and suitability. The dedicated preparation tool converts the existing regional GeoPackage; generic GeoPackage upload remains unsupported. Use the separate planner for multi-layer site screening, and the original importer for single-source mobility exploration.
