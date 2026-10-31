'use client'

import { useState, useEffect } from 'react'
import { CorridorChart } from '@/components/charts/CorridorChart'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CorridorResult } from '@/components/analysis/ResultDetails'
import { AlertCircle } from 'lucide-react'

export function CorridorAnalysis() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${apiUrl}/api/analytics/corridors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_mode: 'historical',
        }),
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      console.error('Analysis error:', err)
      setError(`Failed to run corridor analysis: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runAnalysis()
  }, [])

  const isUnavailable =
    result?.result?.status === 'not_available' || result?.result?.message?.includes('requires')

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      <button
        onClick={runAnalysis}
        disabled={loading || isUnavailable}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-semibold px-6 py-2 rounded-lg transition"
      >
        {loading ? 'Running...' : 'Detect Movement Corridors'}
      </button>

      {loading && <LoadingSpinner message="Analyzing corridors..." />}

      {isUnavailable && (
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
          <p className="text-yellow-200 font-semibold mb-2">Corridor Analysis Unavailable</p>
          <p className="text-yellow-100 text-sm">
            {result?.result?.message ||
              'Corridor analysis requires origin-destination data or trajectory information that is not available in the current dataset.'}
          </p>
        </div>
      )}

      {result?.result && !isUnavailable && <div className="space-y-5">
        <CorridorResult result={result.result} />
        {!!result.result.top_corridors?.length && result.result.top_corridors.every((item: any) => typeof item.trip_count === 'number') && <CorridorChart corridors={result.result.top_corridors} title="Corridor source volumes" />}
      </div>}
    </div>
  )
}