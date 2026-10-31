'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function ReportsPanel() {
  const [reports, setReports] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = async (method: string, id?: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sign in before managing reports.')
    const response = await fetch(`/api/analytics/reports${id ? `?report_id=${encodeURIComponent(id)}` : ''}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ data_mode: 'historical' }) } : {}) })
    const payload = await response.json()
    if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The report request failed.')
    return payload
  }
  const refresh = async () => setReports((await request('GET')).reports || [])
  useEffect(() => { refresh().catch(cause => setError(cause.message)) }, [])
  const mutate = async (method: string, id?: string) => {
    setBusy(true); setError('')
    try { await request(method, id); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Report operation failed.') } finally { setBusy(false) }
  }
  const download = (report: any) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `mobility-report-${report.id}.json`; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="hmi-surface space-y-5 p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Computed reports and recommendations</h2><p className="mt-2 text-sm text-gray-400">Generate a saved snapshot of the configured source, quality, spatial/temporal results, corridors, recommendations and limitations.</p></div><button disabled={busy} onClick={() => mutate('POST')} className="rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50">{busy ? 'Computing…' : 'Generate report'}</button></div>
    {error && <p role="alert" className="rounded-lg bg-yellow-500/10 p-3 text-yellow-200">{error}</p>}
    {!reports.length && !error && <p className="text-sm text-gray-400">No saved reports for the active source. Generate a report to calculate its supported analyses.</p>}
    {reports.map(report => <article key={report.id} className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-white">{report.title}</h3><p className="mt-1 text-xs text-gray-400">{report.date} · {report.dataset}</p></div><div className="flex gap-3 text-sm"><button className="text-purple-200" onClick={() => download(report)}>Export JSON</button><button className="text-red-300 disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm('Delete this saved report?')) mutate('DELETE', report.id) }}>Delete</button></div></div><div className="mt-4 space-y-3">{report.recommendations?.recommendations?.map((finding: any, index: number) => <div key={index} className="rounded-lg bg-black/15 p-3 text-sm"><p className="text-gray-200">{finding.finding}</p><p className="mt-1 text-gray-400">{finding.action}</p><p className="mt-1 text-xs text-purple-300">Basis: {finding.basis}</p></div>)}</div><details className="mt-4 text-xs text-gray-400"><summary className="cursor-pointer">Methodology, computed results and limitations</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(report, null, 2)}</pre></details></article>)}
  </section>
}
