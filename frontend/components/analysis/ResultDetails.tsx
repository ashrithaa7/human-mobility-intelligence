'use client'

export function CorridorResult({ result }: { result: any }) {
  const corridors = result.top_corridors || []
  const point = (value: unknown) => Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite) ? `${value[1].toFixed(4)}°, ${value[0].toFixed(4)}°` : 'Coordinates not provided'
  return <div className="space-y-4 text-sm">
    <p className="text-purple-200">{result.data_semantics?.replace(/_/g, ' ') || 'Source corridor analysis'} · {corridors.length} displayed corridors</p>
    {result.message && <p className="rounded-lg bg-yellow-500/10 p-4 text-yellow-200">{result.message}</p>}
    {!corridors.length && <p className="text-gray-300">No defensible route or corridor can be derived from this source. Use identified timestamped trajectories, origin/destination fields, route geometry or related GTFS tables.</p>}
    {corridors.map((corridor: any, index: number) => <article key={index} className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="font-semibold text-white">{corridor.name || corridor.route_id || `Corridor ${index + 1}`}</p>
      {(corridor.from_stop || corridor.origin_name || corridor.origin) && <p className="mt-2 text-gray-300">From: {corridor.from_stop || corridor.origin_name || point(corridor.origin)}</p>}
      {(corridor.to_stop || corridor.destination_name || corridor.destination) && <p className="mt-1 text-gray-300">To: {corridor.to_stop || corridor.destination_name || point(corridor.destination)}</p>}
      {corridor.trip_count != null && <p className="mt-2 text-purple-200">{corridor.trip_count.toLocaleString()} {result.unit || 'source records / supplied volume'}</p>}
      {corridor.distance_m != null && <p className="mt-2 text-gray-300">Geometry length: {(corridor.distance_m / 1000).toFixed(2)} km</p>}
    </article>)}
  </div>
}

export function AccessibilityResult({ result }: { result: any }) {
  return <div className="space-y-4 text-sm text-gray-300">
    {result.message && <p className="rounded-lg bg-yellow-500/10 p-4 text-yellow-200">{result.message}</p>}
    {result.stop_count != null && <p>{result.stop_count.toLocaleString()} geocoded scheduled transit stops are available.</p>}
    {result.nearby_stop_count != null && <p className="text-lg font-semibold text-purple-200">{result.nearby_stop_count} stops within {result.radius_meters} m</p>}
    {result.metric && <p className="text-xs text-gray-400">Method: {result.metric}</p>}
    {result.stops?.map((stop: any) => <p key={stop.stop_id} className="rounded-lg bg-white/5 p-3">{stop.stop_name || stop.stop_id} · {stop.distance_meters} m straight-line distance</p>)}
  </div>
}
