'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'
import { supabase } from '@/lib/supabase'
import { readProfile } from '@/lib/access'
import { Users, FileCheck, Activity, AlertTriangle } from 'lucide-react'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingRequests: 0,
    approvedPlanners: 0,
    systemHealth: 'Checking…',
  })

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (!currentUser) {
          router.push('/login')
          return
        }

        // Verify admin access
        const userData = await readProfile(currentUser.id)

        if (userData?.role !== 'admin') {
          router.push('/dashboard')
          return
        }

        // Load stats
        const [usersRes, requestsRes, plannersRes, dataSourceRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact' }),
          supabase.from('planner_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
          supabase.from('users').select('id', { count: 'exact' }).eq('role', 'planner'),
          fetch('/api/data/available', { cache: 'no-store' }).catch(() => null),
        ])

        setStats({
          totalUsers: usersRes.count || 0,
          pendingRequests: requestsRes.count || 0,
          approvedPlanners: plannersRes.count || 0,
          systemHealth: dataSourceRes?.ok ? 'Data service online' : 'Data service offline',
        })

        setLoading(false)
      } catch (err) {
        console.error('Auth error:', err)
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
          <LoadingSpinner message="Loading admin dashboard..." />
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="hmi-page min-h-screen text-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-10">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-purple-400">Platform operations</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white mb-2">Admin overview</h1>
            <p className="text-gray-300">Access, user and mobility-source oversight</p>
          </div>

          {error && (
            <div className="mb-8 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-200">
              {error}
            </div>
          )}

          {/* Stats */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
            <AdminStatCard icon={<Users />} label="Total Users" value={stats.totalUsers} />
            <AdminStatCard
              icon={<FileCheck />}
              label="Pending Requests"
              value={stats.pendingRequests}
              alert={stats.pendingRequests > 0}
            />
            <AdminStatCard icon={<Activity />} label="Approved Planners" value={stats.approvedPlanners} />
            <AdminStatCard icon={<AlertTriangle />} label="System Health" value={stats.systemHealth} />
          </div>

          <div className="mb-12"><DatasetOverview /></div>

          {/* Quick Actions */}
          <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 sm:p-8 mb-12">
            <div className="rounded-2xl hmi-surface p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-white mb-3">Access Requests</h2>
              <p className="text-gray-300 mb-6">Review and manage planner access requests</p>
              <button
                onClick={() => router.push('/admin/users?tab=requests')}
                className="rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-700"
              >
                Review Requests ({stats.pendingRequests})
              </button>
            </div>

            <div className="rounded-2xl hmi-surface p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-white mb-3">Mobility Data</h2>
              <p className="text-gray-300 mb-6">Configure the source and review its geographic and temporal coverage.</p>
              <button
                onClick={() => router.push('/admin/data')}
                className="rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-700"
              >
                Manage Data Sources
              </button>
            </div>

            <div className="rounded-2xl hmi-surface p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-white mb-3">User Management</h2>
              <p className="text-gray-300 mb-6">Manage users and their roles</p>
              <button
                onClick={() => router.push('/admin/users?tab=users')}
                className="rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-700"
              >
                Manage Users ({stats.totalUsers})
              </button>
            </div>
          </section>

          {/* System Info */}
          <section className="rounded-2xl hmi-surface p-7 shadow-sm">
            <h2 className="text-lg font-semibold text-white mb-5">System Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <InfoItem label="Version" value="0.1.0" />
              <InfoItem label="Environment" value={process.env.NODE_ENV || 'Development'} />
              <InfoItem label="Database" value="Supabase" />
              <InfoItem label="Source sync cadence" value="Not reported by source" />
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  )
}

function AdminStatCard({ icon, label, value, alert }: any) {
  return (
    <div className={`rounded-2xl border hmi-surface p-6 shadow-sm ${alert ? 'border-yellow-500/50' : 'border-white/10'}`}>
      <div className="mb-3 text-2xl text-purple-400">{icon}</div>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  )
}

function InfoItem({ label, value }: any) {
  return (
    <div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-gray-100 font-semibold">{value}</p>
    </div>
  )
}
