import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.toString()
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'}/api/data${query ? `?${query}` : ''}`, {
      cache: 'no-store',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Data route error:', error)
    return NextResponse.json(
      { detail: 'Mobility backend is unavailable. Start the FastAPI backend and try again.' },
      { status: 503 }
    )
  }
}
