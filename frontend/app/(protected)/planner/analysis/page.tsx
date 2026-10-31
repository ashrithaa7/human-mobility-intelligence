'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { readProfile, canPlan } from '@/lib/access'
import { AlertCircle, Download, BarChart3 } from 'lucide-react'
import { CorridorResult, AccessibilityResult } from '@/components/analysis/ResultDetails'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'

type DataMode = 'historical' | 'realtime'
type AnalysisTab = 'hotspots' | 'temporal' | 'spatial' | 'corridors' | 'accessibility'

interface AnalysisResponse {
  analysis_type?: string
  data_mode?: string
  hourly_patterns?: Record<string, any>
  result?: Record<string, any>
  [key: string]: any
}

export default function PlannerAnalysisPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-950 p-5 sm:p-8"><LoadingSpinner message="Loading planner analysis…" /></div>}><PlannerAnalysis /></Suspense>
}

function PlannerAnalysis() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<AnalysisTab>(
    (['hotspots', 'temporal', 'spatial', 'corridors', 'accessibility'].includes(
      searchParams.get('tab') || ''
    )
      ? searchParams.get('tab')
      : 'hotspots') as AnalysisTab
  )

  const [dataMode, setDataMode] = useState<DataMode>(
    searchParams.get('mode') === 'realtime' ? 'realtime' : 'historical'
  )

  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radius, setRadius] = useState('500')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!currentUser) {
          router.push('/login')
          return
        }

        const userData = await readProfile(currentUser.id)

        if (!canPlan(userData?.role)) {
          router.push('/request-access')
          return
        }

        setLoading(false)
      } catch (err) {
        console.error('Auth error:', err)
        setError('Authorization failed')
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const runAnalysis = async (type: string) => {
    setAnalysisLoading(true)
    setAnalysisResult(null)
    setError(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${apiUrl}/api/analytics/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_mode: dataMode,
          num_records: 500,
          parameters: type === 'accessibility' ? { latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined, radius_meters: Number(radius) } : {},
        }),
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const data = await response.json()
      setAnalysisResult(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      setError(`Failed to run ${type} analysis: ${message}`)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const exportResults = () => {
    if (!analysisResult) return

    const dataStr = JSON.stringify(analysisResult, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analysis_${activeTab}_${new Date().toISOString()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner message="Loading analysis workspace..." />
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-12">
            <p className="hmi-eyebrow mb-3">Evidence-led mobility intelligence</p>
            <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">Analysis Workspace</h1>
            <p className="text-gray-400">
              {dataMode === 'historical' ? 'Historical Dataset Analysis' : 'Real-Time Analysis'} — Select an analysis type to explore mobility patterns
            </p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-200">{error}</p>
            </div>
          )}

          <div className="mb-8 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
            <p className="text-blue-200 text-sm">
              <strong>Data Source:</strong> {dataMode === 'historical' ? 'Historical configured datasets' : 'Real-time data sources'}
            </p>
          </div>

          <details className="mb-8"><summary className="cursor-pointer text-purple-300">Dataset coverage, quality and suitable analyses</summary><div className="mt-4"><DatasetOverview /></div></details>

          <div className="flex gap-4 mb-8 flex-wrap">
            {(['hotspots', 'temporal', 'spatial', 'corridors', 'accessibility'] as AnalysisTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setAnalysisResult(null)
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition capitalize ${
                  activeTab === tab
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {tab === 'hotspots' && '🔥 hotspots'}
                {tab === 'temporal' && '📅 temporal'}
                {tab === 'spatial' && '🗺️ spatial'}
                {tab === 'corridors' && '🛣️ corridors'}
                {tab === 'accessibility' && '♿ accessibility'}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-5 sm:p-8">
            {/* Controls Panel */}
            <div className="hmi-surface p-5 sm:p-8">
              <h2 className="text-2xl font-bold text-white mb-6">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Analysis
              </h2>

              <div className="space-y-4">
                {activeTab === 'accessibility' && <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-gray-300">Latitude<input type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} className="hmi-input mt-2 w-full rounded-lg p-2" /></label><label className="text-sm text-gray-300">Longitude<input type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} className="hmi-input mt-2 w-full rounded-lg p-2" /></label><label className="text-sm text-gray-300">Radius (m)<input type="number" min="100" max="5000" value={radius} onChange={e => setRadius(e.target.value)} className="hmi-input mt-2 w-full rounded-lg p-2" /></label></div>}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Data Source</label>
                  <select 
                    value={dataMode}
                    onChange={(e) => setDataMode(e.target.value as DataMode)}
                    className="hmi-input w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="historical">Historical Dataset</option>
                    <option value="realtime" disabled>Real-Time (Coming Soon)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Analysis Parameters</label>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-gray-400 text-sm">
                      {activeTab === 'hotspots' && 'Detects spatial clusters and concentration points using density-based clustering.'}
                      {activeTab === 'temporal' && 'Analyzes activity patterns by hour of day and day of week.'}
                      {activeTab === 'spatial' && 'Examines geographic distribution across grid cells.'}
                      {activeTab === 'corridors' && 'Identifies significant movement routes and connections.'}
                      {activeTab === 'accessibility' && 'Measures transportation accessibility and coverage.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => runAnalysis(activeTab)}
                  disabled={analysisLoading || dataMode === 'realtime'}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {analysisLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Running Analysis...
                    </>
                  ) : dataMode === 'realtime' ? (
                    <>
                      <AlertCircle size={18} />
                      Real-Time Not Yet Available
                    </>
                  ) : (
                    <>
                      <BarChart3 size={18} />
                      Run Analysis
                    </>
                  )}
                </button>

                {analysisResult && (
                  <button
                    onClick={exportResults}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Export Results
                  </button>
                )}
              </div>

              <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                <p className="text-blue-200 text-sm">
                  <strong>Note:</strong> {dataMode === 'historical' ? 'Analyzing configured historical datasets. Results are based on actual data.' : 'Real-time features coming soon.'}
                </p>
              </div>
            </div>

            {/* Results Panel */}
            <div className="hmi-surface p-5 sm:p-8">
              <h3 className="text-xl font-bold text-white mb-6">Results</h3>

              {analysisLoading ? (
                <LoadingSpinner message={`Running ${activeTab} analysis...`} />
              ) : analysisResult ? (
                <div className="space-y-6">
                  <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
                    <p className="text-green-200 text-sm font-semibold">✓ Analysis completed successfully</p>
                  </div>

                  {activeTab === 'temporal' && analysisResult.hourly_patterns && (
                    <TemporalResultsDisplay result={analysisResult.hourly_patterns} />
                  )}

                  {activeTab === 'spatial' && analysisResult.result && (
                    <SpatialResultsDisplay result={analysisResult.result} />
                  )}

                  {activeTab === 'hotspots' && analysisResult.result && (
                    <HotspotResultsDisplay result={analysisResult.result} />
                  )}

                  {activeTab === 'corridors' && analysisResult.result && (
                    <CorridorResult result={analysisResult.result} />
                  )}

                  {activeTab === 'accessibility' && analysisResult.result && (
                    <AccessibilityResult result={analysisResult.result} />
                  )}

                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <h4 className="text-white font-semibold mb-3 text-sm">Analysis Metadata</h4>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p><strong>Type:</strong> {analysisResult.analysis_type}</p>
                      <p><strong>Data Mode:</strong> {analysisResult.data_mode}</p>
                      <p><strong>Timestamp:</strong> {new Date().toLocaleString()}</p>
                      {analysisResult.result?.total_records && (
                        <p><strong>Records Analyzed:</strong> {(analysisResult.result.total_records as number).toLocaleString()}</p>
                      )}
                    </div>
                  </div>

                  <details className="cursor-pointer">
                    <summary className="text-gray-400 text-sm font-semibold hover:text-gray-300">
                      View Raw JSON
                    </summary>
                    <pre className="mt-3 text-gray-300 text-xs bg-black/20 p-4 rounded overflow-auto max-h-48">
                      {JSON.stringify(analysisResult, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-600 mb-4" />
                  <p className="text-gray-400">Select an analysis type and click "Run Analysis" to see results</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

// Result Display Components

function TemporalResultsDisplay({ result }: any) {
  const hourlyData = result.hourly || {}
  const dailyData = result.daily || {}

  return (
    <div className="space-y-6">
      <p className="text-sm text-purple-200">{result.data_semantics === 'scheduled_service' ? 'Scheduled service events; not passenger journeys.' : 'Source events grouped by their recorded local dates/times.'}</p>
      {!Object.keys(hourlyData).length && <p className="rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-200">No time-of-day observations are available. Date-only sources can still support weekday/week/month summaries.</p>}
      {result.message && <p className="text-sm text-yellow-200">{result.message}</p>}
      {result.daily_status && <p className="text-xs text-gray-400">{result.daily_status}</p>}
      {Object.keys(hourlyData).length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-3">Hourly Patterns (24-hour cycle)</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(hourlyData)
              .sort((a, b) => (a[0] as any) - (b[0] as any))
              .map(([hour, count]: [string, any]) => (
                <div key={hour} className="flex items-center gap-3">
                  <span className="w-12 text-right text-gray-400 text-sm">{String(hour).padStart(2, '0')}:00</span>
                  <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-pink-600 h-full"
                      style={{
  width: `${
    (count /
      Math.max(1, ...(Object.values(hourlyData) as number[]))) *
    100
  }%`,
}}
                    />
                  </div>
                  <span className="w-12 text-right text-gray-300 text-sm font-semibold">{count}</span>
                </div>
              ))}
          </div>
          {result.peak_hour !== null && (
            <p className="text-purple-300 text-sm mt-3">
              <strong>Peak Hour:</strong> {String(result.peak_hour).padStart(2, '0')}:00
            </p>
          )}
        </div>
      )}

      {Object.keys(dailyData).length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-3">Daily Patterns (Day of Week)</h4>
          <div className="space-y-2">
            {Object.entries(dailyData).map(([day, count]: [string, any]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-16 text-gray-400 text-sm">{day}</span>
                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 h-full"
                     style={{
  width: `${
    (count /
      Math.max(1, ...(Object.values(dailyData) as number[]))) *
    100
  }%`,
}}
                  />
                </div>
                <span className="w-12 text-right text-gray-300 text-sm font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SpatialResultsDisplay({ result }: any) {
  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        {result.message && <p className="mb-3 text-sm text-yellow-200">{result.message}</p>}
        {result.feature_count != null && <p className="mb-2 text-purple-200">Geometry features: {result.feature_count}</p>}
        <p className="text-gray-300 text-sm mb-2">
          <strong>Total Grid Cells:</strong> {result.total_areas || 0}
        </p>
        <p className="text-gray-300 text-sm">
          <strong>Records Analyzed:</strong> {result.total_records || 0}
        </p>
      </div>

      {result.top_areas && result.top_areas.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-3">Top 10 High-Activity Areas</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {result.top_areas.map((area: any, idx: number) => (
              <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-white font-semibold">Area {idx + 1}</span>
                  <span className="text-purple-300 font-bold">{area.activity_count} records</span>
                </div>
                <p className="text-gray-400 text-xs">
                  Coordinates: {area.coordinates[1].toFixed(4)}°, {area.coordinates[0].toFixed(4)}°
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HotspotResultsDisplay({ result }: any) {
  return (
    <div className="space-y-4">
      {result.message && <p className="text-sm text-yellow-200">{result.message}</p>}
      <p className="text-xs text-gray-400">Basis: {result.data_semantics}</p>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-gray-300 text-sm">
          <strong>Hotspots Detected:</strong> {result.hotspot_count || 0}
        </p>
        <p className="text-gray-400 text-xs mt-2">
          Grid size: {result.hotspots?.[0]?.radius_degrees ?? 'unavailable'} degrees; adjacent high-weight cells are grouped, using angular cells rather than equal-area density.
        </p>
      </div>

      {result.hotspots && result.hotspots.length > 0 && (
        <div>
          <h4 className="text-white font-semibold mb-3">Detected Hotspots</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {result.hotspots.map((hotspot: any, idx: number) => (
              <div key={idx} className="bg-white/5 rounded-lg p-3 text-sm text-gray-300">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-white font-semibold">Hotspot {idx + 1}</span>
                  <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-xs font-semibold">
                    {hotspot.point_count} points
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Center: {hotspot.center[1].toFixed(4)}°, {hotspot.center[0].toFixed(4)}°
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
