from fastapi.testclient import TestClient
from app.main import app
from app.config import Settings, settings
from app.services import gtfs_realtime

def test_environment_example_is_parseable(monkeypatch):
    monkeypatch.delenv('DEBUG', raising=False)
    config = Settings(_env_file='.env.example')
    assert config.frontend_origins == ['http://localhost:3000', 'http://127.0.0.1:3000']
    assert config.gtfs_rt_feeds == []

def test_realtime_configuration_reads_dotenv_settings(monkeypatch):
    monkeypatch.delenv('GTFS_RT_FEEDS', raising=False)
    monkeypatch.setattr(settings, 'gtfs_rt_feeds', [{'id': 'test', 'name': 'Test feed', 'url': 'https://example.invalid/feed'}])
    assert gtfs_realtime.list_feeds()[0]['id'] == 'test'
    assert 'url' not in gtfs_realtime.list_feeds()[0]

def test_readiness_checks_catalog_and_auth_configuration(monkeypatch):
    monkeypatch.setattr(settings, 'supabase_url', '')
    response = TestClient(app).get('/api/health/ready')
    assert response.status_code == 503
    assert response.json()['database']['engine'] == 'sqlite'
    assert response.json()['authentication']['status'] == 'not_configured'
    monkeypatch.setattr(settings, 'supabase_url', 'https://example.invalid')
    monkeypatch.setattr(settings, 'supabase_anon_key', 'test-public-key')
    assert TestClient(app).get('/api/health/ready').status_code == 200
