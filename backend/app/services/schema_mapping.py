"""Explainable schema inference. Ambiguous guesses require an explicit mapping."""
from __future__ import annotations

import math
import re
from difflib import SequenceMatcher
from typing import Any

import pandas as pd

from app.services.dataset_errors import DatasetReadError


def key(value: Any) -> str:
    return re.sub(r'[^a-z0-9]+', '_', str(value or '').strip().lstrip('\ufeff').lower()).strip('_')


ALIASES = {
    'latitude': ('latitude', 'lat', 'latitude_deg', 'gps_lat', 'y', 'pickup_latitude', 'pickup_lat', 'origin_latitude', 'origin_lat', 'start_latitude', 'start_lat', 'from_latitude', 'stop_lat'),
    'longitude': ('longitude', 'lon', 'lng', 'longitude_deg', 'gps_lon', 'gps_lng', 'x', 'pickup_longitude', 'pickup_lon', 'pickup_lng', 'origin_longitude', 'origin_lon', 'start_longitude', 'start_lon', 'from_longitude', 'stop_lon'),
    'destination_latitude': ('destination_latitude', 'destination_lat', 'dropoff_latitude', 'dropoff_lat', 'dest_latitude', 'dest_lat', 'to_latitude', 'to_lat', 'end_latitude', 'end_lat', 'arrival_latitude'),
    'destination_longitude': ('destination_longitude', 'destination_lon', 'destination_lng', 'dropoff_longitude', 'dropoff_lon', 'dropoff_lng', 'dest_longitude', 'dest_lon', 'to_longitude', 'to_lon', 'end_longitude', 'end_lon', 'arrival_longitude'),
    'timestamp': ('timestamp', 'datetime', 'date_time', 'recorded_at', 'observed_at', 'pickup_datetime', 'start_datetime', 'start_time', 'departure_time', 'trip_start_time', 'time'),
    'date': ('date', 'observation_date', 'service_date', 'start_date'),
    'time': ('clock_time',), 'timezone': ('timezone', 'time_zone', 'tz'),
    'trip_id': ('trip_id', 'journey_id', 'ride_id', 'tripid'),
    'trajectory_id': ('trajectory_id', 'track_id', 'path_id', 'user_id', 'device_id', 'vehicle_id'),
    'route_id': ('route_id', 'routeid', 'line_id'),
    'event_count': ('event_count', 'activity_count', 'passenger_count', 'trip_count', 'flow_count', 'count', 'volume', 'trips'),
    'area_name': ('area_name', 'location_name', 'region', 'neighborhood', 'district', 'zone', 'stop_name'),
    'country': ('country', 'country_name'), 'state': ('state', 'state_name', 'province', 'province_name'),
    'city': ('city', 'city_name', 'municipality'),
    'indicator': ('indicator', 'indicator_name', 'metric', 'measure', 'parameter'),
    'value': ('value', 'indicator_value', 'metric_value', 'measurement'),
    'year': ('year', 'survey_year', 'reference_year'), 'unit': ('unit', 'units', 'unit_of_measure'),
    'origin': ('origin', 'origin_name', 'origin_zone', 'from_zone', 'from_area'),
    'destination': ('destination', 'destination_name', 'destination_zone', 'to_zone', 'to_area'),
    'geometry': ('geometry', 'geom', 'wkt', 'geojson'),
}
FIELDS = tuple(ALIASES)
DATASET_TYPES = ('auto', 'trajectory', 'geographic', 'temporal', 'indicator', 'origin_destination', 'tabular')


def missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip()) or (isinstance(value, float) and math.isnan(value))


def infer_schema(columns: list[str], rows: list[dict], mapping: dict | None = None,
                 dataset_type: str = 'auto') -> dict:
    if dataset_type not in DATASET_TYPES:
        raise DatasetReadError(f'Unknown dataset type {dataset_type!r}.')
    normalized = [key(column) for column in columns]
    if len(set(normalized)) != len(columns) or any(not name for name in normalized):
        raise DatasetReadError('Columns must have distinct, non-empty names after normalisation.')
    manual = mapping or {}
    if set(manual) - set(FIELDS) - {'origin_latitude', 'origin_longitude'}:
        raise DatasetReadError('The mapping contains an unsupported canonical field.')
    manual = {('latitude' if k == 'origin_latitude' else 'longitude' if k == 'origin_longitude' else k): v for k, v in manual.items()}
    for field, column in manual.items():
        if column and column not in columns:
            raise DatasetReadError(f'Mapped column {column!r} for {field} is not present in this file.')
    selected = {}; candidates = {}; confidence = {}; ambiguous = []; warnings = []
    exact_names = {alias for aliases in ALIASES.values() for alias in aliases}
    for field, aliases in ALIASES.items():
        choices = []
        for column in columns:
            name = key(column)
            if name in aliases:
                score = 0.8 if name in ('x', 'y') else 1.0
            else:
                if name in exact_names: continue
                score = max(SequenceMatcher(None, name, alias).ratio() for alias in aliases)
                score = round(score * 0.85, 3) if score >= 0.82 else 0
            if score: choices.append({'column': column, 'confidence': score})
        choices.sort(key=lambda item: (-item['confidence'], columns.index(item['column'])))
        candidates[field] = choices[:4]
        if field in manual:
            if manual[field]: selected[field] = manual[field]; confidence[field] = 1.0
        elif choices:
            best = choices[0]
            if best['confidence'] < 0.9 or (len(choices) > 1 and choices[1]['confidence'] == best['confidence']):
                ambiguous.append(field)
            else:
                selected[field] = best['column']; confidence[field] = best['confidence']
    # One source field must not silently mean two different measures.
    for column in set(selected.values()):
        fields = [field for field in selected if selected[field] == column]
        if len(fields) > 1:
            raise DatasetReadError(f'Column {column!r} is mapped to several fields: {", ".join(fields)}.')
    present = set(selected)
    pair = {'latitude', 'longitude'} <= present
    od = ({'origin', 'destination'} <= present or (pair and {'destination_latitude', 'destination_longitude'} <= present))
    timed = bool(present & {'timestamp', 'date'})
    kind = dataset_type
    if kind == 'auto':
        kind = ('indicator' if {'indicator', 'value'} <= present else 'origin_destination' if od else
                'trajectory' if pair and timed and present & {'trip_id', 'trajectory_id'} else
                'geographic' if pair or 'geometry' in present else 'temporal' if timed else 'tabular')
    requirements = {
        'trajectory': (pair and timed, 'Coordinates and a usable timestamp/date are required.'),
        'geographic': (pair or 'geometry' in present, 'Coordinates or a geometry field are required.'),
        'temporal': (timed, 'A timestamp or date field is required.'),
        'indicator': ({'indicator', 'value'} <= present, 'Indicator and numerical value fields are required.'),
        'origin_destination': (od, 'Named origin/destination fields or both coordinate pairs are required.'),
        'tabular': (True, 'General tabular summaries do not require GPS fields.'),
    }
    analyses = {
        'spatial': {'supported': pair or 'geometry' in present, 'reason': 'Requires valid coordinates or geometry.'},
        'temporal': {'supported': timed, 'reason': 'Requires usable dates/times; no missing dates are fabricated.'},
        'corridors': {'supported': od or (pair and timed and bool(present & {'trip_id', 'trajectory_id'})), 'reason': 'Requires OD fields or identified timestamped trajectories.'},
        'indicators': {'supported': {'indicator', 'value'} <= present, 'reason': 'Requires indicator names and numerical values; units are kept separate.'},
        'overview': {'supported': True, 'reason': 'Record counts, field profiles and import quality.'},
    }
    profiles = []
    for column in columns:
        values = [row.get(column) for row in rows if not missing(row.get(column))]
        numeric = sum(_numeric(value) for value in values)
        dtype = 'numeric' if values and numeric == len(values) else 'categorical' if len({str(v) for v in values}) <= 20 else 'text'
        mapped_as = [field for field, name in selected.items() if name == column]
        if mapped_as and mapped_as[0] in ('timestamp', 'date', 'time'): dtype = 'datetime'
        elif mapped_as and mapped_as[0] in ('latitude','longitude','destination_latitude','destination_longitude'): dtype = 'coordinate'
        elif mapped_as and mapped_as[0].endswith('_id'): dtype = 'identifier'
        elif 'geometry' in mapped_as: dtype = 'geometry'
        profiles.append({'name': column, 'type': dtype, 'sample_non_null': len(values),
                         'sample_nulls': len(rows) - len(values), 'sample_distinct': len({str(v) for v in values})})
    if kind == 'tabular': warnings.append('No specialised schema was detected. Field summaries are available; select mappings to enable other analyses.')
    if ambiguous: warnings.append('Confirm the ambiguous mapping choices before importing; an empty selection explicitly skips a field.')
    valid, reason = requirements[kind]
    return {'columns': profiles, 'mapping': selected, 'confidence': confidence, 'candidates': candidates,
            'ambiguous_fields': ambiguous, 'requires_mapping': bool(ambiguous) or not valid,
            'dataset_type': kind, 'schema_valid': bool(valid), 'schema_message': reason,
            'supported_analyses': analyses, 'warnings': warnings, 'sample_rows': rows[:10]}


def _numeric(value: Any) -> bool:
    try: return math.isfinite(float(value))
    except (TypeError, ValueError): return False
