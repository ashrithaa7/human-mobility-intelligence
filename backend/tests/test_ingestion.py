import csv
import zipfile
from pathlib import Path
import json
import asyncio

import pytest

from app.services import dataset_readers
from app.services.dataset_readers import DatasetReadError, ingest_dataset
from app.services.mobility_store import MobilityStore
from app.services.csv_loader import CSVDataLoader
from app.services import gtfs_realtime


def import_file(path: Path, tmp_path: Path, timezone='Asia/Kolkata'):
    store = MobilityStore(tmp_path / 'catalog')
    result = ingest_dataset(path, path.name, store, {'label':path.stem, 'license':'test', 'timezone':timezone})
    return store, result


def test_csv_alias_timezone_and_duplicate_detection(tmp_path):
    path=tmp_path/'rides.csv'
    path.write_text('pickup_lat,pickup_lon,dropoff_lat,dropoff_lon,pickup_datetime,trip_id,passenger_count,borough\n17.4,78.4,17.5,78.5,2025-02-01 08:30:00,t1,2,Hyd\n17.4,78.4,17.5,78.5,2025-02-01 08:30:00,t1,2,Hyd\n',encoding='utf-8')
    store,result=import_file(path,tmp_path)
    rows,total=store.page_observations(path.name)
    assert total==1 and result['duplicate_count']==1
    assert rows[0]['origin_latitude']==17.4 and rows[0]['destination_longitude']==78.5
    assert rows[0]['timezone']=='Asia/Kolkata' and rows[0]['local_hour']==8
    assert rows[0]['properties']['borough']=='Hyd'
    assert store.temporal_summary(path.name)['hourly']=={8:2}


def test_invalid_coordinates_are_reported(tmp_path):
    path=tmp_path/'bad.csv'
    path.write_text('lat,lon,timestamp\n95,181,2025-01-01T00:00:00\n',encoding='utf-8')
    with pytest.raises(DatasetReadError,match='No valid mobility rows'):
        import_file(path,tmp_path)


def test_empty_csv_returns_a_clear_parse_error(tmp_path):
    path=tmp_path/'empty.csv'; path.write_text('',encoding='utf-8')
    with pytest.raises(DatasetReadError,match='Could not parse CSV'):
        import_file(path,tmp_path)


def test_custom_column_mapping(tmp_path):
    path=tmp_path/'custom.csv'
    path.write_text('gps_y,gps_x,recorded_at,zone_name\n17.4,78.4,2025-01-01T08:00:00,Central\n',encoding='utf-8')
    store=MobilityStore(tmp_path/'mapped')
    ingest_dataset(path,path.name,store,{'column_mapping':{'latitude':'gps_y','longitude':'gps_x','timestamp':'recorded_at','area_name':'zone_name'}})
    row=store.page_observations(path.name)[0][0]
    assert row['area_name']=='Central' and row['latitude']==17.4


def test_large_csv_is_read_across_chunks(tmp_path):
    path=tmp_path/'large.csv'
    with path.open('w',newline='',encoding='utf-8') as stream:
        writer=csv.writer(stream); writer.writerow(['lat','lon','timestamp','trip_id'])
        for index in range(100_120): writer.writerow([17.4+(index%10)*.001,78.4,'2025-01-01T08:00:00',f't{index}'])
    store,result=import_file(path,tmp_path)
    assert result['record_count']==100_120
    assert len(store.page_observations(path.name,limit=5000)[0])==5000


def test_gtfs_static_stores_schedule_without_passenger_demand(tmp_path):
    path=tmp_path/'feed.zip'
    members={
        'stops.txt':'stop_id,stop_name,stop_lat,stop_lon\ns1,Central,17.4,78.4\ns2,North,17.5,78.5\n',
        'routes.txt':'route_id,route_type,route_short_name\nr1,3,1\n',
        'trips.txt':'route_id,service_id,trip_id\nr1,svc,t1\n',
        'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,s1,1\nt1,08:20:00,08:20:00,s2,2\n',
        'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nsvc,1,1,1,1,1,0,0,20250101,20251231\n'}
    with zipfile.ZipFile(path,'w') as archive:
        for name,content in members.items(): archive.writestr(name,content)
    store,result=import_file(path,tmp_path)
    assert result['record_count']==2
    assert store.temporal_summary(path.name)['data_semantics']=='scheduled_service'
    corridors=store.od_summary(path.name)
    assert corridors['data_semantics']=='scheduled_route_segments'
    assert 'passenger' in corridors['message']


def gtfs_archive(path: Path, *, override: dict[str, str] | None = None, prefix: str = '') -> bytes:
    members = {
        'stops.txt': '\ufeffstop_id,stop_name,stop_lat,stop_lon\ns1, Central ,17.4,78.4\ns2,North,17.5,78.5\n',
        'routes.txt': 'route_id,route_type,route_short_name\nr1,3,1\n',
        'trips.txt': 'route_id,service_id,trip_id\nr1,svc,t1\n',
        'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,25:30:00,25:35:00,s1,1\nt1,26:00:00,26:00:00,s2,2\n',
    }
    members.update(override or {})
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in members.items():
            archive.writestr(f'{prefix}{name}', content)
    return path.read_bytes()


def test_gtfs_upload_uses_gtfs_reader_not_csv_validation(tmp_path):
    filename = 'telangana_opendata_gtfs_tgsrtc_08_february_2026.zip'
    content = gtfs_archive(tmp_path / filename)
    loader = CSVDataLoader(str(tmp_path / 'catalog'))
    result = loader.import_dataset(filename, content)
    source = loader.store.get_source(filename)
    assert result['format'] == 'gtfs_static'
    assert source['format'] == 'gtfs_static' and source['status'] == 'ready'
    assert loader.store.gtfs_times_count(filename) == 2
    with loader.store.connect() as db:
        times = db.execute('SELECT arrival_seconds FROM gtfs_stop_times WHERE source_id=? ORDER BY stop_sequence', (filename,)).fetchall()
        assert [row[0] for row in times] == [25 * 3600 + 30 * 60, 26 * 3600]
        assert db.execute('SELECT stop_name FROM gtfs_stops WHERE source_id=? AND stop_id="s1"', (filename,)).fetchone()[0] == 'Central'


def test_gtfs_requires_four_core_tables_but_not_service_calendar(tmp_path):
    content = gtfs_archive(tmp_path / 'missing.zip', override={'stop_times.txt': 'trip_id,stop_id\nt1,s1\n'})
    with pytest.raises(DatasetReadError, match='missing required column'):
        import_file(tmp_path / 'missing.zip', tmp_path)


def test_gtfs_missing_core_file_is_clear(tmp_path):
    path = tmp_path / 'missing.zip'
    members = {'stops.txt': 'stop_id,stop_lat,stop_lon\ns1,17.4,78.4\n', 'routes.txt': 'route_id,route_type\nr1,3\n', 'trips.txt': 'route_id,service_id,trip_id\nr1,svc,t1\n'}
    with zipfile.ZipFile(path, 'w') as archive:
        for name, content in members.items(): archive.writestr(name, content)
    with pytest.raises(DatasetReadError, match='stop_times.txt'):
        import_file(path, tmp_path)


def test_gtfs_rejects_broken_route_and_stop_time_references(tmp_path):
    path = tmp_path / 'bad_references.zip'
    content = gtfs_archive(path, override={
        'trips.txt': 'route_id,service_id,trip_id\nmissing,svc,t1\n',
    })
    with pytest.raises(DatasetReadError, match='unknown route_id'):
        import_file(path, tmp_path)
    path = tmp_path / 'bad_stop_reference.zip'
    gtfs_archive(path, override={
        'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,missing,1\n',
    })
    with pytest.raises(DatasetReadError, match='unknown trip_id or stop_id'):
        import_file(path, tmp_path)


def test_corrupt_and_path_traversal_gtfs_archives_are_rejected(tmp_path):
    corrupt = tmp_path / 'corrupt.zip'; corrupt.write_bytes(b'not a zip archive')
    with pytest.raises(DatasetReadError, match='valid, readable ZIP'):
        import_file(corrupt, tmp_path)
    malicious = tmp_path / 'malicious.zip'
    with zipfile.ZipFile(malicious, 'w') as archive:
        archive.writestr('../stops.txt', 'stop_id,stop_lat,stop_lon\ns1,17.4,78.4\n')
    with pytest.raises(DatasetReadError, match='unsafe path'):
        import_file(malicious, tmp_path)


def test_gtfs_zip_uncompressed_size_limit_is_enforced(tmp_path, monkeypatch):
    path = tmp_path / 'oversized.zip'
    gtfs_archive(path)
    monkeypatch.setattr(dataset_readers, 'MAX_ZIP_UNCOMPRESSED_BYTES', 10)
    with pytest.raises(DatasetReadError, match='uncompressed import limit'):
        dataset_readers.detect_format(path)


def test_flexible_filenames_are_accepted_and_zip_path_is_rejected(tmp_path):
    loader = CSVDataLoader(str(tmp_path / 'catalog'))
    assert loader._safe_filename('mobility data.csv') == 'mobility data.csv'
    with pytest.raises(DatasetReadError, match='directory paths'):
        loader._safe_filename('../mobility.zip')


def test_geolife_and_geojson_point_readers(tmp_path):
    plt=tmp_path/'trajectory.plt'
    plt.write_text('Geolife trajectory\nWGS 84\nAltitude is in Feet\nReserved 3\n0,2,lat,lon\n\n17.4,78.4,0,10,0,2025-01-01,08:00:00\n17.5,78.5,0,10,0,2025-01-01,08:10:00\n',encoding='utf-8')
    store,result=import_file(plt,tmp_path)
    assert result['format']=='geolife_plt'
    assert store.page_observations(plt.name)[0][0]['trajectory_id']=='trajectory'
    assert store.od_summary(plt.name)['data_semantics']=='trajectory_endpoint_inference'
    assert store.page_observations(plt.name,filters={'region':'Grid 1568,348'})[1]==1
    geo=tmp_path/'points.geojson'
    geo.write_text('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"timestamp":"2025-01-01T08:00:00+05:30","zone":"Hyd"},"geometry":{"type":"Point","coordinates":[78.4,17.4]}}]}',encoding='utf-8')
    geo_store,geo_result=import_file(geo,tmp_path)
    assert geo_result['record_count']==1
    row=geo_store.page_observations(geo.name)[0][0]
    assert row['timezone'] and row['area_name']=='Hyd'


def test_gtfs_realtime_feed_is_parsed_and_not_fabricated(monkeypatch):
    from google.transit import gtfs_realtime_pb2
    message=gtfs_realtime_pb2.FeedMessage()
    message.header.gtfs_realtime_version='2.0'
    vehicle=message.entity.add(); vehicle.id='v1'
    vehicle.vehicle.trip.trip_id='trip-1'; vehicle.vehicle.position.latitude=17.4; vehicle.vehicle.position.longitude=78.4
    class Response:
        status_code=200
        headers={'Last-Modified':'Wed, 01 Jan 2025 08:00:00 GMT'}
        content=message.SerializeToString()
        def raise_for_status(self): pass
    class Client:
        def __init__(self,**kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,*args,**kwargs): return Response()
    monkeypatch.setenv('GTFS_RT_FEEDS',json.dumps([{'id':'demo','name':'Configured demo','type':'vehicle_positions','url':'https://feed.example/vehicle'}]))
    monkeypatch.setattr(gtfs_realtime.httpx,'AsyncClient',Client)
    gtfs_realtime._cache.clear()
    result=asyncio.run(gtfs_realtime.fetch_feed('demo'))
    assert result['status']=='success' and result['entity_count']==1
    assert result['entities'][0]['trip_id']=='trip-1'
    assert result['data_semantics'].startswith('transit operations')

