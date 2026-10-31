"""Configured GTFS-Realtime fetcher with short-lived cache and safe metadata."""
from __future__ import annotations

import json
import os
import time
from typing import Any
import httpx
from google.transit import gtfs_realtime_pb2
from app.config import settings

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_SECONDS = 30
_TIMEOUT = 10.0


def _configs() -> list[dict]:
    raw = os.getenv('GTFS_RT_FEEDS')
    if raw is None:
        return settings.gtfs_rt_feeds
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return []


def list_feeds() -> list[dict]:
    return [{'id': str(item.get('id','')), 'name': str(item.get('name') or item.get('id') or 'GTFS-Realtime feed'),
             'type': item.get('type'), 'configured': bool(item.get('url')),
             'city':item.get('city'), 'attribution': item.get('attribution')} for item in _configs() if item.get('id')]


def _auth_headers(config: dict) -> dict[str, str]:
    headers = {}
    env_name = config.get('api_key_env')
    if env_name and os.getenv(env_name):
        headers[config.get('api_key_header', 'Authorization')] = os.getenv(env_name, '')
    extra_env = config.get('headers_env')
    if extra_env and os.getenv(extra_env):
        try:
            extra = json.loads(os.environ[extra_env])
            if isinstance(extra, dict): headers.update({str(k):str(v) for k,v in extra.items()})
        except json.JSONDecodeError:
            pass
    return headers


async def fetch_feed(feed_id: str) -> dict:
    config = next((item for item in _configs() if str(item.get('id')) == feed_id), None)
    if not config or not config.get('url'):
        return {'status':'unavailable','message':'No GTFS-Realtime provider is configured for this feed.'}
    kind = config.get('type')
    if kind not in ('vehicle_positions','trip_updates','service_alerts'):
        return {'status':'unavailable','message':'Feed configuration must specify vehicle_positions, trip_updates or service_alerts.'}
    cached = _cache.get(feed_id)
    if cached and time.monotonic()-cached[0] < _CACHE_SECONDS:
        return {**cached[1], 'cached':True}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(config['url'], headers=_auth_headers(config))
        if response.status_code == 429:
            retry = response.headers.get('Retry-After')
            if cached:
                return {**cached[1], 'status':'stale','cached':True,'retry_after':retry,'message':'Provider rate limit reached; showing the last successful response.'}
            return {'status':'rate_limited','retry_after':retry,'message':'Provider rate limit reached; no cached response is available.'}
        response.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        entities=[]
        for entity in feed.entity:
            item={'id':entity.id}
            if kind=='vehicle_positions' and entity.HasField('vehicle'):
                vehicle=entity.vehicle
                item.update({'trip_id':vehicle.trip.trip_id or None,'route_id':vehicle.trip.route_id or None,
                    'latitude':vehicle.position.latitude if vehicle.HasField('position') else None,
                    'longitude':vehicle.position.longitude if vehicle.HasField('position') else None,
                    'bearing':vehicle.position.bearing if vehicle.HasField('position') else None,
                    'timestamp':vehicle.timestamp or None})
            elif kind=='trip_updates' and entity.HasField('trip_update'):
                update=entity.trip_update
                delays=[stop.arrival.delay for stop in update.stop_time_update if stop.HasField('arrival') and stop.arrival.HasField('delay')]
                item.update({'trip_id':update.trip.trip_id or None,'route_id':update.trip.route_id or None,
                    'stop_updates':len(update.stop_time_update),'max_delay_seconds':max(delays) if delays else None,
                    'timestamp':update.timestamp or None})
            elif kind=='service_alerts' and entity.HasField('alert'):
                alert=entity.alert
                item.update({'header':alert.header_text.translation[0].text if alert.header_text.translation else None,
                    'description':alert.description_text.translation[0].text if alert.description_text.translation else None,
                    'cause':int(alert.cause),'effect':int(alert.effect)})
            else:
                continue
            entities.append(item)
        payload={'status':'success','feed_id':feed_id,'type':kind,'entities':entities,
            'entity_count':len(entities),'header_timestamp':feed.header.timestamp or None,
            'last_updated':response.headers.get('Last-Modified'),'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
            'attribution':config.get('attribution'),'cached':False,
            'data_semantics':'transit operations feed; not passenger-demand measurements'}
        _cache[feed_id]=(time.monotonic(),payload)
        return payload
    except (httpx.HTTPError, ValueError) as exc:
        if cached:
            return {**cached[1],'status':'stale','cached':True,'message':f'Provider request failed; showing last successful response ({type(exc).__name__}).'}
        return {'status':'error','message':f'Could not fetch or decode this GTFS-Realtime feed ({type(exc).__name__}).'}
