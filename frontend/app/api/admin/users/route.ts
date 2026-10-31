import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  const auth = await authorize(request, ['admin'])
  if (auth.response) return auth.response
  const { data, error } = await auth.client.from('users').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ detail: 'The account records could not be loaded.' }, { status: 503 })
  return NextResponse.json({ users: data })
}
