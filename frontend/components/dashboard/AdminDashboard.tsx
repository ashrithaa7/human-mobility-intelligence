'use client'

import { useEffect, useState } from 'react'
import { Users, FileCheck, Activity } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'

export function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [serviceStatus, setServiceStatus] = useState('Checking?')
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingRequests: 0,
    approvedPlanners: 0,
  })

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [usersRes, requestsRes, plannersRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact' }),
          supabase.from('planner_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
          supabase.from('users').select('id', { count: 'exact' }).eq('role', 'planner'),
        ])

        const health = await fetch('/api/data/available', { cache: 'no-store' }).catch(() => null)
        setServiceStatus(health?.ok ? 'Data service online' : 'Data service unavailable')
        setStats({
          totalUsers: usersRes.count || 0,
          pendingRequests: requestsRes.count || 0,
          approvedPlanners: plannersRes.count || 0,
        })
      } catch (err) {
        console.error('Error loading stats:', err)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  if (loading) {
    return <LoadingSpinner message="Loading admin overview..." />
  }

  return (
    <div className="space-y-12">
      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label="Total Users"
          value={stats.totalUsers}
        />
        <StatCard
          icon={<FileCheck className="w-6 h-6" />}
          label="Pending Requests"
          value={stats.pendingRequests}
          alert={stats.pendingRequests > 0}
        />
        <StatCard
          icon={<Activity className="w-6 h-6" />}
          label="Approved Planners"
          value={stats.approvedPlanners}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <ActionCard
          title="Access Requests"
          description="Review planner access requests"
          count={stats.pendingRequests}
          href="/admin/users?tab=requests"
        />
        <ActionCard
          title="User Management"
          description="Manage platform users and roles"
          count={stats.totalUsers}
          href="/admin/users?tab=users"
        />
      </div>

      {/* System Info */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6">System Information</h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <InfoItem label="Version" value="0.1.0" />
          <InfoItem label="Platform" value="Human Mobility Intelligence" />
          <InfoItem label="Database" value="Supabase PostgreSQL" />
          <InfoItem label="Status" value={serviceStatus} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, alert }: any) {
  return (
    <div className={`bg-white/5 border rounded-lg p-6 ${alert ? 'border-yellow-500/50' : 'border-white/10'}`}>
      <div className="text-purple-400 mb-3 text-2xl">{icon}</div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}

function ActionCard({ title, description, count, href }: any) {
  return (
    <a
      href={href}
      className="bg-white/5 border border-white/10 rounded-lg p-6 hover:bg-white/10 transition"
    >
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm mb-4">{description}</p>
      <p className="text-purple-400 font-semibold">{count} items</p>
    </a>
  )
}

function InfoItem({ label, value }: any) {
  return (
    <div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-white font-semibold">{value}</p>
    </div>
  )
}