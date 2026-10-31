'use client'

import { useEffect, useState } from 'react'
import { HotspotAnalysis } from '@/components/analysis/HotspotAnalysis'
import { CorridorAnalysis } from '@/components/analysis/CorridorAnalysis'
import { AccessibilityAnalysis } from '@/components/analysis/AccessibilityAnalysis'
import { TemporalChart } from '@/components/charts/TemporalChart'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { RealtimeStatus } from '@/components/dashboard/RealtimeStatus'
import { Database } from 'lucide-react'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'

export function PlannerDashboard() {
  const [loading, setLoading] = useState(true)
  const [temporal, setTemporal] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    const loadData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
        const response = await fetch(`${apiUrl}/api/data`)

        if (response.ok) {
          const result = await response.json()
          setData(result.data)
          const temporalResponse = await fetch(`${apiUrl}/api/analytics/temporal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data_mode: 'historical' }) })
          if (temporalResponse.ok) setTemporal((await temporalResponse.json()).result)
        }
      } catch (err) {
        console.error('Data loading error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <LoadingSpinner message="Loading planner workspace..." />
  }

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-4 flex-wrap border-b border-white/10 pb-4">
        {['overview', 'hotspots', 'temporal', 'corridors', 'accessibility'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-semibold transition capitalize ${
              activeTab === tab
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {tab === 'overview' && '📊 Overview'}
            {tab === 'hotspots' && '🔥 Hotspots'}
            {tab === 'temporal' && '📅 Temporal'}
            {tab === 'corridors' && '🛣️ Corridors'}
            {tab === 'accessibility' && '♿ Accessibility'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <DatasetOverview />
          <RealtimeStatus />
          <div className="grid md:grid-cols-2 gap-6">
            <InfoCard
              icon={<Database className="w-6 h-6" />}
              title="Historical Dataset"
              description={data?.metadata?.source || 'No dataset loaded'}
              details={`${data?.records?.length || 0} records`}
            />

          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-8">
            <h3 className="text-2xl font-bold text-white mb-4">Available Analyses</h3>
            <p className="text-gray-400 mb-6">
              Select an analysis type from the tabs above to explore mobility patterns in your dataset.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <AnalysisOption
                title="Hotspot Detection"
                description="Identify geographic clusters and high-activity areas"
              />
              <AnalysisOption
                title="Temporal Patterns"
                description="Explore hourly and daily activity variations"
              />
              <AnalysisOption
                title="Corridor Analysis"
                description="Discover significant movement routes"
              />
              <AnalysisOption
                title="Accessibility"
                description="Analyze service coverage and reach"
              />
            </div>
          </div>
        </div>
      )}

      {/* Hotspots Tab */}
      {activeTab === 'hotspots' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <HotspotAnalysis />
        </div>
      )}

      {/* Temporal Tab */}
      {activeTab === 'temporal' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <TemporalChart data={temporal || {}} type="hourly" title="Hourly Activity Patterns" />
          <div className="mt-8">
            <TemporalChart data={temporal || {}} type="daily" title="Daily Patterns" />
          </div>
        </div>
      )}

      {/* Corridors Tab */}
      {activeTab === 'corridors' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <CorridorAnalysis />
        </div>
      )}

      {/* Accessibility Tab */}
      {activeTab === 'accessibility' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <AccessibilityAnalysis />
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon, title, description, details }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <div className="text-purple-400 mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-gray-400 text-sm mb-2">{description}</p>
      <p className="text-gray-500 text-xs">{details}</p>
    </div>
  )
}

function AnalysisOption({ title, description }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition">
      <h4 className="text-white font-semibold mb-1">{title}</h4>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  )
}