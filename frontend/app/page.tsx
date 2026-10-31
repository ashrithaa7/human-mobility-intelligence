'use client'

import Link from 'next/link'
import { ArrowRight, Map, BarChart3, Users, Globe, Lock, Zap } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 text-xl font-bold tracking-tight text-white"><span className="grid h-10 w-10 place-items-center rounded-lg bg-purple-600/20">🗺️</span> HMI <span className="hidden text-sm font-medium text-slate-400 sm:inline">Mobility Intelligence</span></div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Register
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20 text-center">
        <h1 className="hmi-gradient-text mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-7xl">
          Understand Human Mobility
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
          Discover spatiotemporal movement patterns across urban areas. Support evidence-based decisions on transportation, infrastructure, and urban development planning.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/register"
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-4 font-semibold text-white shadow-lg shadow-purple-950/30 hover:from-purple-700 hover:to-pink-700"
          >
            Start Exploring <ArrowRight size={20} />
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-white/20 bg-white/5 px-8 py-4 font-semibold text-white hover:bg-white/10"
          >
            Sign In
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon={<Map className="w-8 h-8" />}
            title="Interactive Maps"
            description="Explore geographic mobility patterns on responsive, layer-rich maps."
          />
          <FeatureCard
            icon={<BarChart3 className="w-8 h-8" />}
            title="Advanced Analytics"
            description="Hotspot detection, temporal analysis, corridors, and accessibility insights."
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="Real-time Insights"
            description="Generate reports and actionable planning recommendations."
          />
        </div>
      </div>

      {/* Problem Section */}
      <div className="bg-black/40 border-y border-white/10 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-12 text-center">
            The Urban Planning Challenge
          </h2>
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-semibold text-purple-300 mb-4">The Problem</h3>
              <p className="text-gray-300 leading-relaxed">
                Urban areas experience continuous movement of people across residential areas, workplaces, educational institutions, commercial zones, and transport hubs. These patterns change based on time of day, day of the week, geography, and external factors. Urban planners need unified, evidence-based insights to make informed decisions about transport infrastructure, accessibility, congestion management, and future development.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-purple-300 mb-4">Our Solution</h3>
              <p className="text-gray-300 leading-relaxed">
                Human Mobility Intelligence processes geographical, temporal, and mobility data to discover patterns and transform raw observations into actionable analytical insights. The platform supports spatial clustering, temporal decomposition, corridor analysis, accessibility measurement, and evidence-based planning recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* User Roles Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-white mb-12 text-center">
          For Every User
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <RoleCard
            icon={<Users className="w-8 h-8" />}
            title="Public Users"
            description="Explore publicly available mobility insights, geographic patterns, and temporal summaries."
            role="public"
          />
          <RoleCard
            icon={<Globe className="w-8 h-8" />}
            title="Urban Planners"
            description="Advanced analytics, hotspot analysis, planning recommendations, and report generation."
            role="planner"
          />
          <RoleCard
            icon={<Lock className="w-8 h-8" />}
            title="Administrators"
            description="Platform oversight, user management, data source configuration, and system health monitoring."
            role="admin"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/60 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
          <p>© 2024 Human Mobility Intelligence. A Data Science Research Platform.</p>
          <p className="text-sm mt-2">
            This is a demonstration platform. Synthetic data is labelled clearly. Real-world analysis requires verified data sources.
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="hmi-surface-soft p-6 transition duration-300 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-white/10">
      <div className="text-purple-400 mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </div>
  )
}

function RoleCard({
  icon,
  title,
  description,
  role,
}: {
  icon: React.ReactNode
  title: string
  description: string
  role: 'public' | 'planner' | 'admin'
}) {
  return (
    <div className="hmi-surface p-8 transition duration-300 hover:-translate-y-1 hover:border-purple-400/40">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-2xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-gray-300 mb-6">{description}</p>
      <Link
        href={role === 'planner' ? '/login?next=/planner/dashboard' : '/login'}
        className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-2"
      >
        {role === 'planner' ? 'Open planning workspace' : 'Sign in'} <ArrowRight size={16} />
      </Link>
    </div>
  )
}
