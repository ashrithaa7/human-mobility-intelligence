import type { StyleSpecification } from 'maplibre-gl'

/** The old demonstration style has country outlines but no local streets. */
export function mobilityMapStyle(): string | StyleSpecification {
  const configured = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  if (configured && configured !== 'https://demotiles.maplibre.org/style.json') return configured
  return {
    version: 8,
    sources: {
      streets: {
        type: 'raster',
        tiles: [process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      },
    },
    layers: [{ id: 'streets', type: 'raster', source: 'streets', paint: { 'raster-saturation': -0.65 } }],
  }
}

export function geometryPositions(geometry: GeoJSON.Geometry): number[][] {
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(geometryPositions)
  const collect = (coordinates: any): number[][] => typeof coordinates?.[0] === 'number'
    ? [coordinates] : Array.isArray(coordinates) ? coordinates.flatMap(collect) : []
  return collect(geometry.coordinates).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90)
}
