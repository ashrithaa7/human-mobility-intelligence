# Hyderabad datasets and quality assessment

Prepared and reviewed: **31 October 2026**. This is a curated set for this application's planning questions, not an exhaustive claim to every available dataset. Structural validation cannot prove real-world completeness or freshness.

## Ready on this workstation

The existing Geofabrik regional archive was previously unusable by the generic upload importer because it is a GeoPackage ZIP. It has now been clipped, cleaned and converted to importable GeoJSON layers, and a separate spatially indexed GeoPackage powers the planning workspace. The original archive was retained. Source snapshot: **28 October 2026, 21:21:02 UTC**. [Geofabrik source and dated downloads](https://download.geofabrik.de/asia/india/southern-zone.html), [OpenStreetMap attribution and licence](https://www.openstreetmap.org/copyright).

All files below are under `backend/data/planning/`. They are local data artifacts, deliberately excluded from the code repository.

| File | Clean features | Use |
| --- | ---: | --- |
| `hyderabad-roads.geojson` | 284,544 | Road/path centrelines, class and basic road attributes |
| `hyderabad-amenities.geojson` | 11,595 | Amenity points |
| `hyderabad-amenity_areas.geojson` | 5,376 | Mapped amenity footprints |
| `hyderabad-landuse.geojson` | 6,052 | Mapped land uses, not official zoning |
| `hyderabad-water.geojson` | 1,879 | Water polygons, not flood hazard or statutory buffers |
| `hyderabad-waterways.geojson` | 808 | Waterway centrelines |
| `hyderabad-railways.geojson` | 1,547 | Rail alignment context |
| `hyderabad-transport.geojson` | 973 | OSM transport points |
| `hyderabad-transit.geojson` | 4,882 | TGSRTC scheduled stops within the study envelope |

The complete existing TGSRTC feed remains the public mobility source: 5,028 stops, 1,031 routes, 44,892 trips and 1,132,807 stop-time rows. The smaller planning-stop count is the result of geographic selection; the remaining regional stops were not deleted. [TGSRTC open data and terms](https://tgsrtc.telangana.gov.in/open-data). Required attribution: **Contains data provided by TGSRTC**. This February 2026 schedule feed is not evidence of current operations or passenger journeys; its long service-calendar end date does not prove freshness.

The nine layers intentionally represent complementary infrastructure, not nine interchangeable mobility samples. Keep the layers together for planner comparisons. To inspect a single GeoJSON with the generic importer, an administrator can preview/import it and choose whether to activate it; activating one changes the public mobility source and its supported analytics.

## Cleaning and validation

The preparation script reads each source CRS, converts to WGS84, repairs invalid geometry if necessary, clips to the declared metropolitan study envelope, rejects null/empty/invalid geometry and removes exact duplicates using OSM ID plus geometry. **75 duplicate records were removed. No invalid geometry remains.** Different mapped objects with similar names are not silently merged. OSM node/polygon duplication of an establishment can remain and is disclosed in the UI. Road crossings are not automatically made into junctions.

The source archive SHA-256, per-layer input/output/rejection counts, category counts, source dates and limitations are recorded in [planning-data-validation.json](planning-data-validation.json). Zero rejected rows does not establish accuracy of all OSM tags. Areas outside the selected envelope are outside this prepared study dataset, not globally invalid records. The envelope is not a legal metropolitan boundary.

## Reproduce after cloning

Install the backend requirements as described in [SETUP.md](SETUP.md). Place the two dated archives in the repository root, then run:

```powershell
.\backend\venv\Scripts\python.exe tools/prepare_planning_data.py
```

If the archives are missing, `--download` downloads the pinned public source files. The OSM archive is about 1.27 GB, with a roughly 2.8 GB uncompressed GeoPackage; allow additional disk space for converted layers. The dated OSM URL may eventually expire. In that case choose and validate a replacement snapshot explicitly; do not silently label a different date as the pinned one.

```powershell
.\backend\venv\Scripts\python.exe tools/prepare_planning_data.py --download
```

Outputs are `hyderabad.gpkg`, nine `hyderabad-*.geojson` files, `manifest.json` and the shareable validation report. The script does not activate or overwrite the public mobility dataset. Keep ODbL attribution and obligations when redistributing the OSM-derived database; review each source's terms separately.

## Other suitable sources and missing evidence

| Dataset family / primary source | Appropriate use | Status and integration requirement |
| --- | --- | --- |
| [HMDA master plans and land-use sheets](https://www.hmda.gov.in/planning-2/) | Statutory planning reference | Official references linked from the workspace. PDF/raster sheets are not validated parcel-level vector zoning in this app; verify applicable amendments with the authority. |
| [WorldPop population counts](https://hub.worldpop.org/project/categories?id=3) | Modelled population/catchment denominators | Not installed. Select a suitable India year/model; rasters require CRS-aware clipping and zonal aggregation before supported tabular/GeoJSON import. Estimates are not observed trip demand. |
| [GHSL resident population and built-up products](https://human-settlement.emergency.copernicus.eu/downloadWizard.php) | Population/built-form context and historical comparison | Not installed. Raster processing and matching year/boundary are required. Do not add WorldPop and GHSL estimates together. |
| [Census of India tables](https://censusindia.gov.in/census.website/data/census-tables) | Authoritative historical demographic baselines | Not installed. Match census year and geographic units; old ward boundaries may not match present administration. |
| Local authority current wards, cadastral/zoning GIS, utility and amenity registers | Land-use compliance, capacity and equitable infrastructure allocation | Not available as verified machine-readable layers in this project. Obtain approved versions, licence and identifiers. |
| Field-audited footways, crossings, accessible entrances and crash data | Pedestrian safety and active-mobility prioritisation | Not configured. OSM centreline tags cannot substitute for these measurements. |
| Traffic counts, turning counts, service reliability, passenger origin-destination surveys | Network modelling and demand-sensitive planning | Not configured. Schedule trips cannot substitute for passenger counts or congestion. |
| Flood hazard, terrain and drainage capacity | Environmental/infrastructure constraints | Not configured. OSM water polygons do not establish flood risk. |

## Why the previous files were insufficient

- The GTFS feed is structurally usable but answers schedule and stop-coverage questions. It has no route-shape table or passenger observations. A visually dense stop map is not a population heatmap.
- `hyd_stops.csv` is a stop inventory. Stop coordinates alone cannot support temporal trip analysis, demand or infrastructure capacity.
- `hyderabad_mobility_test_sample.csv` contains explicitly named test tracks. Keep it for validation demonstrations, not claims about real Hyderabad behaviour.
- `indian-cities-infrastructure.csv` contains city-level aggregate indicators with no substantiated provenance in the provided file. It cannot support local site comparison and has not been promoted to a trusted planning layer.
- `SmartphoneSensorData_PublicBus.zip` and `WUP_cities.zip` were not validated for Hyderabad site planning in this phase; they are not included in planner calculations.

No data is labelled “perfect.” The delivered layers are compatible and structurally checked, with reproducible source provenance and visible uncertainty.
