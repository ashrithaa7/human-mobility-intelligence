'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, TrendingUp, MapPin, Users } from 'lucide-react'
import { InteractiveMap } from '@/components/map/InteractiveMap'
import { ActivityChart } from '@/components/charts/ActivityChart'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export function PublicDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
        const response = await fetch(`${apiUrl}/api/data`)

        if (!response.ok) {
          throw new Error('Failed to load data')
        }

        const result = await response.json()
        setData({ ...result.data, coverage: result.coverage })

        if (result.data?.records) {
          const isSynthetic = result.data.metadata?.is_synthetic || false
          setStats({
            totalLocations: result.data.metadata?.total_records ?? result.data.records.length,
            dataPoints: result.data.records.length,
            source: isSynthetic ? 'Synthetic Demonstration Data' : 'Historical Dataset',
            isSynthetic: isSynthetic,
            lastUpdated: result.data.metadata?.updated_at || 'Not supplied',
          })
        }

        setLoading(false)
      } catch (err) {
        console.error('Data loading error:', err)
        setError('Failed to load data')
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <LoadingSpinner message="Loading mobility data..." />
  }

  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">{error}</div>
  }

  const locations = data?.coverage?.locations?.length ? Object.fromEntries(data.coverage.locations.map((location: any) => [location.name, location.record_count])) : (data?.records || []).reduce((counts: Record<string, number>, record: any) => {
    const name = record.location_name || record.area || record.region || 'Unlabelled area'
    counts[name] = (counts[name] || 0) + 1
    return counts
  }, {})

  return (
    <div className="space-y-12">
      {/* Stats Grid */}
      {stats && (
        <div className="grid md:grid-cols-4 gap-6">
          <StatsCard
            icon={<Globe className="w-6 h-6" />}
            label="Records"
            value={stats.totalLocations}
          />
          <StatsCard
            icon={<MapPin className="w-6 h-6" />}
            label="Data Source"
            value={stats.source}
          />
          <StatsCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Type"
            value={stats.isSynthetic ? 'Demo' : 'Real'}
          />
          <StatsCard
            icon={<Users className="w-6 h-6" />}
            label="Last Updated"
            value={stats.lastUpdated}
          />
        </div>
      )}

      {/* Data Source Warning */}
      {stats?.isSynthetic && (
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
          <p className="text-yellow-200 text-sm">
            <strong>Note:</strong> This is synthetic demonstration data for testing. Real historical data will replace this when configured.
          </p>
        </div>
      )}

      {/* Map */}
      {data?.records && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <InteractiveMap
            records={data.records}
            isSynthetic={stats?.isSynthetic}
            title="Mobility Overview"
            showCluster={true}
          />
        </div>
      )}

      {/* Activity Chart */}
      {data?.records && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          {Object.keys(locations).length > 0 && <ActivityChart data={locations} title="Recorded observations by area" xAxisLabel="Area" yAxisLabel="Rows" />}
        </div>
      )}

      {/* Features */}
      <section className="bg-white/5 border border-white/10 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6">Available Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            href="/dashboard/maps"
            title="Interactive Maps"
            description="Explore geographic mobility patterns"
          />
          <FeatureCard
            href="/dashboard/analysis"
            title="Temporal Analysis"
            description="Understand activity throughout the day"
          />
          <FeatureCard
            href="/dashboard/insights"
            title="Data Insights"
            description="View mobility summaries and trends"
          />
          <FeatureCard href="/dashboard/travel" title="Travel Decision Support" description="Compare road routes between locations present in the mobility source." />
        </div>
      </section>
    </div>
  )
}

function StatsCard({ icon, label, value }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <div className="text-purple-400 mb-3">{icon}</div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  )
}

function FeatureCard({ href, title, description }: any) {
  return (
    <Link href={href} className="block bg-white/5 border border-white/10 rounded-lg p-6 hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-purple-300">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
      <span className="mt-4 inline-flex text-sm font-semibold text-purple-200">Explore <span aria-hidden="true" className="ml-1">→</span></span>
    </Link>
  )
}
