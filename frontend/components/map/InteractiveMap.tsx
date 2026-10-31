'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryPositions, mobilityMapStyle } from '@/lib/map-style'

interface MapRecord {
  latitude: number
  longitude: number
  id?: string
  [key: string]: any
}

const DEFAULT_CENTER: [number, number] = [78.4867, 17.385]

interface InteractiveMapProps {
  records: MapRecord[]
  isSynthetic?: boolean
  title?: string
  showCluster?: boolean
  showHeatmap?: boolean
  center?: [number, number]
  zoom?: number
  maxZoom?: number
  routeCoordinates?: [number, number][]
  features?: GeoJSON.FeatureCollection
}

export function InteractiveMap({
  records,
  isSynthetic = false,
  title = 'Mobility Map',
  showCluster = true,
  showHeatmap = false,
  center = DEFAULT_CENTER, // Hyderabad
  zoom = 11,
  maxZoom = 18,
  routeCoordinates,
  features,
}: InteractiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fitView = useRef<() => void>(() => {})
  const previousView = useRef<{ records: MapRecord[]; features?: GeoJSON.FeatureCollection; center: [number, number]; zoom: number } | null>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    let disposed = false
    let observer: ResizeObserver | undefined
    let frame = 0
    let instance: maplibregl.Map | null = null
    const clusterLabels = new Map<number, maplibregl.Marker>()
    setLoading(true)
    setError(null)
    if (!records.some(record => Number.isFinite(record.latitude) && Number.isFinite(record.longitude) && Math.abs(record.latitude) <= 90 && Math.abs(record.longitude) <= 180) && !features?.features.length) {
      setError('This selection has no usable point coordinates or geometry. Open Data Insights for the analyses this source supports.')
      setLoading(false)
      return
    }
    try {
      // Initialize map
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: mobilityMapStyle(),
        center: center as [number, number],
        zoom: zoom,
        maxZoom: maxZoom,
      })

      instance = map.current
      const currentMap = instance
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => { if (!disposed) currentMap.resize() })
      })
      observer.observe(mapContainer.current)
      currentMap.on('error', () => { if (!disposed) { setError('Some map tiles could not load. Your data remains available; check your connection or retry the map.'); setLoading(false) } })
      currentMap.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

      // Add controls
      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

      // Add data source and layer when map loads
      map.current.on('load', () => {
        if (disposed || !map.current || map.current !== currentMap) return
        currentMap.resize()

        // Validate and prepare records
        const validRecords = records.filter((r) => {
          if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) {
            console.warn('Invalid coordinates:', r)
            return false
          }
          if (r.latitude < -90 || r.latitude > 90 || r.longitude < -180 || r.longitude > 180) {
            console.warn('Out of bounds coordinates:', r)
            return false
          }
          return true
        })

        const positions = routeCoordinates?.length ? routeCoordinates : [
          ...validRecords.map(record => [record.longitude, record.latitude]),
          ...(features?.features.flatMap(feature => feature.geometry ? geometryPositions(feature.geometry) : []) || []),
        ]
        const bounds = new maplibregl.LngLatBounds()
        positions.forEach(([lng, lat]) => bounds.extend([lng, lat]))
        fitView.current = () => { if (!bounds.isEmpty() && !disposed) currentMap.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 }) }
        const previous = previousView.current
        if (previous?.records === records && previous.features === features) currentMap.jumpTo({ center: previous.center, zoom: previous.zoom })
        else fitView.current()

        if (validRecords.length === 0 && !features?.features.length) {
          setError('No valid point coordinates or geographic features are available for this selection.')
          setLoading(false)
          return
        }

        // Create GeoJSON
        const geojson = {
          type: 'FeatureCollection' as const,
          features: validRecords.map((record) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [record.longitude, record.latitude],
            },
            properties: {
              id: record.id || `point-${Math.random()}`,
              isSynthetic: isSynthetic,
              ...record,
            },
          })),
        }

        // Add source
        map.current.addSource('points', {
          type: 'geojson',
          data: geojson,
          cluster: showCluster && !showHeatmap,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        })

        if (showHeatmap) {
          map.current.addLayer({
            id: 'mobility-heatmap', type: 'heatmap', source: 'points',
            paint: {
              'heatmap-weight': 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 12, 0.8],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 12, 16],
              'heatmap-opacity': 0.55,
              'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(49,54,149,0)', 0.2, '#2c7bb6', 0.4, '#00a6ca', 0.6, '#ffff8c', 0.8, '#fdae61', 1, '#d7191c'],
            },
          })
        }

        if (features?.features.length) {
          currentMap.addSource('source-geography', { type: 'geojson', data: features })
          currentMap.addLayer({ id: 'source-polygons', type: 'fill', source: 'source-geography', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#9333ea', 'fill-opacity': 0.22 } })
          currentMap.addLayer({ id: 'source-lines', type: 'line', source: 'source-geography', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#c084fc', 'line-width': 3 } })
          currentMap.addLayer({ id: 'source-points', type: 'circle', source: 'source-geography', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#c084fc', 'circle-radius': 5 } })
          currentMap.on('click', 'source-lines', event => {
            if (!event.features?.[0]) return
            const label = String(event.features[0].properties?.name || event.features[0].properties?.shape_id || event.features[0].id || 'Source geometry')
            const content = document.createElement('div'); content.className = 'p-2 text-sm text-gray-900'; content.textContent = label
            new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(currentMap)
          })
        }

        // Add cluster layer
        if (showCluster && !showHeatmap) {
          map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'points',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': ['step', ['get', 'point_count'], '#8b5cf6', 5, '#7c3aed', 10, '#6d28d9'],
              'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 25],
              'circle-opacity': 0.8,
            },
          })

          // DOM labels use the application's font. A failed external glyph request must
          // never prevent the shared point/cluster source tiles from rendering.
          const updateLabels = () => {
            if (disposed || !currentMap.isSourceLoaded('points')) return
            const visible = new Set<number>()
            for (const feature of currentMap.querySourceFeatures('points')) {
              const props = feature.properties
              if (!props?.cluster || feature.geometry.type !== 'Point') continue
              const coordinates = feature.geometry.coordinates as [number, number]
              if (!currentMap.getBounds().contains(coordinates)) continue
              const id = Number(props.cluster_id)
              visible.add(id)
              if (!clusterLabels.has(id)) {
                const label = document.createElement('span')
                label.textContent = String(props.point_count_abbreviated || props.point_count)
                label.className = 'pointer-events-none text-xs font-bold text-white'
                label.setAttribute('aria-hidden', 'true')
                clusterLabels.set(id, new maplibregl.Marker({ element: label }).setLngLat(coordinates).addTo(currentMap))
              }
            }
            for (const [id, marker] of clusterLabels) if (!visible.has(id)) { marker.remove(); clusterLabels.delete(id) }
          }
          currentMap.on('idle', updateLabels)
          currentMap.on('moveend', updateLabels)
        }

        // Add unclustered points
        if (!showHeatmap) map.current.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'points',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': isSynthetic ? '#fbbf24' : '#8b5cf6',
            'circle-radius': 6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })

        if (routeCoordinates && routeCoordinates.length > 1) {
          map.current.addSource('planned-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: routeCoordinates },
            },
          })
          map.current.addLayer({
            id: 'planned-route-line',
            type: 'line',
            source: 'planned-route',
            paint: { 'line-color': '#4f46e5', 'line-width': 5, 'line-opacity': 0.9 },
          })
        }

        // Add popup on click
        if (!showHeatmap) map.current.on('click', 'unclustered-point', (e) => {
          if (!map.current) return

          const coordinates = (e.features?.[0]?.geometry as any)?.coordinates?.slice() || []
          const properties = e.features?.[0]?.properties || {}

          const content = document.createElement('div')
          content.className = 'p-2 text-sm text-gray-900'
          const name = properties.location_name || properties.stop_name || properties.name || properties.area_name || properties.id || 'Mapped location'
          content.textContent = `${name} · ${Number(coordinates[1]).toFixed(5)}, ${Number(coordinates[0]).toFixed(5)}${properties.event_count != null ? ` · ${Number(properties.event_count).toLocaleString()} scheduled stop-time events` : ''}${isSynthetic ? ' · Synthetic demonstration' : ''}`
          new maplibregl.Popup().setLngLat(coordinates).setDOMContent(content)
            .addTo(map.current)
        })

        // Zoom to cluster on click
        if (showCluster && !showHeatmap) {
          map.current.on('click', 'clusters', (e) => {
            if (!map.current) return

            const clusterId = (e.features?.[0]?.properties as any)?.cluster_id
            ;(map.current.getSource('points') as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId).then(clusterZoom => {
              if (disposed || !map.current) return
              currentMap.easeTo({ center: (e.features?.[0]?.geometry as any)?.coordinates, zoom: clusterZoom })
            }).catch(() => {})
          })
        }

        setLoading(false)
      })

      return () => {
        if (instance) previousView.current = { records, features, center: instance.getCenter().toArray(), zoom: instance.getZoom() }
        disposed = true
        observer?.disconnect()
        cancelAnimationFrame(frame)
        clusterLabels.forEach(marker => marker.remove())
        instance?.remove()
        if (map.current === instance) map.current = null
      }
    } catch (err) {
      console.error('Map initialization error:', err)
      setError('Failed to initialize map')
      setLoading(false)
      observer?.disconnect()
      instance?.remove()
      map.current = null
    }
  }, [records, isSynthetic, showCluster, showHeatmap, center[0], center[1], zoom, maxZoom, routeCoordinates, features])

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="text-white font-semibold">{title}</h3>}

      {isSynthetic && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-200 text-xs">
          Displaying synthetic demonstration data
        </div>
      )}

      <div data-map-frame className="relative isolate h-[clamp(18rem,50vh,32rem)] w-full min-w-0 overflow-hidden rounded-lg border border-white/10">
        {/* Stable classes preserve MapLibre's class and containing block. */}
        <div ref={mapContainer} className="relative h-full w-full" />
        <button type="button" onClick={() => fitView.current()} className="absolute left-3 top-3 rounded-lg border border-white/20 bg-slate-900/95 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-purple-800">Fit to data</button>
        {loading && <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-900/80 text-gray-300">Loading map…</div>}
        {error && <div role="status" className="absolute bottom-3 left-3 right-3 rounded-lg bg-slate-900/95 p-3 text-sm text-yellow-200">{error}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">{showHeatmap ? <><span>Lower density</span><span className="h-2 w-28 rounded-full bg-gradient-to-r from-cyan-500 via-yellow-200 to-red-600" /><span>Higher density</span><span>· Each mapped point has equal weight.</span></> : <><span className="h-2.5 w-2.5 rounded-full bg-purple-400" /><span>Purple: locations. Numbered circles group nearby points; click to expand.</span></>}{features?.features.length ? <span>Lines and boundaries: source geometry, not live journeys.</span> : null}</div>
    </div>
  )
}
