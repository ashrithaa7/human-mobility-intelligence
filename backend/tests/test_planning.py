import json
import geopandas as gpd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Point, LineString, box
from shapely.ops import transform
from app.services import planning
from app.main import app
from app import auth

@pytest.fixture
def prepared(tmp_path):
    center=transform(planning.PROJECT,Point(78.48,17.39))
    layers={
        'roads':gpd.GeoDataFrame({'osm_id':['1'],'fclass':['footway'],'name':['path']},geometry=[LineString([(center.x-2000,center.y),(center.x+2000,center.y)])],crs=32644),
        'amenities':gpd.GeoDataFrame({'osm_id':['2'],'fclass':['school'],'name':['School']},geometry=[Point(center.x+100,center.y)],crs=32644),
        'landuse':gpd.GeoDataFrame({'osm_id':['3','4'],'fclass':['residential','residential'],'name':['a','b']},geometry=[box(center.x-300,center.y-300,center.x+300,center.y+300)]*2,crs=32644),
        'water':gpd.GeoDataFrame({'osm_id':['5'],'fclass':['water'],'name':['lake']},geometry=[box(center.x-10,center.y-10,center.x+10,center.y+10)],crs=32644),
        'transit':gpd.GeoDataFrame({'osm_id':['s1'],'fclass':['bus_stop'],'name':['stop']},geometry=[Point(center.x,center.y+200)],crs=32644),
    }
    for key,frame in layers.items():frame.to_crs(4326).to_file(tmp_path/'hyderabad.gpkg',layer=key,driver='GPKG')
    manifest={'source_date':'fixture','source_url':'https://example.invalid','archive_sha256':'fixture','attribution':'fixture','license':'test','bbox':[77.8,16.8,79.2,18.1],'scope':'test','layers':{k:{} for k in layers},'limitations':[]}
    (tmp_path/'manifest.json').write_text(json.dumps(manifest))
    return tmp_path

def test_metric_clipping_nearest_and_polygon_union(prepared):
    result=planning.assess([{'name':'Test','latitude':17.39,'longitude':78.48}],500,'amenities',prepared)
    metrics=result['sites'][0]['metrics']
    assert metrics['mapped_road_km']==pytest.approx(1,abs=.005)
    assert metrics['explicit_active_path_km']==pytest.approx(1,abs=.005)
    assert metrics['nearest_stop_m']==200
    assert metrics['amenities']['education']['nearest']['distance_m']==100
    assert metrics['amenities']['health']['nearest'] is None
    assert metrics['landuse_km2_by_class']['residential']==pytest.approx(.36,abs=.001)
    assert metrics['site_intersects_mapped_water'] is True

def test_boundary_rejects_partial_and_outside_studies(prepared):
    for lat,lon in [(0,0),(16.8001,78.48)]:
        with pytest.raises(ValueError):planning.assess([{'name':'Bad','latitude':lat,'longitude':lon}],1000,'roads',prepared)

def test_scenarios_isolated_by_verified_owner(prepared):
    result=planning.assess([{'name':'Test','latitude':17.39,'longitude':78.48}],500,'policy',prepared)
    saved=planning.save_scenario('alice','Review','Field check required',result,prepared)
    assert 'map' not in saved['sites'][0]
    assert len(planning.list_scenarios('alice',prepared))==1
    assert planning.list_scenarios('bob',prepared)==[]

@pytest.mark.parametrize('method,path',[('get','catalog'),('post','assess'),('get','scenarios'),('post','scenarios')])
def test_planning_requires_authentication(method,path):
    assert getattr(TestClient(app),method)('/api/planning/'+path).status_code==401

def test_public_role_denied_even_if_metadata_says_planner(monkeypatch):
    def response(method,path,token,**kwargs):
        return {'id':'public','user_metadata':{'role':'planner'}} if path=='/auth/v1/user' else [{'role':'public_user','is_active':True}]
    monkeypatch.setattr(auth,'supabase_request',response)
    assert TestClient(app).get('/api/planning/catalog',headers={'Authorization':'Bearer fixture'}).status_code==403

@pytest.mark.parametrize('radius,latitude',[(0,17.39),(50000,17.39),(1000,100)])
def test_request_limits(radius,latitude):
    from app.routers.planning import Assessment
    from pydantic import ValidationError
    with pytest.raises(ValidationError):Assessment(sites=[{'name':'test','latitude':latitude,'longitude':78.48}],radius_m=radius)
