'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { readProfile } from '@/lib/access'
import { reviewRequest } from '@/lib/access'
import { Check, X } from 'lucide-react'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  created_at: string
}

interface AccessRequest {
  id: string
  user_id: string
  organization: string
  request_reason: string
  position?: string
  review_notes?: string
  reviewed_at?: string
  status: string
  requested_at: string
  user?: { email: string; first_name: string; last_name: string }
}

export default function AdminUsersPage() {
  return <Suspense fallback={<div className="hmi-page p-8"><LoadingSpinner message="Loading user administration…" /></div>}><AdminUsers /></Suspense>
}

function AdminUsers() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'requests')
  const [users, setUsers] = useState<User[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

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


        // Load data
        await loadData()
        setLoading(false)
      } catch (err) {
        setError('Authorization failed')
        setLoading(false)
      }
    }

    const loadData = async () => {
      try {
        // Load users
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false })

        if (usersError) throw usersError
        setUsers(usersData || [])

        // Load requests
        const { data: requestsData, error: requestsError } = await supabase
          .from('planner_requests')
          .select('*')
          .order('requested_at', { ascending: false })

        if (requestsError) throw requestsError
      setRequests(requestsData || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load account records.')
      }
    }

    checkAuth()
  }, [router])

  const approveRequest = async (requestId: string, userId: string) => {
    setActionLoading(requestId)

    try {
      setError(null)
      await reviewRequest(requestId, 'approved', reviewNotes[requestId])
      setUsers(current => current.map(user => user.id === userId ? { ...user, role: user.role === 'admin' ? 'admin' : 'planner' } : user))

      // Refresh data
      const { data: requestsData, error: requestsError } = await supabase
        .from('planner_requests')
        .select('*')
        .order('requested_at', { ascending: false })

      if (requestsError) throw requestsError
      setRequests(requestsData || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setActionLoading(null)
    }
  }

  const rejectRequest = async (requestId: string) => {
    setActionLoading(requestId)

    try {
      setError(null)
      await reviewRequest(requestId, 'rejected', reviewNotes[requestId])

      const { data: requestsData, error: requestsError } = await supabase
        .from('planner_requests')
        .select('*')
        .order('requested_at', { ascending: false })

      if (requestsError) throw requestsError
      setRequests(requestsData || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner message="Loading user management..." />
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
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">User Management</h1>
            <p className="text-gray-400">Manage users and planner access requests</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                activeTab === 'requests'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              Access Requests ({requests.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                activeTab === 'users'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              All Users ({users.length})
            </button>
          </div>

          {/* Requests Tab */}
          {activeTab === 'requests' && (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {requests.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-400">No pending access requests</p>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {requests.map((req) => (
                    <div key={req.id} className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-white font-semibold">{req.organization}</h3>
                          <p className="mt-1 text-sm text-purple-200">{users.find(user => user.id === req.user_id)?.email || 'Account profile unavailable'}{req.position ? ` · ${req.position}` : ''}</p>
                          <p className="text-gray-400 text-sm">Status: {req.status}</p>
                          <p className="text-gray-500 text-xs mt-1">{new Date(req.requested_at).toLocaleDateString()}</p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded text-sm font-semibold ${
                            req.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-200'
                              : req.status === 'approved'
                              ? 'bg-green-500/20 text-green-200'
                              : 'bg-red-500/20 text-red-200'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      <p className="text-gray-300 mb-4">{req.request_reason}</p>
                      {req.review_notes && <p className="mb-4 rounded-lg bg-white/5 p-3 text-sm text-gray-300">Review note: {req.review_notes}</p>}
                      {req.status === 'pending' && <label className="mb-4 block text-sm text-gray-300">Review note (visible to applicant)<textarea value={reviewNotes[req.id] || ''} onChange={event => setReviewNotes(current => ({ ...current, [req.id]: event.target.value }))} maxLength={4000} rows={2} className="hmi-input mt-2 block w-full rounded-lg p-3" /></label>}

                      {req.status === 'pending' && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => approveRequest(req.id, req.user_id)}
                            disabled={actionLoading === req.id}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white px-4 py-2 rounded transition"
                          >
                            <Check size={18} />
                            Approve
                          </button>
                          <button
                            onClick={() => rejectRequest(req.id)}
                            disabled={actionLoading === req.id}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white px-4 py-2 rounded transition"
                          >
                            <X size={18} />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-4 text-left text-white font-semibold">Email</th>
                    <th className="px-6 py-4 text-left text-white font-semibold">Name</th>
                    <th className="px-6 py-4 text-left text-white font-semibold">Role</th>
                    <th className="px-6 py-4 text-left text-white font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-6 py-4 text-gray-300">{u.email}</td>
                      <td className="px-6 py-4 text-gray-300">
                        {u.first_name} {u.last_name}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded text-sm font-semibold ${
                            u.role === 'admin'
                              ? 'bg-red-500/20 text-red-200'
                              : u.role === 'planner'
                              ? 'bg-blue-500/20 text-blue-200'
                              : 'bg-gray-500/20 text-gray-200'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
