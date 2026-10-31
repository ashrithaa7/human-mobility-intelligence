import { supabase } from './supabase'

export type AppRole = 'public_user' | 'planner' | 'admin'
export type AppProfile = { id: string; role: AppRole; is_active: boolean }
export const roleHome = (role: AppRole) => role === 'admin' ? '/admin/dashboard' : role === 'planner' ? '/planner/dashboard' : '/dashboard'
export const canPlan = (role?: string) => role === 'planner' || role === 'admin'

export function accessError(error: { code?: string; message?: string } | null | undefined): string {
  if (['PGRST202', '42P01', '42703', '42P17'].includes(error?.code || '')) return 'The account database needs its access-workflow migration. An administrator must apply database/migrations/002_access_workflow.sql.'
  return error?.message || 'The account service is unavailable. Please try again.'
}

export async function readProfile(userId: string): Promise<AppProfile> {
  const { data, error } = await supabase.from('users').select('id, role, is_active').eq('id', userId).single()
  if (error || !data) throw new Error(error?.code === 'PGRST116' ? 'Your account profile is missing. An administrator must apply the account-profile migration.' : accessError(error))
  if (!['public_user','planner','admin'].includes(data.role)) throw new Error('Your account has an invalid role. Contact an administrator.')
  if (!data.is_active) throw new Error('Your account is inactive. Contact an administrator.')
  return data as AppProfile
}

export async function reviewRequest(id: string, decision: 'approved' | 'rejected', notes?: string) {
  const { error } = await supabase.rpc('review_planner_request', { p_request_id: id, p_decision: decision, p_notes: notes || null })
  if (error) throw new Error(accessError(error))
}
