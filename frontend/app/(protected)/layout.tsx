'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { canPlan, readProfile, roleHome } from '@/lib/access'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter()
  const [verifiedPath, setVerifiedPath] = useState('')
  const [error, setError] = useState('')
  const check = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) { setVerifiedPath(''); router.replace('/login'); return }
      const profile = await readProfile(user.id)
      if (path === '/dashboard' && profile.role !== 'public_user') { setVerifiedPath(''); router.replace(roleHome(profile.role)); return }
      if (path.startsWith('/admin') && profile.role !== 'admin') { setVerifiedPath(''); router.replace(roleHome(profile.role)); return }
      if (path.startsWith('/planner') && !canPlan(profile.role)) { setVerifiedPath(''); router.replace('/request-access'); return }
      setError(''); setVerifiedPath(path)
    } catch (cause) { setVerifiedPath(''); setError(cause instanceof Error ? cause.message : 'Your account could not be verified.') }
  }, [path, router])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    check()
    // Supabase auth callbacks run inside its session lock; defer additional auth calls.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { clearTimeout(timer); timer = setTimeout(check, 0) })
    window.addEventListener('focus', check)
    return () => { clearTimeout(timer); subscription.unsubscribe(); window.removeEventListener('focus', check) }
  }, [check])
  if (error) return <main className="hmi-page grid min-h-screen place-items-center p-6"><div className="hmi-surface max-w-lg space-y-4 p-6"><h1 className="text-xl font-semibold text-white">Account access unavailable</h1><p role="alert" className="text-amber-200">{error}</p><div className="flex gap-4"><button onClick={check} className="rounded-lg bg-purple-600 px-4 py-2 text-white">Try again</button><button onClick={async () => { await supabase.auth.signOut(); router.replace('/login') }} className="text-purple-200">Sign out</button></div></div></main>
  if (verifiedPath !== path) return <main className="hmi-page grid min-h-screen place-items-center"><LoadingSpinner message="Verifying account access…" /></main>
  return <>{children}</>
}
