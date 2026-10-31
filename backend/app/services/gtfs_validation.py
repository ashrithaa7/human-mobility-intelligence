"""GTFS table inventory and optional-table validation; all joins stay source scoped."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.services.dataset_errors import DatasetReadError

TABLE_COLUMNS = {
    'agency.txt': {'agency_name','agency_url','agency_timezone'},
    'stops.txt': {'stop_id','stop_lat','stop_lon'}, 'routes.txt': {'route_id','route_type'},
    'trips.txt': {'trip_id','route_id','service_id'},
    'stop_times.txt': {'trip_id','stop_id','stop_sequence','arrival_time','departure_time'},
    'calendar.txt': {'service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'},
    'calendar_dates.txt': {'service_id','date','exception_type'},
    'shapes.txt': {'shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'},
    'frequencies.txt': {'trip_id','start_time','end_time','headway_secs'},
    'feed_info.txt': {'feed_publisher_name','feed_publisher_url','feed_lang'},
    'transfers.txt': {'from_stop_id','to_stop_id','transfer_type'},
    'pathways.txt': {'pathway_id','from_stop_id','to_stop_id','pathway_mode','is_bidirectional'},
    'levels.txt': {'level_id','level_index'}, 'translations.txt': {'table_name','field_name','language','translation'},
    'attributions.txt': set(), 'fare_attributes.txt': {'fare_id','price','currency_type','payment_method','transfers'},
    'fare_rules.txt': {'fare_id'}, 'fare_products.txt': {'fare_product_id','amount','currency'},
    'fare_leg_rules.txt': {'fare_product_id'}, 'fare_transfer_rules.txt': set(),
    'areas.txt': {'area_id'}, 'stop_areas.txt': {'area_id','stop_id'}, 'networks.txt': {'network_id'},
    'route_networks.txt': {'network_id','route_id'},
}
CORE = {'stops.txt','routes.txt','trips.txt','stop_times.txt'}


def inventory(archive, store, source_id) -> dict:
    from app.services.dataset_readers import _validated_zip_members, _validate_gtfs_columns, _dict_rows, _gtfs_time, _number
    names=_validated_zip_members(archive); report={'recognised_files':[], 'row_counts':{}, 'warnings':[], 'errors':[], 'missing_requirements':[]}
    members={}
    for member in names:
        name=Path(member).name.lower()
        if name not in TABLE_COLUMNS: continue
        if name in members: raise DatasetReadError(f'GTFS ZIP contains multiple files named {name}.',report)
        members[name]=member;report['recognised_files'].append(member)
    report['missing_requirements']=sorted(CORE-set(members))
    report['unrecognised_files']=[name for name in names if not name.endswith('/') and Path(name).name.lower() not in TABLE_COLUMNS]
    if report['missing_requirements']:
        message='GTFS ZIP is missing required table(s): '+', '.join(report['missing_requirements'])
        report['errors'].append(message);raise DatasetReadError(message,report)
    if 'agency.txt' not in members: report['warnings'].append('agency.txt is absent. Agency identity/timezone could not be validated; this is an incomplete GTFS feed.')
    if not {'calendar.txt','calendar_dates.txt'}&set(members): report['warnings'].append('No service calendar supplied. Calendar-date/weekday availability cannot be inferred.')
    try:
        for name,member in members.items():
            _validate_gtfs_columns(archive,member,TABLE_COLUMNS[name]);count=0;batch=[]
            with archive.open(member) as stream:
                for row in _dict_rows(stream):
                    count+=1
                    if name=='calendar.txt':
                        for day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'):
                            if row[day] not in ('0','1'): raise DatasetReadError(f'{name} row {count}: {day} must be 0 or 1.')
                        start=datetime.strptime(row['start_date'],'%Y%m%d');end=datetime.strptime(row['end_date'],'%Y%m%d')
                        if start>end: raise DatasetReadError(f'{name} has an inverted service date range.')
                    elif name=='calendar_dates.txt':
                        datetime.strptime(row['date'],'%Y%m%d')
                        if row['exception_type'] not in ('1','2'): raise DatasetReadError('calendar_dates.txt exception_type must be 1 or 2.')
                    elif name=='shapes.txt':
                        _number(row['shape_pt_lat'],'shape latitude',required=True);_number(row['shape_pt_lon'],'shape longitude',required=True)
                        if not row['shape_id'] or int(row['shape_pt_sequence'])<0: raise DatasetReadError('shapes.txt needs a shape ID and non-negative sequence.')
                    elif name=='frequencies.txt':
                        start=_gtfs_time(row['start_time']);end=_gtfs_time(row['end_time'])
                        if start is None or end is None or end<=start or int(row['headway_secs'])<=0 or row.get('exact_times','0') not in ('','0','1'):
                            raise DatasetReadError('frequencies.txt needs valid start/end times, positive headway_secs and exact_times 0 or 1.')
                    elif name=='agency.txt':
                        from zoneinfo import ZoneInfo
                        ZoneInfo(row['agency_timezone'])
                    elif name=='feed_info.txt':
                        for field in ('feed_start_date','feed_end_date'):
                            if row.get(field): datetime.strptime(row[field],'%Y%m%d')
                    if name not in CORE|{'calendar.txt','calendar_dates.txt'}:
                        batch.append((source_id,name,count,json.dumps(row,ensure_ascii=False)))
                        if len(batch)>=25000:
                            with store.connect() as db:db.executemany('INSERT INTO gtfs_extra_rows VALUES (?,?,?,?)',batch)
                            batch=[]
            if batch:
                with store.connect() as db:db.executemany('INSERT INTO gtfs_extra_rows VALUES (?,?,?,?)',batch)
            report['row_counts'][name]=count
        with store.connect() as db:
            zones=[row[0] for row in db.execute("SELECT DISTINCT json_extract(payload_json,'$.agency_timezone') FROM gtfs_extra_rows WHERE source_id=? AND table_name='agency.txt'",(source_id,))]
            if len(zones)==1:db.execute('UPDATE sources SET timezone=? WHERE id=?',(zones[0],source_id))
            elif len(zones)>1:report['warnings'].append('Multiple agency timezones are present. Service times are not converted into a fabricated common timezone.')
        report['warnings'].append('Stop times describe scheduled events, not passenger journeys. Frequency windows are retained separately; calendar exceptions are not expanded into demand.')
        store.save_source_details(source_id,{'gtfs':report,'dataset_type':'scheduled_transit'})
        return report
    except Exception as exc:
        report['errors'].append(str(exc))
        raise DatasetReadError(f'GTFS validation failed: {exc}',report) from exc


def validate_relationships(store,source_id,report):
    with store.connect() as db:
        counts=db.execute('SELECT (SELECT COUNT(*) FROM gtfs_services WHERE source_id=?)+(SELECT COUNT(*) FROM gtfs_service_dates WHERE source_id=?)',(source_id,source_id)).fetchone()[0]
        if counts:
            invalid=db.execute('''SELECT COUNT(*) FROM gtfs_trips t WHERE t.source_id=? AND NOT EXISTS
                (SELECT 1 FROM gtfs_services c WHERE c.source_id=t.source_id AND c.service_id=t.service_id) AND NOT EXISTS
                (SELECT 1 FROM gtfs_service_dates d WHERE d.source_id=t.source_id AND d.service_id=t.service_id)''',(source_id,)).fetchone()[0]
            if invalid: raise DatasetReadError(f'GTFS trips.txt has {invalid} unknown service_id references.',report)
        for table,field,target,target_field in [('frequencies.txt','trip_id','gtfs_trips','trip_id'),('transfers.txt','from_stop_id','gtfs_stops','stop_id'),('transfers.txt','to_stop_id','gtfs_stops','stop_id'),('pathways.txt','from_stop_id','gtfs_stops','stop_id'),('pathways.txt','to_stop_id','gtfs_stops','stop_id')]:
            invalid=db.execute(f'''SELECT COUNT(*) FROM gtfs_extra_rows e WHERE e.source_id=? AND e.table_name=?
                AND NOT EXISTS (SELECT 1 FROM {target} t WHERE t.source_id=e.source_id AND t.{target_field}=json_extract(e.payload_json,?))''',(source_id,table,f'$.{field}')).fetchone()[0]
            if invalid: raise DatasetReadError(f'GTFS {table} has {invalid} unknown {field} references.',report)
        invalid=db.execute('''SELECT COUNT(*) FROM gtfs_stops s WHERE s.source_id=? AND COALESCE(json_extract(s.properties_json,'$.parent_station'),'')<>''
            AND NOT EXISTS(SELECT 1 FROM gtfs_stops p WHERE p.source_id=s.source_id AND p.stop_id=json_extract(s.properties_json,'$.parent_station'))''',(source_id,)).fetchone()[0]
        if invalid:raise DatasetReadError(f'GTFS stops.txt has {invalid} unknown parent_station references.',report)
        if report['row_counts'].get('agency.txt'):
            agencies=report['row_counts']['agency.txt']
            invalid=db.execute('''SELECT COUNT(*) FROM gtfs_routes r WHERE r.source_id=? AND
                ((? > 1 AND COALESCE(json_extract(r.properties_json,'$.agency_id'),'')='') OR
                (COALESCE(json_extract(r.properties_json,'$.agency_id'),'')<>'' AND NOT EXISTS
                 (SELECT 1 FROM gtfs_extra_rows a WHERE a.source_id=r.source_id AND a.table_name='agency.txt'
                  AND json_extract(a.payload_json,'$.agency_id')=json_extract(r.properties_json,'$.agency_id'))))''',(source_id,agencies)).fetchone()[0]
            if invalid:raise DatasetReadError(f'GTFS routes.txt has {invalid} missing or unknown agency_id references.',report)
        if report['row_counts'].get('shapes.txt'):
            invalid=db.execute('''SELECT COUNT(*) FROM gtfs_trips t WHERE t.source_id=? AND COALESCE(json_extract(t.properties_json,'$.shape_id'),'')<>''
                AND NOT EXISTS(SELECT 1 FROM gtfs_extra_rows e WHERE e.source_id=t.source_id AND e.table_name='shapes.txt' AND json_extract(e.payload_json,'$.shape_id')=json_extract(t.properties_json,'$.shape_id'))''',(source_id,)).fetchone()[0]
            if invalid:raise DatasetReadError(f'GTFS trips.txt has {invalid} unknown shape_id references.',report)
