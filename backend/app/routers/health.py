"""Process health and actual local catalog readiness, separate from auth configuration."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.config import settings

router = APIRouter(prefix='/api', tags=['health'])

def service_status():
    from app.routers.data import data_loader
    try:
        with data_loader.store.connect() as connection:
            connection.execute('SELECT 1').fetchone()
        database = {'status': 'connected', 'engine': 'sqlite', 'message': 'Local mobility catalog is reachable.'}
    except Exception:
        database = {'status': 'error', 'engine': 'sqlite', 'message': 'Local mobility catalog is unavailable.'}
    auth_configured = bool(settings.supabase_url and settings.supabase_anon_key)
    return {'database': database, 'authentication': {
        'status': 'configured' if auth_configured else 'not_configured',
        'provider': 'supabase',
        'message': 'Configuration presence only; each protected request verifies its session and current role.'
    }}

@router.get('/health')
def health_check():
    services = service_status()
    return {'status': 'healthy' if services['database']['status'] == 'connected' else 'degraded',
            'service': settings.app_name, 'version': settings.version, **services}

@router.get('/health/ready')
def readiness_check():
    services = service_status()
    ready = services['database']['status'] == 'connected' and services['authentication']['status'] == 'configured'
    return JSONResponse({'ready': ready, **services}, status_code=200 if ready else 503)
