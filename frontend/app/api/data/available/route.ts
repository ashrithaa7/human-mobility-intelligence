import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'}/api/data/available`, { cache: 'no-store' })
    const payload = await response.json()
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    console.error('Dataset listing route error:', error)
    return NextResponse.json({ detail: 'Mobility backend is unavailable. Start the FastAPI backend and try again.' }, { status: 503 })
  }
}
