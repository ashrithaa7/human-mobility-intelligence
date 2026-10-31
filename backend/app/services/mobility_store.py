"""Local, indexed storage for normalized mobility records and GTFS service data."""
from __future__ import annotations

import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


class MobilityStore:
    """A small-project SQLite catalog; records are paged and analyses aggregate in SQL."""

    def __init__(self, data_directory: str | Path):
        self.data_directory = Path(data_directory)
        self.data_directory.mkdir(parents=True, exist_ok=True)
        self.path = self.data_directory / 'mobility_catalog.sqlite3'
        self._initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, factory=_ClosingConnection)
        connection.row_factory = sqlite3.Row
        connection.create_function('floor', 1, math.floor, deterministic=True)
        def finite_number(value):
            try:
                number=float(value)
                return number if math.isfinite(number) else None
            except (ValueError,TypeError):return None
        connection.create_function('finite_number',1,finite_number,deterministic=True)
        connection.execute('PRAGMA busy_timeout=30000')
        connection.execute('PRAGMA foreign_keys=ON')
        return connection

    def _initialize(self) -> None:
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, format TEXT NOT NULL,
                    label TEXT, source_url TEXT, license TEXT, timezone TEXT,
                    status TEXT NOT NULL DEFAULT 'loading', is_synthetic INTEGER NOT NULL DEFAULT 0,
                    is_sample INTEGER NOT NULL DEFAULT 0, record_count INTEGER NOT NULL DEFAULT 0,
                    duplicate_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0,
                    date_start TEXT, date_end TEXT, bbox_json TEXT, coverage_json TEXT,
                    analyses_json TEXT NOT NULL DEFAULT '[]', attribution TEXT,
                    imported_at TEXT NOT NULL, updated_at TEXT, error TEXT
                );
                CREATE TABLE IF NOT EXISTS observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    row_hash TEXT NOT NULL, record_type TEXT NOT NULL DEFAULT 'point',
                    timestamp TEXT, local_timestamp TEXT, timezone TEXT,
                    latitude REAL, longitude REAL, origin_latitude REAL, origin_longitude REAL,
                    destination_latitude REAL, destination_longitude REAL,
                    trip_id TEXT, trajectory_id TEXT, route_id TEXT, stop_id TEXT,
                    area_name TEXT, country TEXT, state TEXT, city TEXT,
                    event_count REAL, service_seconds INTEGER, service_id TEXT,
                    local_hour INTEGER, local_weekday INTEGER, local_day TEXT, local_month TEXT, local_week TEXT,
                    properties_json TEXT NOT NULL DEFAULT '{}',
                    UNIQUE(source_id, row_hash)
                );
                CREATE INDEX IF NOT EXISTS observations_source_time ON observations(source_id, local_timestamp);
                CREATE INDEX IF NOT EXISTS observations_source_area_time ON observations(source_id, area_name, local_timestamp);
                CREATE INDEX IF NOT EXISTS observations_source_coords ON observations(source_id, latitude, longitude);
                CREATE INDEX IF NOT EXISTS observations_source_trip ON observations(source_id, trip_id);
                CREATE INDEX IF NOT EXISTS observations_source_geo_time ON observations(source_id, country, state, city, local_timestamp);
                CREATE VIRTUAL TABLE IF NOT EXISTS observation_rtree USING rtree(id,min_longitude,max_longitude,min_latitude,max_latitude);
                CREATE TRIGGER IF NOT EXISTS observations_rtree_insert AFTER INSERT ON observations
                    WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL BEGIN
                    INSERT OR REPLACE INTO observation_rtree VALUES (NEW.id,NEW.longitude,NEW.longitude,NEW.latitude,NEW.latitude);
                END;
                CREATE TRIGGER IF NOT EXISTS observations_rtree_delete AFTER DELETE ON observations BEGIN
                    DELETE FROM observation_rtree WHERE id=OLD.id;
                END;
                CREATE TABLE IF NOT EXISTS gtfs_routes (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    route_id TEXT NOT NULL, route_type INTEGER, route_name TEXT,
                    properties_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(source_id, route_id)
                );
                CREATE TABLE IF NOT EXISTS gtfs_trips (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    trip_id TEXT NOT NULL, route_id TEXT, service_id TEXT, direction_id TEXT,
                    properties_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(source_id, trip_id)
                );
                CREATE TABLE IF NOT EXISTS gtfs_services (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    service_id TEXT NOT NULL, monday INTEGER, tuesday INTEGER, wednesday INTEGER,
                    thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER,
                    start_date TEXT, end_date TEXT, exceptions_json TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY(source_id, service_id)
                );
                CREATE TABLE IF NOT EXISTS gtfs_service_dates (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    service_id TEXT NOT NULL, service_date TEXT NOT NULL, exception_type INTEGER NOT NULL,
                    PRIMARY KEY(source_id,service_id,service_date)
                );
                CREATE TABLE IF NOT EXISTS gtfs_stops (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    stop_id TEXT NOT NULL, stop_name TEXT, latitude REAL, longitude REAL,
                    properties_json TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(source_id, stop_id)
                );
                CREATE TABLE IF NOT EXISTS gtfs_stop_times (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    trip_id TEXT NOT NULL, stop_id TEXT NOT NULL, stop_sequence INTEGER NOT NULL,
                    arrival_seconds INTEGER, departure_seconds INTEGER,
                    PRIMARY KEY(source_id,trip_id,stop_sequence)
                );
                CREATE INDEX IF NOT EXISTS gtfs_stop_times_departure ON gtfs_stop_times(source_id,departure_seconds);
                CREATE INDEX IF NOT EXISTS gtfs_stop_times_stop ON gtfs_stop_times(source_id,stop_id);
                CREATE INDEX IF NOT EXISTS gtfs_stops_coords ON gtfs_stops(source_id, latitude, longitude);
                CREATE TABLE IF NOT EXISTS geo_features (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    feature_id TEXT NOT NULL, geometry_type TEXT NOT NULL,
                    geometry_json TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY(source_id,feature_id)
                );
                CREATE TABLE IF NOT EXISTS realtime_entities (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    entity_id TEXT NOT NULL, entity_type TEXT NOT NULL, observed_at TEXT,
                    latitude REAL, longitude REAL, trip_id TEXT, route_id TEXT, stop_id TEXT,
                    delay_seconds INTEGER, payload_json TEXT NOT NULL DEFAULT '{}',
                    PRIMARY KEY(source_id, entity_id, entity_type)
                );
                CREATE TABLE IF NOT EXISTS gtfs_extra_rows (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    table_name TEXT NOT NULL, row_index INTEGER NOT NULL, payload_json TEXT NOT NULL,
                    PRIMARY KEY(source_id,table_name,row_index)
                );
                CREATE TABLE IF NOT EXISTS mapping_profiles (
                    name TEXT PRIMARY KEY, mapping_json TEXT NOT NULL, dataset_type TEXT NOT NULL,
                    date_format TEXT, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analysis_reports (
                    id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    generated_at TEXT NOT NULL, payload_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL, filter_key TEXT NOT NULL, source_updated_at TEXT,
                    computed_at TEXT NOT NULL, payload_json TEXT NOT NULL,
                    PRIMARY KEY(source_id,kind,filter_key)
                );
            ''')
            source_columns = {row['name'] for row in db.execute('PRAGMA table_info(sources)')}
            if 'details_json' not in source_columns:
                db.execute("ALTER TABLE sources ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}'")
            columns = {row['name'] for row in db.execute('PRAGMA table_info(observations)')}
            for name, sql_type in (('local_hour','INTEGER'),('local_weekday','INTEGER'),('local_day','TEXT'),('local_month','TEXT'),('local_week','TEXT')):
                if name not in columns:
                    db.execute(f'ALTER TABLE observations ADD COLUMN {name} {sql_type}')
            db.execute('''INSERT OR IGNORE INTO observation_rtree
                SELECT id,longitude,longitude,latitude,latitude FROM observations WHERE latitude IS NOT NULL AND longitude IS NOT NULL''')

    def start_source(self, metadata: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connect() as db:
            db.execute('''INSERT INTO sources
                (id, filename, format, label, source_url, license, timezone, status,
                 is_synthetic, is_sample, imported_at, attribution)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'loading', ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET status='loading', error=NULL''',
                (metadata['id'], metadata['filename'], metadata['format'], metadata.get('label'),
                 metadata.get('source_url'), metadata.get('license'), metadata.get('timezone'),
                 int(bool(metadata.get('is_synthetic'))), int(bool(metadata.get('is_sample'))), now,
                 metadata.get('attribution')))

    def insert_observations(self, source_id: str, rows: Iterable[dict[str, Any]]) -> tuple[int, int]:
        values = []
        for row in rows:
            values.append((source_id, row['row_hash'], row.get('record_type', 'point'), row.get('timestamp'),
                row.get('local_timestamp'), row.get('timezone'), row.get('latitude'), row.get('longitude'),
                row.get('origin_latitude'), row.get('origin_longitude'), row.get('destination_latitude'),
                row.get('destination_longitude'), row.get('trip_id'), row.get('trajectory_id'), row.get('route_id'),
                row.get('stop_id'), row.get('area_name'), row.get('country'), row.get('state'), row.get('city'),
                row.get('event_count'), row.get('service_seconds'), row.get('service_id'),
                row.get('local_hour'), row.get('local_weekday'), row.get('local_day'), row.get('local_month'), row.get('local_week'),
                json.dumps(row.get('properties', {}), ensure_ascii=False, default=str)))
        if not values:
            return 0, 0
        with self.connect() as db:
            cursor = db.executemany('''INSERT OR IGNORE INTO observations
                (source_id,row_hash,record_type,timestamp,local_timestamp,timezone,latitude,longitude,
                 origin_latitude,origin_longitude,destination_latitude,destination_longitude,trip_id,
                 trajectory_id,route_id,stop_id,area_name,country,state,city,event_count,service_seconds,
                 service_id,local_hour,local_weekday,local_day,local_month,local_week,properties_json)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', values)
            inserted = cursor.rowcount
        return inserted, len(values) - inserted

    def save_source_details(self, source_id: str, details: dict) -> None:
        with self.connect() as db:
            row = db.execute('SELECT details_json FROM sources WHERE id=?', (source_id,)).fetchone()
            merged = {**(json.loads(row[0]) if row else {}), **details}
            db.execute('UPDATE sources SET details_json=? WHERE id=?', (json.dumps(merged, default=str), source_id))

    def mapping_profiles(self) -> list[dict]:
        with self.connect() as db:
            return [{**dict(row), 'mapping': json.loads(row['mapping_json'])}
                    for row in db.execute('SELECT * FROM mapping_profiles ORDER BY name')]

    def save_mapping_profile(self, name: str, mapping: dict, dataset_type: str, date_format: str | None) -> None:
        if not name.strip() or len(name) > 100: raise ValueError('Profile name must contain 1–100 characters.')
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO mapping_profiles VALUES (?,?,?,?,?)',
                       (name.strip(), json.dumps(mapping), dataset_type, date_format, datetime.now(timezone.utc).isoformat()))

    def insert_gtfs_rows(self, table: str, source_id: str, rows: Iterable[tuple]) -> int:
        statements = {
            'routes': ('INSERT OR REPLACE INTO gtfs_routes(source_id,route_id,route_type,route_name,properties_json) VALUES (?,?,?,?,?)', 4),
            'trips': ('INSERT OR REPLACE INTO gtfs_trips(source_id,trip_id,route_id,service_id,direction_id,properties_json) VALUES (?,?,?,?,?,?)', 5),
            'stops': ('INSERT OR REPLACE INTO gtfs_stops(source_id,stop_id,stop_name,latitude,longitude,properties_json) VALUES (?,?,?,?,?,?)', 5),
            'services': ('INSERT OR REPLACE INTO gtfs_services(source_id,service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date,exceptions_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', 11),
            'service_dates': ('INSERT OR REPLACE INTO gtfs_service_dates(source_id,service_id,service_date,exception_type) VALUES (?,?,?,?)', 3),
        }
        statement, _ = statements[table]
        values = [(source_id, *row) for row in rows]
        if not values:
            return 0
        with self.connect() as db:
            db.executemany(statement, values)
        return len(values)

    def finalize_source(self, source_id: str, duplicate_count: int = 0, rejected_count: int = 0,
                        extra_analyses: list[str] | None = None) -> dict:
        with self.connect() as db:
            row = db.execute('''SELECT COUNT(*) AS count, MIN(local_timestamp) AS date_start,
                    MAX(local_timestamp) AS date_end, MIN(longitude) AS min_lon, MAX(longitude) AS max_lon,
                    MIN(latitude) AS min_lat, MAX(latitude) AS max_lat
                FROM observations WHERE source_id=?''', (source_id,)).fetchone()
            stop_count = db.execute('SELECT COUNT(*) FROM gtfs_stops WHERE source_id=?', (source_id,)).fetchone()[0]
            source = db.execute('SELECT format FROM sources WHERE id=?', (source_id,)).fetchone()
            fmt = source['format'] if source else 'unknown'
            stop_time_count = db.execute('SELECT COUNT(*) FROM gtfs_stop_times WHERE source_id=?', (source_id,)).fetchone()[0]
            feature_count = db.execute('SELECT COUNT(*) FROM geo_features WHERE source_id=?', (source_id,)).fetchone()[0]
            count = int(stop_time_count if fmt == 'gtfs_static' else row['count'] or feature_count)
            if fmt == 'gtfs_static':
                service_dates = db.execute('SELECT MIN(start_date),MAX(end_date) FROM gtfs_services WHERE source_id=?', (source_id,)).fetchone()
                date_start, date_end = service_dates[0], service_dates[1]
                if not date_start or not date_end:
                    exception_range=db.execute('SELECT MIN(service_date),MAX(service_date) FROM gtfs_service_dates WHERE source_id=?',(source_id,)).fetchone()
                    date_start=date_start or exception_range[0]; date_end=date_end or exception_range[1]
            else:
                date_start, date_end = row['date_start'], row['date_end']
            if fmt=='gtfs_static':
                date_start=datetime.strptime(date_start,'%Y%m%d').date().isoformat() if date_start else None
                date_end=datetime.strptime(date_end,'%Y%m%d').date().isoformat() if date_end else None
            analyses = ['temporal'] if count and (row['date_start'] or fmt == 'gtfs_static') else []
            if count and (row['min_lat'] is not None or stop_count):
                analyses += ['spatial', 'hotspots']
            if db.execute("SELECT COUNT(*) FROM observations WHERE source_id=? AND ((origin_latitude IS NOT NULL AND destination_latitude IS NOT NULL) OR (trajectory_id IS NOT NULL AND local_timestamp IS NOT NULL) OR json_extract(properties_json,'$.origin') IS NOT NULL)", (source_id,)).fetchone()[0]:
                analyses += ['origin_destination', 'corridors']
            if stop_count:
                analyses += ['transit_coverage', 'accessibility']
            if fmt == 'gtfs_static' and stop_time_count:
                analyses.append('scheduled_corridors')
            analyses.append('overview')
            if feature_count: analyses.append('geometry')
            if db.execute("SELECT COUNT(*) FROM geo_features WHERE source_id=? AND geometry_type IN ('LineString','MultiLineString')",(source_id,)).fetchone()[0]:
                analyses.append('route_geometry')
            if db.execute("SELECT COUNT(*) FROM observations WHERE source_id=? AND json_extract(properties_json,'$.indicator') IS NOT NULL AND json_type(properties_json,'$.value') IN ('integer','real')", (source_id,)).fetchone()[0]:
                analyses.append('indicators')
            if extra_analyses:
                analyses.extend(extra_analyses)
            coverage = db.execute('''SELECT COALESCE(area_name,city,state,country) AS area_name, country, state, city, COUNT(*) AS record_count,
                    AVG(latitude) AS latitude, AVG(longitude) AS longitude
                FROM observations WHERE source_id=? AND COALESCE(area_name,city,state,country) IS NOT NULL
                GROUP BY COALESCE(area_name,city,state,country),country,state,city ORDER BY area_name LIMIT 5000''', (source_id,)).fetchall()
            if not coverage and stop_count:
                coverage = db.execute('''SELECT stop_name AS area_name, COUNT(*) AS record_count,
                    AVG(latitude) AS latitude, AVG(longitude) AS longitude
                    FROM gtfs_stops WHERE source_id=? AND latitude IS NOT NULL GROUP BY stop_name LIMIT 5000''', (source_id,)).fetchall()
            areas = [{**dict(item), 'name': item['area_name']} for item in coverage]
            if not areas and fmt != 'gtfs_static':
                grid = db.execute('''SELECT floor(longitude/0.05+0.000000001) x,floor(latitude/0.05+0.000000001) y,COUNT(*) record_count,
                    AVG(latitude) latitude,AVG(longitude) longitude FROM observations WHERE source_id=?
                    AND latitude IS NOT NULL AND longitude IS NOT NULL GROUP BY x,y ORDER BY record_count DESC LIMIT 5000''',(source_id,)).fetchall()
                areas = [{'name':f'Grid {item["x"]},{item["y"]}','record_count':item['record_count'],
                          'latitude':item['latitude'],'longitude':item['longitude']} for item in grid]
            bbox = None
            if row['min_lon'] is not None:
                bbox = [row['min_lon'], row['min_lat'], row['max_lon'], row['max_lat']]
            if stop_count:
                stop_bounds = db.execute('SELECT MIN(longitude),MIN(latitude),MAX(longitude),MAX(latitude) FROM gtfs_stops WHERE source_id=?', (source_id,)).fetchone()
                if stop_bounds[0] is not None:
                    stop_bbox = list(stop_bounds)
                    if bbox:
                        bbox = [min(bbox[0], stop_bbox[0]), min(bbox[1], stop_bbox[1]), max(bbox[2], stop_bbox[2]), max(bbox[3], stop_bbox[3])]
                    else:
                        bbox = stop_bbox
            if not bbox:
                feature_rows=db.execute('SELECT geometry_json FROM geo_features WHERE source_id=?',(source_id,)).fetchall()
                coordinates=[]
                def walk_coords(value):
                    if isinstance(value,list):
                        if len(value)>=2 and isinstance(value[0],(int,float)) and isinstance(value[1],(int,float)):
                            coordinates.append((float(value[0]),float(value[1])))
                        else:
                            for child in value: walk_coords(child)
                for feature_row in feature_rows:
                    try: walk_coords(json.loads(feature_row['geometry_json']).get('coordinates',[]))
                    except (ValueError,TypeError): continue
                if coordinates:
                    bbox=[min(pair[0] for pair in coordinates),min(pair[1] for pair in coordinates),max(pair[0] for pair in coordinates),max(pair[1] for pair in coordinates)]
            db.execute('''UPDATE sources SET status='ready', record_count=?, duplicate_count=?, rejected_count=?,
                    date_start=?, date_end=?, bbox_json=?, coverage_json=?, analyses_json=?, updated_at=? WHERE id=?''',
                (count, duplicate_count, rejected_count, date_start, date_end,
                 json.dumps(bbox), json.dumps(areas), json.dumps(sorted(set(analyses))),
                 datetime.now(timezone.utc).isoformat(), source_id))
            return {'record_count': count, 'duplicate_count': duplicate_count, 'rejected_count': rejected_count,
                    'date_start': date_start, 'date_end': date_end, 'bbox': bbox,
                    'locations': areas, 'supported_analyses': sorted(set(analyses))}

    def fail_source(self, source_id: str, message: str) -> None:
        with self.connect() as db:
            db.execute("UPDATE sources SET status='error',error=? WHERE id=?", (message[:1000], source_id))

    def get_source(self, source_id: str) -> dict | None:
        with self.connect() as db:
            row = db.execute('SELECT * FROM sources WHERE id=?', (source_id,)).fetchone()
        return self._source_dict(row) if row else None

    def list_sources(self) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM sources WHERE status='ready' ORDER BY imported_at DESC").fetchall()
        return [self._source_dict(row) for row in rows]

    @staticmethod
    def _source_dict(row: sqlite3.Row) -> dict:
        result = dict(row)
        for key in ('bbox_json', 'coverage_json', 'analyses_json', 'details_json'):
            raw = result.pop(key, None)
            result[key.removesuffix('_json')] = json.loads(raw) if raw else ([] if key == 'analyses_json' else None)
        result['is_synthetic'] = bool(result['is_synthetic'])
        result['is_sample'] = bool(result['is_sample'])
        return result

    def page_observations(self, source_id: str, filters: dict | None = None, limit: int = 2000, offset: int = 0) -> tuple[list[dict], int]:
        clauses = ['source_id=?']
        args: list[Any] = [source_id]
        filters = filters or {}
        source = self.get_source(source_id)
        if source and source['format'] == 'gtfs_static':
            stop_clauses=['source_id=?','latitude IS NOT NULL']; stop_args: list[Any]=[source_id]
            if filters.get('region'):
                stop_clauses.append('LOWER(stop_name)=LOWER(?)'); stop_args.append(filters['region'])
            stop_where=' AND '.join(stop_clauses)
            with self.connect() as db:
                total=int(db.execute(f'SELECT COUNT(*) FROM gtfs_stops WHERE {stop_where}',stop_args).fetchone()[0])
                rows=db.execute(f'''SELECT stop_id AS id,stop_name AS area_name,latitude,longitude,
                    'scheduled_stop' AS record_type FROM gtfs_stops WHERE {stop_where} LIMIT ? OFFSET ?''',
                    [*stop_args,limit,offset]).fetchall()
            return [dict(item) for item in rows],total
        self._add_location_filters(clauses,args,filters)
        self._add_bbox_filter(clauses,args,filters)
        if filters.get('start'):
            clauses.append('local_timestamp>=?'); args.append(filters['start'])
        if filters.get('end'):
            clauses.append('local_timestamp<?'); args.append(filters['end'])
        if filters.get('hour') is not None:
            clauses.append('local_hour=?'); args.append(int(filters['hour']))
        where = ' AND '.join(clauses)
        with self.connect() as db:
            count = int(db.execute(f'SELECT COUNT(*) FROM observations WHERE {where}', args).fetchone()[0])
            rows = db.execute(f'''SELECT * FROM observations WHERE {where} ORDER BY id LIMIT ? OFFSET ?''', [*args, limit, offset]).fetchall()
        output = []
        for row in rows:
            item = dict(row)
            item['properties'] = json.loads(item.pop('properties_json') or '{}')
            item.pop('row_hash', None); item.pop('source_id', None)
            output.append(item)
        return output, count

    @staticmethod
    def _add_bbox_filter(clauses: list[str], args: list[Any], filters: dict) -> None:
        bbox=filters.get('bbox')
        if not isinstance(bbox,(list,tuple)) or len(bbox)!=4: return
        try: west,south,east,north=map(float,bbox)
        except (TypeError,ValueError): return
        if not (-180<=west<=180 and -180<=east<=180 and -90<=south<=90 and -90<=north<=90) or south>north: return
        if west<=east:
            clauses.append('id IN (SELECT id FROM observation_rtree WHERE min_longitude>=? AND max_longitude<=? AND min_latitude>=? AND max_latitude<=?)')
            args.extend([west,east,south,north])
        else:
            clauses.append('id IN (SELECT id FROM observation_rtree WHERE (min_longitude>=? OR max_longitude<=?) AND min_latitude>=? AND max_latitude<=?)')
            args.extend([west,east,south,north])

    @staticmethod
    def _add_location_filters(clauses: list[str], args: list[Any], filters: dict) -> None:
        region=filters.get('region')
        if region:
            match=re.fullmatch(r'Grid\s+(-?\d+)\s*,\s*(-?\d+)',str(region),re.IGNORECASE)
            if match:
                clauses.append('floor(longitude/0.05+0.000000001)=? AND floor(latitude/0.05+0.000000001)=?')
                args.extend([int(match.group(1)),int(match.group(2))])
            else:
                clauses.append('LOWER(COALESCE(area_name,city,state,country))=LOWER(?)'); args.append(region)
        for key,column in (('country','country'),('state','state'),('city','city')):
            if filters.get(key): clauses.append(f'LOWER({column})=LOWER(?)'); args.append(filters[key])

    def temporal_summary(self, source_id: str, filters: dict | None = None) -> dict:
        return self._cached_static_analysis(source_id,'temporal',filters,
            lambda:self._compute_temporal_summary(source_id,filters))

    def _cached_static_analysis(self,source_id,kind,filters,compute):
        source=self.get_source(source_id)
        if not source or source['format']!='gtfs_static' or source['status']!='ready':return compute()
        key=json.dumps(filters or {},sort_keys=True,default=str)
        with self.connect() as db:
            cached=db.execute('SELECT payload_json FROM analysis_cache WHERE source_id=? AND kind=? AND filter_key=? AND source_updated_at=?',
                (source_id,kind,key,source['updated_at'])).fetchone()
        if cached:return json.loads(cached[0])
        result=compute()
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO analysis_cache VALUES (?,?,?,?,?,?)',
                (source_id,kind,key,source['updated_at'],datetime.now(timezone.utc).isoformat(),json.dumps(result)))
            db.execute('DELETE FROM analysis_cache WHERE source_id=? AND rowid NOT IN (SELECT rowid FROM analysis_cache WHERE source_id=? ORDER BY computed_at DESC LIMIT 128)',(source_id,source_id))
        return result

    def _compute_temporal_summary(self, source_id: str, filters: dict | None = None) -> dict:
        filters = filters or {}
        with self.connect() as db:
            source = db.execute('SELECT format FROM sources WHERE id=?', (source_id,)).fetchone()
            source_format = source['format'] if source else None
            if source_format == 'gtfs_static':
                clauses=['st.source_id=?'];args=[source_id]
                if filters.get('region'):
                    clauses.append('st.stop_id IN (SELECT stop_id FROM gtfs_stops WHERE source_id=? AND LOWER(stop_name)=LOWER(?))')
                    args.extend([source_id,filters['region']])
                where=' AND '.join(clauses)
                rows=db.execute(f'''SELECT CAST(COALESCE(st.departure_seconds,st.arrival_seconds)/3600 AS INTEGER)%24 AS hour,
                    COUNT(*) AS departures FROM gtfs_stop_times st WHERE {where}
                    AND COALESCE(st.departure_seconds,st.arrival_seconds) IS NOT NULL GROUP BY hour ORDER BY hour''',args).fetchall()
                calendar_count=db.execute('SELECT COUNT(*) FROM gtfs_services WHERE source_id=?',(source_id,)).fetchone()[0]
                calendar={}
                if calendar_count:
                    days=('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
                    aggregates=','.join(f'SUM(CASE WHEN svc.{day}=1 THEN e.events ELSE 0 END) AS {day}' for day in days)
                    # Aggregate the million-row stop-time table before joining trip/service metadata.
                    # This preserves exact event counts while reducing metadata joins to one per trip.
                    weekdays=db.execute(f'''WITH events AS (
                        SELECT st.trip_id,COUNT(*) AS events FROM gtfs_stop_times st WHERE {where} GROUP BY st.trip_id)
                        SELECT {aggregates} FROM events e
                        JOIN gtfs_trips t ON t.source_id=? AND t.trip_id=e.trip_id
                        JOIN gtfs_services svc ON svc.source_id=t.source_id AND svc.service_id=t.service_id''',(*args,source_id)).fetchone()
                    calendar={name:int(weekdays[name] or 0) for name in days}
                hourly={str(row['hour']):row['departures'] for row in rows}
                return {'status':'success' if hourly else 'no_data','hourly':hourly,'daily':calendar,'weekly':calendar,'monthly':{},
                        'peak_hour':max(hourly,key=hourly.get) if hourly else None,
                        'total_records':sum(row['departures'] for row in rows),'data_semantics':'scheduled_service',
                        'daily_status':('Weekday values count scheduled stop events on recurring service days; calendar_dates exceptions are not expanded and values are not passenger counts.'
                            if calendar_count else 'No recurring service calendar was supplied; weekday and monthly patterns are unavailable.'),
                        'date_filter_status':'Static schedules are not expanded into calendar-day or monthly totals. Times beyond 24 hours are shown modulo the clock.'}
        clauses = ['source_id=?', 'local_timestamp IS NOT NULL']
        args: list[Any] = [source_id]
        self._add_location_filters(clauses,args,filters)
        self._add_bbox_filter(clauses,args,filters)
        if filters.get('start'):
            clauses.append('local_timestamp>=?'); args.append(filters['start'])
        if filters.get('end'):
            clauses.append('local_timestamp<?'); args.append(filters['end'])
        where = ' AND '.join(clauses)
        with self.connect() as db:
            rows = db.execute(f'''SELECT local_hour AS hour,
                local_weekday AS weekday,
                local_month AS month,
                local_week AS week,
                SUM(COALESCE(event_count,1)) AS count FROM observations WHERE {where} GROUP BY hour,weekday,month,week''', args).fetchall()
            total = db.execute(f'SELECT COUNT(*) FROM observations WHERE {where}', args).fetchone()[0]
        hourly: dict[str, float] = {}; daily: dict[str, float] = {}; monthly: dict[str, float] = {}; weekly: dict[str,float] = {}
        weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
        for row in rows:
            if row['hour'] is not None: hourly[row['hour']] = hourly.get(row['hour'], 0) + row['count']
            if row['weekday'] is not None:
                day = weekdays[int(row['weekday'])]; daily[day] = daily.get(day, 0) + row['count']
            if row['month'] is not None: monthly[row['month']] = monthly.get(row['month'], 0) + row['count']
            if row['week'] is not None: weekly[row['week']] = weekly.get(row['week'], 0) + row['count']
        return {'status': 'success' if total else 'no_data', 'hourly': hourly, 'daily': daily, 'weekly':weekly,'monthly': monthly,
                'peak_hour': max(hourly, key=hourly.get) if hourly else None, 'total_records': total,
                'message':None if total else 'This source/filter has no usable timestamps. Try spatial, geometry, indicator or general field summaries.',
                'data_semantics': 'observed_or_source_events'}

    def spatial_cells(self, source_id: str, filters: dict | None = None, cell_size: float = 0.01) -> dict:
        filters = filters or {}
        clauses = ['source_id=?', 'latitude IS NOT NULL', 'longitude IS NOT NULL']
        args: list[Any] = [source_id]
        self._add_location_filters(clauses,args,filters)
        self._add_bbox_filter(clauses,args,filters)
        if filters.get('start'): clauses.append('local_timestamp>=?'); args.append(filters['start'])
        if filters.get('end'): clauses.append('local_timestamp<?'); args.append(filters['end'])
        if filters.get('hour') is not None:
            clauses.append('local_hour=?'); args.append(int(filters['hour']))
        lat_expr = f'floor(latitude/{cell_size}+0.000000001)'
        lon_expr = f'floor(longitude/{cell_size}+0.000000001)'
        where = ' AND '.join(clauses)
        with self.connect() as db:
            source = db.execute('SELECT format FROM sources WHERE id=?', (source_id,)).fetchone()
            if source and source['format'] == 'gtfs_static':
                gtfs_where='source_id=? AND latitude IS NOT NULL'; gtfs_args=[source_id]
                if filters.get('region'):
                    gtfs_where+=' AND LOWER(stop_name)=LOWER(?)'; gtfs_args.append(filters['region'])
                rows = db.execute(f'''SELECT floor(longitude/{cell_size}+0.000000001) AS x,
                    floor(latitude/{cell_size}+0.000000001) AS y,COUNT(*) AS rows,COUNT(*) AS activity
                    FROM gtfs_stops WHERE {gtfs_where} GROUP BY x,y ORDER BY activity DESC''', gtfs_args).fetchall()
                top = [{'coordinates': [(item['x']+.5)*cell_size,(item['y']+.5)*cell_size],
                        'activity_count': item['activity'], 'record_count': item['rows']} for item in rows[:100]]
                return {'status':'success' if rows else 'no_data','total_areas':len(rows),
                        'total_records':sum(item['rows'] for item in rows),'top_areas':top,
                        'cell_size_degrees':cell_size,'data_semantics':'scheduled_stop_density'}
            rows = db.execute(f'''SELECT {lon_expr} AS x,{lat_expr} AS y,COUNT(*) AS rows,
                SUM(COALESCE(event_count,1)) AS activity FROM observations WHERE {where}
                GROUP BY x,y ORDER BY activity DESC''', args).fetchall()
        top = [{'coordinates': [(row['x'] + .5) * cell_size, (row['y'] + .5) * cell_size],
                'activity_count': row['activity'], 'record_count': row['rows']} for row in rows[:100]]
        return {'status': 'success' if rows else 'no_data', 'total_areas': len(rows),
                'total_records': sum(row['rows'] for row in rows), 'top_areas': top,
                'cell_size_degrees': cell_size}

    def hotspot_cells(self, source_id: str, filters: dict | None = None, cell_size: float = 0.01, limit: int = 50_000) -> list[dict]:
        filters=filters or {}
        clauses=['source_id=?','latitude IS NOT NULL','longitude IS NOT NULL']
        args: list[Any]=[source_id]
        self._add_location_filters(clauses,args,filters)
        self._add_bbox_filter(clauses,args,filters)
        if filters.get('start'): clauses.append('local_timestamp>=?'); args.append(filters['start'])
        if filters.get('end'): clauses.append('local_timestamp<?'); args.append(filters['end'])
        if filters.get('hour') is not None:
            clauses.append('local_hour=?'); args.append(int(filters['hour']))
        where=' AND '.join(clauses)
        with self.connect() as db:
            source=db.execute('SELECT format FROM sources WHERE id=?',(source_id,)).fetchone()
            if source and source['format']=='gtfs_static':
                gtfs_where='source_id=? AND latitude IS NOT NULL'; gtfs_args=[source_id]
                if filters.get('region'):
                    gtfs_where+=' AND LOWER(stop_name)=LOWER(?)'; gtfs_args.append(filters['region'])
                rows=db.execute(f'''SELECT floor(longitude/{cell_size}+0.000000001) x,floor(latitude/{cell_size}+0.000000001) y,
                    COUNT(*) AS weight FROM gtfs_stops WHERE {gtfs_where} GROUP BY x,y ORDER BY weight DESC LIMIT ?''',
                    [*gtfs_args,limit]).fetchall()
            else:
                rows=db.execute(f'''SELECT floor(longitude/{cell_size}+0.000000001) x,floor(latitude/{cell_size}+0.000000001) y,
                    SUM(COALESCE(event_count,1)) AS weight FROM observations WHERE {where} GROUP BY x,y ORDER BY weight DESC LIMIT ?''',
                    [*args,limit]).fetchall()
        return [{'x':int(row['x']),'y':int(row['y']),'weight':float(row['weight'] or 0)} for row in rows]

    def od_summary(self, source_id: str, limit: int = 30, filters: dict | None = None) -> dict:
        source=self.get_source(source_id)
        if source and source['format']=='gtfs_static':
            result=self._cached_static_analysis(source_id,'scheduled_corridors',filters,
                lambda:self._compute_od_summary(source_id,max(1000,limit),filters))
            return {**result,'top_corridors':result.get('top_corridors',[])[:limit]}
        return self._compute_od_summary(source_id,limit,filters)

    def _compute_od_summary(self, source_id: str, limit: int = 30, filters: dict | None = None) -> dict:
        filters=filters or {}
        clauses=['source_id=?'];args=[source_id]
        self._add_location_filters(clauses,args,filters)
        if filters.get('start'):clauses.append('local_timestamp>=?');args.append(filters['start'])
        if filters.get('end'):clauses.append('local_timestamp<?');args.append(filters['end'])
        where=' AND '.join(clauses)
        with self.connect() as db:
            source = db.execute('SELECT format FROM sources WHERE id=?', (source_id,)).fetchone()
            if source and source['format'] == 'gtfs_static':
                rows = db.execute('''WITH ordered_stops AS (
                    SELECT source_id,trip_id,stop_id,
                        LEAD(stop_id) OVER (PARTITION BY source_id,trip_id ORDER BY stop_sequence) AS next_stop_id
                    FROM gtfs_stop_times WHERE source_id=?
                    ) SELECT t.route_id, a.stop_id AS from_stop_id, sa.stop_name AS from_stop,
                    a.next_stop_id AS to_stop_id, sb.stop_name AS to_stop, sa.latitude AS origin_latitude,sa.longitude AS origin_longitude,
                    sb.latitude AS destination_latitude,sb.longitude AS destination_longitude,COUNT(DISTINCT t.trip_id) AS scheduled_trips
                    FROM ordered_stops a JOIN gtfs_trips t ON t.source_id=a.source_id AND t.trip_id=a.trip_id
                    JOIN gtfs_stops sa ON sa.source_id=a.source_id AND sa.stop_id=a.stop_id
                    JOIN gtfs_stops sb ON sb.source_id=a.source_id AND sb.stop_id=a.next_stop_id
                    WHERE a.next_stop_id IS NOT NULL AND (? IS NULL OR LOWER(sa.stop_name)=LOWER(?) OR LOWER(sb.stop_name)=LOWER(?)) GROUP BY t.route_id,a.stop_id,a.next_stop_id ORDER BY scheduled_trips DESC LIMIT ?''',(source_id,filters.get('region'),filters.get('region'),filters.get('region'),limit)).fetchall()
                total = db.execute('SELECT COUNT(*) FROM gtfs_stop_times WHERE source_id=?',(source_id,)).fetchone()[0]
                return {'status':'success' if rows else 'insufficient_data','total_trip_records':total,
                        'top_corridors':[dict(item) for item in rows],'data_semantics':'scheduled_route_segments',
                        'message':'Scheduled service frequency is not observed passenger movement.'}
            total = db.execute(f'''SELECT COUNT(*) FROM observations WHERE {where} AND
                origin_latitude IS NOT NULL AND destination_latitude IS NOT NULL''', args).fetchone()[0]
            if not total:
                trajectory_rows=db.execute(f'''WITH ordered AS (
                    SELECT COALESCE(trip_id,trajectory_id) AS journey_id,latitude,longitude,local_timestamp,id,
                        ROW_NUMBER() OVER (PARTITION BY COALESCE(trip_id,trajectory_id) ORDER BY local_timestamp,id) AS first_row,
                        ROW_NUMBER() OVER (PARTITION BY COALESCE(trip_id,trajectory_id) ORDER BY local_timestamp DESC,id DESC) AS last_row
                    FROM observations WHERE {where} AND COALESCE(trip_id,trajectory_id) IS NOT NULL
                        AND latitude IS NOT NULL AND longitude IS NOT NULL AND local_timestamp IS NOT NULL)
                    SELECT a.latitude AS origin_latitude,a.longitude AS origin_longitude,
                        b.latitude AS destination_latitude,b.longitude AS destination_longitude,COUNT(*) AS trips
                    FROM ordered a JOIN ordered b ON a.journey_id=b.journey_id
                    WHERE a.first_row=1 AND b.last_row=1 AND a.id<>b.id AND a.local_timestamp<>b.local_timestamp
                    GROUP BY a.latitude,a.longitude,b.latitude,b.longitude ORDER BY trips DESC LIMIT ?''',(*args,limit)).fetchall()
                trajectory_count=sum(int(row['trips']) for row in trajectory_rows)
                if trajectory_count:
                    return {'status':'success','total_trip_records':trajectory_count,
                        'top_corridors':[dict(row) for row in trajectory_rows],
                        'message':'Corridors are inferred from first/last timestamped GPS points per trajectory; they are not surveyed trip endpoints.',
                        'data_semantics':'trajectory_endpoint_inference'}
            rows = db.execute(f'''SELECT origin_latitude,origin_longitude,destination_latitude,destination_longitude,
                SUM(COALESCE(event_count,1)) AS trips,COUNT(*) AS records FROM observations WHERE {where} AND
                origin_latitude IS NOT NULL AND destination_latitude IS NOT NULL GROUP BY 1,2,3,4
                ORDER BY trips DESC LIMIT ?''', (*args, limit)).fetchall()
        return {'status': 'success' if total else 'insufficient_data', 'total_trip_records': total,
                'top_corridors': [dict(row) for row in rows],
                'message': None if total else 'This source has no origin and destination coordinate pairs.'}

    def accessibility_summary(self, source_id: str, latitude: float | None = None,
                              longitude: float | None = None, radius_meters: float = 500) -> dict:
        with self.connect() as db:
            count = int(db.execute('SELECT COUNT(*) FROM gtfs_stops WHERE source_id=? AND latitude IS NOT NULL', (source_id,)).fetchone()[0])
            if not count:
                return {'status': 'insufficient_data', 'message': 'Transit accessibility needs a static GTFS source with geocoded stops; road maps or movement points alone are insufficient.'}
            if latitude is None or longitude is None:
                return {'status': 'available', 'stop_count': count, 'message': 'GTFS stop coverage is available. Select a location to calculate nearby-stop coverage.'}
            lat_delta = radius_meters / 111_000
            lon_delta = radius_meters / max(1, 111_000 * abs(__import__('math').cos(__import__('math').radians(latitude))))
            rows = db.execute('''SELECT stop_id,stop_name,latitude,longitude FROM gtfs_stops WHERE source_id=?
                AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?''',
                (source_id, latitude-lat_delta, latitude+lat_delta, longitude-lon_delta, longitude+lon_delta)).fetchall()
        import math
        nearby = []
        for row in rows:
            lat1, lat2 = math.radians(latitude), math.radians(row['latitude'])
            dlat = lat2-lat1; dlon = math.radians(row['longitude']-longitude)
            distance = 6371000 * 2 * math.asin(math.sqrt(math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2))
            if distance <= radius_meters:
                nearby.append({**dict(row), 'distance_meters': round(distance)})
        return {'status': 'success', 'radius_meters': radius_meters, 'nearby_stop_count': len(nearby),
                'stops': sorted(nearby, key=lambda item: item['distance_meters'])[:100],
                'metric': 'stop proximity only; does not model pedestrian networks, population, capacity or passenger demand'}

    def source_points(self, source_id: str, limit: int = 5000) -> list[dict]:
        with self.connect() as db:
            source = db.execute('SELECT format FROM sources WHERE id=?', (source_id,)).fetchone()
            if source and source['format'] == 'gtfs_static':
                rows = db.execute('''SELECT stop_id AS id,stop_name AS area_name,latitude,longitude,'gtfs_stop' AS record_type
                    FROM gtfs_stops WHERE source_id=? AND latitude IS NOT NULL LIMIT ?''', (source_id, limit)).fetchall()
                return [dict(row) for row in rows]
            rows = db.execute('''SELECT id,area_name,latitude,longitude,record_type FROM observations
                WHERE source_id=? AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY id LIMIT ?''', (source_id, limit)).fetchall()
        return [dict(row) for row in rows]

    def gtfs_times_count(self, source_id: str) -> int:
        with self.connect() as db:
            return int(db.execute('SELECT COUNT(*) FROM gtfs_stop_times WHERE source_id=?',(source_id,)).fetchone()[0])

    def insert_geo_features(self, source_id: str, rows: Iterable[tuple]) -> int:
        values = [(source_id, *row) for row in rows]
        if not values:
            return 0
        with self.connect() as db:
            db.executemany('INSERT OR REPLACE INTO geo_features(source_id,feature_id,geometry_type,geometry_json,properties_json) VALUES (?,?,?,?,?)', values)
        return len(values)

    def insert_gtfs_stop_times(self, source_id: str, rows: Iterable[tuple]) -> int:
        values = [(source_id, *row) for row in rows]
        if not values:
            return 0
        with self.connect() as db:
            db.executemany('''INSERT OR REPLACE INTO gtfs_stop_times
                (source_id,trip_id,stop_id,stop_sequence,arrival_seconds,departure_seconds) VALUES (?,?,?,?,?,?)''', values)
        return len(values)

    def prune_invalid_gtfs_times(self, source_id: str) -> int:
        with self.connect() as db:
            before = db.total_changes
            db.execute('''DELETE FROM gtfs_stop_times WHERE source_id=? AND (
                NOT EXISTS (SELECT 1 FROM gtfs_trips t WHERE t.source_id=gtfs_stop_times.source_id AND t.trip_id=gtfs_stop_times.trip_id)
                OR NOT EXISTS (SELECT 1 FROM gtfs_stops s WHERE s.source_id=gtfs_stop_times.source_id AND s.stop_id=gtfs_stop_times.stop_id))''', (source_id,))
            return db.total_changes - before

    def delete_source(self, source_id: str) -> bool:
        with self.connect() as db:
            return db.execute('DELETE FROM sources WHERE id=?', (source_id,)).rowcount > 0
