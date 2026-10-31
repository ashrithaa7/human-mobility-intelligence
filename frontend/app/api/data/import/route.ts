import { authorize } from '@/lib/server-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const auth = await authorize(request, ['admin'])
  if (auth.response) return auth.response
  const authorization = 'Bearer ' + auth.token

  if (request.nextUrl.searchParams.get('operation') === 'activate') {
    const filename = request.nextUrl.searchParams.get('filename')
    if (!filename) return NextResponse.json({ detail: 'Choose a source from the catalog.' }, { status: 400 })
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${base}/api/data/activate?${new URLSearchParams({ filename })}`, { method: 'POST', headers: { Authorization: authorization } })
      return NextResponse.json(await response.json(), { status: response.status })
    } catch { return NextResponse.json({ detail: 'The catalog backend is unavailable.' }, { status: 503 }) }
  }

  if (!request.body) return NextResponse.json({ detail: 'Choose a non-empty dataset file.' }, { status: 400 })
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 1024 * 1024 * 1024) return NextResponse.json({ detail: 'Dataset files must be 1 GB or smaller.' }, { status: 413 })

  const filename = request.nextUrl.searchParams.get('filename')
  if (!filename) return NextResponse.json({ detail: 'Dataset filename is required.' }, { status: 400 })

  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const query = new URLSearchParams(request.nextUrl.searchParams)
    const operation = query.get('operation') === 'preview' ? 'preview' : 'import'
    query.delete('operation')
    const response = await fetch(`${backendUrl}/api/data/${operation}?${query.toString()}`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': request.headers.get('content-type') || 'application/octet-stream' },
      body: request.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const payload = await response.json()
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    console.error('Dataset import route error:', error)
    return NextResponse.json({ detail: 'Mobility backend is unavailable. Start the FastAPI backend and try again.' }, { status: 503 })
  }
}
