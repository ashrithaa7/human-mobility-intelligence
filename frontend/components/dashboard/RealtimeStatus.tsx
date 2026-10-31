'use client'

import { useEffect, useState } from 'react'
import { InteractiveMap } from '@/components/map/InteractiveMap'

export function RealtimeStatus() {
  const [feeds, setFeeds] = useState<any[]>([])
  const [feed, setFeed] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/realtime/feeds', { cache: 'no-store' }).then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.detail || 'Feed status unavailable.'); setFeeds(payload.feeds || []) }).catch(cause => setError(cause.message)) }, [])
  const readFeed = async (id: string) => {
    setBusy(true); setError(''); setFeed(null)
    try { const response = await fetch(`/api/realtime/feeds/${encodeURIComponent(id)}`, { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.detail || 'Feed unavailable.'); setFeed(payload) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Feed unavailable.') } finally { setBusy(false) }
  }
  const hyderabad = feeds.filter(item => String(item.city || '').toLowerCase() === 'hyderabad' && item.configured)
  const vehicles = (feed?.entities || []).filter((item: any) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
  return <section className="hmi-surface space-y-4 p-5 sm:p-8"><h2 className="text-xl font-semibold">Hyderabad live / near-real-time integration</h2>
    <p className="text-sm text-gray-400">Historical files remain separate from provider operations feeds. Feed configuration must explicitly declare Hyderabad coverage.</p>
    {error && <p role="alert" className="text-yellow-200">{error}</p>}
    {!hyderabad.length && <p className="rounded-lg bg-yellow-500/10 p-4 text-sm text-yellow-200">No configured feed declares Hyderabad coverage. Live analysis is unavailable; historical files are not presented as current conditions.</p>}
    {hyderabad.map(item => <button key={item.id} disabled={busy} onClick={() => readFeed(item.id)} className="mr-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Reading provider…' : `Read ${item.name}`}</button>)}
    {feed && <div className="space-y-3 text-sm text-gray-300"><p>Status: {feed.status} · {feed.entity_count ?? 0} entities · {feed.cached ? 'cached provider response' : 'provider response'}</p>{feed.message && <p className="text-yellow-200">{feed.message}</p>}<p className="text-xs text-gray-400">Provider timestamp: {feed.header_timestamp ? new Date(feed.header_timestamp * 1000).toISOString() : feed.last_updated || 'not supplied'}. Freshness depends on the provider; vehicle positions and service alerts are not passenger demand.</p>{vehicles.length > 0 && <InteractiveMap records={vehicles} title="Provider vehicle positions" showCluster={false} />}<details><summary className="cursor-pointer text-purple-200">Provider entities and attribution</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(feed, null, 2)}</pre></details></div>}
  </section>
}
