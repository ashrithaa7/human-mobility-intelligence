import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const parsePoint = (value: string | null) => {
    if (!value) return null
    const parts = value.split(',').map(Number)
    if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null
    const [longitude, latitude] = parts
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
    return `${longitude},${latitude}`
  }

  const from = parsePoint(request.nextUrl.searchParams.get('from'))
  const to = parsePoint(request.nextUrl.searchParams.get('to'))
  if (!from || !to) return NextResponse.json({ detail: 'Provide valid coordinates for both covered areas.' }, { status: 400 })

  try {
    const routingBase = (process.env.MOBILITY_ROUTING_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '')
    const response = await fetch(`${routingBase}/route/v1/driving/${from};${to}?alternatives=2&overview=full&geometries=geojson&steps=false`, {
      next: { revalidate: 30 },
      headers: { 'User-Agent': 'HumanMobilityIntelligence/1.0' },
      signal: AbortSignal.timeout(12000),
    })
    const payload = await response.json()
    if (!response.ok || payload.code !== 'Ok') return NextResponse.json({ detail: 'The road routing service could not find a route for these areas.' }, { status: 502 })
    return NextResponse.json({ routes: (payload.routes || []).map((route: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }) => ({ distance: route.distance, duration: route.duration, geometry: route.geometry })), provider: 'OSRM routing provider', attribution: 'OpenStreetMap contributors; OSRM route estimates', live_traffic: false })
  } catch (error) {
    console.error('Route planning service error:', error)
    return NextResponse.json({ detail: 'Road routing is currently unavailable. Please try again later.' }, { status: 503 })
  }
}
