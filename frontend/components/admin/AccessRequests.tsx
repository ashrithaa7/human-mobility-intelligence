'use client'

import { useEffect, useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import { reviewRequest } from '@/lib/access'

export function AccessRequests() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      const { data, error: err } = await supabase
        .from('planner_requests')
        .select('*, users!planner_requests_user_id_fkey(email, first_name, last_name)')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })

      if (err) throw err

      setRequests(data || [])
      setLoading(false)
    } catch (err) {
      console.error('Error loading requests:', err)
      setError('Failed to load access requests')
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId)

    try {
      setError(null)
      await reviewRequest(requestId, 'approved')

      await loadRequests()
    } catch (err) {
      console.error('Error approving request:', err)
      setError(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId)

    try {
      setError(null)
      await reviewRequest(requestId, 'rejected')

      await loadRequests()
    } catch (err) {
      console.error('Error rejecting request:', err)
      setError(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading access requests..." />
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-red-200">{error}</p>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">No pending access requests</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <div key={request.id} className="bg-white/5 border border-white/10 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-white font-semibold">
                {request.users?.first_name} {request.users?.last_name}
              </h3>
              <p className="text-gray-400 text-sm">{request.users?.email}</p>
            </div>
            <span className="bg-yellow-500/20 text-yellow-200 px-3 py-1 rounded text-sm font-semibold">
              Pending
            </span>
          </div>

          <div className="space-y-2 mb-4 text-sm text-gray-300">
            <p>
              <strong>Organization:</strong> {request.organization}
            </p>
            <p>
              <strong>Position:</strong> {request.position || 'Not specified'}
            </p>
            <p>
              <strong>Reason:</strong> {request.request_reason}
            </p>
            <p className="text-xs text-gray-500">
              Requested: {new Date(request.requested_at).toLocaleDateString()}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleApprove(request.id)}
              disabled={actionLoading === request.id}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white px-4 py-2 rounded transition font-semibold text-sm"
            >
              <Check size={18} />
              Approve
            </button>
            <button
              onClick={() => handleReject(request.id)}
              disabled={actionLoading === request.id}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white px-4 py-2 rounded transition font-semibold text-sm"
            >
              <X size={18} />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}