import { authorize } from '@/lib/server-auth'
import { NextRequest, NextResponse } from 'next/server'

async function relay(request: NextRequest) {
  const auth = await authorize(request, ['planner', 'admin'])
  if (auth.response) return auth.response
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${base}/api/analytics/reports${request.nextUrl.search}`, {
      method: request.method, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
      ...(request.method === 'POST' ? { body: await request.text() } : {}),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch { return NextResponse.json({ detail: 'The analytics backend is unavailable.' }, { status: 503 }) }
}
export const GET = relay
export const POST = relay
export const DELETE = relay
