"""Prepare reproducible Hyderabad study layers, without changing the active mobility source.

Run with backend/venv/Scripts/python.exe tools/prepare_planning_data.py.
Uses an existing dated Geofabrik archive, or --download to fetch it. No new dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from datetime import datetime, timezone
import urllib.request

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'backend/data/planning'
URL = 'https://download.geofabrik.de/asia/india/southern-zone-261028-free.gpkg.zip'
GTFS_URL = 'https://data.opencity.in/dataset/88e2d145-7ec6-4666-88dd-6cf18b18312e/resource/1b0d18bb-b2fb-4a79-8ed0-1e071da5790c/download/telangana_opendata_gtfs_tgsrtc_08_february_2026.zip'
# Explicit study envelope; not an official HMDA administrative boundary.
BBOX = [77.8, 16.8, 79.2, 18.1]
LAYERS = {'roads': 'gis_osm_roads_free', 'amenities': 'gis_osm_pois_free',
          'amenity_areas': 'gis_osm_pois_a_free', 'landuse': 'gis_osm_landuse_a_free',
          'water': 'gis_osm_water_a_free', 'waterways': 'gis_osm_waterways_free',
          'railways': 'gis_osm_railways_free', 'transport': 'gis_osm_transport_free'}


def clean(frame, envelope):
    """Repair before clipping, reject unusable geometry, preserve OSM IDs and categories."""
    if frame.crs is None:
        raise ValueError('Unknown CRS: refusing to guess coordinates')
    frame = frame.to_crs(4326).copy()
    original = len(frame)
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    repaired = int((~frame.geometry.is_valid).sum())
    frame.geometry = frame.geometry.make_valid()
    frame.geometry = frame.geometry.intersection(envelope)
    frame = frame[~frame.geometry.is_empty & frame.geometry.is_valid].copy()
    duplicate = frame.assign(_geometry=frame.geometry.to_wkb()).duplicated(subset=['osm_id', '_geometry'])
    duplicates = int(duplicate.sum())
    frame = frame[~duplicate].copy()
    return frame, {'input_in_envelope': original, 'geometry_repairs': repaired,
                   'duplicates_removed': duplicates, 'rejected_or_empty': original-len(frame)-duplicates,
                   'output_features': len(frame), 'invalid_remaining': int((~frame.geometry.is_valid).sum())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    archive = ROOT / 'southern-zone-261028-free.gpkg.zip'
    if not archive.exists():
        if not args.download:
            raise SystemExit('Dated archive missing. Run again with --download (approximately 1.27 GB).')
        temporary = archive.with_suffix('.download')
        with urllib.request.urlopen(URL, timeout=120) as response, temporary.open('wb') as out:
            shutil.copyfileobj(response, out)
        temporary.replace(archive)
    raw = DATA / 'raw/southern-zone.gpkg'
    raw.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        readme = z.read('README').decode('utf-8')
        if '2026-10-28T21:21:02Z' not in readme:
            raise ValueError('Unexpected source snapshot')
        if not raw.exists() or raw.stat().st_size != z.getinfo('southern-zone.gpkg').file_size:
            with z.open('southern-zone.gpkg') as src, raw.open('wb') as dst:
                shutil.copyfileobj(src, dst, 1024*1024)
    report = {'prepared_at': datetime.now(timezone.utc).isoformat(), 'source_date': '2026-10-28T21:21:02Z',
              'source_url': URL, 'archive_sha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(),
              'license': 'ODbL-1.0', 'attribution': 'OpenStreetMap contributors; extract by Geofabrik',
              'bbox': BBOX, 'scope': 'Hyderabad metropolitan study envelope; not a statutory HMDA boundary',
              'layers': {}, 'limitations': ['OSM completeness varies by place and feature type.',
              'Land-use tags are mapped uses, not statutory zoning or development permission.',
              'Road data does not establish sidewalk presence, accessibility, safety, capacity or traffic.',
              'No population, demand, cadastral ownership, flood return periods or utility capacity is inferred.']}
    staging = DATA / 'hyderabad-preparing.gpkg'
    if staging.exists(): staging.unlink()
    envelope = box(*BBOX)
    for key, layer in LAYERS.items():
        frame = gpd.read_file(raw, layer=layer, bbox=tuple(BBOX))
        frame, checks = clean(frame, envelope)
        frame.to_file(staging, layer=key, driver='GPKG')
        frame.to_file(DATA / f'hyderabad-{key}.geojson', driver='GeoJSON')
        report['layers'][key] = {**checks, 'file': f'hyderabad-{key}.geojson',
            'categories': {str(k): int(v) for k,v in frame.fclass.value_counts().items()}}
        print(key, checks, flush=True)
    # Keep transit as its own source; stops are scheduled infrastructure, not passenger samples.
    gtfs = ROOT / 'telangana_opendata_gtfs_tgsrtc_08_february_2026.zip'
    if not gtfs.exists(): gtfs = ROOT / 'backend/data' / gtfs.name
    if not gtfs.exists() and args.download:
        temporary = gtfs.with_suffix('.download')
        with urllib.request.urlopen(GTFS_URL, timeout=120) as response, temporary.open('wb') as out:
            shutil.copyfileobj(response, out)
        temporary.replace(gtfs)
    if gtfs.exists():
        with zipfile.ZipFile(gtfs) as z:
            member = next(n for n in z.namelist() if n.endswith('stops.txt'))
            stops = pd.read_csv(z.open(member), dtype={'stop_id': str})
        lat, lon = pd.to_numeric(stops.stop_lat, errors='coerce'), pd.to_numeric(stops.stop_lon, errors='coerce')
        selected = lat.between(BBOX[1], BBOX[3]) & lon.between(BBOX[0], BBOX[2])
        stops = stops[selected].copy()
        frame = gpd.GeoDataFrame({'osm_id': stops.stop_id, 'name': stops.stop_name, 'fclass': 'bus_stop'},
            geometry=gpd.points_from_xy(lon[selected],lat[selected]), crs=4326)
        frame.to_file(staging, layer='transit', driver='GPKG')
        frame.to_file(DATA/'hyderabad-transit.geojson',driver='GeoJSON')
        report['layers']['transit'] = {'output_features': len(frame), 'file': 'hyderabad-transit.geojson',
            'source_date': '2026-02-08', 'attribution': 'Contains data provided by TGSRTC',
            'source_url': 'https://tgsrtc.telangana.gov.in/open-data', 'download_url': GTFS_URL,
            'archive_sha256': hashlib.file_digest(gtfs.open('rb'), 'sha256').hexdigest(), 'invalid_remaining': 0,
            'limitation': 'Static scheduled stops; not evidence of operating service or passenger demand.'}
    else:
        report['limitations'].append('Transit archive missing; no scheduled stop layer was prepared.')
    staging.replace(DATA/'hyderabad.gpkg')
    (DATA/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (ROOT/'docs/planning-data-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Prepared planning layers. The existing active mobility dataset was preserved.',flush=True)


if __name__ == '__main__': main()
