"""Data validation and preprocessing"""
import pandas as pd
import numpy as np
import logging
from typing import Dict, Tuple, List
from datetime import datetime

logger = logging.getLogger(__name__)

class DataValidator:
    """Validate and clean mobility data"""
    
    REQUIRED_COLUMNS = ["latitude", "longitude", "timestamp"]
    
    @staticmethod
    def validate_coordinates(lat: float, lng: float) -> Tuple[bool, str]:
        """Validate geographic coordinates"""
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            return False, "Coordinates must be numeric"
        
        if lat < -90 or lat > 90:
            return False, f"Latitude {lat} out of range [-90, 90]"
        
        if lng < -180 or lng > 180:
            return False, f"Longitude {lng} out of range [-180, 180]"
        
        return True, "Valid"
    
    @staticmethod
    def validate_timestamp(timestamp_str: str) -> Tuple[bool, str]:
        """Validate timestamp format"""
        try:
            datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            return True, "Valid"
        except:
            return False, f"Invalid timestamp format: {timestamp_str}"
    
    @staticmethod
    def validate_dataset(data: Dict) -> Dict:
        """Validate entire dataset and return quality report"""
        records = data.get("records", [])
        
        if not records:
            return {
                "is_valid": False,
                "record_count": 0,
                "error_count": 0,
                "error_messages": ["No records provided"],
            }
        
        errors = []
        valid_records = 0
        invalid_records = 0
        
        for i, record in enumerate(records):
            # Check required fields
            for col in DataValidator.REQUIRED_COLUMNS:
                if col not in record:
                    errors.append(f"Record {i}: Missing '{col}'")
                    invalid_records += 1
                    continue
            
            # Validate coordinates
            if "latitude" in record and "longitude" in record:
                valid, msg = DataValidator.validate_coordinates(
                    record["latitude"],
                    record["longitude"]
                )
                if not valid:
                    errors.append(f"Record {i}: {msg}")
                    invalid_records += 1
                    continue
            
            # Validate timestamp
            if "timestamp" in record:
                valid, msg = DataValidator.validate_timestamp(record["timestamp"])
                if not valid:
                    errors.append(f"Record {i}: {msg}")
                    invalid_records += 1
                    continue
            
            valid_records += 1
        
        return {
            "is_valid": invalid_records == 0,
            "total_records": len(records),
            "valid_records": valid_records,
            "invalid_records": invalid_records,
            "error_count": len(errors),
            "errors": errors[:10],  # Return first 10 errors
            "warnings": [],
        }

def preprocess_mobility_data(data: Dict) -> pd.DataFrame:
    """Convert validated data to DataFrame for analysis"""
    records = data.get("records", [])
    
    if not records:
        return pd.DataFrame()
    
    df = pd.DataFrame(records)
    
    # Ensure correct data types
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    
    # Add useful temporal features
    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    df["date"] = df["timestamp"].dt.date
    
    logger.info(f"Preprocessed {len(df)} records")
    
    return df