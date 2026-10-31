import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  try {
    // Clear auth token on client side
    const response = NextResponse.json({ success: true })
    response.cookies.set('sb-auth-token', '', { maxAge: 0 })
    return response
  } catch (error) {
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}
