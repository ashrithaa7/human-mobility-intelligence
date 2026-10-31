'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Menu, X, LogOut } from 'lucide-react'

interface HeaderProps {
  hideNav?: boolean
}

export function Header({ hideNav = false }: HeaderProps) {
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      if (currentUser) {
        setUser(currentUser)

        // Get user role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', currentUser.id)
          .single()

        setRole(userData?.role || 'public_user')
      }
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Do not request a session while Supabase is dispatching under its auth lock.
      setTimeout(checkAuth, 0)
    })

    return () => subscription?.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    window.location.href = '/'
  }

  if (hideNav) {
    return null
  }

  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-3">
        {/* Logo */}
        <Link href="/" className="flex min-w-0 items-center gap-3 text-2xl font-bold text-white">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-purple-600/20 text-lg">🗺️</span>
          <span>HMI<span className="hidden">/ Mobility Intelligence</span></span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {!user ? (
            <>
              <Link href="/login" className="text-gray-300 hover:text-white transition">
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              {role === 'admin' && (
                <Link href="/admin/dashboard" className="text-gray-300 hover:text-white transition">
                  Admin
                </Link>
              )}
              {(role === 'planner' || role === 'admin') && (
                <Link href="/planner/dashboard" className="text-gray-300 hover:text-white transition">
                  Planning workspace
                </Link>
              )}
              <Link
  href={
    role === 'admin'
      ? '/admin/dashboard'
      : role === 'planner'
        ? '/planner/dashboard'
        : '/dashboard'
  }
  className="text-gray-300 hover:text-white transition"
>
  Dashboard
</Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-300 hover:text-white transition"
              >
                <LogOut size={18} />
                Logout
              </button>
            </>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-lg p-2 text-white hover:bg-white/10"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Navigation */}
        {mobileOpen && (
          <nav className="absolute top-full left-0 right-0 bg-black/95 border-b border-white/10 md:hidden p-4 space-y-3">
            {!user ? (
              <>
                <Link href="/login" className="block text-gray-300 hover:text-white py-2">
                  Sign In
                </Link>
                <Link href="/register" className="block bg-purple-600 text-white px-4 py-2 rounded-lg">
                  Register
                </Link>
              </>
            ) : (
              <>
                {role === 'admin' && (
                  <Link href="/admin/dashboard" className="block text-gray-300 hover:text-white py-2">
                    Admin
                  </Link>
                )}
                {(role === 'planner' || role === 'admin') && (
                  <Link href="/planner/dashboard" className="block text-gray-300 hover:text-white py-2">
                    Planning workspace
                  </Link>
                )}
                <Link
  href={
    role === 'admin'
      ? '/admin/dashboard'
      : role === 'planner'
        ? '/planner/dashboard'
        : '/dashboard'
  }
  className="text-gray-300 hover:text-white transition"
>
  Dashboard
</Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left text-gray-300 hover:text-white py-2"
                >
                  Logout
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}
