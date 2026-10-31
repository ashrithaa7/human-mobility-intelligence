import { NextRequest, NextResponse } from 'next/server'

// Browser-owned sessions must be established in the browser that holds the PKCE verifier.
export async function GET(request: NextRequest) {
  const destination = new URL('/auth/confirm', request.url)
  for (const name of ['code', 'error']) {
    const value = request.nextUrl.searchParams.get(name)
    if (value) destination.searchParams.set(name,value)
  }
  return NextResponse.redirect(destination)
}
