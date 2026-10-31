"""Spatial site screening using independently prepared, attributed planning layers."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import geopandas as gpd
from pyproj import Transformer
from shapely.geometry import Point, mapping
from shapely.ops import transform, unary_union

DATA = Path(__file__).resolve().parents[2] / 'data/planning'
PROJECT = Transformer.from_crs(4326, 32644, always_xy=True).transform
UNPROJECT = Transformer.from_crs(32644, 4326, always_xy=True).transform
OBJECTIVES = {
    'landuse': 'Land-use compatibility', 'infrastructure': 'Infrastructure planning',
    'amenities': 'Amenity siting', 'active_mobility': 'Pedestrian and active mobility',
    'roads': 'Road network review', 'policy': 'Policy and master planning',
}
CATEGORIES = {'health': {'hospital','clinic','doctors','pharmacy'},
              'education': {'school','kindergarten','college','university'},
              'open_space': {'park','playground','sports_centre','recreation_ground'}}


def catalog(directory=DATA):
    manifest = directory/'manifest.json'
    if not manifest.exists() or not (directory/'hyderabad.gpkg').exists():
        return {'ready': False, 'message': 'Planning layers have not been prepared. Run tools/prepare_planning_data.py.', 'objectives': OBJECTIVES}
    return {'ready': True, 'objectives': OBJECTIVES, **json.loads(manifest.read_text(encoding='utf-8'))}


def assess_site(site, radius_m, manifest, directory=DATA):
    point = transform(PROJECT, Point(site['longitude'], site['latitude']))
    circle = point.buffer(radius_m, quad_segs=32)
    search_bbox = transform(UNPROJECT, circle).bounds
    metrics = {'radius_m': radius_m, 'study_area_km2': round(circle.area/1e6, 3)}
    features, layers, previews = [], {}, {}
    for key in manifest['layers']:
        frame = gpd.read_file(directory/'hyderabad.gpkg', layer=key, bbox=search_bbox).to_crs(32644)
        frame = frame[frame.intersects(circle)].copy()
        frame.geometry = frame.geometry.intersection(circle)
        layers[key] = frame
        # Metrics use ALL intersecting records; map detail is capped separately and disclosed.
        view = frame.head(1500).copy()
        view.geometry = view.geometry.simplify(3, preserve_topology=True)
        view = view.to_crs(4326)
        previews[key] = {'total': len(frame), 'displayed': len(view)}
        for feature in json.loads(view.to_json())['features']:
            feature['properties']['planning_layer'] = key
            features.append(feature)
    roads = layers.get('roads')
    if roads is not None:
        lengths = roads.geometry.length.groupby(roads.fclass).sum()
        metrics['road_km_by_class'] = {str(k): round(v/1000,3) for k,v in lengths.items()}
        metrics['mapped_road_km'] = round(roads.length.sum()/1000,3)
        metrics['explicit_active_path_km'] = round(roads[roads.fclass.isin(['footway','pedestrian','cycleway','path','steps'])].length.sum()/1000,3)
        metrics['explicit_cycleway_km'] = round(roads[roads.fclass=='cycleway'].length.sum()/1000,3)
        metrics['road_segments'] = len(roads)
    land = layers.get('landuse')
    if land is not None:
        metrics['landuse_km2_by_class'] = {str(k): round(unary_union(group.geometry).area/1e6,4) for k,group in land.groupby('fclass')}
        metrics['mapped_landuse_coverage_pct'] = round(unary_union(land.geometry).area/circle.area*100,1)
        metrics['site_landuse_tags'] = sorted(land[land.intersects(point)].fclass.unique().tolist())
    water = layers.get('water')
    if water is not None:
        metrics['water_area_km2'] = round(unary_union(water.geometry).area/1e6,4)
        metrics['site_intersects_mapped_water'] = bool(water.intersects(point).any())
    metrics['amenities'] = {}
    for category, classes in CATEGORIES.items():
        # Node and polygon records remain distinguishable; do not claim unique establishments.
        found = []
        for key in ('amenities','amenity_areas','landuse'):
            if key not in layers: continue
            frame = layers[key]
            for _, row in frame[frame.fclass.isin(classes)].iterrows():
                found.append({'name': str(row.get('name') or row.fclass), 'category': row.fclass,
                    'source_layer': key, 'distance_m': round(point.distance(row.geometry))})
        found.sort(key=lambda x: x['distance_m'])
        metrics['amenities'][category] = {'mapped_features':len(found),'nearest':found[0] if found else None}
    transit = layers.get('transit')
    metrics['scheduled_stops'] = len(transit) if transit is not None else None
    metrics['nearest_stop_m'] = round(transit.distance(point).min()) if transit is not None and len(transit) else None
    nearest = metrics['nearest_stop_m']
    findings = [
        {'objective':'landuse','finding':f"Mapped land-use coverage: {metrics.get('mapped_landuse_coverage_pct', 0)}% of the study circle.",
         'action':'Compare the tagged uses with official zoning, ownership and environmental constraints before proposing a change.'},
        {'objective':'infrastructure','finding':f"{metrics['scheduled_stops']} scheduled stop records within the study radius." if transit is not None else 'No prepared transit layer.',
         'action':'Check service availability, utility capacity and population before prioritising investment. Stop counts are not ridership.'},
        {'objective':'amenities','finding':'; '.join(f"{k.replace('_',' ')}: {v['mapped_features']} mapped features" for k,v in metrics['amenities'].items()),
         'action':'Survey apparently underserved locations; missing map features may reflect missing data. Check capacity and opening hours.'},
        {'objective':'active_mobility','finding':f"{metrics.get('explicit_active_path_km',0)} km of explicitly mapped pedestrian/path/cycle classes.",
         'action':'Audit crossings, universal accessibility, shade and continuity. Sidewalks on ordinary roads are not represented in this extract.'},
        {'objective':'roads','finding':f"{metrics.get('mapped_road_km',0)} km of mapped road/path centreline in the circle.",
         'action':'Review junctions and connections on the map, then obtain traffic, right-of-way and turning restrictions before network redesign.'},
        {'objective':'policy','finding':'Site overlaps mapped water.' if metrics.get('site_intersects_mapped_water') else 'No mapped water polygon intersects this point; this does not establish flood safety.',
         'action':'Use the official HMDA plan and applicable buffers for statutory checks. Record evidence gaps and obtain field verification.'},
    ]
    features.append({'type':'Feature','geometry':mapping(transform(UNPROJECT,circle)),
                     'properties':{'planning_layer':'study_area','name':'Straight-line screening radius'}})
    features.append({'type':'Feature','geometry':mapping(Point(site['longitude'],site['latitude'])),
                     'properties':{'planning_layer':'candidate','name':site['name']}})
    return {'site':site,'metrics':metrics,'findings':findings,'map':{'type':'FeatureCollection','features':features},'map_counts':previews}


def assess(sites, radius_m, objective, directory=DATA):
    manifest = catalog(directory)
    if not manifest['ready']: raise ValueError(manifest['message'])
    west,south,east,north = manifest['bbox']
    for site in sites:
        if not west <= site['longitude'] <= east or not south <= site['latitude'] <= north:
            raise ValueError('Candidate is outside the prepared Hyderabad study envelope.')
        circle_bounds = transform(UNPROJECT, transform(PROJECT,Point(site['longitude'],site['latitude'])).buffer(radius_m)).bounds
        if circle_bounds[0]<west or circle_bounds[1]<south or circle_bounds[2]>east or circle_bounds[3]>north:
            raise ValueError('Study circle crosses the prepared data boundary. Move the site inward or reduce the radius.')
    return {'created_at':datetime.now(timezone.utc).isoformat(),'objective':objective,'radius_m':radius_m,
        'sites':[assess_site(site,radius_m,manifest,directory) for site in sites],
        'source':{k:manifest[k] for k in ('source_date','source_url','archive_sha256','attribution','license','scope','bbox')},
        'transit_source':manifest['layers'].get('transit'),
        'methodology':'EPSG:32644 metric buffers and clipped geometry lengths/areas; nearest straight-line distance within the radius. Not walking travel time, a network isochrone, demand forecasting or an optimisation solver.',
        'limitations':manifest['limitations']+['Amenity nodes and polygons can describe the same establishment; counts are mapped features.',
             'Map previews show at most 1,500 features per layer; metrics use all intersecting features.']}


def scenario_connection(directory=DATA):
    directory.mkdir(parents=True,exist_ok=True)
    conn = sqlite3.connect(directory/'scenarios.sqlite3',timeout=30)
    conn.row_factory=sqlite3.Row
    conn.execute('CREATE TABLE IF NOT EXISTS scenarios (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)')
    return conn


def save_scenario(owner, title, notes, assessment, directory=DATA):
    # Keep metrics and source evidence, not large map payloads, in the saved decision record.
    result=json.loads(json.dumps(assessment))
    for site in result['sites']: site.pop('map',None)
    result.update(id=str(uuid4()),title=title,notes=notes)
    with scenario_connection(directory) as conn:
        conn.execute('INSERT INTO scenarios VALUES (?,?,?,?,?)',(result['id'],owner,title,result['created_at'],json.dumps(result)))
    conn.close()
    return result


def list_scenarios(owner,directory=DATA):
    with scenario_connection(directory) as conn:
        rows=conn.execute('SELECT payload FROM scenarios WHERE owner=? ORDER BY created_at DESC LIMIT 50',(owner,)).fetchall()
    conn.close()
    return [json.loads(row['payload']) for row in rows]
