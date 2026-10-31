'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Users,
  LogOut,
  Menu,
  X,
  Globe,
  Zap,
  Database,
} from 'lucide-react'

interface SidebarProps {
  userRole?: string | null
  className?: string
}

export function Sidebar({ userRole = 'public_user', className = '' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [role, setRole] = useState(userRole)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Get user role
    const getRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
        setRole(data?.role || 'public_user')
      }
    }
    getRole()
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    localStorage.removeItem('sb-auth-token')
    router.push('/login')
  }

  const publicLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: Globe },
  ]

  const plannerLinks = [
    { href: '/planner/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/planner/analysis', label: 'Analysis', icon: BarChart3 },
    { href: '/planner/reports', label: 'Reports', icon: FileText },
  ]

  const adminLinks = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/data', label: 'Data Sources', icon: Database },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/users?tab=requests', label: 'Access Requests', icon: Zap },
  ]

  let navLinks = publicLinks
  if (role === 'planner') {
    navLinks = plannerLinks
  } else if (role === 'admin') {
    navLinks = adminLinks
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-purple-600 text-white rounded-lg"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed z-50 h-screen w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-slate-900/95 backdrop-blur-md transition-transform md:relative md:z-auto md:bg-white/5 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${className}`}
      >
        <div className="p-6 space-y-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 text-2xl font-bold text-white">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-purple-600/20">🗺️</span>
            <span>HMI <span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-gray-400">Mobility Intelligence</span></span>
          </Link>

          {/* Navigation */}
          <nav className="space-y-2">
            {navLinks.map((link) => {
              const Icon = link.icon
              const hrefPath = link.href.split('?')[0]
const isActive =
  pathname === hrefPath ||
  (hrefPath !== '/dashboard' && pathname.startsWith(`${hrefPath}/`))

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                    isActive
                    ? 'bg-purple-600 text-white'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Role Info */}
          <div className="bg-white/5 rounded-lg p-3 text-sm">
            <p className="text-gray-400 mb-1">Signed in as</p>
            <p className="text-white font-semibold capitalize">
              {role === 'public_user' ? 'Public User' : role === 'planner' ? 'Urban Planner' : 'Administrator'}
            </p>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white rounded-lg transition font-semibold"
          >
            <LogOut size={20} />
            <span>{loading ? 'Signing out...' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
