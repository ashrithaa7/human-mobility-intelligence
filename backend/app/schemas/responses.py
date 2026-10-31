from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime

class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool
    status_code: int
    message: str
    timestamp: datetime
    data: Optional[Any] = None
    
class ErrorResponse(BaseModel):
    """Error response"""
    success: bool = False
    status_code: int
    message: str
    detail: Optional[str] = None
    timestamp: datetime

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    version: str
    database: dict

class AnalyticsMetadata(BaseModel):
    """Metadata for analytics results"""
    analysis_type: str
    timestamp: datetime
    data_mode: str
    record_count: int
    time_range: Optional[dict] = None
    geographic_bounds: Optional[dict] = None
    parameters: Optional[dict] = None
    limitations: List[str] = []