'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, RefreshCw } from 'lucide-react'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'

import { DatasetImporter } from '@/components/admin/DatasetImporter'

type SourceStatus = { success?: boolean; sources?: { filename: string; label?: string }[]; source?: { filename: string; label: string; is_synthetic: boolean; is_sample: boolean; record_count: number }; coverage?: { locations?: Array<{ name: string }>; date_start?: string; date_end?: string }; message?: string }

export default function AdminDataPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SourceStatus | null>(null)
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)

  const activate = async (filename: string) => {
    setActivating(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sign in again to select a source.')
      const response = await fetch(`/api/data/import?${new URLSearchParams({ operation: 'activate', filename })}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'Could not activate this source.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not select this source.') }
    finally { setActivating(false) }
  }

  const refresh = async () => {
    const response = await fetch('/api/data/available', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.detail || 'Could not read source coverage.')
    setStatus(result)
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
        const response = await fetch('/api/data/available', { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || 'Could not read source coverage.')
        if (!cancelled) setStatus(result)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load data-source status.')
      } finally { if (!cancelled) setLoading(false) }
    }
    init()
    return () => { cancelled = true }
  }, [router])

  return <><Header /><main className="hmi-page min-h-screen px-4 py-10 text-slate-100 sm:px-8"><div className="mx-auto max-w-5xl">
    <div className="mb-8 flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-950/30"><Database /></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-purple-400">Platform operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Data sources</h1></div></div>
    {loading ? <div className="rounded-2xl hmi-surface p-10"><LoadingSpinner message="Checking administrator access…" /></div> : <>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
      <section className="mb-6 rounded-2xl hmi-surface p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Configured source</h2><p className="mt-1 text-sm text-gray-400">Users see supported places and coverage, never a file chooser.</p></div><button onClick={() => refresh().catch((cause) => setError(cause.message))} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10"><RefreshCw size={15} /> Refresh</button></div>
        {status?.source ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["File", status.source.label], ["Records", status.source.record_count.toLocaleString()], ["Available areas", status.coverage?.locations?.length ?? 0], ["Classification", status.source.is_synthetic ? 'Synthetic / demo' : 'Source data']].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-2 break-words text-sm font-semibold text-gray-100">{value}</p></div>)}</div> : <p className="mt-5 rounded-xl bg-yellow-500/10 p-4 text-sm text-yellow-200">{status?.message || 'No source is configured yet.'}</p>}
        {status?.coverage?.date_start && <p className="mt-4 text-sm text-gray-300">Coverage dates: {new Date(status.coverage.date_start).toLocaleDateString()} – {new Date(status.coverage.date_end || status.coverage.date_start).toLocaleDateString()}</p>}
      </section>
      {!!status?.sources?.length && <label className="hmi-surface mb-6 block p-5 text-sm text-gray-300">Active historical source<select aria-label="Active historical source" disabled={activating} value={status.source?.filename || ''} onChange={event => activate(event.target.value)} className="hmi-input mt-2 block w-full rounded-lg p-3"><option value="" disabled>Select a ready source</option>{status.sources.map(source => <option key={source.filename} value={source.filename}>{source.label || source.filename}</option>)}</select><span className="mt-2 block text-xs text-gray-400">Other workspaces can use Refresh source to reload the configured dataset.</span></label>}
      <DatasetImporter onImported={refresh} />

    </>}
  </div></main><Footer /></>
}
