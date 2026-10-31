import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body=await request.json()
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'}/api/analytics/compare`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',
    })
    const payload=await response.json()
    return NextResponse.json(payload,{status:response.status})
  } catch {
    return NextResponse.json({detail:'Area comparison could not reach the mobility backend.'},{status:503})
  }
}
