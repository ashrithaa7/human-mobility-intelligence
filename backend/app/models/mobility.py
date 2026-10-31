from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MobilityRecord(BaseModel):
    """Single mobility observation"""
    id: Optional[str] = None
    latitude: float
    longitude: float
    timestamp: datetime
    location_name: Optional[str] = None
    activity_count: Optional[int] = None
    data_source: str = "synthetic"
    
    class Config:
        json_schema_extra = {
            "example": {
                "latitude": 17.3850,
                "longitude": 78.4867,
                "timestamp": "2024-01-15T14:30:00Z",
                "location_name": "Hyderabad Downtown",
                "activity_count": 1250,
                "data_source": "synthetic",
            }
        }

class MobilityDataset(BaseModel):
    """Collection of mobility records"""
    name: str
    description: str
    record_count: int
    date_range: dict
    geographic_bounds: dict
    data_source: str
    is_synthetic: bool