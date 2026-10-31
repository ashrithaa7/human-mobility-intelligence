'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { readProfile, canPlan } from '@/lib/access'
import { ReportsPanel } from '@/components/dashboard/ReportsPanel'

export default function PlannerReports() {
  const router = useRouter()
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

        // Verify planner access
        const userData = await readProfile(currentUser.id)

        if (!canPlan(userData?.role)) {
          router.push('/request-access')
          return
        }

        setLoading(false)


      } catch (err) {
        setError('Authorization failed')
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
          <LoadingSpinner message="Loading reports..." />
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
          {/* Header */}
          <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Reports</h1>
              <p className="text-gray-400">Generate and view analysis reports</p>
            </div>
            <button
              onClick={() => document.getElementById('report-workspace')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-2 rounded-lg transition"
            >
              Review and generate reports
            </button>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          <div id="report-workspace"><ReportsPanel /></div>
        </div>
      </main>
      <Footer />
    </>
  )
}
