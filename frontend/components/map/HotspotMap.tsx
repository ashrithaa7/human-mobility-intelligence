'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mobilityMapStyle } from '@/lib/map-style'

interface Hotspot {
  center: [number, number]
  point_count: number
  radius_degrees: number
}

interface HotspotMapProps {
  hotspots: Hotspot[]
  title?: string
  loading?: boolean
}

export function HotspotMap({ hotspots = [], title = 'Hotspot Map', loading = false }: HotspotMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapContainer.current || loading) return

    let disposed = false
    let observer: ResizeObserver | undefined
    let frame = 0
    let instance: maplibregl.Map | null = null
    setError(null)
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: mobilityMapStyle(),
        center: [78.4867, 17.3850], // Hyderabad
        zoom: 11,
      })

      instance = map.current
      const currentMap = instance
      observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!disposed) currentMap.resize() }) })
      observer.observe(mapContainer.current)
      currentMap.on('error', event => { if (!disposed) setError(event.error?.message || 'The map style could not load.') })
      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

      map.current.on('load', () => {
        if (disposed || !map.current || map.current !== currentMap) return
        currentMap.resize()

        if (hotspots.length === 0) {
          setError('No hotspots detected in the dataset')
          return
        }

        // Validate hotspots
        const validHotspots = hotspots.filter((h) => {
          if (!Array.isArray(h.center) || h.center.length !== 2) return false
          const [lng, lat] = h.center
          if (typeof lng !== 'number' || typeof lat !== 'number') return false
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
          return true
        })

        if (validHotspots.length === 0) {
          setError('Invalid hotspot coordinates')
          return
        }
        const bounds = new maplibregl.LngLatBounds()
        validHotspots.forEach(hotspot => bounds.extend(hotspot.center))
        currentMap.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })

        // Create circle GeoJSON
        const geojson = {
          type: 'FeatureCollection' as const,
          features: validHotspots.map((hotspot, idx) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: hotspot.center,
            },
            properties: {
              id: idx,
              point_count: hotspot.point_count,
              radius_degrees: hotspot.radius_degrees,
            },
          })),
        }

        // Add source
        map.current.addSource('hotspots', {
          type: 'geojson',
          data: geojson,
        })

        // Add hotspot circles (visual representation of radius)
        map.current.addLayer({
          id: 'hotspot-circles',
          type: 'circle',
          source: 'hotspots',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'point_count'],
              1,
              10,
              100,
              30,
            ],
            'circle-color': '#ef4444',
            'circle-opacity': 0.3,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#dc2626',
          },
        })

        // Add hotspot centers
        map.current.addLayer({
          id: 'hotspot-points',
          type: 'circle',
          source: 'hotspots',
          paint: {
            'circle-radius': 8,
            'circle-color': '#dc2626',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })

        // Add popup
        map.current.on('click', 'hotspot-points', (e) => {
          if (!map.current) return

          const coordinates = (e.features?.[0]?.geometry as any)?.coordinates?.slice() || []
          const properties = e.features?.[0]?.properties || {}

          new maplibregl.Popup()
            .setLngLat(coordinates)
            .setHTML(
              `
              <div class="p-3 text-sm">
                <p class="font-semibold text-gray-900">Hotspot ${(properties.id || 0) + 1}</p>
                <p class="text-gray-600">Points in cluster: ${properties.point_count}</p>
                <p class="text-xs text-gray-500 mt-1">Radius: ${(properties.radius_degrees * 111).toFixed(1)} km</p>
              </div>
            `
            )
            .addTo(map.current)
        })
      })

      return () => {
        disposed = true
        observer?.disconnect()
        cancelAnimationFrame(frame)
        instance?.remove()
        if (map.current === instance) map.current = null
      }
    } catch (err) {
      console.error('Hotspot map error:', err)
      setError('Failed to initialize map')
      observer?.disconnect()
      instance?.remove()
      map.current = null
    }
  }, [hotspots, loading])

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="text-white font-semibold">{title}</h3>}

      <div data-map-frame className="relative isolate h-[clamp(18rem,50vh,32rem)] w-full min-w-0 overflow-hidden rounded-lg border border-white/10">
        <div ref={mapContainer} className="relative h-full w-full" />
        {loading && <div role="status" className="absolute inset-0 grid place-items-center bg-slate-900/80 text-gray-300">Loading hotspots…</div>}
        {error && <div role="status" className="absolute bottom-3 left-3 right-3 rounded-lg bg-slate-900/95 p-3 text-sm text-yellow-200">{error}</div>}
      </div>
      <p className="text-xs text-gray-400">Red circles: clusters of source points; radius approximates the analysis grid, not passenger demand.</p>
    </div>
  )
}
