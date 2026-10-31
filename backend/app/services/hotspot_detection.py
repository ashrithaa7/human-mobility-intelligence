"""Hotspot detection service"""
import pandas as pd
import numpy as np
from typing import Dict, List
import logging
from collections import deque
import math

logger = logging.getLogger(__name__)

class HotspotDetector:
    """Detect mobility hotspots using spatial clustering"""

    def __init__(self, eps_degrees: float = 0.02, min_samples: int = 5):
        """
        eps_degrees: Distance threshold in decimal degrees (~2km at equator)
        min_samples: Minimum points to form a cluster
        """
        self.eps_degrees = eps_degrees
        self.min_samples = min_samples

    def detect(self, data: Dict) -> Dict:
        """Detect hotspots from location data"""
        records = data.get('records', [])
        if not records:
            return {'status': 'no_data', 'hotspots': [], 'hotspot_count': 0}

        df = pd.DataFrame(records)

        # Find location columns
        lat_col = None
        lng_col = None

        for col in ['latitude', 'origin_latitude', 'destination_latitude']:
            if col in df.columns:
                lat_col = col
                break

        for col in ['longitude', 'origin_longitude', 'destination_longitude']:
            if col in df.columns:
                lng_col = col
                break

        if not lat_col or not lng_col:
            return {
                'status': 'no_location_columns',
                'available_columns': df.columns.tolist(),
                'hotspots': [],
                'hotspot_count': 0,
            }

        try:
            # Simple density-based clustering without sklearn dependency
            # Aggregate to a fixed-size geographic grid before clustering. Runtime is
            # O(points + occupied cells), avoiding the old pairwise O(n^2) scan.
            coordinates = df[[lat_col, lng_col]].apply(pd.to_numeric, errors='coerce').dropna().values
            cells = {}
            for lat, lon in coordinates:
                cell=(math.floor(float(lon)/self.eps_degrees+1e-9),math.floor(float(lat)/self.eps_degrees+1e-9))
                cells[cell]=cells.get(cell,0)+1
            hotspots = self.detect_cells([{'x':x,'y':y,'weight':weight} for (x,y),weight in cells.items()],
                                         cell_size=self.eps_degrees, min_samples=self.min_samples)

            return {
                'status': 'success',
                'hotspot_count': len(hotspots),
                'hotspots': hotspots,
                'total_records': len(records),
            }
        except Exception as e:
            logger.error(f"Error in hotspot detection: {e}")
            return {
                'status': 'error',
                'message': str(e),
                'hotspots': [],
                'hotspot_count': 0,
                'total_records': len(records),
            }

    @staticmethod
    def detect_cells(cells: list[dict], cell_size: float = 0.01, min_samples: int = 5) -> list[dict]:
        """Cluster high-density adjacent grid cells using a bounded 8-neighbour scan."""
        if not cells: return []
        weights={(int(cell['x']),int(cell['y'])):float(cell.get('weight',0)) for cell in cells}
        values=np.fromiter(weights.values(),dtype=float)
        threshold=max(float(min_samples),float(np.quantile(values,.9)))
        hot={key for key,value in weights.items() if value>=threshold}
        clusters=[]
        while hot:
            seed=hot.pop(); queue=deque([seed]); component=[seed]
            while queue:
                x,y=queue.popleft()
                for dx in (-1,0,1):
                    for dy in (-1,0,1):
                        neighbour=(x+dx,y+dy)
                        if neighbour in hot:
                            hot.remove(neighbour); queue.append(neighbour); component.append(neighbour)
            weight=sum(weights[cell] for cell in component)
            if weight < min_samples: continue
            center_x=sum((cell[0]+.5)*cell_size*weights[cell] for cell in component)/weight
            center_y=sum((cell[1]+.5)*cell_size*weights[cell] for cell in component)/weight
            clusters.append({'center':[center_x,center_y],'point_count':int(weight),
                'cell_count':len(component),'radius_degrees':cell_size,'density_threshold':threshold})
        return sorted(clusters,key=lambda item:item['point_count'],reverse=True)
