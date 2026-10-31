"""Spatial analysis service"""
import pandas as pd
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class SpatialAnalyzer:
    """Analyze spatial distribution of mobility"""

    def area_summary(self, data: Dict) -> Dict:
        """Get geographic area summaries"""
        records = data.get('records', [])
        if not records:
            return {'status': 'no_data', 'areas': {}, 'total_areas': 0, 'top_areas': []}

        df = pd.DataFrame(records)

        # Find location columns
        lat_col = None
        lng_col = None

        for col in ['latitude', 'origin_latitude', 'start_latitude']:
            if col in df.columns:
                lat_col = col
                break

        for col in ['longitude', 'origin_longitude', 'start_longitude']:
            if col in df.columns:
                lng_col = col
                break

        if not lat_col or not lng_col:
            return {
                'status': 'no_location_columns',
                'available_columns': df.columns.tolist(),
                'total_areas': 0,
                'top_areas': [],
            }

        try:
            # Create grid cells (rough geographic aggregation)
            df['lat_grid'] = (df[lat_col] * 10).astype(int) / 10  # 0.1° grid
            df['lng_grid'] = (df[lng_col] * 10).astype(int) / 10

            # Count by grid cell
            grid_counts = df.groupby(['lat_grid', 'lng_grid']).size().to_dict()

            # Top areas
            sorted_areas = sorted(grid_counts.items(), key=lambda x: x[1], reverse=True)
            top_areas = [
                {
                    'coordinates': [area[0][1], area[0][0]],  # [lng, lat] for GeoJSON
                    'activity_count': area[1],
                }
                for area in sorted_areas[:10]
            ]

            return {
                'status': 'success',
                'total_areas': len(grid_counts),
                'top_areas': top_areas,
                'total_records': len(records),
            }
        except Exception as e:
            logger.error(f"Error in area_summary: {e}")
            return {
                'status': 'error',
                'message': str(e),
                'total_areas': 0,
                'top_areas': [],
                'total_records': len(records),
            }