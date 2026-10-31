"""Verify Supabase sessions and current database roles before privileged operations."""
from dataclasses import dataclass
from fastapi import Depends, Header, HTTPException
import httpx
from app.config import settings

@dataclass
class User:
    id: str
    email: str
    role: str
    token: str

def supabase_request(method: str, path: str, token: str, **kwargs):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, 'Account verification is not configured on the backend.')
    try:
        response = httpx.request(method, settings.supabase_url.rstrip('/') + path,
            headers={'apikey': settings.supabase_anon_key, 'Authorization': f'Bearer {token}'}, timeout=15, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(503, 'The account service is unavailable.') from exc
    if response.status_code >= 400:
        status = response.status_code if response.status_code in (400, 401, 403, 404, 409, 422) else 503
        raise HTTPException(status, 'The account operation could not be completed. Check your access and database migration.')
    return response.json()

def current_user(authorization: str | None = Header(default=None)) -> User:
    scheme, _, token = (authorization or '').partition(' ')
    if scheme.lower() != 'bearer' or not token.strip(): raise HTTPException(401, 'Sign in to continue.')
    account = supabase_request('GET', '/auth/v1/user', token.strip())
    if not account.get('id'): raise HTTPException(401, 'Invalid session.')
    profiles = supabase_request('GET', '/rest/v1/users', token.strip(), params={'id': f'eq.{account["id"]}', 'select': 'id,role,is_active'})
    if len(profiles) != 1: raise HTTPException(403, 'An account profile is required.')
    profile = profiles[0]
    if not profile.get('is_active') or profile.get('role') not in ('public_user','planner','admin'):
        raise HTTPException(403, 'This account is inactive or has an invalid role.')
    return User(account['id'], account.get('email',''), profile['role'], token.strip())

def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != 'admin': raise HTTPException(403, 'Administrator access required.')
    return user

def require_planner(user: User = Depends(current_user)) -> User:
    if user.role not in ('planner','admin'): raise HTTPException(403, 'Planner access required.')
    return user
