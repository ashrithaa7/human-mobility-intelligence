'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function DatasetOverview({ region, start, end, country, state, city }: { region?: string; start?: string; end?: string; country?: string; state?: string; city?: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    const query = new URLSearchParams()
    if (region && region !== 'all') query.set('region', region)
    if (start) query.set('start', start)
    if (end) query.set('end', end)
    for (const [field, value] of Object.entries({ country, state, city })) if (value && value !== 'all') query.set(field, value)
    fetch(`/api/data/overview?${query}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const payload = await response.json()
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Dataset overview is unavailable.')
      setData(payload)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [region, start, end, country, state, city])
  if (error) return <div role="alert" className="hmi-surface p-5 text-yellow-200">{error}</div>
  if (!data) return <LoadingSpinner message="Computing dataset coverage and quality…" />
  const scheduled = data.source.format === 'gtfs_static'
  const totals = data.totals || {}
  const measures: [string, unknown][] = scheduled
    ? [['Scheduled stops', totals.stops], ['Routes', totals.routes], ['Scheduled trips', totals.trips], ['Stop-time events', totals.scheduled_stop_events]]
    : [['Valid records', totals.records], ['Geocoded records', totals.geocoded_records], ['Dated records', totals.dated_records], ['Geometry features', totals.geographic_features]]
  return <section aria-label="Dataset overview" className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{measures.map(([label, value]) => <div key={label} className="hmi-surface p-5"><p className="text-sm text-purple-300">{label}</p><p className="mt-2 text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : 'Unavailable'}</p></div>)}</div>
    <div className="hmi-surface space-y-3 p-5 sm:p-6"><h2 className="text-xl font-semibold text-white">Source coverage and quality</h2>
      <p className="break-words text-sm text-gray-300">{data.source.label || data.source.filename} · {data.source.format} · {data.source.is_synthetic ? 'Synthetic demonstration source' : 'Historical source data'}</p>
      <p className="text-sm text-gray-400">Time span: {data.source.date_start || 'not supplied'} – {data.source.date_end || 'not supplied'}. Extent (west, south, east, north): {data.source.bbox ? data.source.bbox.map((v: number) => v.toFixed(4)).join(', ') : 'no valid geometry'}.</p>
      <p className="text-sm text-gray-400">Quality: {data.quality.accepted.toLocaleString()} accepted · {data.quality.rejected.toLocaleString()} rejected · {data.quality.duplicates.toLocaleString()} duplicate rows. Source updated: {data.source.updated_at || 'not supplied'}.</p>
      {data.frequency?.window_count > 0 && <p className="text-sm text-purple-200">{data.frequency.window_count} scheduled frequency windows; headways {data.frequency.minimum_headway_seconds}–{data.frequency.maximum_headway_seconds} seconds. Windows are not passenger counts.</p>}
      <p className="text-xs leading-5 text-gray-400">Method: {data.methodology}</p>
      {scheduled && <p className="rounded-lg border border-purple-400/20 bg-purple-500/10 p-3 text-sm leading-6 text-purple-100">Suitable for transit-stop coverage, scheduled service patterns and stop proximity. To assess real travel demand, add observed passenger counts or properly licensed movement observations. Import success alone does not establish accuracy.</p>}
      {data.limitations?.map((item: string) => <p key={item} className="rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-200">{item}</p>)}
      <div className="grid gap-2 sm:grid-cols-2">{Object.entries(data.capabilities || {}).map(([name, value]: [string, any]) => <p key={name} className="rounded-lg bg-white/5 p-3 text-xs text-gray-300"><strong className={value.supported ? 'text-green-300' : 'text-yellow-200'}>{name}: {value.supported ? 'supported' : 'unavailable'}</strong><span className="mt-1 block">{value.reason}</span></p>)}</div>
    </div>
    {data.indicators?.length > 0 && <div className="hmi-surface overflow-x-auto p-5"><h2 className="mb-3 text-xl font-semibold">Urban infrastructure indicators</h2><table className="w-full text-left text-sm"><thead><tr>{['Indicator', 'Area', 'Year', 'Unit', 'Records', 'Min', 'Mean', 'Max'].map(label => <th key={label} className="p-2 text-purple-200">{label}</th>)}</tr></thead><tbody>{data.indicators.map((item: any, index: number) => <tr key={index} className="border-t border-white/10">{[item.indicator, item.area, item.year ?? 'unspecified', item.unit, item.records, item.minimum, item.mean, item.maximum].map((value, col) => <td key={col} className="whitespace-nowrap p-2 text-gray-300">{typeof value === 'number' ? Number(value.toFixed(3)).toLocaleString() : value}</td>)}</tr>)}</tbody></table><p className="mt-3 text-xs text-gray-400">Up to 200 groups. Compare the same indicator/unit/year; these summaries do not establish causes or passenger demand.</p></div>}
    {data.fields?.length > 0 && <details className="hmi-surface p-5 text-sm text-gray-300"><summary className="cursor-pointer font-semibold text-purple-200">Field quality and diversity</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.fields.map((field: any) => <p key={field.name}>{field.name} ({field.type}): {field.non_null} non-null, {field.distinct} distinct{field.sample_inferred_numeric_min != null && <span className="block text-xs text-gray-400">Source numeric range: {field.sample_inferred_numeric_min}?{field.sample_inferred_numeric_max}; mean {Number(field.sample_inferred_numeric_mean.toFixed(3))}. Interpret units from the source.</span>}</p>)}</div></details>}
  </section>
}
