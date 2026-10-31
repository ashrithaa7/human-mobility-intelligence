import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if (auth.response) return auth.response
  return NextResponse.json({ user: { email: auth.user.email, ...auth.profile } })
}
