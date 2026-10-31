'use client'

import { useState, useEffect } from 'react'
import { HotspotMap } from '@/components/map/HotspotMap'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AlertCircle } from 'lucide-react'

export function HotspotAnalysis() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${apiUrl}/api/analytics/hotspots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_mode: 'historical',
          num_records: 500,
        }),
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      console.error('Analysis error:', err)
      setError(`Failed to run hotspot analysis: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runAnalysis()
  }, [])

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-200 font-semibold">Analysis Error</p>
            <p className="text-red-100 text-sm">{error}</p>
          </div>
        </div>
      )}

      <button
        onClick={runAnalysis}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-semibold px-6 py-2 rounded-lg transition"
      >
        {loading ? 'Running...' : 'Run Hotspot Detection'}
      </button>

      {loading && <LoadingSpinner message="Detecting hotspots..." />}

      {result && result.result && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-gray-300 text-sm">
              <strong>Hotspots Found:</strong> {result.result.hotspot_count || 0}
            </p>
            <p className="text-gray-300 text-sm">
              <strong>Records Analyzed:</strong> {result.result.total_records || 0}
            </p>
            {result.data_mode && (
              <p className="text-gray-400 text-xs mt-2">
                <strong>Source:</strong> {result.data_mode === 'historical' ? 'Historical Dataset' : 'Real-Time Data'}
              </p>
            )}
          </div>

          <HotspotMap
            hotspots={result.result.hotspots || []}
            title="Detected Hotspots"
            loading={loading}
          />

          {result.result.hotspots && result.result.hotspots.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-3">Hotspot Details</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.result.hotspots.map((hotspot: any, idx: number) => (
                  <div key={idx} className="bg-white/5 rounded p-3 text-sm text-gray-300">
                    <p>
                      <strong>Hotspot {idx + 1}:</strong> {hotspot.point_count} points clustered
                    </p>
                    <p className="text-xs text-gray-500">
                      Center: {hotspot.center[1].toFixed(4)}°, {hotspot.center[0].toFixed(4)}°
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}