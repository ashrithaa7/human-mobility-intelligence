import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: 'The accessibility request must be valid JSON.' }, { status: 400 })
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${apiUrl}/api/analytics/accessibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const responseText = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(responseText)
    } catch {
      return NextResponse.json(
        { detail: `The mobility backend returned a non-JSON accessibility response (HTTP ${response.status}).` },
        { status: 502 }
      )
    }

    return NextResponse.json(payload, { status: response.status })
  } catch {
    return NextResponse.json(
      { detail: 'Accessibility analysis could not reach the mobility backend.' },
      { status: 503 }
    )
  }
}
