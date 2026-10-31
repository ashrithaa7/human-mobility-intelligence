"""Administrative operations use Supabase RLS and the transactional review RPC."""
from fastapi import APIRouter, Depends
from app.auth import User, require_admin, supabase_request

router = APIRouter(prefix='/api/admin', tags=['admin'])

@router.get('/requests')
def get_pending_requests(user: User = Depends(require_admin)):
    rows = supabase_request('GET','/rest/v1/planner_requests',user.token,params={'status':'eq.pending','order':'requested_at.desc'})
    return {'requests': rows, 'total': len(rows)}

@router.post('/requests/{request_id}/approve')
def approve_request(request_id: str, user: User = Depends(require_admin)):
    result = supabase_request('POST','/rest/v1/rpc/review_planner_request',user.token,json={'p_request_id':request_id,'p_decision':'approved'})
    return {'success':True,'request':result}

@router.post('/requests/{request_id}/reject')
def reject_request(request_id: str, user: User = Depends(require_admin)):
    result = supabase_request('POST','/rest/v1/rpc/review_planner_request',user.token,json={'p_request_id':request_id,'p_decision':'rejected'})
    return {'success':True,'request':result}

@router.get('/users')
def get_users(user: User = Depends(require_admin)):
    rows = supabase_request('GET','/rest/v1/users',user.token,params={'order':'created_at.desc'})
    return {'users': rows, 'total': len(rows)}
