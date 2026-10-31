"""Server-side analytics backed by the indexed mobility catalog."""
from __future__ import annotations

from typing import Optional
from fastapi import Depends, APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.auth import require_planner
from app.services.csv_loader import CSVDataLoader
from app.services.hotspot_detection import HotspotDetector
from app.services.dataset_insights import overview, geographic_features, named_corridors

router = APIRouter(prefix='/api/analytics', tags=['analytics'])
data_loader = CSVDataLoader()


class AnalyticsRequest(BaseModel):
    # Real, configured sources are the default. Synthetic data requires an
    # explicit request and is visibly labelled in the response.
    data_mode: str = 'historical'
    num_records: int = 500
    parameters: Optional[dict] = None
    dataset: Optional[str] = None


def _source(request: AnalyticsRequest) -> dict:
    if request.data_mode == 'synthetic':
        raise HTTPException(status_code=501, detail='Synthetic analysis is not enabled in this endpoint. Import a real source first.')
    if request.data_mode != 'historical':
        raise HTTPException(status_code=400, detail="data_mode must be 'historical'.")
    active_name=data_loader.get_active_dataset()
    if request.dataset and request.dataset != active_name:
        raise HTTPException(status_code=403, detail='Analysis is restricted to the administrator-configured active source.')
    name = active_name
    source = data_loader.store.get_source(name) if name else None
    if not source or source.get('status') != 'ready':
        raise HTTPException(status_code=503, detail='No ready mobility data source is configured. An administrator must import a supported dataset.')
    return source


def _filters(request: AnalyticsRequest) -> dict:
    params = request.parameters or {}
    return {key: params[key] for key in ('region','country','state','city','start','end','hour') if params.get(key) is not None}


def _response(request: AnalyticsRequest, kind: str, result: dict) -> dict:
    return {'success': True, 'analysis_type': kind, 'data_mode': request.data_mode,
            'dataset': request.dataset or data_loader.get_active_dataset(), 'result': result}


@router.post('/hotspots')
def detect_hotspots(request: AnalyticsRequest):
    source = _source(request)
    store = data_loader.store
    filters = _filters(request)
    summary = store.spatial_cells(source['filename'], filters)
    cells = store.hotspot_cells(source['filename'], filters, cell_size=0.01)
    hotspots = HotspotDetector.detect_cells(cells, cell_size=0.01, min_samples=5)
    return _response(request, 'hotspots', {'status': 'success' if hotspots else 'insufficient_data',
        'hotspots': hotspots, 'hotspot_count': len(hotspots), 'cells_aggregated': len(cells), 'total_records':summary.get('total_records',0),
        'data_semantics': 'scheduled_stop_density' if source['format']=='gtfs_static' else 'observed_or_source_event_density',
        'methodology':'0.01-degree grid; cells meeting max(5, 90th percentile of occupied-cell weights) are grouped by 8-neighbour adjacency. Angular cells are not equal-area density.',
        'message': ('GTFS stop locations indicate scheduled stop coverage, not passenger demand.' if source['format']=='gtfs_static' else
                    'No usable point coordinates in this filter. Use geometry, indicator or field summaries instead.' if not cells else
                    'No adjacent high-weight cells met the configured hotspot threshold.' if not hotspots else None)})


@router.post('/temporal')
def analyze_temporal(request: AnalyticsRequest):
    source = _source(request)
    result = data_loader.store.temporal_summary(source['filename'], _filters(request))
    return {**_response(request, 'temporal', result), 'hourly_patterns': result,
            'daily_patterns': {'daily':result.get('daily', {}), 'weekly':result.get('weekly', {}), 'monthly':result.get('monthly', {})}, 'weekly_patterns': result.get('weekly', {}),
            'monthly_patterns': result.get('monthly', {})}


@router.post('/spatial')
def analyze_spatial(request: AnalyticsRequest):
    source = _source(request)
    result = data_loader.store.spatial_cells(source['filename'], _filters(request))
    if not result.get('total_records'):
        features=geographic_features(data_loader.store,source['filename'])
        result.update({'status':'success' if features['features'] else 'insufficient_data',
                       'feature_count':len(features['features']),'bbox':source['bbox'],
                       'message':'Geometry coverage uses source features and extent; point-density statistics require valid point coordinates.'})
    return _response(request, 'spatial', result)


@router.post('/corridors')
def detect_corridors(request: AnalyticsRequest):
    source = _source(request)
    result = data_loader.store.od_summary(source['filename'], filters=_filters(request))
    if result.get('status') != 'success':
        named=named_corridors(data_loader.store,source['filename'],_filters(request))
        if named['status']=='success': result=named
    if result.get('status') != 'success':
        from pyproj import Geod
        from shapely.geometry import shape
        lines=[feature for feature in geographic_features(data_loader.store,source['filename'])['features']
               if feature['geometry']['type'] in ('LineString','MultiLineString')]
        if lines:
            result={'status':'success','data_semantics':'static_route_geometry','top_corridors':[
                {'name':str(feature.get('id',index)), 'distance_m':abs(Geod(ellps='WGS84').geometry_length(shape(feature['geometry'])))}
                for index,feature in enumerate(lines[:30])], 'message':'Lengths describe static route geometry, not observed trips or travel time.'}
    normalised=[]
    for row in result.get('top_corridors',[]):
        item={**row,'trip_count':row.get('scheduled_trips',row.get('trips'))}
        if row.get('origin_latitude') is not None: item['origin']=[row['origin_longitude'],row['origin_latitude']]
        if row.get('destination_latitude') is not None: item['destination']=[row['destination_longitude'],row['destination_latitude']]
        normalised.append(item)
    result['top_corridors']=normalised; result['total_corridors']=len(normalised)
    result['unit']='scheduled trips' if source['format']=='gtfs_static' else 'source volume / records'
    return _response(request, 'corridors', result)


@router.post('/accessibility')
def analyze_accessibility(request: AnalyticsRequest):
    source = _source(request)
    params = request.parameters or {}
    try:
        latitude = float(params['latitude']) if params.get('latitude') is not None else None
        longitude = float(params['longitude']) if params.get('longitude') is not None else None
        radius = min(max(float(params.get('radius_meters', 500)), 100), 5000)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail='latitude, longitude and radius_meters must be numeric.')
    import math
    if any(value is not None and not math.isfinite(value) for value in (latitude,longitude,radius)) or (latitude is not None and not -90<=latitude<=90) or (longitude is not None and not -180<=longitude<=180):
        raise HTTPException(status_code=400,detail='Use finite WGS84 coordinates and a finite radius.')
    return _response(request, 'accessibility', data_loader.store.accessibility_summary(source['filename'], latitude, longitude, radius))


@router.post('/recommendations')
def generate_recommendations(request: AnalyticsRequest):
    source = _source(request)
    store = data_loader.store
    filters = _filters(request)
    temporal = store.temporal_summary(source['filename'], filters)
    spatial = store.spatial_cells(source['filename'], filters)
    corridors = store.od_summary(source['filename'], limit=5,filters=filters)
    if corridors.get('status')!='success':
        named=named_corridors(store,source['filename'],filters,limit=5)
        if named['status']=='success':corridors=named
    recommendations = []
    if temporal.get('peak_hour') is not None:
        recommendations.append({'basis': 'observed_source_timestamps' if source['format'] != 'gtfs_static' else 'scheduled_service',
            'finding': f"The strongest hour in this source is {temporal['peak_hour']}:00.",
            'action': 'Review capacity and service coverage around this hour; verify against local operational context.'})
    if spatial.get('top_areas'):
        cell=spatial['top_areas'][0]
        recommendations.append({'basis': spatial.get('data_semantics','source_event_density'),
            'finding': f"The densest mapped grid cell contains {cell['activity_count']} weighted records.",
            'action': 'Inspect the location on the map and compare neighboring areas before prioritizing an intervention.'})
    if corridors.get('status') == 'success':
        recommendations.append({'basis': corridors.get('data_semantics','observed_origin_destination'),
            'finding': 'Scheduled stop-to-stop service segments are available.' if source['format']=='gtfs_static' else 'Origin and destination movement corridors are available.',
            'action': 'Review scheduled route structure alongside service times; verify passenger demand separately.' if source['format']=='gtfs_static' else 'Review the highest-volume source corridors alongside time-of-day patterns.'})
    indicators=overview(store,source['filename'],filters).get('indicators',[])
    if indicators:
        item=indicators[0]
        recommendations.append({'basis':'supplied_urban_indicators','finding':f"{item['indicator']}: {item['records']} records for {item['area']} ({item['unit']}); range {item['minimum']}–{item['maximum']}.",
            'action':'Compare compatible areas and years using the same indicator definition; investigate missing coverage before interpreting disparities.'})
    if not recommendations:
        recommendations.append({'basis':'insufficient_data','finding':'This source does not yet support a defensible recommendation for these filters.',
            'action':'Add timestamped location observations or origin/destination pairs for movement analysis.'})
    result={'status':'success' if indicators or temporal.get('status')=='success' or spatial.get('status')=='success' else 'insufficient_data',
        'recommendations':recommendations,'data_semantics':temporal.get('data_semantics')}
    return _response(request, 'recommendations', result)


@router.post('/compare')
def compare_areas(request: AnalyticsRequest):
    source=_source(request)
    parameters=request.parameters or {}
    regions=parameters.get('regions')
    if not isinstance(regions,list) or not 2<=len(regions)<=10 or any(not isinstance(region,str) or not region.strip() for region in regions):
        raise HTTPException(status_code=400,detail='Provide between two and ten non-empty region names in parameters.regions.')
    store=data_loader.store
    shared={key:val for key,val in _filters(request).items() if key!='region'}
    compared=[]
    for region in dict.fromkeys(regions):
        filters={**shared,'region':region}
        temporal=store.temporal_summary(source['filename'],filters)
        spatial=store.spatial_cells(source['filename'],filters)
        compared.append({'region':region,'records':spatial.get('total_records',0) or temporal.get('total_records',0) or data_loader.store.page_observations(source['filename'],filters,1)[1],
            'peak_hour':temporal.get('peak_hour'),'top_cells':spatial.get('top_areas',[])[:3],
            'data_semantics':temporal.get('data_semantics') or spatial.get('data_semantics')})
    return _response(request,'area_comparison',{'status':'success' if any(area['records'] for area in compared) else 'insufficient_data',
        'regions':compared,'source':source['filename'],'message':'Counts reflect the selected source and may represent scheduled service, GPS observations, or supplied event weights.'})


@router.post('/reports', dependencies=[Depends(require_planner)])
def create_report(request: AnalyticsRequest):
    import json
    import uuid
    from datetime import datetime, timezone
    source=_source(request);store=data_loader.store;filters=_filters(request)
    result={'id':str(uuid.uuid4()),'title':f"{source['label'] or source['filename']} — analysis report",
            'date':datetime.now(timezone.utc).isoformat(),'dataset':source['filename'],'filters':filters,
            'overview':overview(store,source['filename'],filters),
            'temporal':store.temporal_summary(source['filename'],filters),
            'spatial':store.spatial_cells(source['filename'],filters),
            'corridors':(detect_corridors(request))['result'],
            'recommendations':(generate_recommendations(request))['result'],
            'limitations':['Static sources do not provide live traffic. Static GTFS describes scheduled service, not passenger demand.',
                           'Spatial grids use angular cells, not equal-area density per square kilometre.',
                           'Transit stop proximity is not a walking-network or population accessibility measure.']}
    with store.connect() as db: db.execute('INSERT INTO analysis_reports VALUES (?,?,?,?)',(result['id'],source['filename'],result['date'],json.dumps(result)))
    return {'success':True,'report':result}


@router.get('/reports', dependencies=[Depends(require_planner)])
def list_reports(report_id: str | None = Query(default=None)):
    import json
    source=_source(AnalyticsRequest())
    with data_loader.store.connect() as db:
        rows=db.execute('SELECT payload_json FROM analysis_reports WHERE source_id=? AND (? IS NULL OR id=?) ORDER BY generated_at DESC LIMIT 100',
                        (source['filename'],report_id,report_id)).fetchall()
    return {'reports':[json.loads(row[0]) for row in rows]}


@router.delete('/reports', dependencies=[Depends(require_planner)])
def remove_report(report_id: str):
    source=_source(AnalyticsRequest())
    with data_loader.store.connect() as db: removed=db.execute('DELETE FROM analysis_reports WHERE source_id=? AND id=?',(source['filename'],report_id)).rowcount
    if not removed: raise HTTPException(status_code=404,detail='Report not found for the active source.')
    return {'success':True}
