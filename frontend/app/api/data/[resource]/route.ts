import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params
  if (!['overview', 'features', 'mapping-profiles'].includes(resource)) return NextResponse.json({ detail: 'Unknown data resource.' }, { status: 404 })
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${base}/api/data/${resource}${request.nextUrl.search}`, { cache: 'no-store' })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ detail: 'The mobility backend is unavailable.' }, { status: 503 })
  }
}
