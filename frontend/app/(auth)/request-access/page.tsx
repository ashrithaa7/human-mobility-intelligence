'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { accessError, canPlan, readProfile, roleHome } from '@/lib/access'

export default function RequestAccessPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestRequest, setLatestRequest] = useState<any>(null)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    organization: '',
    position: '',
    reason: '',
  })

  useEffect(() => {
    let cancelled = false
    const checkAuth = async () => {
      try {
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !currentUser) { router.replace('/login?next=/request-access'); return }
        const profile = await readProfile(currentUser.id)
        if (canPlan(profile.role)) { router.replace(roleHome(profile.role)); return }
        const { data, error: requestError } = await supabase.from('planner_requests')
          .select('id,status,review_notes,requested_at').eq('user_id',currentUser.id)
          .order('requested_at',{ascending:false}).limit(1).maybeSingle()
        if (requestError) throw new Error(accessError(requestError))
        if (!cancelled) { setUser(currentUser); setLatestRequest(data) }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not verify your account.') }
      finally { if (!cancelled) setLoading(false) }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!user || formData.organization.trim().length < 2 || formData.reason.trim().length < 20) {
      setError('Enter your organization and a reason of at least 20 characters.')
      return
    }

    setSubmitting(true)

    try {
      const { error: insertError } = await supabase.rpc('submit_planner_request', {
        p_organization: formData.organization.trim(), p_position: formData.position.trim(), p_reason: formData.reason.trim(),
      })
      if (insertError) { setError(accessError(insertError)); return }
      setSuccess(true)
    } catch (err) {
      setError('An error occurred while submitting your request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <div className="hmi-surface p-5 sm:p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Request Planner Access</h1>
          <p className="text-gray-400 mb-8">Apply for advanced mobility analysis and planning tools</p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {success || latestRequest?.status === 'pending' ? (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{success ? 'Request submitted' : 'Request awaiting review'}</h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  Your planner access request has been submitted and is awaiting administrator review. Return to this page to check the decision. Once approved, your dashboard will open the planner workspace.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-2.5 rounded-lg transition"
              >
                Return to Dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {latestRequest?.status === 'rejected' && <p role="status" className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-200">Your previous request was declined. {latestRequest.review_notes || 'You can revise your reason and submit a new request.'}</p>}
              {latestRequest?.status === 'approved' && <p role="status" className="text-amber-200">Your previous request was approved, but your current account role does not include planner access. Contact an administrator or submit a new request.</p>}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Organization <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    name="organization" required minLength={2} maxLength={255}
                    value={formData.organization}
                    onChange={handleChange}
                    disabled={submitting || !user}
                    placeholder="Your organization name"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Position/Title
                </label>
                <input
                  type="text"
                  name="position" maxLength={255}
                  value={formData.position}
                  onChange={handleChange}
                  disabled={submitting || !user}
                  placeholder="Your job title"
                  className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Why do you need planner access? <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="reason" required minLength={20} maxLength={4000}
                  value={formData.reason}
                  onChange={handleChange}
                  disabled={submitting || !user}
                  placeholder="Describe your intended use of the platform..."
                  rows={5}
                  className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !user}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-semibold py-2.5 rounded-lg transition"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
