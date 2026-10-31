"""Data catalog, bounded record paging, and streamed administrator ingestion."""
from __future__ import annotations

import logging
import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from starlette.concurrency import run_in_threadpool

from app.auth import require_admin
from app.services.csv_loader import CSVDataLoader, MAX_IMPORT_BYTES
from app.services.dataset_readers import DatasetReadError, preview_dataset
from app.services.schema_mapping import FIELDS, DATASET_TYPES
from app.services.dataset_insights import overview, geographic_features
from app.services.gtfs_realtime import fetch_feed, list_feeds

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api', tags=['data'])
realtime_router = APIRouter(prefix='/api/realtime', tags=['realtime'])
data_loader = CSVDataLoader()


@router.get('/data')
def get_data(dataset: str | None = Query(default=None), limit: int = Query(default=2000, ge=1, le=5000),
                   offset: int = Query(default=0, ge=0), region: str | None = None,
                   country: str | None = None, state: str | None = None, city: str | None = None,
                   start: str | None = None, end: str | None = None, hour: int | None = Query(default=None, ge=0, le=23),
                   west: float | None = None, south: float | None = None, east: float | None = None, north: float | None = None):
    try:
        available=data_loader.get_available_datasets()
        if not available:
            raise HTTPException(status_code=503,detail='No data source is configured. An administrator must import a supported mobility dataset.')
        active_name=data_loader.get_active_dataset()
        if dataset and Path(dataset).name != active_name:
            raise HTTPException(status_code=403,detail='Data access is restricted to the administrator-configured active source.')
        filename=active_name
        source=data_loader.store.get_source(filename) if filename else None
        if not source: raise HTTPException(status_code=404,detail=f'No ready data source named {dataset!r}.')
        filters={'region':region,'country':country,'state':state,'city':city,'start':start,'end':end,'hour':hour}
        if None not in (west,south,east,north): filters['bbox']=[west,south,east,north]
        records,total=data_loader.store.page_observations(source['filename'],filters,limit,offset)
        return {'success':True,'data':{'records':records,'metadata':{**source,'source':source['filename'],'total_records':source['record_count'],
                    'filtered_records':total,'returned_records':len(records),'offset':offset,'limit':limit,
                    'has_more':offset+len(records)<total}},
                'coverage':{'locations':source['coverage'] or [],'date_start':source['date_start'],'date_end':source['date_end'],
                    'bbox':source['bbox'],'source':source['filename']},
                'summary':{'source':source['filename'],'format':source['format'],'is_synthetic':source['is_synthetic'],
                    'record_count':source['record_count'],'returned_records':len(records)}}
    except HTTPException: raise
    except Exception as exc:
        logger.exception('Data read failed')
        raise HTTPException(status_code=500,detail=f'Could not read the selected data source: {exc}') from exc


@router.get('/data/available')
def get_available_datasets():
    try:
        sources=data_loader.get_available_datasets()
        active_name=data_loader.get_active_dataset()
        active=next((item for item in sources if item['filename']==active_name),None)
        return {'success':True,'sources':[{key:value for key,value in item.items() if key not in ('file_path','columns')}
                    for item in sources],
                'source':None if active is None else {'label':active['label'] or active['filename'],'filename':active['filename'],
                    'format':active['format'],'is_synthetic':active['is_synthetic'],'is_sample':active['is_sample'],
                    'record_count':active['record_count'],'supported_analyses':active['analyses'],'import_report':active.get('details',{})},
                'coverage':None if active is None else {'locations':active['coverage'] or [],'date_start':active['date_start'],
                    'date_end':active['date_end'],'bbox':active['bbox'],'last_updated':active['updated_at']},
                'message':None if active else 'No source is configured. Add a supported mobility dataset in the administrator data-source page.'}
    except Exception as exc:
        logger.exception('Data catalog read failed')
        raise HTTPException(status_code=500,detail=f'Could not list data sources: {exc}') from exc


@router.post('/data/preview', dependencies=[Depends(require_admin)])
@router.post('/data/import', dependencies=[Depends(require_admin)])
async def import_dataset(request: Request, filename: str = Query(...), source_name: str | None = None,
                         source_url: str | None = None, license: str | None = None,
                         timezone: str | None = None, attribution: str | None = None,
                         column_mapping: str | None = None, dataset_type: str = 'auto',
                         date_format: str | None = None, profile_name: str | None = None, archive_member: str | None = None):
    temp_path: Path | None=None
    try:
        with tempfile.NamedTemporaryFile(dir=data_loader.data_directory,prefix='.upload-',delete=False) as temp:
            temp_path=Path(temp.name)
            total=0
            async for chunk in request.stream():
                total+=len(chunk)
                if total>MAX_IMPORT_BYTES: raise HTTPException(status_code=413,detail='Dataset files must be 1 GB or smaller in this local deployment.')
                temp.write(chunk)
        if total==0: raise HTTPException(status_code=400,detail='The uploaded file is empty.')
        mapping=None
        if column_mapping:
            try: mapping=json.loads(column_mapping)
            except json.JSONDecodeError as exc: raise HTTPException(status_code=400,detail='column_mapping must be valid JSON mapping canonical fields to source column names.') from exc
            if not isinstance(mapping,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in mapping.items()):
                raise HTTPException(status_code=400,detail='column_mapping must be a JSON object such as {"latitude":"lat_col","longitude":"lon_col","timestamp":"recorded_at"}.')
            allowed=set(FIELDS)|{'origin_latitude','origin_longitude'}
            if set(mapping)-allowed: raise HTTPException(status_code=400,detail=f'Unsupported mapped fields: {", ".join(sorted(set(mapping)-allowed))}.')
        if dataset_type not in DATASET_TYPES: raise HTTPException(status_code=400,detail='Unknown dataset type.')
        metadata={'label':source_name or filename,'source_url':source_url,'license':license or 'unspecified',
            'timezone':timezone,'attribution':attribution,'column_mapping':mapping,'dataset_type':dataset_type,'date_format':date_format,'archive_member':archive_member}
        data_loader._safe_filename(filename)
        if request.url.path.endswith('/preview'):
            return {'success':True,'preview':await run_in_threadpool(preview_dataset,temp_path,metadata)}
        if profile_name and (not profile_name.strip() or len(profile_name)>100):
            raise HTTPException(status_code=400,detail='Mapping profile name must contain 1–100 characters.')
        result=await run_in_threadpool(data_loader.import_path,temp_path,filename,metadata)
        if profile_name and result.get('import_report',{}).get('schema'):
            data_loader.store.save_mapping_profile(profile_name,result['import_report']['schema']['mapping'],dataset_type,date_format)
        return {'success':True,'dataset':result}
    except HTTPException:
        raise
    except DatasetReadError as exc:
        raise HTTPException(status_code=400,detail={'message':str(exc),'report':exc.report}) from exc
    except Exception as exc:
        logger.exception('Dataset import failed')
        raise HTTPException(status_code=500,detail=f'Could not import dataset: {exc}') from exc
    finally:
        if temp_path:
            try: temp_path.unlink(missing_ok=True)
            except OSError: pass


@router.get('/data/summary')
def get_data_summary():
    sources=data_loader.get_available_datasets()
    active_name=data_loader.get_active_dataset()
    active=next((item for item in sources if item['filename']==active_name),None)
    if not active:return {'source':None,'record_count':0,'message':'No data source is configured.'}
    return {'source':active['filename'],'format':active['format'],'license':active['license'],
            'record_count':active['record_count'],'date_start':active['date_start'],'date_end':active['date_end'],
            'is_synthetic':active['is_synthetic'],'supported_analyses':active['analyses']}


@realtime_router.get('/feeds')
async def get_realtime_feeds():
    return {'feeds':list_feeds(),'message':None if list_feeds() else 'No GTFS-Realtime feeds are configured.'}


@realtime_router.get('/feeds/{feed_id}')
async def get_realtime_feed(feed_id: str):
    result=await fetch_feed(feed_id)
    if result.get('status')=='unavailable': raise HTTPException(status_code=404,detail=result['message'])
    return result


def _active_source():
    name=data_loader.get_active_dataset()
    if not name: raise HTTPException(status_code=503,detail='No data source is configured. An administrator must import a dataset.')
    return name


@router.get('/data/overview')
def get_overview(region: str | None=None, start: str | None=None, end: str | None=None,
                       country: str | None=None, state: str | None=None, city: str | None=None):
    return overview(data_loader.store,_active_source(),{'region':region,'start':start,'end':end,'country':country,'state':state,'city':city})


@router.get('/data/features')
def get_features(limit: int=Query(default=1000,ge=1,le=2000)):
    return geographic_features(data_loader.store,_active_source(),limit)


@router.get('/data/mapping-profiles')
def get_mapping_profiles():
    return {'profiles':data_loader.store.mapping_profiles()}


@router.post('/data/activate', dependencies=[Depends(require_admin)])
def activate_source(filename: str):
    try:
        name=data_loader._safe_filename(filename)
        source=data_loader.store.get_source(name)
        if not source or source['status']!='ready':raise DatasetReadError('Select a ready dataset from the catalog.')
        data_loader.activate_dataset(name)
        return {'success':True,'source':name}
    except DatasetReadError as exc:raise HTTPException(status_code=400,detail=str(exc)) from exc
