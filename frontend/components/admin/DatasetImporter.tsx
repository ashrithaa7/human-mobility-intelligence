'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Preview = {
  format: string; dataset_type: string; columns?: { name: string; type: string; sample_nulls: number }[]
  mapping?: Record<string, string>; confidence?: Record<string, number>
  candidates?: Record<string, { column: string; confidence: number }[]>
  ambiguous_fields?: string[]; sample_rows?: Record<string, unknown>[]; warnings?: string[]
  supported_analyses?: Record<string, { supported: boolean; reason: string }>
  recognised_files?: string[]; archive_files?: (Preview & { file: string })[]; requires_table_selection?: boolean
}
type Profile = { name: string; mapping: Record<string, string>; dataset_type: string; date_format?: string }
const fields = ['latitude', 'longitude', 'destination_latitude', 'destination_longitude', 'timestamp', 'date', 'time', 'timezone', 'trip_id', 'trajectory_id', 'route_id', 'event_count', 'area_name', 'country', 'state', 'city', 'indicator', 'value', 'year', 'unit', 'origin', 'destination', 'geometry']

export function DatasetImporter({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [archiveMember, setArchiveMember] = useState('')
  const [datasetType, setDatasetType] = useState('auto')
  const [dateFormat, setDateFormat] = useState('')
  const [timezone, setTimezone] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [license, setLicense] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState('')
  const [report, setReport] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/data/mapping-profiles').then(r => r.json()).then(data => setProfiles(data.profiles || [])).catch(() => {}) }, [])

  const submit = async (operation: 'preview' | 'import') => {
    if (!file) return
    setBusy(true); setError(''); setReport(null); setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sign in again before configuring a source.')
      const query = new URLSearchParams({ filename: file.name, operation, dataset_type: datasetType })
      if (archiveMember) query.set('archive_member', archiveMember)
      for (const [key, value] of Object.entries({ timezone, date_format: dateFormat, source_url: sourceUrl, license, profile_name: operation === 'import' ? profileName : '' })) if (value) query.set(key, value)
      // Explicit empty choices record the administrator's decision to skip a field.
      if (preview?.columns) query.set('column_mapping', JSON.stringify(mapping))
      const response = await fetch(`/api/data/import?${query}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      const payload = await response.json()
      if (!response.ok) {
        setReport(payload.detail?.report || null)
        throw new Error(typeof payload.detail === 'string' ? payload.detail : payload.detail?.message || 'This dataset could not be processed.')
      }
      if (operation === 'preview') {
        setPreview(payload.preview)
        setMapping({ ...Object.fromEntries(fields.map(field => [field, ''])), ...(payload.preview.mapping || {}) })
      } else {
        setReport(payload.dataset.import_report)
        setMessage(`Imported ${payload.dataset.record_count.toLocaleString()} records/features from ${payload.dataset.filename}. ${payload.dataset.rejected_count} rejected; ${payload.dataset.duplicate_count} duplicates.`)
        await onImported()
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.') }
    finally { setBusy(false) }
  }

  return <section className="hmi-surface space-y-5 p-5 sm:p-6">
    <div><h2 className="text-lg font-semibold">Preview and import a dataset</h2><p className="mt-1 text-sm leading-6 text-gray-400">CSV, TSV, delimited TXT, XLSX/XLS, JSON, JSON Lines, GeoJSON, supported ZIPs, GTFS static ZIP and GeoLife PLT/ZIP. Select one data sheet for Excel. General tables do not require GPS fields. Upload limit: 1 GB; Excel/JSON documents: 256 MB.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-green-500/10 p-4 text-green-200">{message}</p>}
    <label className="block text-sm text-gray-300">Dataset file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.ndjson,.geojson,.zip,.plt" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setMapping({}); setReport(null); setArchiveMember('') }} className="hmi-input mt-2 block w-full rounded-lg p-3 file:mr-3 file:rounded file:border-0 file:bg-purple-600 file:px-3 file:py-2 file:text-white" /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-gray-300">Dataset type<select value={datasetType} onChange={e => setDatasetType(e.target.value)} className="hmi-input mt-2 block w-full rounded-lg p-3">{['auto', 'trajectory', 'geographic', 'temporal', 'indicator', 'origin_destination', 'tabular'].map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select></label>
      <label className="text-sm text-gray-300">Timezone (optional)<input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Kolkata" className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>
      <label className="text-sm text-gray-300">Date format (for ambiguous dates)<input value={dateFormat} onChange={e => setDateFormat(e.target.value)} placeholder="%d/%m/%Y %H:%M:%S" className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>
      <label className="text-sm text-gray-300">Source URL (optional)<input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>
      <label className="text-sm text-gray-300">License (optional)<input value={license} onChange={e => setLicense(e.target.value)} className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>
    </div>
    <button onClick={() => submit('preview')} disabled={!file || busy} className="rounded-lg border border-purple-400/50 bg-purple-500/10 px-5 py-3 font-semibold text-purple-200 disabled:opacity-50">{busy ? 'Reading dataset…' : 'Preview columns and validation'}</button>
    {preview && <div className="space-y-5 border-t border-white/10 pt-5">
      <p className="text-sm text-purple-200">Detected {preview.format} · {preview.dataset_type.replace(/_/g, ' ')}</p>
      {preview.warnings?.map(warning => <p key={warning} className="rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-200">{warning}</p>)}
      {preview.recognised_files && <p className="break-words text-sm text-gray-300">GTFS tables: {preview.recognised_files.join(', ')}</p>}
      {preview.archive_files && <p className="break-words text-sm text-gray-300">Archive tables: {preview.archive_files.map(item => item.file).join(', ')}</p>}
      {!!preview.archive_files?.length && <label className="block text-sm text-gray-300">Table inside ZIP{preview.requires_table_selection && <span className="ml-2 text-yellow-200">Different schemas detected: choose a table.</span>}<select aria-label="Table inside ZIP" value={archiveMember} onChange={event => { const selected = preview.archive_files?.find(item => item.file === event.target.value); setArchiveMember(event.target.value); if (selected) { setPreview({ ...selected, format: 'tabular_zip', archive_files: preview.archive_files, requires_table_selection: preview.requires_table_selection }); setMapping({ ...Object.fromEntries(fields.map(field => [field, ''])), ...selected.mapping }) } }} className="hmi-input mt-2 block w-full rounded-lg p-3"><option value="" disabled={preview.requires_table_selection}>{preview.requires_table_selection ? 'Choose one table' : 'Combine compatible tables'}</option>{preview.archive_files.map(item => <option key={item.file} value={item.file}>{item.file}</option>)}</select></label>}
      {!!preview.columns?.length && <>
        <label className="block text-sm text-gray-300">Reusable mapping<select defaultValue="" onChange={event => { const profile = profiles.find(item => item.name === event.target.value); if (profile) { setMapping({ ...Object.fromEntries(fields.map(field => [field, ''])), ...profile.mapping }); setDatasetType(profile.dataset_type); setDateFormat(profile.date_format || '') } }} className="hmi-input mt-2 block w-full rounded-lg p-3"><option value="">Choose a saved profile</option>{profiles.map(profile => <option key={profile.name}>{profile.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field => <label key={field} className="text-xs text-gray-300">{field.replace(/_/g, ' ')}{preview.ambiguous_fields?.includes(field) && <span className="ml-1 text-yellow-300">— confirm choice</span>}<select aria-label={`Map ${field}`} value={mapping[field] || ''} onChange={e => setMapping(current => ({ ...current, [field]: e.target.value }))} className="hmi-input mt-1.5 block w-full rounded-lg p-2.5"><option value="">Not provided / skip</option>{preview.columns!.map(column => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}</select>{preview.confidence?.[field] != null && <span className="mt-1 block text-gray-400">Detected confidence: {Math.round(preview.confidence[field] * 100)}%</span>}{!preview.mapping?.[field] && preview.candidates?.[field]?.[0] && <span className="mt-1 block text-gray-400">Suggestion: {preview.candidates[field][0].column} ({Math.round(preview.candidates[field][0].confidence * 100)}%)</span>}</label>)}</div>
        <div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-left text-xs"><thead><tr>{preview.columns.map(column => <th key={column.name} className="whitespace-nowrap p-3 text-purple-200">{column.name}<span className="block font-normal text-gray-400">{column.type} · {column.sample_nulls} sampled nulls</span></th>)}</tr></thead><tbody>{preview.sample_rows?.map((row, index) => <tr key={index} className="border-t border-white/10">{preview.columns!.map(column => <td key={column.name} className="max-w-60 truncate p-3 text-gray-300">{row[column.name] == null ? '—' : typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name])}</td>)}</tr>)}</tbody></table></div>
        <label className="block text-sm text-gray-300">Save mapping as (optional)<input value={profileName} onChange={e => setProfileName(e.target.value)} maxLength={100} className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>
      </>}
      {preview.supported_analyses && <ul className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(preview.supported_analyses).map(([analysis, capability]) => <li key={analysis} className="rounded-lg bg-white/5 p-3"><strong className={capability.supported ? 'text-green-300' : 'text-yellow-200'}>{analysis}: {capability.supported ? 'mapped' : 'needs fields'}</strong><p className="mt-1 text-xs text-gray-400">{capability.reason}</p></li>)}</ul>}
      <p className="text-xs text-gray-400">Confirm mappings, then import. Validation checks the entire file; preview suitability is based on sampled values. Missing dates and coordinates are never invented.</p>
      <button onClick={() => submit('import')} disabled={busy || (preview.requires_table_selection && !archiveMember)} className="rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50">{busy ? 'Importing…' : 'Confirm mapping and configure source'}</button>
    </div>}
    {report != null && <details open className="rounded-lg bg-black/20 p-4 text-sm"><summary className="cursor-pointer font-semibold text-purple-200">Import / validation report</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">{JSON.stringify(report, null, 2)}</pre><button className="mt-3 text-purple-300" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'import-report.json'; link.click(); URL.revokeObjectURL(url) }}>Export report JSON</button></details>}
  </section>
}
