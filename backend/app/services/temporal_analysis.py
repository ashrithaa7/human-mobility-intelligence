"""Temporal analysis service"""
import pandas as pd
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class TemporalAnalyzer:
    """Analyze temporal patterns in mobility data"""
    
    def hourly_patterns(self, data: Dict) -> Dict:
        """Get hourly distribution of trips/activity"""
        records = data.get('records', [])
        if not records:
            return {'status': 'no_data', 'hourly': {}}
        
        df = pd.DataFrame(records)
        
        # Find timestamp column (might be named differently)
        time_col = None
        for col in ['timestamp', 'start_time', 'departure_time', 'time']:
            if col in df.columns:
                time_col = col
                break
        
        if not time_col:
            return {'status': 'no_timestamp_column', 'available_columns': df.columns.tolist()}
        
        try:
            df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
            df['hour'] = df[time_col].dt.hour
            
            # Count by hour
            hourly = df.groupby('hour').size().to_dict()
            
            return {
                'status': 'success',
                'hourly': hourly,
                'peak_hour': max(hourly, key=hourly.get) if hourly else None,
                'total_records': len(records),
            }
        except Exception as e:
            logger.error(f"Error in hourly_patterns: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def daily_patterns(self, data: Dict) -> Dict:
        """Get day-of-week distribution"""
        records = data.get('records', [])
        if not records:
            return {'status': 'no_data', 'daily': {}}
        
        df = pd.DataFrame(records)
        
        time_col = None
        for col in ['timestamp', 'start_time', 'departure_time', 'time']:
            if col in df.columns:
                time_col = col
                break
        
        if not time_col:
            return {'status': 'no_timestamp_column'}
        
        try:
            df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
            df['day_name'] = df[time_col].dt.day_name()
            
            daily = df.groupby('day_name').size().to_dict()
            
            return {
                'status': 'success',
                'daily': daily,
                'total_records': len(records),
            }
        except Exception as e:
            logger.error(f"Error in daily_patterns: {e}")
            return {'status': 'error', 'message': str(e)}