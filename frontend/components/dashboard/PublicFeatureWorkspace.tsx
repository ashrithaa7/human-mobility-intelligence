'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BarChart3, CalendarDays, Clock3, MapPin, Route, ShieldCheck, Sparkles, Layers } from 'lucide-react'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { InteractiveMap } from '@/components/map/InteractiveMap'
import { ActivityChart } from '@/components/charts/ActivityChart'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'
import { supabase } from '@/lib/supabase'

type Feature = 'maps' | 'analysis' | 'insights' | 'travel'
type Location = { name: string; latitude?: number; longitude?: number; record_count: number; country?: string; state?: string; city?: string; province?: string }
type WorkspaceData = { records: Array<Record<string, any>>; metadata?: { source?: string; format?: string; is_synthetic?: boolean; is_sample?: boolean; total_records?: number; filtered_records?: number; loaded_at?: string; bbox?: number[] } }
type Coverage = { locations: Location[]; date_start?: string | null; date_end?: string | null; last_updated?: string | null }
 type RouteChoice = { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }

const content: Record<Feature, { title: string; eyebrow: string; description: string }> = {
  maps: { title: 'Spatial intelligence', eyebrow: 'Explore', description: 'See where recorded activity is concentrated and how it is distributed across supported areas.' },
  analysis: { title: 'Temporal analysis', eyebrow: 'Understand', description: 'Compare the observed hourly and day-of-week patterns for the selected area.' },
  insights: { title: 'Mobility insights', eyebrow: 'Decide', description: 'Turn the available observations into clear, traceable findings for your area.' },
  travel: { title: 'Travel decision support', eyebrow: 'Plan', description: 'Compare road routes between areas in the loaded coverage and review their historical activity context.' },
}
const routes = [
  { id: 'maps', label: 'Map', href: '/dashboard/maps', icon: MapPin },
  { id: 'analysis', label: 'Temporal', href: '/dashboard/analysis', icon: BarChart3 },
  { id: 'insights', label: 'Insights', href: '/dashboard/insights', icon: Sparkles },
  { id: 'travel', label: 'Travel planner', href: '/dashboard/travel', icon: Route },
] as const

function localDate(value?: string | null) { return value ? value.slice(0, 10) : '' }
function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
async function readAnalysisResponse(response: Response, label: string) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${label} returned a non-JSON response (HTTP ${response.status}). Check the frontend API route and mobility backend.`)
  }

  try {
    return await response.json()
  } catch {
    throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`)
  }
}

export function PublicFeatureWorkspace({ feature }: { feature: Feature }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [geography, setGeography] = useState<GeoJSON.FeatureCollection | undefined>(undefined)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [areaSearch, setAreaSearch] = useState('')
  const [mapUpdating, setMapUpdating] = useState(false)
  const [country, setCountry] = useState('all')
  const [state, setState] = useState('all')
  const [city, setCity] = useState('all')
  const [region, setRegion] = useState('all')
  const [compareRegion, setCompareRegion] = useState('')
  const [comparison, setComparison] = useState<any>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [focusHour, setFocusHour] = useState('all')
  const [mapMode, setMapMode] = useState<'heatmap'|'points'>('points')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [temporal, setTemporal] = useState<any>(null)
  const [spatial, setSpatial] = useState<any>(null)
  const [hotspots, setHotspots] = useState<any>(null)
  const [accessibility, setAccessibility] = useState<any>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [routeChoices, setRouteChoices] = useState<RouteChoice[]>([])
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        const [availableResponse, dataResponse, featureResponse] = await Promise.all([fetch('/api/data/available', { cache: 'no-store' }), fetch('/api/data?limit=5000', { cache: 'no-store' }), fetch('/api/data/features', { cache: 'no-store' })])
        const available = await availableResponse.json().catch(() => ({}))
        const loaded = await dataResponse.json().catch(() => ({}))
        if (!availableResponse.ok) throw new Error(available.detail || 'Could not read data coverage.')
        if (!dataResponse.ok) throw new Error(loaded.detail || `Mobility data service returned HTTP ${dataResponse.status}`)
        if (!loaded.data?.metadata?.record_count) throw new Error('The configured source contains no usable records or geometry.')
        const features = await featureResponse.json().catch(() => null)
        if (features?.type === 'FeatureCollection') setGeography(features)
        if (cancelled) return
        setCoverage(available.coverage || { locations: [] })
        setData(loaded.data)
        setStartDate(localDate(available.coverage?.date_start))
        setEndDate(localDate(available.coverage?.date_end))
        setRegion((current) => current || 'all')
        setOrigin((current) => current || available.coverage?.locations?.[0]?.name || '')
        setDestination((current) => current || available.coverage?.locations?.[1]?.name || '')
        setCompareRegion((current) => current || available.coverage?.locations?.[1]?.name || '')
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load mobility coverage.')
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!data?.metadata?.source) return
    const controller = new AbortController()
    const query = new URLSearchParams({ limit: '5000' })
    for (const [field, value] of Object.entries({ country, state, city, region })) if (value !== 'all') query.set(field, value)
    if (data.metadata.format !== 'gtfs_static') {
      if (startDate) query.set('start', startDate)
      if (endDate) { const end = new Date(`${endDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1); query.set('end', end.toISOString().slice(0, 10)) }
      if (focusHour !== 'all') query.set('hour', focusHour)
    }
    setMapUpdating(true)
    fetch(`/api/data?${query}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'The filtered map preview is unavailable.')
      setData(payload.data)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) }).finally(() => { if (!controller.signal.aborted) setMapUpdating(false) })
    return () => controller.abort()
  }, [data?.metadata?.source, data?.metadata?.format, country, state, city, region, startDate, endDate, focusHour])

  const locations = useMemo(() => coverage?.locations || [], [coverage])
  const records = data?.records || []
  const countries = [...new Set(locations.map((location) => location.country).filter(Boolean))] as string[]
  const states = [...new Set(locations.filter((location) => country === 'all' || location.country === country).map((location) => location.state || location.province).filter(Boolean))] as string[]
  const cities = [...new Set(locations.filter((location) => (country === 'all' || location.country === country) && (state === 'all' || (location.state || location.province) === state)).map((location) => location.city).filter(Boolean))] as string[]
  const filteredLocations = locations.filter((location) => (country === 'all' || location.country === country) && (state === 'all' || (location.state || location.province) === state) && (city === 'all' || location.city === city))
  const scopedRecords = useMemo(() => records.filter((record) => {
    const rowLatitude = Number(record.latitude ?? record.origin_latitude ?? record.start_latitude ?? NaN)
    const rowLongitude = Number(record.longitude ?? record.origin_longitude ?? record.start_longitude ?? NaN)
    const area = record.location_name ?? record.area_name ?? record.area ?? record.region ?? record.neighborhood ?? record.district ?? record.city ?? record.state ?? record.country ?? (Number.isFinite(rowLatitude) && Number.isFinite(rowLongitude) ? `Grid ${Math.floor(rowLongitude / 0.05 + 1e-9)},${Math.floor(rowLatitude / 0.05 + 1e-9)}` : null)
    const recordCountry = record.country
    const recordState = record.state ?? record.province
    const recordCity = record.city
    return (country === 'all' || recordCountry === country) &&
      (state === 'all' || recordState === state) &&
      (city === 'all' || recordCity === city) &&
      (region === 'all' || (area != null && String(area).toLocaleLowerCase() === region.toLocaleLowerCase()))
  }), [records, country, state, city, region, startDate, endDate, focusHour, data?.metadata?.format])
  const mapRecords = useMemo(() => scopedRecords.map((record) => ({ ...record, latitude: Number(record.latitude ?? record.origin_latitude ?? record.start_latitude ?? NaN), longitude: Number(record.longitude ?? record.origin_longitude ?? record.start_longitude ?? NaN) })), [scopedRecords])
  const validMapRecords = useMemo(() => mapRecords.filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude)), [mapRecords])
  const allMapRecords = useMemo(() => records.map((record) => ({ ...record, latitude: Number(record.latitude ?? record.origin_latitude ?? record.start_latitude ?? NaN), longitude: Number(record.longitude ?? record.origin_longitude ?? record.start_longitude ?? NaN) })), [records])
  const mapCenter: [number, number] = useMemo<[number, number]>(() => validMapRecords.length
    ? [validMapRecords.reduce((sum, record) => sum + record.longitude, 0) / validMapRecords.length, validMapRecords.reduce((sum, record) => sum + record.latitude, 0) / validMapRecords.length]
    : data?.metadata?.bbox ? [(data.metadata.bbox[0] + data.metadata.bbox[2]) / 2, (data.metadata.bbox[1] + data.metadata.bbox[3]) / 2] : [78.4867, 17.385], [validMapRecords, data?.metadata?.bbox])
  const originLocation = locations.find((item) => item.name === origin)
  const destinationLocation = locations.find((item) => item.name === destination)
  const routeCenter: [number, number] = useMemo<[number, number]>(() => originLocation?.latitude != null && destinationLocation?.latitude != null && originLocation.longitude != null && destinationLocation.longitude != null
    ? [(originLocation.longitude + destinationLocation.longitude) / 2, (originLocation.latitude + destinationLocation.latitude) / 2]
    : mapCenter, [originLocation, destinationLocation, mapCenter])
  const routeCoordinates = routeChoices[0]?.geometry?.coordinates
  const areaRowCount = (name: string) => scopedRecords.filter((record) => String(record.area_name ?? record.location_name ?? record.area ?? record.region ?? record.neighborhood ?? record.district ?? '').toLocaleLowerCase() === name.toLocaleLowerCase()).length

  useEffect(() => {
    if (!data || feature === 'maps' || feature === 'travel') return
    let cancelled = false
    const getAnalysis = async () => {
      setTemporal(null); setSpatial(null); setHotspots(null); setAccessibility(null)
      const exclusiveEnd = endDate ? new Date(`${endDate}T00:00:00Z`) : null
      if (exclusiveEnd) exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      const isSchedule = data.metadata?.format === 'gtfs_static'
      const base = { data_mode: 'historical', dataset: data.metadata?.source, parameters: { region: region === 'all' ? undefined : region, country: country === 'all' ? undefined : country, state: state === 'all' ? undefined : state, city: city === 'all' ? undefined : city, start: isSchedule ? undefined : startDate || undefined, end: isSchedule ? undefined : exclusiveEnd?.toISOString().slice(0,10) } }
      try {
        if (feature === 'analysis') {
          const response = await fetch('/api/analytics/temporal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.detail || result.error || 'Temporal analysis could not be calculated.')
          if (!cancelled) setTemporal(result)
        } else {
          const focused = { ...base, parameters: { ...base.parameters, hour: focusHour === 'all' ? undefined : Number(focusHour) } }
          const selectedLocation=locations.find((item)=>item.name===(region==='all'?locations[0]?.name:region))
          const accessibilityRequest={...base,parameters:{...base.parameters,
            latitude:selectedLocation?.latitude,longitude:selectedLocation?.longitude,radius_meters:500}}
          const [spatialResponse, hotspotResponse, accessibilityResponse] = await Promise.all([
            fetch('/api/analytics/spatial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(focused) }),
            fetch('/api/analytics/hotspots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(focused) }),
            fetch('/api/analytics/accessibility', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(accessibilityRequest) }),
          ])
          const [s, h, a] = await Promise.all([
            readAnalysisResponse(spatialResponse, 'Spatial analysis'),
            readAnalysisResponse(hotspotResponse, 'Hotspot analysis'),
            readAnalysisResponse(accessibilityResponse, 'Accessibility analysis'),
          ])
          if (!spatialResponse.ok || !hotspotResponse.ok || !accessibilityResponse.ok) {
            const failed = !spatialResponse.ok ? s : !hotspotResponse.ok ? h : a
            throw new Error(failed.detail || failed.error || 'Area insights could not be calculated.')
          }
          if (!cancelled) { setSpatial(s.result); setHotspots(h.result); setAccessibility(a.result) }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Analysis failed.') }
    }
    getAnalysis()
    return () => { cancelled = true }
  }, [data, feature, country, state, city, region, startDate, endDate, focusHour, locations])

  const requestRoute = async () => {
    const from = locations.find((item) => item.name === origin)
    const to = locations.find((item) => item.name === destination)
    setRouteError(null); setRouteChoices([])
    if (!from || !to || from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) { setRouteError('Route planning needs coordinates for both selected areas. This source does not provide enough location detail.'); return }
    if (origin === destination) { setRouteError('Choose two different areas to compare a route.'); return }
    setRouteLoading(true)
    try {
      const response = await fetch(`/api/travel/route?from=${from.longitude},${from.latitude}&to=${to.longitude},${to.latitude}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Road routing is currently unavailable.')
      setRouteChoices(result.routes || [])
    } catch (cause) { setRouteError(cause instanceof Error ? cause.message : 'Road routing is currently unavailable.') }
    finally { setRouteLoading(false) }
  }

  const compareAreas = async () => {
    const first=region !== 'all' ? region : locations[0]?.name
    if (!first || !compareRegion || first===compareRegion) return
    setCompareLoading(true); setError(null); setComparison(null)
    const rangeEnd=endDate ? new Date(`${endDate}T00:00:00Z`) : null
    if (rangeEnd) rangeEnd.setUTCDate(rangeEnd.getUTCDate()+1)
    try {
      const response=await fetch('/api/analytics/compare',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({data_mode:'historical',dataset:data?.metadata?.source,
          parameters:{regions:[first,compareRegion],country:country==='all'?undefined:country,
            state:state==='all'?undefined:state,city:city==='all'?undefined:city,
            start:scheduled?undefined:startDate||undefined,end:scheduled?undefined:rangeEnd?.toISOString().slice(0,10)}})})
      const result=await response.json()
      if (!response.ok) throw new Error(result.detail||'Area comparison could not be calculated.')
      setComparison(result.result)
    } catch (cause) { setError(cause instanceof Error?cause.message:'Area comparison failed.') }
    finally { setCompareLoading(false) }
  }

  const hourly = temporal?.hourly_patterns?.hourly || {}
  const daily = temporal?.daily_patterns?.daily || {}
  const peak = temporal?.hourly_patterns?.peak_hour
  const title = content[feature]
  const synthetic = Boolean(data?.metadata?.is_synthetic)
  const scheduled = data?.metadata?.format === 'gtfs_static'

  return <>
    <Header />
    <main className="min-h-screen hmi-page text-gray-100">
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7 lg:px-10 lg:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-purple-400">Mobility intelligence · {title.eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">{scheduled ? (feature === 'maps' ? 'Explore transit stops and the geographic reach of the selected timetable.' : feature === 'analysis' ? 'Compare scheduled service patterns. These counts represent timetable events, not observed trips by passengers.' : title.description) : title.description}</p></div>
          <button onClick={() => window.location.reload()} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-purple-200 hover:bg-white/10">Refresh source</button>
          <Link href="/dashboard" className="rounded-xl hmi-surface px-4 py-2.5 text-sm font-semibold text-gray-300 shadow-sm transition hover:border-purple-400/50 hover:bg-white/10">← Dashboard</Link>
        </div>
        <nav aria-label="Mobility tools" className="mb-6 flex flex-wrap gap-2 rounded-2xl hmi-surface p-2 shadow-sm">{routes.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} aria-current={feature === id ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${feature === id ? 'bg-purple-600 text-white shadow' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}><Icon size={16} />{label}</Link>)}</nav>

        {loading && <div className="rounded-2xl hmi-surface py-14"><LoadingSpinner message="Preparing verified coverage…" /></div>}
        {!loading && error && <div role="alert" className="rounded-2xl border border-red-500/50 bg-red-500/10 p-5 text-red-200"><p className="font-semibold">This workspace couldn’t load.</p><p className="mt-1 text-sm">{error}</p><button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white">Try again</button></div>}

        {!loading && !error && data && <>
          {feature === 'insights' && <div className="mb-6"><DatasetOverview region={region} country={country} state={state} city={city} /></div>}
          {scheduled && <div className="mb-4 rounded-xl border border-blue-500/50 bg-blue-500/10 p-4 text-sm text-blue-200">This GTFS source contains scheduled transit stops and service times, not passenger observations. Spatial density and hotspots describe transit-stop coverage only.</div>}
          {feature === 'insights' && <section className="mb-5 rounded-2xl hmi-surface p-5 shadow-sm"><h2 className="font-semibold text-white">Transit service coverage</h2><p className="mt-1 text-sm text-gray-400">Stop proximity is reported only when the active source includes geocoded GTFS stops.</p>{accessibility?.status === 'success' ? <p className="mt-3 text-sm text-gray-300">{formatNumber(accessibility.nearby_stop_count)} scheduled transit stops are within {accessibility.radius_meters} m of the selected area center. This is proximity coverage, not a population or walk-access measure.</p> : <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-gray-300">{accessibility?.message || 'Checking whether transit-stop data is available…'}</p>}</section>}
          <section className="mb-6 rounded-2xl hmi-surface p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-white">Choose a covered area</h2><p className="mt-1 text-sm text-gray-400">Locations appear here only when they exist in the configured source.{scheduled ? ' These GTFS locations represent scheduled transit stops.' : ''}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-200"><ShieldCheck size={14} /> {locations.length} covered areas</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {countries.length > 0 && <Picker label="Country" value={country} values={['all', ...countries]} format={(value) => value === 'all' ? 'All supported countries' : value} onChange={(value) => { setCountry(value); setState('all'); setCity('all'); setRegion('all') }} />}
              {states.length > 0 && <Picker label="State / province" value={state} values={['all', ...states]} format={(value) => value === 'all' ? 'All supported states' : value} onChange={(value) => { setState(value); setCity('all'); setRegion('all') }} />}
              {cities.length > 0 && <Picker label="City" value={city} values={['all', ...cities]} format={(value) => value === 'all' ? 'All supported cities' : value} onChange={(value) => { setCity(value); setRegion('all') }} />}
              <Picker label="Region / area" value={region} values={['all', ...filteredLocations.map((location) => location.name)]} format={(value) => value === 'all' ? 'All covered areas' : value} onChange={setRegion} />
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> From</span><input type="date" disabled={scheduled} value={startDate} min={localDate(coverage?.date_start)} max={endDate || localDate(coverage?.date_end)} onChange={(event) => setStartDate(event.target.value)} className="hmi-input mt-2 block w-full rounded-xl px-3 py-2.5 text-sm font-medium normal-case text-gray-200 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 disabled:bg-white/5" /></label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> To</span><input type="date" disabled={scheduled} value={endDate} min={startDate || localDate(coverage?.date_start)} max={localDate(coverage?.date_end)} onChange={(event) => setEndDate(event.target.value)} className="hmi-input mt-2 block w-full rounded-xl px-3 py-2.5 text-sm font-medium normal-case text-gray-200 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 disabled:bg-white/5" /></label>
              <Picker disabled={scheduled} label="Hour of day" value={focusHour} values={['all', ...Array.from({ length: 24 }, (_, hour) => String(hour))]} onChange={setFocusHour} format={(value) => value === 'all' ? 'All hours' : `${value.padStart(2, '0')}:00`} />
            </div>
            {scheduled && <p className="mt-3 text-xs text-gray-400">Static GTFS service calendars describe when trips are scheduled, but the system does not expand them into observed dates or monthly passenger totals. Date and hour filters are unavailable for the stop map; use Temporal for timetable patterns.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 pt-4 text-xs text-gray-400"><span>Source: <strong className="font-semibold text-gray-300">{data.metadata?.source || 'Configured mobility source'}</strong></span><span>Coverage: <strong className="font-semibold text-gray-300">{coverage?.date_start ? localDate(coverage.date_start) : 'unknown'} – {coverage?.date_end ? localDate(coverage.date_end) : 'unknown'}</strong></span><span>{formatNumber(data.metadata?.filtered_records ?? scopedRecords.length)} matching records</span><span>Map preview: up to {formatNumber(records.length)} records</span></div>
          </section>
          {feature === 'insights' && locations.length >= 2 && <section className="mb-6 rounded-2xl hmi-surface p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"><div><h2 className="font-semibold text-white">Compare covered areas</h2><p className="mt-1 text-sm text-gray-400">Compare source record counts, peak time and spatial concentration.</p>{region==='all' && <p className="mt-1 text-xs text-gray-400">Primary area: {locations[0]?.name}</p>}</div><Picker label="Compare with" value={compareRegion} values={locations.filter((item)=>item.name!==(region==='all'?locations[0]?.name:region)).map((item)=>item.name)} onChange={setCompareRegion} /><button onClick={compareAreas} disabled={compareLoading||!compareRegion} className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{compareLoading?'Comparing…':'Compare areas'}</button></div>{comparison?.regions?.length>0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{comparison.regions.map((item:any)=><article key={item.region} className="rounded-xl bg-white/5 p-4"><h3 className="font-semibold text-gray-100">{item.region}</h3><p className="mt-2 text-sm text-gray-300">{formatNumber(item.records)} source records · peak {item.peak_hour==null?'unavailable':`${String(item.peak_hour).padStart(2,'0')}:00`}</p><p className="mt-1 text-xs text-gray-400">Basis: {item.data_semantics||'source records'}</p></article>)}</div>}</section>}
          {synthetic && <div className="mb-6 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200"><strong>Demonstration coverage:</strong> this source is synthetic and spans a limited period. Treat patterns and route context as a product demo, not measured travel conditions or planning evidence.</div>}

          {feature === 'maps' && <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.7fr)]">
            <section className="min-w-0 rounded-2xl hmi-surface p-4 shadow-sm sm:p-5" aria-label="Location map">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-white">{scheduled ? 'Transit stops and service coverage' : 'Mapped source locations'}</h2><p className="mt-1 text-sm text-gray-400">{scheduled ? 'Explore scheduled bus stops. Click a cluster to zoom in or a stop to see its name.' : 'Zoom, pan and click a point to explore the selected source.'}</p></div>
                <button onClick={() => setMapMode(mapMode === 'heatmap' ? 'points' : 'heatmap')} aria-pressed={mapMode === 'heatmap'} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10"><Layers size={14} /> {mapMode === 'heatmap' ? 'Show points' : 'Show heatmap'}</button>
              </div>
              <p role="status" className="mb-3 text-xs text-purple-200">{mapUpdating ? 'Updating selected area…' : formatNumber(validMapRecords.length) + ' mapped ' + (scheduled ? 'stops' : 'points') + ' · ' + (region === 'all' ? 'All covered areas' : region)}{(data?.metadata?.filtered_records || 0) > records.length ? ' · Preview limited to 5,000 locations; select an area for detail.' : ''}</p>
              <InteractiveMap records={mapRecords} center={mapCenter} isSynthetic={synthetic} title="" features={region === 'all' && country === 'all' && state === 'all' && city === 'all' ? geography : undefined} showCluster={mapMode === 'points'} showHeatmap={mapMode === 'heatmap'} />
              {scheduled && <p className="mt-3 text-xs leading-5 text-gray-400">Stop concentration shows the distribution of transit infrastructure, not passengers or traffic. Multiple platforms can share a stop name.</p>}
            </section>
            <section className="min-w-0 rounded-2xl hmi-surface p-4 shadow-sm sm:p-5" aria-label="Area coverage">
              <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-white">{scheduled ? 'Stop areas' : 'Area coverage'}</h2><button type="button" onClick={() => setRegion('all')} className="rounded px-2 py-1 text-xs text-purple-200 hover:bg-white/10">Show all</button></div>
              <p className="mt-1 text-sm text-gray-400">{scheduled ? 'Select a name to focus its stops on the map.' : 'Select an area to focus the map. Counts are source rows.'}</p>
              <label className="mt-4 block text-xs text-gray-300" htmlFor="area-search">Search covered areas</label><input id="area-search" type="search" value={areaSearch} onChange={event => setAreaSearch(event.target.value)} placeholder="Search by name…" className="hmi-input mt-2 w-full rounded-lg px-3 py-2 text-sm" />
              <p className="mt-2 text-xs text-gray-400">{filteredLocations.filter(item => item.name.toLocaleLowerCase().includes(areaSearch.trim().toLocaleLowerCase())).length.toLocaleString()} matching areas</p>
              <ol aria-label="Covered areas" tabIndex={0} className="mt-3 h-[clamp(16rem,43vh,27rem)] space-y-2 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable] focus-visible:outline-purple-400">{filteredLocations.filter(item => item.name.toLocaleLowerCase().includes(areaSearch.trim().toLocaleLowerCase())).map(item => <li key={item.name}><button onClick={() => setRegion(item.name)} aria-pressed={region === item.name} className={"flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition " + (region === item.name ? 'bg-purple-500/20 text-purple-100 ring-1 ring-inset ring-purple-400/50' : 'bg-white/5 text-gray-300 hover:bg-white/10')}><span className="min-w-0 break-words font-medium">{item.name}</span><span className="shrink-0 text-xs text-gray-400">{formatNumber(item.record_count)} {scheduled ? (item.record_count === 1 ? 'stop' : 'stops') : (item.record_count === 1 ? 'row' : 'rows')}</span></button></li>)}</ol>
              {!filteredLocations.some(item => item.name.toLocaleLowerCase().includes(areaSearch.trim().toLocaleLowerCase())) && <p role="status" className="mt-2 text-sm text-gray-400">No areas match this search.</p>}
            </section>
          </div>}

          {feature === 'analysis' && <><div className="mb-5 grid gap-4 sm:grid-cols-3"><Metric label={scheduled ? 'Scheduled events' : 'Records in period'} value={formatNumber(temporal?.hourly_patterns?.total_records ?? scopedRecords.length)} /><Metric label={scheduled ? 'Peak scheduled hour' : 'Observed peak hour'} value={peak == null ? '—' : `${String(peak).padStart(2, '0')}:00`} /><Metric label={scheduled ? 'Recurring service weekdays' : 'Days represented'} value={formatNumber(Object.values(daily).reduce((sum: number, value: any) => sum + Number(value), 0))} /></div><div className="grid gap-5 xl:grid-cols-2"><ChartCard title={scheduled ? 'Scheduled stops by hour' : 'Activity by hour'} description={scheduled ? 'Scheduled departures by time of day; not passenger counts.' : 'Hourly distribution within the selected area and date range.'} data={hourly} xLabel="Hour of day" /><ChartCard title={scheduled ? 'Recurring service weekdays' : 'Activity by weekday'} description={scheduled ? 'Weekdays when service is scheduled, not observed travel demand.' : 'Records grouped by the weekday in the source timestamps.'} data={daily} xLabel="Day" />{!scheduled && Object.keys(temporal?.weekly_patterns || {}).length > 0 && <ChartCard title="Weekly source events" description="ISO weeks within the selected source period." data={temporal.weekly_patterns} xLabel="ISO week" />}{!scheduled && Object.keys(temporal?.monthly_patterns || {}).length > 0 && <ChartCard title="Monthly source events" description="Calendar months within the selected source period." data={temporal.monthly_patterns} xLabel="Month" />}</div><p className="mt-4 text-xs text-gray-400">{scheduled ? 'GTFS stop times describe scheduled service. They do not measure passenger boardings or actual travel demand.' : '“Activity” counts source observations unless the dataset provides a validated activity or passenger-count measure.'}</p></>}

          {feature === 'insights' && <div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><section className="rounded-2xl hmi-surface p-5 shadow-sm"><h2 className="font-semibold text-white">Area distribution</h2><p className="mt-1 text-sm text-gray-400">Top spatial cells in {region === 'all' ? 'all covered areas' : region}; based on available coordinates.</p><div className="mt-5 space-y-3">{(spatial?.top_areas || []).slice(0, 6).map((area: any, index: number) => <div key={`${area.coordinates}-${index}`} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-300">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between text-sm"><span className="font-medium text-gray-200">{area.coordinates[1].toFixed(3)}, {area.coordinates[0].toFixed(3)}</span><span className="text-gray-400">{formatNumber(area.activity_count)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600" style={{ width: `${Math.max(8, area.activity_count / Math.max(1, spatial.top_areas[0]?.activity_count) * 100)}%` }} /></div></div></div>)}{!spatial?.top_areas?.length && <p className="rounded-xl bg-white/5 p-4 text-sm text-gray-300">Spatial summaries need valid coordinates and enough observations in this filter.</p>}</div></section><section className="rounded-2xl hmi-surface p-5 shadow-sm"><h2 className="font-semibold text-white">What the data says</h2><div className="mt-4 space-y-3 text-sm leading-6 text-gray-300"><Finding>{spatial?.total_records ? `${formatNumber(spatial.total_records)} source observations fall in the selected area and date range.` : 'No observations match the current filters.'}</Finding><Finding>{spatial?.total_areas ? `The records span ${formatNumber(spatial.total_areas)} spatial grid cells at the analysis resolution.` : 'The source does not currently support a spatial comparison for this selection.'}</Finding><Finding>{hotspots?.hotspot_count ? `${hotspots.hotspot_count} hotspot${hotspots.hotspot_count === 1 ? '' : 's'} were detected by the configured clustering method.` : 'No hotspots were detected. This can mean activity is diffuse or the selected sample is too small.'}</Finding><Finding>These findings describe this source and period; they are not a forecast or a causal explanation.</Finding></div></section></div>}

          {feature === 'travel' && <div className="grid gap-6 xl:grid-cols-[minmax(320px,.75fr)_minmax(0,1.25fr)]"><section className="rounded-2xl hmi-surface p-5 shadow-sm"><div className="mb-5"><h2 className="font-semibold text-white">Plan between covered areas</h2><p className="mt-1 text-sm leading-6 text-gray-400">Choose origin and destination areas with mapped coordinates in this source.</p></div><div className="space-y-4"><Picker label="Starting area" value={origin} values={locations.filter((item) => item.latitude != null && item.longitude != null).map((item) => item.name)} onChange={setOrigin} /><Picker label="Destination" value={destination} values={locations.filter((item) => item.latitude != null && item.longitude != null).map((item) => item.name)} onChange={setDestination} /><button onClick={requestRoute} disabled={routeLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-60">{routeLoading ? 'Finding road routes…' : 'Compare road routes'} <ArrowRight size={16} /></button>{routeError && <p role="alert" className="rounded-xl bg-yellow-500/10 p-3 text-sm leading-5 text-yellow-200">{routeError}</p>}</div><p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-gray-400">Road geometry and distance are provided by OpenStreetMap-based routing. Estimates are not live traffic predictions. Historical activity rows do not reveal congestion on a specific road.</p></section><section className="rounded-2xl hmi-surface p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-white">Route alternatives</h2><p className="mt-1 text-sm text-gray-400">Estimated driving routes for the selected pair.</p></div><Route className="text-purple-400" /></div>{routeChoices.length ? <div className="space-y-3"><div className="overflow-hidden rounded-xl border border-white/10"><InteractiveMap records={allMapRecords} center={routeCenter} routeCoordinates={routeCoordinates} isSynthetic={synthetic} title="" showCluster={false} zoom={12} /></div>{routeChoices.map((choice, index) => <article key={index} className="rounded-xl border border-white/10 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-gray-100">{index === 0 ? 'Recommended route' : `Alternative ${index}`}</p><p className="mt-1 text-sm text-gray-400">{origin} <ArrowRight className="mx-1 inline" size={14} /> {destination}</p></div><span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-300">{(choice.distance / 1000).toFixed(1)} km</span></div><p className="mt-3 text-sm text-gray-300">Estimated drive: <strong>{Math.max(1, Math.round(choice.duration / 60))} min</strong></p></article>)}<p className="rounded-xl bg-purple-500/15 p-3 text-xs leading-5 text-purple-200">Map-preview rows in this filter (up to 5,000): {formatNumber(areaRowCount(origin))} at origin and {formatNumber(areaRowCount(destination))} at destination. This is historical area context only; it does not measure traffic along the route.</p></div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center"><div><Route className="mx-auto text-gray-400" /><p className="mt-3 font-medium text-gray-300">Your route options will appear here</p><p className="mt-1 max-w-sm text-sm leading-5 text-gray-400">Routing requires coordinates for two distinct covered areas and access to the routing service.</p></div></div>}</section></div>}

          <div className="mt-6 flex items-center gap-2 text-xs text-gray-400"><Clock3 size={14} /> Data refresh depends on the source owner. This workspace analyzes the latest file available to the system; it does not imply an hourly feed.</div>
        </>}
      </div>
    </main>
    <Footer />
  </>
}

function Picker({ label, value, values, onChange, disabled = false, format = (item: string) => item }: { label: string; value: string; values: string[]; onChange: (value: string) => void; disabled?: boolean; format?: (value: string) => string }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="hmi-input mt-2 block w-full rounded-xl px-3 py-2.5 text-sm font-medium normal-case text-gray-200 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30" disabled={disabled || !values.length}>{values.map((item) => <option key={item} value={item}>{format(item)}</option>)}</select></label>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl hmi-surface p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p></div> }
function ChartCard({ title, description, data, xLabel }: { title: string; description: string; data: Record<string, number>; xLabel: string }) { return <section className="rounded-2xl hmi-surface p-5 shadow-sm"><h2 className="font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-gray-400">{description}</p>{Object.keys(data).length ? <div className="mt-4"><ActivityChart data={data} title="" xAxisLabel={xLabel} yAxisLabel="Source events / supplied weight" /></div> : <p className="mt-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">This source/filter has no usable dates or times for this chart. Try the insights page for supported spatial, geometry or indicator summaries.</p>}</section> }
function Finding({ children }: { children: React.ReactNode }) { return <p className="rounded-xl bg-white/5 px-4 py-3">{children}</p> }
