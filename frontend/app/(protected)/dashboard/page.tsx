'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'

export default function PublicDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!currentUser) {
          router.push('/login')
          return
        }

        setUser(currentUser)

        setLoading(false)


      } catch (err) {
        console.error('Dashboard auth error:', err)
        setError('Could not verify your sign-in. Please sign in again.')
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner message="Loading dashboard..." />
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
          {/* Welcome */}
        <div className="mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">
              Welcome, {user?.email?.split('@')[0]}!
            </h1>
            <p className="text-gray-400">Explore mobility patterns and urban insights</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          <div className="mb-8"><DatasetOverview /></div>

          {/* Main Content Sections */}
          <div className="space-y-8">
            {/* Mobility Patterns Section */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-8">
              <h2 className="text-2xl font-bold text-white mb-4">About Mobility Patterns</h2>
              <p className="text-gray-400 leading-relaxed mb-4">
                Human Mobility Intelligence analyzes movement patterns across geographic areas and time periods.
                This platform helps urban planners understand where people move, when they move, and why.
              </p>
              <p className="text-gray-400 leading-relaxed">
                The source overview identifies its actual coverage, data quality and supported analyses. Static schedules, infrastructure indicators and observed movement are reported separately.
              </p>
            </section>

            {/* Available Features */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Available Features</h2>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                <FeatureCard
                  title="Interactive Maps"
                  description="Explore geographic mobility patterns on responsive, interactive maps."
                  href="/dashboard/maps"
                />
                <FeatureCard
                  title="Temporal Analysis"
                  description="Understand how mobility patterns change throughout the day and week."
                  href="/dashboard/analysis"
                />
                <FeatureCard
                  title="Data Insights"
                  description="View publicly available mobility insights and geographic summaries."
                  href="/dashboard/insights"
                />
                <FeatureCard
                  title="Travel Decision Support"
                  description="Compare road routes between locations covered by the configured source."
                  href="/dashboard/travel"
                />
              </div>
            </section>

            {/* Access Request */}
            <section className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/50 rounded-xl p-5 sm:p-8">
              <h2 className="text-2xl font-bold text-white mb-4">Want Advanced Analysis?</h2>
              <p className="text-gray-300 mb-6">
                Request access to the Planner dashboard for advanced mobility analysis, hotspot detection,
                corridor analysis, and planning recommendations.
              </p>
              <button
                onClick={() => router.push('/request-access')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition"
              >
                Request Planner Access
              </button>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

function FeatureCard({ title, description, href }: any) {
  return (
    <Link href={href} className="hmi-surface-soft group block p-6 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-purple-300 transition group-hover:gap-3">Open feature <span aria-hidden="true">→</span></span>
    </Link>
  )
}
