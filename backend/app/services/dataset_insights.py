"""Computed, source-aware summaries; no synthetic demand or missing dates."""
from __future__ import annotations

import json
from collections import defaultdict


def overview(store, source_id: str, filters: dict | None = None) -> dict:
    source=store.get_source(source_id)
    filters=filters or {}
    if not source:return {'status':'insufficient_data','message':'No source is configured.'}
    with store.connect() as db:
        if source['format']=='gtfs_static':
            totals={name:int(db.execute(f'SELECT COUNT(*) FROM {table} WHERE source_id=?',(source_id,)).fetchone()[0])
                    for name,table in [('stops','gtfs_stops'),('routes','gtfs_routes'),('trips','gtfs_trips'),('scheduled_stop_events','gtfs_stop_times')]}
            frequency=db.execute("SELECT COUNT(*), MIN(CAST(json_extract(payload_json,'$.headway_secs') AS INTEGER)), MAX(CAST(json_extract(payload_json,'$.headway_secs') AS INTEGER)) FROM gtfs_extra_rows WHERE source_id=? AND table_name='frequencies.txt'",(source_id,)).fetchone()
            totals['frequency_windows']=frequency[0]
            quality={'accepted':source['record_count'],'rejected':source['rejected_count'],'duplicates':source['duplicate_count']}
            shape_count=db.execute("SELECT COUNT(*) FROM gtfs_extra_rows WHERE source_id=? AND table_name='shapes.txt'",(source_id,)).fetchone()[0]
            limitations=['No passenger boardings, population, road congestion or walk-network access can be inferred from static GTFS alone.',
                        'Successful import checks structure and relationships, not real-world accuracy or whether this timetable is still current. The service-calendar end date is not a freshness guarantee.']
            if not shape_count: limitations.append('This feed has no shapes.txt route geometry. Stops and timetable relationships can be mapped; exact bus paths along roads cannot be reconstructed from this feed.')
            return {'status':'success','source':source,'totals':totals,'quality':quality,
                    'frequency':{'window_count':frequency[0],'minimum_headway_seconds':frequency[1],'maximum_headway_seconds':frequency[2]},
                    'capabilities':capabilities(source), 'data_semantics':'scheduled_transit_service',
                    'methodology':'Counts from related GTFS tables; hourly departures use supplied stop times, not passenger demand. Frequency windows are not expanded; GTFS times beyond 24 hours are displayed modulo the 24-hour clock.',
                    'limitations':limitations}
        clauses=['source_id=?'];args=[source_id]
        store._add_location_filters(clauses,args,filters);store._add_bbox_filter(clauses,args,filters)
        if filters.get('start'):clauses.append('local_timestamp>=?');args.append(filters['start'])
        if filters.get('end'):clauses.append('local_timestamp<?');args.append(filters['end'])
        if filters.get('hour') is not None:clauses.append('local_hour=?');args.append(filters['hour'])
        where=' AND '.join(clauses)
        totals=dict(db.execute(f'''SELECT COUNT(*) AS records,COUNT(local_timestamp) AS dated_records,
            COUNT(local_hour) AS records_with_time_of_day,COUNT(latitude) AS geocoded_records,
            COUNT(DISTINCT COALESCE(trajectory_id,trip_id)) AS identified_tracks,
            MIN(local_timestamp) AS date_start,MAX(local_timestamp) AS date_end,
            MIN(longitude) AS west,MIN(latitude) AS south,MAX(longitude) AS east,MAX(latitude) AS north
            FROM observations WHERE {where}''',args).fetchone())
        feature_count=db.execute('SELECT COUNT(*) FROM geo_features WHERE source_id=?',(source_id,)).fetchone()[0]
        totals['geographic_features']=feature_count
        indicators=[dict(row) for row in db.execute(f'''SELECT json_extract(properties_json,'$.indicator') AS indicator,
            COALESCE(json_extract(properties_json,'$.unit'),'unspecified') AS unit,COALESCE(city,area_name,state,country,'unspecified') AS area,
            json_extract(properties_json,'$.year') AS year,COUNT(*) AS records,
            MIN(json_extract(properties_json,'$.value')) AS minimum,MAX(json_extract(properties_json,'$.value')) AS maximum,
            AVG(json_extract(properties_json,'$.value')) AS mean
            FROM observations WHERE {where} AND json_extract(properties_json,'$.indicator') IS NOT NULL
            AND json_type(properties_json,'$.value') IN ('integer','real') GROUP BY indicator,unit,area,year ORDER BY indicator,area,year LIMIT 200''',args)]
        fields=[]
        # Safe JSON paths: only canonical mappings selected by the schema layer.
        schema=source.get('details',{}).get('schema',{})
        for item in schema.get('columns',[])[:40]:
            from app.services.schema_mapping import key
            column=item['name'];path='$.'+json.dumps(key(column))
            stats=db.execute(f'''SELECT COUNT(json_extract(properties_json,?)),COUNT(DISTINCT json_extract(properties_json,?))
                FROM observations WHERE {where}''',[path,path,*args]).fetchone()
            detail={'name':column,'type':item['type'],'non_null':stats[0],'distinct':stats[1]}
            if item['type']=='numeric':
                numbers=db.execute(f'''SELECT MIN(finite_number(json_extract(properties_json,?))),MAX(finite_number(json_extract(properties_json,?))),AVG(finite_number(json_extract(properties_json,?)))
                    FROM observations WHERE {where} AND json_extract(properties_json,?) IS NOT NULL''',[path,path,path,*args,path]).fetchone()
                detail.update({'sample_inferred_numeric_min':numbers[0],'sample_inferred_numeric_max':numbers[1],'sample_inferred_numeric_mean':numbers[2]})
            fields.append(detail)
    limitations=[]
    if not totals['geocoded_records'] and not feature_count:limitations.append('No mapped coordinates/geometry; spatial and hotspot analysis are unavailable.')
    if not totals['dated_records']:limitations.append('No usable observation date/time; temporal patterns are unavailable. A year indicator is not an observed timestamp.')
    elif not totals['records_with_time_of_day']:limitations.append('Only calendar dates are provided; hourly patterns are unavailable.')
    return {'status':'success','source':source,'totals':totals,'indicators':indicators,'fields':fields,
            'quality':{'accepted':source['record_count'],'rejected':source['rejected_count'],'duplicates':source['duplicate_count'],
                       'missing_coordinates':totals['records']-totals['geocoded_records'],'missing_dates':totals['records']-totals['dated_records']},
            'capabilities':capabilities(source),'data_semantics':source.get('details',{}).get('dataset_type','source_records'),
            'methodology':'SQL aggregates of valid imported records. Indicator means/minima/maxima are grouped by indicator, unit, area and year; unlike units are never combined.',
            'limitations':limitations}


def capabilities(source):
    actual=set(source.get('analyses') or [])
    rules={'overview':('overview',),'spatial':('spatial','geometry'),'hotspots':('hotspots',),'temporal':('temporal',),
           'corridors':('corridors','scheduled_corridors','route_geometry'),'accessibility':('accessibility',),'indicators':('indicators',)}
    reasons={'spatial':'Needs valid WGS84 coordinates or geographic features.','hotspots':'Needs enough geocoded points for the configured grid method.',
             'temporal':'Needs source dates/times or GTFS stop times.','corridors':'Needs OD records, timestamped identified tracks or related GTFS trips/stops.',
             'accessibility':'Needs geocoded GTFS stops; measures proximity, not population access.','indicators':'Needs indicator names and numerical values with compatible units.'}
    return {name:{'supported':bool(actual&set(requirements)), 'reason':reasons.get(name,'Available for imported sources.')}
            for name,requirements in rules.items()}


def geographic_features(store,source_id,limit=1000):
    with store.connect() as db:
        rows=db.execute('SELECT * FROM geo_features WHERE source_id=? LIMIT ?',(source_id,limit+1)).fetchall()
        features=[{'type':'Feature','id':row['feature_id'],'geometry':json.loads(row['geometry_json']),
                   'properties':json.loads(row['properties_json'])} for row in rows[:limit]]
        if not features:
            # GTFS shape geometry belongs to the schedule; it is never a tracked journey.
            shape_rows=db.execute("SELECT payload_json FROM gtfs_extra_rows WHERE source_id=? AND table_name='shapes.txt' ORDER BY json_extract(payload_json,'$.shape_id'),CAST(json_extract(payload_json,'$.shape_pt_sequence') AS INTEGER) LIMIT 100001",(source_id,)).fetchall()
            groups=defaultdict(list)
            for row in shape_rows[:100000]:
                item=json.loads(row[0]);groups[item['shape_id']].append([float(item['shape_pt_lon']),float(item['shape_pt_lat'])])
            features=[{'type':'Feature','id':name,'geometry':{'type':'LineString','coordinates':coords},
                       'properties':{'shape_id':name,'semantics':'scheduled_route_geometry'}} for name,coords in groups.items() if len(coords)>1][:limit]
    return {'type':'FeatureCollection','features':features,'truncated':len(rows)>limit or (not rows and len(shape_rows)>100000),
            'limit':limit,'data_semantics':'source_geometry_or_scheduled_shapes'}


def named_corridors(store,source_id,filters=None,limit=30):
    clauses=['source_id=?',"json_extract(properties_json,'$.origin') IS NOT NULL", "json_extract(properties_json,'$.destination') IS NOT NULL"];args=[source_id]
    store._add_location_filters(clauses,args,filters or {})
    for field,op in [('start','>='),('end','<')]:
        if (filters or {}).get(field):clauses.append(f'local_timestamp{op}?');args.append(filters[field])
    with store.connect() as db:
        rows=[dict(row) for row in db.execute(f'''SELECT json_extract(properties_json,'$.origin') AS origin_name,
            json_extract(properties_json,'$.destination') AS destination_name,COUNT(*) AS records,
            SUM(COALESCE(event_count,1)) AS trips FROM observations WHERE {' AND '.join(clauses)}
            GROUP BY origin_name,destination_name ORDER BY trips DESC LIMIT ?''',[*args,limit])]
    return {'status':'success' if rows else 'insufficient_data','top_corridors':rows,'total_trip_records':sum(r['records'] for r in rows),
            'data_semantics':'supplied_origin_destination_flows','message':'Volumes use a supplied count field when present, otherwise source row counts. Named zones are not automatically geocoded.'}
