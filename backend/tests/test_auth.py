import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app import auth

@pytest.mark.parametrize('method,path', [
 ('post','/api/data/preview?filename=test.csv'),('post','/api/data/import?filename=test.csv'),
 ('post','/api/data/activate?filename=test.csv'),('get','/api/admin/users'),
 ('get','/api/admin/requests'),('post','/api/admin/requests/unknown/approve'),
 ('post','/api/admin/requests/unknown/reject'),('get','/api/analytics/reports'),
 ('post','/api/analytics/reports'),('delete','/api/analytics/reports?report_id=unknown'),
])
def test_privileged_endpoints_require_verified_session(method,path):
    assert getattr(TestClient(app),method)(path).status_code==401

@pytest.mark.parametrize('role,active,status',[('public_user',True,403),('planner',True,403),('admin',False,403),('invalid',True,403)])
def test_admin_role_is_verified_from_active_database_profile(monkeypatch,role,active,status):
    def response(method,path,token,**kwargs):
        assert token=='test-session'
        return {'id':'fixture','email':'fixture@example.invalid'} if path=='/auth/v1/user' else [{'id':'fixture','role':role,'is_active':active}]
    monkeypatch.setattr(auth,'supabase_request',response)
    result=TestClient(app).post('/api/data/activate?filename=unconfigured.csv',headers={'Authorization':'Bearer test-session'})
    assert result.status_code==status

def test_verified_identity_not_metadata_controls_role(monkeypatch):
    calls=[]
    def response(method,path,token,**kwargs):
        calls.append((path,kwargs))
        if path=='/auth/v1/user':return {'id':'actual-id','email':'a@example.invalid','user_metadata':{'role':'admin'}}
        return [{'id':'actual-id','role':'public_user','is_active':True}]
    monkeypatch.setattr(auth,'supabase_request',response)
    user=auth.current_user('Bearer valid-session')
    assert user.role=='public_user' and calls[1][1]['params']['id']=='eq.actual-id'
    with pytest.raises(HTTPException):auth.require_admin(user)

def test_invalid_token_and_service_failure_are_not_success(monkeypatch):
    def unavailable(*args,**kwargs):raise HTTPException(503,'Service unavailable')
    monkeypatch.setattr(auth,'supabase_request',unavailable)
    result=TestClient(app).get('/api/admin/users',headers={'Authorization':'Bearer unavailable'})
    assert result.status_code==503
    assert TestClient(app).get('/api/admin/users',headers={'Authorization':'Basic ignored'}).status_code==401

@pytest.mark.parametrize('role',['planner','admin'])
def test_planner_and_admin_allowed_planner_capability(role):
    user=auth.User('fixture','fixture@example.invalid',role,'session')
    assert auth.require_planner(user) is user
