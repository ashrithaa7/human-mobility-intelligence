import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/server-auth'

async function relay(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params
  if (!['catalog','assess','scenarios'].includes(resource)) return NextResponse.json({ detail: 'Unknown planning operation.' }, { status: 404 })
  const auth = await authorize(request, ['planner','admin'])
  if (auth.response) return auth.response
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${base}/api/planning/${resource}`, {
      method: request.method, cache: 'no-store', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      ...(request.method === 'POST' ? { body: await request.text() } : {}),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch { return NextResponse.json({ detail: 'The planning service is unavailable or took too long. Try a smaller radius.' }, { status: 503 }) }
}
export const GET = relay
export const POST = relay
