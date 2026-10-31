'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { readProfile, roleHome } from '@/lib/access'

export default function ConfirmAccount() {
  const [error,setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const complete = async () => {
      try {
        const query = new URLSearchParams(window.location.search)
        if (query.get('error')) throw new Error('This confirmation link is invalid or expired. Please request a new link.')
        const code=query.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          window.history.replaceState(null, '', '/auth/confirm')
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { window.location.replace('/login'); return }
        const profile = await readProfile(user.id)
        window.location.replace(roleHome(profile.role))
      } catch(cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm your account.') }
    }
    complete()
  },[])
  return <main className="hmi-page grid min-h-screen place-items-center p-6"><section className="hmi-surface max-w-lg space-y-4 p-8 text-white"><h1 className="text-xl font-semibold">Confirming your account</h1>{error ? <><p role="alert" className="text-amber-200">{error}</p><Link href="/login" className="text-purple-200">Return to sign in</Link></> : <p role="status" className="text-gray-300">Verifying your session…</p>}</section></main>
}
