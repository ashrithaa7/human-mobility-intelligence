import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params
  if (resource[0] !== 'feeds' || resource.length > 2) return NextResponse.json({ detail: 'Unknown live-feed resource.' }, { status: 404 })
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${base}/api/realtime/${resource.map(encodeURIComponent).join('/')}`, { cache: 'no-store' })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch { return NextResponse.json({ detail: 'The live-feed backend is unavailable.' }, { status: 503 }) }
}
