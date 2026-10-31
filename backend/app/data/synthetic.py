"""Synthetic data generation for development and testing"""
import random
import logging
from datetime import datetime, timedelta
from typing import List, Dict
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# Hyderabad geographic bounds
HYDERABAD_BOUNDS = {
    "min_lat": 17.2403,
    "max_lat": 17.5290,
    "min_lng": 78.3569,
    "max_lng": 78.6955,
}

# Key locations in Hyderabad (synthetic for Phase 1)
HYDERABAD_LOCATIONS = [
    {
        "name": "Downtown Business District",
        "lat": 17.3850,
        "lng": 78.4867,
        "expected_activity": 1500,
    },
    {
        "name": "Tech Park Zone",
        "lat": 17.4436,
        "lng": 78.4399,
        "expected_activity": 2200,
    },
    {
        "name": "Residential Area North",
        "lat": 17.3630,
        "lng": 78.5142,
        "expected_activity": 900,
    },
    {
        "name": "Commercial Hub South",
        "lat": 17.3467,
        "lng": 78.5050,
        "expected_activity": 1100,
    },
    {
        "name": "Educational District",
        "lat": 17.4469,
        "lng": 78.5718,
        "expected_activity": 800,
    },
]

def generate_synthetic_records(
    num_records: int = 500,
    days_back: int = 30,
    include_metadata: bool = True,
) -> Dict:
    """
    Generate realistic synthetic mobility records for Hyderabad.
    
    All records are explicitly marked as synthetic.
    """
    logger.info(f"Generating {num_records} synthetic mobility records")
    
    records = []
    now = datetime.utcnow()
    
    for i in range(num_records):
        # Select a random location cluster
        location = random.choice(HYDERABAD_LOCATIONS)
        
        # Add small random variation to create realistic distribution
        lat = location["lat"] + random.gauss(0, 0.01)
        lng = location["lng"] + random.gauss(0, 0.01)
        
        # Ensure within bounds
        lat = max(HYDERABAD_BOUNDS["min_lat"], 
                 min(HYDERABAD_BOUNDS["max_lat"], lat))
        lng = max(HYDERABAD_BOUNDS["min_lng"], 
                 min(HYDERABAD_BOUNDS["max_lng"], lng))
        
        # Generate timestamp
        days_offset = random.randint(0, days_back)
        hours_offset = random.randint(0, 23)
        timestamp = now - timedelta(days=days_offset, hours=hours_offset)
        
        # Activity count varies by location and time
        base_activity = location["expected_activity"]
        hour = timestamp.hour
        
        # Higher activity during business hours (8-18)
        if 8 <= hour <= 18:
            activity_multiplier = random.uniform(0.8, 1.2)
        else:
            activity_multiplier = random.uniform(0.2, 0.6)
        
        activity_count = int(base_activity * activity_multiplier * random.uniform(0.8, 1.2))
        
        records.append({
            "id": f"synthetic_{i:06d}",
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "timestamp": timestamp.isoformat() + "Z",
            "location_name": location["name"],
            "activity_count": activity_count,
            "data_source": "synthetic",
            "is_synthetic": True,
        })
    
    # Sort by timestamp
    records = sorted(records, key=lambda x: x["timestamp"])
    
    result = {
        "records": records,
        "metadata": {
            "total_records": len(records),
            "is_synthetic": True,
            "generation_timestamp": datetime.utcnow().isoformat() + "Z",
            "data_source": "synthetic",
            "description": "Synthetic Hyderabad mobility data for development and testing",
            "warning": "This data is artificially generated for demonstration purposes only. It does not represent real human observations.",
            "geographic_bounds": HYDERABAD_BOUNDS,
            "locations": HYDERABAD_LOCATIONS,
            "date_range": {
                "earliest": min(r["timestamp"] for r in records),
                "latest": max(r["timestamp"] for r in records),
            },
        } if include_metadata else None,
    }
    
    logger.info(f"Generated {len(records)} synthetic records")
    return result

def get_synthetic_dataset_summary() -> Dict:
    """Get summary of available synthetic dataset"""
    return {
        "name": "Synthetic Hyderabad Mobility Data",
        "description": "Artificial mobility observations for Phase 1 development and testing",
        "is_synthetic": True,
        "record_count": "Variable (generated on demand)",
        "geographic_coverage": "Hyderabad, Telangana, India (simulated)",
        "temporal_coverage": "Past 30 days (simulated)",
        "data_sources": ["Synthetic generation"],
        "update_frequency": "On-demand generation",
        "warning": "This is synthetic data. Do not use for real-world analysis.",
    }