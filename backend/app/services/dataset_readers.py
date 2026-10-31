"""Format-specific readers which normalize mobility sources into MobilityStore rows."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

from app.services.mobility_store import MobilityStore

CHUNK_SIZE = 25_000
MAX_GEOJSON_BYTES = 256 * 1024 * 1024
MAX_ZIP_ENTRIES = 100_000
MAX_ZIP_MEMBER_BYTES = 1024 * 1024 * 1024
MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024


from app.services.dataset_errors import DatasetReadError
from app.services.schema_mapping import ALIASES, infer_schema, missing
from app.services.tabular_reader import detect_tabular, frames, clean_rows


def _key(value: Any) -> str:
    value = str(value or '').strip().lstrip('\ufeff').lower()
    value = re.sub(r'[^a-z0-9]+', '_', value).strip('_')
    return value


ALIAS_TO_FIELD = {alias: field for field, aliases in ALIASES.items() for alias in aliases}


def detect_format(path: Path) -> str:
    if path.is_dir(): return 'geolife_folder'
    fmt = detect_tabular(path)
    if fmt == 'archive':
        try:
            with zipfile.ZipFile(path) as archive:
                members = _validated_zip_members(archive)
                names = {Path(name).name.lower() for name in members}
                core = {'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'}
                signatures={'stops.txt':{'stop_id','stop_lat'},'routes.txt':{'route_id','route_type'},
                            'trips.txt':{'trip_id','service_id'},'stop_times.txt':{'trip_id','stop_sequence'}}
                for member in members:
                    name=Path(member).name.lower()
                    if name in core:
                        with archive.open(member) as stream:
                            header=next(csv.reader(io.StringIO(stream.read(32768).decode('utf-8-sig'))),[])
                        if signatures[name] <= set(header): return 'gtfs_static'
                if any(name.endswith('.plt') for name in names): return 'geolife_zip'
                if any(Path(name).suffix.lower() in TABULAR_SUFFIXES for name in members): return 'tabular_zip'
        except (zipfile.BadZipFile, OSError) as exc:
            raise DatasetReadError('The uploaded file is not a valid, readable ZIP archive.') from exc
        raise DatasetReadError('ZIP contains no supported tabular, GeoJSON, GTFS or GeoLife files.')
    if fmt == 'xlsx':
        with zipfile.ZipFile(path) as archive: _validated_zip_members(archive)
    if fmt == 'json':
        if path.stat().st_size > MAX_GEOJSON_BYTES: raise DatasetReadError('JSON/GeoJSON documents must be 256 MB or smaller; use JSON Lines for larger tables.')
        try: document=json.loads(path.read_text(encoding='utf-8-sig'))
        except ValueError as exc: raise DatasetReadError(f'Invalid JSON: {exc}') from exc
        if isinstance(document,dict) and document.get('type') in ('FeatureCollection','Feature','Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection'):
            return 'geojson'
    return fmt


TABULAR_SUFFIXES = {'.csv','.tsv','.txt','.xlsx','.xls','.json','.jsonl','.ndjson','.geojson'}


def _timestamp(raw: Any, tz_name: Any = None) -> tuple[str | None, str | None, str | None]:
    if missing(raw): return None, None, str(tz_name) if tz_name else None
    try:
        if isinstance(raw,(int,float)) or (isinstance(raw,str) and re.fullmatch(r'\d{4}(-\d{2})?',raw.strip())):
            return None,None,str(tz_name) if tz_name else None
        if isinstance(raw,str) and re.fullmatch(r'\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?',raw.strip()):
            return None, None, str(tz_name) if tz_name else None
        stamp = pd.Timestamp(raw)
        zone = str(tz_name).strip() if tz_name is not None and str(tz_name).strip() else None
        if stamp.tzinfo is None and zone:
            stamp = stamp.tz_localize(zone, ambiguous='NaT', nonexistent='NaT')
            if pd.isna(stamp): return None, None, zone
        local_value = stamp.tz_localize(None).isoformat() if stamp.tzinfo is not None else stamp.isoformat()
        utc_value = stamp.tz_convert('UTC').isoformat() if stamp.tzinfo is not None else None
        return utc_value or local_value, local_value, zone or (str(stamp.tzinfo) if stamp.tzinfo else None)
    except Exception:
        return None, None, str(tz_name) if tz_name else None


def _number(value: Any, field: str, *, required: bool = False) -> float | None:
    if missing(value):
        if required: raise DatasetReadError(f'Record is missing required {field}.')
        return None
    try: number = float(value)
    except (TypeError, ValueError) as exc: raise DatasetReadError(f'{field} must be numeric; received {value!r}.') from exc
    if not math.isfinite(number): raise DatasetReadError(f'{field} must be finite.')
    bounds = (-90, 90) if 'latitude' in field else (-180, 180)
    if number < bounds[0] or number > bounds[1]: raise DatasetReadError(f'{field} value {number} is outside {bounds}.')
    return number


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode('utf-8')).hexdigest()


def _normalize_row(row: dict[str, Any], source_timezone: str | None, *, timestamp_required: bool = False,
                   record_type: str = 'point', trajectory_id: str | None = None,
                   column_mapping: dict[str,str] | None = None, dataset_type: str = 'auto', date_format: str | None = None) -> dict[str, Any]:
    normalized = {_key(key): value for key, value in row.items()}
    mapped: dict[str, Any] = {}
    custom={_key(source_name):('latitude' if canonical=='origin_latitude' else 'longitude' if canonical=='origin_longitude' else canonical) for canonical,source_name in (column_mapping or {}).items() if source_name}
    for key, value in normalized.items():
        field = custom.get(key) if column_mapping is not None else ALIAS_TO_FIELD.get(key)
        if field and field not in mapped and not missing(value): mapped[field] = value
    if mapped.get('date') and mapped.get('timestamp') and re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?', str(mapped['timestamp']).strip()):
        mapped['timestamp'] = f"{mapped['date']} {mapped['timestamp']}"
    if not mapped.get('timestamp') and mapped.get('date') and mapped.get('time'):
        mapped['timestamp'] = f"{mapped['date']} {mapped['time']}"
    latitude = _number(mapped.get('latitude'), 'latitude', required=False)
    longitude = _number(mapped.get('longitude'), 'longitude', required=False)
    origin_lat = _number(mapped.get('latitude'), 'origin latitude', required=False)
    origin_lon = _number(mapped.get('longitude'), 'origin longitude', required=False)
    dest_lat = _number(mapped.get('destination_latitude'), 'destination latitude', required=False)
    dest_lon = _number(mapped.get('destination_longitude'), 'destination longitude', required=False)
    if (latitude is None) != (longitude is None) or (dest_lat is None) != (dest_lon is None):
        raise DatasetReadError('Coordinate pairs must contain both latitude and longitude.')
    if dataset_type in ('trajectory','geographic') and latitude is None and not mapped.get('geometry'):
        raise DatasetReadError('This geographic row has no usable coordinate pair or geometry.')
    if not mapped.get('timestamp') and mapped.get('date'):
        mapped['timestamp'] = str(mapped['date'])
    time_raw=mapped.get('timestamp')
    if time_raw and date_format:
        try: mapped['timestamp']=pd.to_datetime(time_raw,format=date_format).isoformat()
        except (ValueError,TypeError) as exc: raise DatasetReadError(f'Timestamp does not match date format {date_format}.') from exc
    elif time_raw and re.match(r'^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}',str(time_raw)):
        raise DatasetReadError('Ambiguous date order. Choose an explicit date format such as %d/%m/%Y before import.')
    if timestamp_required and not mapped.get('timestamp'):
        raise DatasetReadError('No timestamp column was detected. Add timestamp, datetime, pickup_datetime, start_time or date plus time.')
    time_zone = mapped.get('timezone') or source_timezone
    timestamp, local_timestamp, parsed_zone = _timestamp(mapped.get('timestamp'), time_zone)
    if (timestamp_required or time_raw) and not timestamp:
        raise DatasetReadError(f"Invalid timestamp {mapped.get('timestamp')!r}; use ISO-8601 or a parseable date/time value.")
    count = None
    if mapped.get('event_count') is not None:
        try:
            count = float(mapped['event_count'])
            if not math.isfinite(count) or count < 0: raise ValueError
        except (TypeError, ValueError) as exc:
            raise DatasetReadError(f"Count/volume value {mapped['event_count']!r} must be a non-negative number.") from exc
    known = set(ALIAS_TO_FIELD)
    def has_value(value: Any) -> bool:
        if value is None: return False
        if isinstance(value, (float, int)) and math.isnan(value): return False
        return True
    properties = {key: value for key, value in normalized.items() if has_value(value)}
    for name in ('indicator','value','year','unit','origin','destination','geometry'):
        if name in mapped: properties[name]=mapped[name]
    if mapped.get('value') is not None:
        try:
            value=float(mapped['value'])
            if not math.isfinite(value): raise ValueError
            properties['value']=value
        except (TypeError,ValueError) as exc: raise DatasetReadError('Indicator value must be a finite number.') from exc
    if dataset_type=='indicator' and ('indicator' not in mapped or 'value' not in mapped):
        raise DatasetReadError('Indicator rows require a name and numeric value.')
    date_only=bool(time_raw and re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(time_raw)))
    properties['time_precision']='date' if date_only else 'datetime' if timestamp else None
    if 'timestamp' in normalized and mapped.get('timestamp') is not None:
        properties['source_timestamp'] = str(mapped['timestamp'])
    local_stamp = pd.Timestamp(local_timestamp) if local_timestamp else None
    return {
        'row_hash': _hash(normalized), 'record_type': record_type, 'timestamp': timestamp,
        'local_timestamp': local_timestamp, 'timezone': parsed_zone,
        'latitude': latitude if latitude is not None else origin_lat if origin_lat is not None else dest_lat,
        'longitude': longitude if longitude is not None else origin_lon if origin_lon is not None else dest_lon,
        'origin_latitude': origin_lat, 'origin_longitude': origin_lon,
        'destination_latitude': dest_lat, 'destination_longitude': dest_lon,
        'trip_id': str(mapped['trip_id']) if mapped.get('trip_id') is not None else None,
        'trajectory_id': str(mapped.get('trajectory_id') or trajectory_id) if mapped.get('trajectory_id') or trajectory_id else None,
        'route_id': str(mapped['route_id']) if mapped.get('route_id') is not None else None,
        'area_name': str(mapped['area_name']).strip() if mapped.get('area_name') is not None else None,
        'country': str(mapped['country']).strip() if mapped.get('country') is not None else None,
        'state': str(mapped['state']).strip() if mapped.get('state') is not None else None,
        'city': str(mapped['city']).strip() if mapped.get('city') is not None else None,
        'event_count': count, 'properties': properties,
        'local_hour': int(local_stamp.hour) if local_stamp is not None and not date_only else None,
        'local_weekday': int(local_stamp.weekday()) if local_stamp is not None else None,
        'local_day': local_stamp.strftime('%Y-%m-%d') if local_stamp is not None else None,
        'local_month': local_stamp.strftime('%Y-%m') if local_stamp is not None else None,
        'local_week': local_stamp.strftime('%G-W%V') if local_stamp is not None else None,
    }


def ingest_dataset(path: Path, source_id: str, store: MobilityStore, metadata: dict[str, Any]) -> dict:
    fmt = detect_format(path)
    meta = {**metadata, 'id': source_id, 'filename': path.name, 'format': fmt}
    store.start_source(meta)
    try:
        if fmt in ('csv','tsv','whitespace','json','jsonl','xlsx','xls'):
            rejected, duplicates = _read_tabular(path, source_id, store, metadata, fmt)
        elif fmt == 'tabular_zip': rejected, duplicates = _read_tabular_zip(path,source_id,store,metadata)
        elif fmt == 'gtfs_static': rejected, duplicates = _read_gtfs(path, source_id, store)
        elif fmt in ('geolife_plt', 'geolife_folder', 'geolife_zip'): rejected, duplicates = _read_geolife(path, source_id, store, fmt)
        elif fmt == 'geojson': rejected, duplicates = _read_geojson(path, source_id, store, metadata.get('timezone'),metadata.get('column_mapping'))
        else: raise DatasetReadError(f'No reader is implemented for {fmt}.')
        summary = store.finalize_source(source_id, duplicate_count=duplicates, rejected_count=rejected)
        return {'format': fmt, **summary, 'import_report': store.get_source(source_id).get('details',{})}
    except Exception as exc:
        store.fail_source(source_id, str(exc))
        if isinstance(exc, DatasetReadError):
            source=store.get_source(source_id)
            saved=(source or {}).get('details',{}).get('gtfs')
            if saved: exc.report={**saved,'errors':[*saved.get('errors',[]),str(exc)]}
            raise
        raise DatasetReadError(f'Could not ingest {path.name}: {exc}') from exc


def _read_csv(path, source_id, store, source_timezone, column_mapping=None):
    return _read_tabular(path,source_id,store,{'timezone':source_timezone,'column_mapping':column_mapping},'csv')


def _read_tabular(path,source_id,store,metadata,fmt):
    inserted_total=duplicates=rejected=0; errors=[]; schema=None
    for frame in frames(path,fmt):
        rows=clean_rows(frame)
        inferred=infer_schema(list(frame.columns),rows[:200],metadata.get('column_mapping'),metadata.get('dataset_type','auto'))
        if inferred['requires_mapping']:
            raise DatasetReadError('Confirm schema mappings before importing. '+inferred['schema_message'],inferred)
        if schema and inferred['mapping']!=schema['mapping']:
            raise DatasetReadError('Columns change between chunks or archive files. Import each table separately or use a consistent schema.')
        schema=inferred; batch=[]; geometry_batch=[]
        for index,raw in enumerate(rows):
            try:
                record=_normalize_row(raw,metadata.get('timezone'),column_mapping=schema['mapping'],
                    dataset_type=schema['dataset_type'],record_type=schema['dataset_type'],
                    timestamp_required=schema['dataset_type'] in ('trajectory','temporal'),date_format=metadata.get('date_format'))
                geom=record['properties'].get('geometry')
                if geom:
                    from shapely import wkt
                    from shapely.geometry import shape, mapping as geometry_mapping
                    obj=shape(geom if isinstance(geom,dict) else json.loads(geom)) if isinstance(geom,dict) or str(geom).lstrip().startswith('{') else wkt.loads(str(geom))
                    if obj.is_empty or not obj.is_valid: raise DatasetReadError('Empty or invalid geometry.')
                    bounds=obj.bounds
                    if not (-180<=bounds[0]<=bounds[2]<=180 and -90<=bounds[1]<=bounds[3]<=90): raise DatasetReadError('Geometry must use WGS84 longitude/latitude coordinates.')
                    geometry_batch.append((record['row_hash'],obj.geom_type,json.dumps(geometry_mapping(obj)),json.dumps(record['properties'],default=str)))
                    if obj.geom_type=='Point': record['latitude']=obj.y;record['longitude']=obj.x
                batch.append(record)
            except Exception as exc:
                rejected+=1
                if len(errors)<10: errors.append({'row':inserted_total+rejected+duplicates+len(batch),'message':str(exc)})
        inserted,dupes=store.insert_observations(source_id,batch);inserted_total+=inserted;duplicates+=dupes
        store.insert_geo_features(source_id,geometry_batch)
    if not inserted_total: raise DatasetReadError(f'No valid mobility rows or tabular records found ({rejected} rejected).',{'errors':errors})
    store.save_source_details(source_id,{'schema':schema,'dataset_type':schema['dataset_type'],
        'row_errors':errors,'warnings':schema['warnings'],'validation':{'accepted':inserted_total,'rejected':rejected,'duplicates':duplicates},'date_format':metadata.get('date_format')})
    return rejected,duplicates


def _archive_tables(archive):
    return [name for name in _validated_zip_members(archive) if not name.endswith('/') and
            not name.startswith('__MACOSX/') and Path(name).name not in ('.DS_Store',) and Path(name).suffix.lower() in TABULAR_SUFFIXES]


def _selected_tables(archive,metadata):
    tables=_archive_tables(archive)
    selected=metadata.get('archive_member')
    if selected:
        if selected not in tables:raise DatasetReadError('Select a supported table present in this validated archive.')
        return [selected]
    return tables


def _read_tabular_zip(path,source_id,store,metadata):
    import tempfile
    rejected=duplicates=0; reports=[]; expected=None
    with zipfile.ZipFile(path) as archive:
        for member in _selected_tables(archive,metadata):
            with tempfile.TemporaryDirectory(dir=store.data_directory) as directory:
                target=Path(directory)/Path(member).name
                # Safe basename in a new private directory; never extract archive paths.
                with archive.open(member) as stream,target.open('wb') as output:
                    while chunk:=stream.read(1024*1024): output.write(chunk)
                fmt=detect_format(target)
                preview=preview_dataset(target,metadata)
                signature=(preview.get('dataset_type'),preview.get('mapping'))
                if expected and signature!=expected: raise DatasetReadError('ZIP contains different table schemas. Upload related tables separately; only GTFS tables are joined automatically.')
                expected=signature
                if fmt=='geojson': counts=_read_geojson(target,source_id,store,metadata.get('timezone'),metadata.get('column_mapping'))
                elif fmt in ('csv','tsv','whitespace','json','jsonl','xlsx','xls'): counts=_read_tabular(target,source_id,store,metadata,fmt)
                else: raise DatasetReadError(f'Unsupported archive member {member}.')
                rejected+=counts[0];duplicates+=counts[1];reports.append({'file':member,'format':fmt})
    store.save_source_details(source_id,{'archive_files':reports})
    return rejected,duplicates


def preview_dataset(path: Path,metadata: dict | None=None) -> dict:
    metadata=metadata or {};fmt=detect_format(path)
    if fmt=='gtfs_static':
        with zipfile.ZipFile(path) as archive:
            names=_validated_zip_members(archive)
            return {'format':fmt,'dataset_type':'scheduled_transit','requires_mapping':False,
                    'recognised_files':[name for name in names if Path(name).suffix.lower()=='.txt'],
                    'warnings':['GTFS tables are validated and joined during import. Scheduled service is not passenger demand.']}
    if fmt=='tabular_zip':
        import tempfile
        reports=[]
        with zipfile.ZipFile(path) as archive:
            for member in _selected_tables(archive,metadata):
                with tempfile.TemporaryDirectory() as directory:
                    target=Path(directory)/Path(member).name
                    with archive.open(member) as stream,target.open('wb') as output:
                        while chunk:=stream.read(1024*1024):output.write(chunk)
                    reports.append({'file':member,**preview_dataset(target,metadata)})
        first=reports[0] if reports else {}
        signatures={json.dumps([item.get('dataset_type'),item.get('mapping')],sort_keys=True) for item in reports}
        return {**first,'format':fmt,'archive_files':reports,'requires_mapping':any(item.get('requires_mapping') for item in reports),
                'requires_table_selection':len(signatures)>1}
    if fmt=='geojson':
        document=json.loads(path.read_text(encoding='utf-8-sig'))
        features=document.get('features',[]) if document.get('type')=='FeatureCollection' else [document if document.get('type')=='Feature' else {'geometry':document,'properties':{}}]
        samples=[]
        for feature in features[:200]:
            geometry=feature.get('geometry') or {};row={**(feature.get('properties') or {}),'geometry':geometry}
            if geometry.get('type')=='Point' and len(geometry.get('coordinates',[]))>=2:
                row.update({'longitude':geometry['coordinates'][0],'latitude':geometry['coordinates'][1]})
            samples.append(row)
        columns=list(dict.fromkeys(column for row in samples for column in row))
        if not samples:raise DatasetReadError('GeoJSON has no features to preview.')
        return {'format':fmt,**infer_schema(columns,samples,metadata.get('column_mapping'),metadata.get('dataset_type','auto'))}
    if fmt in ('geolife_plt','geolife_zip','geolife_folder'):
        return {'format':fmt,'dataset_type':'geographic' if fmt=='geojson' else 'trajectory','requires_mapping':False,
                'warnings':['Native geographic coordinates are retained; missing timestamps are not fabricated.']}
    frame=next(frames(path,fmt,sample_only=True),None)
    if frame is None or frame.empty: raise DatasetReadError('This table has no data rows.')
    return {'format':fmt,**infer_schema(list(frame.columns),clean_rows(frame),metadata.get('column_mapping'),metadata.get('dataset_type','auto'))}


def _archive_member(archive: zipfile.ZipFile, basename: str) -> str | None:
    matches = [name for name in _validated_zip_members(archive) if Path(name).name.lower() == basename.lower()]
    if len(matches) > 1:
        raise DatasetReadError(f'GTFS ZIP contains multiple files named {basename}; keep one copy only.')
    return matches[0] if matches else None


def _validated_zip_members(archive: zipfile.ZipFile) -> list[str]:
    infos = archive.infolist()
    if not infos: raise DatasetReadError('The ZIP archive is empty.')
    if len(infos) > MAX_ZIP_ENTRIES:
        raise DatasetReadError(f'ZIP contains too many entries (maximum {MAX_ZIP_ENTRIES:,}).')
    total_size = 0
    safe_names = []
    seen_names=set()
    for info in infos:
        name = info.filename.replace('\\', '/')
        parts = name.split('/')
        reserved={'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}
        if name.startswith('/') or any(':' in part or part in ('.','..') or
            (part and (part.endswith((' ','.')) or part.split('.')[0].upper() in reserved)) for part in parts):
            raise DatasetReadError(f'ZIP contains an unsafe path: {info.filename!r}.')
        mode = (info.external_attr >> 16) & 0o170000
        if mode == 0o120000:
            raise DatasetReadError(f'ZIP contains a symbolic link: {info.filename!r}.')
        if info.flag_bits & 0x1:
            raise DatasetReadError(f'ZIP contains an encrypted entry that cannot be safely imported: {info.filename!r}.')
        if info.file_size > MAX_ZIP_MEMBER_BYTES:
            raise DatasetReadError(f'ZIP entry {info.filename!r} exceeds the 1 GB uncompressed limit.')
        if info.file_size > 10 * 1024 * 1024 and (info.compress_size == 0 or info.file_size / info.compress_size > 1000):
            raise DatasetReadError(f'ZIP entry {info.filename!r} has an unsafe compression ratio and may be a ZIP bomb.')
        total_size += info.file_size
        if total_size > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise DatasetReadError('ZIP expands beyond the 2 GB uncompressed import limit.')
        if name in seen_names: raise DatasetReadError(f'ZIP contains a duplicate member path: {name!r}.')
        seen_names.add(name)
        safe_names.append(info.filename)
    return safe_names


def _dict_rows(stream) -> Iterator[dict[str,str]]:
    text = io.TextIOWrapper(stream, encoding='utf-8-sig', newline='')
    reader = csv.DictReader(text)
    if not reader.fieldnames:
        raise DatasetReadError('GTFS table is empty or has no header row.')
    reader.fieldnames = [name.strip().lstrip('\ufeff') if name else '' for name in reader.fieldnames]
    if len(set(reader.fieldnames)) != len(reader.fieldnames) or any(not name for name in reader.fieldnames):
        raise DatasetReadError('GTFS table has empty or duplicate column names.')
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise DatasetReadError(f'Malformed GTFS row near line {reader.line_num}: its field count does not match the header.')
        yield {key: (value.strip() if value is not None else '') for key, value in row.items()}


def _validate_gtfs_columns(archive: zipfile.ZipFile, member: str, required: set[str]) -> None:
    with archive.open(member) as stream:
        text = io.TextIOWrapper(stream, encoding='utf-8-sig', newline='')
        try:
            headers = next(csv.reader(text))
        except StopIteration as exc:
            raise DatasetReadError(f'{Path(member).name} is empty; expected columns: {", ".join(sorted(required))}.') from exc
        columns = [header.strip().lstrip('\ufeff') for header in headers]
        missing = sorted(required - set(columns))
        if missing:
            raise DatasetReadError(f'{Path(member).name} is missing required column(s): {", ".join(missing)}.')


def _gtfs_time(value: str | None) -> int | None:
    if not value: return None
    try:
        hours, minutes, seconds = (int(part) for part in value.split(':'))
        if hours < 0 or minutes not in range(60) or seconds not in range(60): return None
        return hours * 3600 + minutes * 60 + seconds
    except (ValueError, TypeError): return None


def _read_gtfs(path: Path, source_id: str, store: MobilityStore) -> tuple[int,int]:
    rejected = duplicates = 0
    try:
        archive_context = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise DatasetReadError('The uploaded file is not a valid, readable ZIP archive.') from exc
    with archive_context as archive:
        from app.services.gtfs_validation import inventory, validate_relationships
        report=inventory(archive,store,source_id)
        required = {name: _archive_member(archive, name) for name in ('stops.txt','routes.txt','trips.txt','stop_times.txt')}
        missing = [name for name, member in required.items() if member is None]
        if missing: raise DatasetReadError(f'GTFS ZIP is missing required table(s): {", ".join(missing)}.')
        required_columns = {
            'stops.txt': {'stop_id', 'stop_lat', 'stop_lon'},
            'routes.txt': {'route_id', 'route_type'},
            'trips.txt': {'route_id', 'service_id', 'trip_id'},
            'stop_times.txt': {'trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time'},
        }
        for name, columns in required_columns.items():
            _validate_gtfs_columns(archive, required[name], columns)
        calendar_member = _archive_member(archive, 'calendar.txt')
        if calendar_member:
            _validate_gtfs_columns(archive, calendar_member, {'service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'})
        dates_member = _archive_member(archive, 'calendar_dates.txt')
        if dates_member:
            _validate_gtfs_columns(archive, dates_member, {'service_id','date','exception_type'})
        stop_count = 0
        stop_batch=[]
        with archive.open(required['stops.txt']) as stream:
            for row in _dict_rows(stream):
                sid = row.get('stop_id','').strip()
                if not sid: rejected += 1; continue
                try: lat = _number(row.get('stop_lat'),'stop latitude'); lon = _number(row.get('stop_lon'),'stop longitude')
                except DatasetReadError: rejected += 1; continue
                props = {k:v for k,v in row.items() if k not in ('stop_id','stop_name','stop_lat','stop_lon') and v}
                stop_batch.append((sid,row.get('stop_name',''),lat,lon,json.dumps(props)))
                stop_count += 1
                if len(stop_batch)>=CHUNK_SIZE: store.insert_gtfs_rows('stops',source_id,stop_batch); stop_batch=[]
        store.insert_gtfs_rows('stops',source_id,stop_batch)
        route_batch=[]
        with archive.open(required['routes.txt']) as stream:
            for row in _dict_rows(stream):
                rid=row.get('route_id','').strip()
                if not rid: rejected += 1; continue
                try: route_type=int(row['route_type'])
                except (KeyError,ValueError): rejected += 1; continue
                display=' '.join(filter(None,(row.get('route_short_name'),row.get('route_long_name'))))
                route_batch.append((rid,route_type,display,json.dumps(row,ensure_ascii=False)))
                if len(route_batch)>=CHUNK_SIZE: store.insert_gtfs_rows('routes',source_id,route_batch); route_batch=[]
        store.insert_gtfs_rows('routes',source_id,route_batch)
        trip_count = 0
        batch=[]
        with archive.open(required['trips.txt']) as stream:
            for row in _dict_rows(stream):
                tid=row.get('trip_id','').strip()
                route_id=row.get('route_id','').strip(); service_id=row.get('service_id','').strip()
                if not tid or not route_id or not service_id: rejected += 1; continue
                trip_count += 1
                batch.append((tid,route_id,service_id,row.get('direction_id'),json.dumps(row,ensure_ascii=False)))
                if len(batch)>=CHUNK_SIZE: store.insert_gtfs_rows('trips',source_id,batch); batch=[]
        store.insert_gtfs_rows('trips',source_id,batch)
        if calendar_member:
            batch=[]
            with archive.open(calendar_member) as stream:
                for row in _dict_rows(stream):
                    sid=row.get('service_id','').strip()
                    if not sid: continue
                    values=[sid]+[int(row.get(day,'0') or 0) for day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')]+[row.get('start_date'),row.get('end_date'),json.dumps({})]
                    batch.append(tuple(values))
                    if len(batch)>=CHUNK_SIZE: store.insert_gtfs_rows('services',source_id,batch); batch=[]
            store.insert_gtfs_rows('services',source_id,batch)
        if dates_member:
            batch=[]
            with archive.open(dates_member) as stream:
                for row in _dict_rows(stream):
                    try: value=(row['service_id'],row['date'],int(row['exception_type']))
                    except (KeyError,ValueError): rejected += 1; continue
                    batch.append(value)
                    if len(batch)>=CHUNK_SIZE: store.insert_gtfs_rows('service_dates',source_id,batch); batch=[]
            store.insert_gtfs_rows('service_dates',source_id,batch)
        batch=[]
        stop_times_count = 0
        with archive.open(required['stop_times.txt']) as stream:
            for row in _dict_rows(stream):
                trip_id=row.get('trip_id','').strip(); stop_id=row.get('stop_id','').strip()
                if not trip_id or not stop_id: rejected += 1; continue
                seconds=_gtfs_time(row.get('departure_time') or row.get('arrival_time'))
                if seconds is None and (row.get('arrival_time') or row.get('departure_time') or row.get('timepoint','1')!='0'):
                    rejected += 1; continue
                try: sequence=int(row.get('stop_sequence',''))
                except ValueError: rejected += 1; continue
                if sequence<0: rejected+=1;continue
                arrival=_gtfs_time(row.get('arrival_time'))
                departure=_gtfs_time(row.get('departure_time'))
                batch.append((trip_id,stop_id,sequence,arrival,departure))
                stop_times_count += 1
                if len(batch)>=CHUNK_SIZE:
                    store.insert_gtfs_stop_times(source_id,batch); batch=[]
        store.insert_gtfs_stop_times(source_id,batch)
    if not stop_count: raise DatasetReadError('GTFS stops.txt contains no valid stops with coordinates.')
    if not trip_count: raise DatasetReadError('GTFS trips.txt contains no usable trips.')
    if not stop_times_count: raise DatasetReadError('GTFS stop_times.txt contains no usable arrival/departure records.')
    with store.connect() as db:
        bad_trip_routes = db.execute('''SELECT COUNT(*) FROM gtfs_trips t WHERE t.source_id=?
            AND NOT EXISTS (SELECT 1 FROM gtfs_routes r WHERE r.source_id=t.source_id AND r.route_id=t.route_id)''', (source_id,)).fetchone()[0]
        bad_stop_time_refs = db.execute('''SELECT COUNT(*) FROM gtfs_stop_times st WHERE st.source_id=? AND (
            NOT EXISTS (SELECT 1 FROM gtfs_trips t WHERE t.source_id=st.source_id AND t.trip_id=st.trip_id)
            OR NOT EXISTS (SELECT 1 FROM gtfs_stops s WHERE s.source_id=st.source_id AND s.stop_id=st.stop_id))''', (source_id,)).fetchone()[0]
    if bad_trip_routes:
        raise DatasetReadError(f'GTFS trips.txt has {bad_trip_routes} trip(s) referencing an unknown route_id.')
    if bad_stop_time_refs:
        raise DatasetReadError(f'GTFS stop_times.txt has {bad_stop_time_refs} row(s) referencing an unknown trip_id or stop_id.')
    validate_relationships(store,source_id,report)
    for table,sql_table in [('stops.txt','gtfs_stops'),('routes.txt','gtfs_routes'),('trips.txt','gtfs_trips'),('stop_times.txt','gtfs_stop_times')]:
        with store.connect() as db: kept=db.execute(f'SELECT COUNT(*) FROM {sql_table} WHERE source_id=?',(source_id,)).fetchone()[0]
        if report['row_counts'][table]>kept:
            report['warnings'].append(f'{table}: {report["row_counts"][table]-kept} rows were invalid or repeated; retained {kept}.')
    report['validation']={'rejected':rejected,'duplicates':duplicates}
    store.save_source_details(source_id,{'gtfs':report})
    rejected += store.prune_invalid_gtfs_times(source_id)
    if not store.gtfs_times_count(source_id):
        raise DatasetReadError('No GTFS stop_times rows connect to both a known trip and stop.')
    if not store.get_source(source_id): raise DatasetReadError('GTFS source registration failed.')
    return rejected,duplicates


def _plt_rows(stream, trajectory_id: str) -> Iterator[dict[str,Any]]:
    text=io.TextIOWrapper(stream,encoding='utf-8-sig',errors='replace')
    for _ in range(6):
        next(text,None)
    for fields in csv.reader(text):
        if len(fields)<7: continue
        yield {'latitude':fields[0], 'longitude':fields[1], 'altitude':fields[3],
               'timestamp':f'{fields[5]} {fields[6]}', 'trajectory_id':trajectory_id}


def _ingest_rows(source_id: str, store: MobilityStore, rows: Iterator[dict], timezone_name: str | None,
                 column_mapping: dict[str,str] | None = None, timestamp_required: bool = True,
                 record_type: str = 'trajectory_point') -> tuple[int,int,int]:
    batch=[]; rejected=duplicates=inserted_total=0
    for raw in rows:
        try: batch.append(_normalize_row(raw,timezone_name,timestamp_required=timestamp_required,record_type=record_type,trajectory_id=str(raw.get('trajectory_id') or '') or None,column_mapping=column_mapping))
        except DatasetReadError: rejected+=1
        if len(batch)>=CHUNK_SIZE:
            inserted,dupes=store.insert_observations(source_id,batch); inserted_total+=inserted; duplicates+=dupes; batch=[]
    inserted,dupes=store.insert_observations(source_id,batch); inserted_total+=inserted; duplicates+=dupes
    if inserted_total==0: raise DatasetReadError(f'No valid trajectory points found ({rejected} rejected).')
    return rejected,duplicates,inserted_total


def _read_geolife(path: Path, source_id: str, store: MobilityStore, fmt: str) -> tuple[int,int]:
    def all_rows():
        if fmt=='geolife_plt':
            with path.open('rb') as stream: yield from _plt_rows(stream,path.stem)
        elif fmt=='geolife_folder':
            files=sorted(path.rglob('*.plt'))
            if not files: raise DatasetReadError('GeoLife folder has no .plt files (expected a Trajectory directory).')
            for item in files:
                with item.open('rb') as stream: yield from _plt_rows(stream,item.relative_to(path).with_suffix('').as_posix())
        else:
            with zipfile.ZipFile(path) as archive:
                files=[name for name in _validated_zip_members(archive) if name.lower().endswith('.plt')]
                if not files: raise DatasetReadError('GeoLife ZIP contains no .plt trajectory files.')
                for name in files:
                    with archive.open(name) as stream: yield from _plt_rows(stream,str(Path(name).with_suffix('')).replace('\\','/'))
    rejected,duplicates,_=_ingest_rows(source_id,store,all_rows(),None)
    return rejected,duplicates


def _geojson_rows(geometry: dict, props: dict, feature_id: str, source_timezone: str | None) -> Iterator[dict]:
    kind=geometry.get('type'); coords=geometry.get('coordinates')
    times=props.get('timestamps') or props.get('times')
    if kind=='Point' and isinstance(coords,list) and len(coords)>=2:
        row={**props,'longitude':coords[0],'latitude':coords[1],'trajectory_id':props.get('trajectory_id')}
        if not any(name in row for name in ALIASES['timestamp']):
            row['timestamp']=props.get('timestamp') or props.get('datetime') or props.get('time')
        yield row
    elif kind in ('LineString','MultiPoint') and isinstance(coords,list):
        if kind=='LineString' and not isinstance(times,list): return
        if isinstance(times,list) and len(times)!=len(coords): raise DatasetReadError('GeoJSON per-point timestamp count must match coordinate count.')
        for index,point in enumerate(coords):
            if len(point)<2: continue
            row={**props,'longitude':point[0],'latitude':point[1],'trajectory_id':(props.get('trajectory_id') or feature_id) if isinstance(times,list) else None}
            if isinstance(times,list) and index<len(times): row['timestamp']=times[index]
            else: row['timestamp']=props.get('timestamp') or props.get('datetime')
            yield row
    elif kind=='MultiLineString' and isinstance(coords,list):
        if not isinstance(times,list): return
        if len(times)!=sum(len(line) for line in coords): raise DatasetReadError('GeoJSON per-point timestamp count must match coordinate count.')
        offset=0
        for line_index,line in enumerate(coords):
            for point in line:
                row={**props,'longitude':point[0],'latitude':point[1],'trajectory_id':props.get('trajectory_id') or feature_id}
                if isinstance(times,list) and offset<len(times): row['timestamp']=times[offset]
                else: row['timestamp']=props.get('timestamp') or props.get('datetime')
                row['trajectory_segment']=line_index; offset+=1; yield row


def _read_geojson(path: Path, source_id: str, store: MobilityStore, source_timezone: str | None,
                  column_mapping: dict[str,str] | None = None) -> tuple[int,int]:
    if path.stat().st_size>MAX_GEOJSON_BYTES: raise DatasetReadError('GeoJSON files over 256 MB are not accepted by the current local reader; convert to chunked CSV/GeoParquet first.')
    try: document=json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as exc: raise DatasetReadError(f'Invalid GeoJSON: {exc}') from exc
    features=document.get('features') if document.get('type')=='FeatureCollection' else [document if document.get('type')=='Feature' else {'type':'Feature','geometry':document,'properties':{}}]
    if not isinstance(features,list): raise DatasetReadError('GeoJSON must be a Feature or FeatureCollection.')
    geo_features=[]
    def point_rows():
        for index,feature in enumerate(features):
            geometry=feature.get('geometry') or {}
            if geometry.get('type') in ('Polygon','MultiPolygon','GeometryCollection'): continue
            props=feature.get('properties') or {}
            fid=str(feature.get('id') or props.get('id') or index)
            yield from _geojson_rows(geometry,props,fid,source_timezone)
    for index,feature in enumerate(features):
        geometry=feature.get('geometry') or {}
        props=feature.get('properties') or {}
        fid=str(feature.get('id') or props.get('id') or index)
        if geometry.get('type') in ('Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection'):
            from shapely.geometry import shape
            parsed=shape(geometry)
            if parsed.is_empty or not parsed.is_valid: raise DatasetReadError(f'Invalid geometry in feature {fid}.')
            bounds=parsed.bounds
            if not (-180<=bounds[0]<=bounds[2]<=180 and -90<=bounds[1]<=bounds[3]<=90): raise DatasetReadError('GeoJSON must use WGS84 longitude/latitude coordinates.')
            geo_features.append((fid,geometry.get('type'),json.dumps(geometry,separators=(',',':')),json.dumps(props,ensure_ascii=False,default=str)))
    for offset in range(0,len(geo_features),CHUNK_SIZE):
        store.insert_geo_features(source_id,geo_features[offset:offset+CHUNK_SIZE])
    has_points=any((feature.get('geometry') or {}).get('type') in ('Point','MultiPoint') or
                   ((feature.get('geometry') or {}).get('type') in ('LineString','MultiLineString') and
                    isinstance((feature.get('properties') or {}).get('timestamps') or (feature.get('properties') or {}).get('times'),list)) for feature in features)
    rejected,duplicates,_=_ingest_rows(source_id,store,point_rows(),source_timezone,column_mapping,timestamp_required=False,record_type='geographic_point') if has_points else (0,0,0)
    store.save_source_details(source_id,{'dataset_type':'geographic','warnings':['Static lines and boundaries are retained as geometry, not inferred passenger trips. Only per-point timestamp arrays create line trajectory observations.']})
    if not has_points and not geo_features: raise DatasetReadError('GeoJSON has no supported Point, MultiPoint, LineString, MultiLineString or boundary features.')
    return rejected,duplicates
