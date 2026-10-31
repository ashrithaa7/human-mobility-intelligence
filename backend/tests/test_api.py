from fastapi.testclient import TestClient

from app.main import app
from app.routers import analytics
from app.services.mobility_store import MobilityStore


def test_temporal_endpoint_uses_selected_indexed_source(tmp_path, monkeypatch):
    store=MobilityStore(tmp_path)
    store.start_source({'id':'actual.csv','filename':'actual.csv','format':'csv','label':'Real records'})
    store.insert_observations('actual.csv',[{'row_hash':'a','timestamp':'2025-01-06T02:30:00Z',
        'local_timestamp':'2025-01-06T08:00:00','timezone':'Asia/Kolkata','local_hour':8,
        'local_weekday':0,'local_day':'2025-01-06','local_week':'2025-W02','local_month':'2025-01',
        'latitude':17.4,'longitude':78.4,'event_count':3,'area_name':'Hyd','properties':{}},
        {'row_hash':'b','timestamp':'2025-01-06T03:30:00Z','local_timestamp':'2025-01-06T09:00:00',
        'timezone':'Asia/Kolkata','local_hour':9,'local_weekday':0,'local_day':'2025-01-06',
        'local_week':'2025-W02','local_month':'2025-01','latitude':17.5,'longitude':78.5,
        'event_count':1,'area_name':'Vijayawada','properties':{}}])
    store.finalize_source('actual.csv')
    monkeypatch.setattr(analytics.data_loader,'store',store)
    monkeypatch.setattr(analytics.data_loader,'get_active_dataset',lambda:'actual.csv')
    monkeypatch.setattr(analytics.data_loader,'get_available_datasets',lambda:[store.get_source('actual.csv')])
    response=TestClient(app).post('/api/analytics/temporal',json={'parameters':{'region':'Hyd'}})
    assert response.status_code==200
    payload=response.json()
    assert payload['data_mode']=='historical'
    assert payload['hourly_patterns']['hourly']=={'8':3}
    assert payload['weekly_patterns']=={'2025-W02':3}
    comparison=TestClient(app).post('/api/analytics/compare',json={'parameters':{'regions':['Hyd','Vijayawada']}})
    assert comparison.status_code==200
    assert [area['records'] for area in comparison.json()['result']['regions']]==[1,1]


def test_analytics_does_not_fall_back_to_synthetic_data(monkeypatch):
    monkeypatch.setattr(analytics.data_loader,'get_active_dataset',lambda:None)
    monkeypatch.setattr(analytics.data_loader,'get_available_datasets',lambda:[])
    response=TestClient(app).post('/api/analytics/spatial',json={})
    assert response.status_code==503
    assert 'administrator must import' in response.json()['detail']
