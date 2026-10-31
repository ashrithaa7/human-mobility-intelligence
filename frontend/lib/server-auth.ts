import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { AppRole } from './access'

export async function authorize(request: NextRequest, roles?: AppRole[]) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { response: NextResponse.json({ detail: 'Sign in to continue.' }, { status: 401 }) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { response: NextResponse.json({ detail: 'Authentication is not configured.' }, { status: 503 }) }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user) return { response: NextResponse.json({ detail: 'Your session has expired. Sign in again.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await client.from('users').select('id,role,is_active').eq('id', user.id).single()
  if (profileError || !profile) return { response: NextResponse.json({ detail: 'Your account profile could not be verified.' }, { status: 503 }) }
  if (!profile.is_active || !['public_user', 'planner', 'admin'].includes(profile.role) || (roles && !roles.includes(profile.role))) return { response: NextResponse.json({ detail: 'Your account does not have access to this action.' }, { status: 403 }) }
  return { client, user, profile, token }
}
