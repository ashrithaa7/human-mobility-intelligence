'use client'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { Footer } from '@/components/common/Footer'
import { PlanningWorkspace } from '@/components/dashboard/PlanningWorkspace'
import { DatasetOverview } from '@/components/dashboard/DatasetOverview'
import { RealtimeStatus } from '@/components/dashboard/RealtimeStatus'
export default function PlannerDashboard(){
  return <><Header/><main className="hmi-page min-h-screen"><div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8"><header><p className="hmi-eyebrow mb-3">Hyderabad - Urban planning</p><h1 className="text-3xl font-bold text-white sm:text-4xl">City planning workspace</h1><p className="mt-3 max-w-3xl text-slate-300">Compare locations, examine infrastructure and land use, and build an evidence-based decision brief for your team.</p><nav className="mt-5 flex flex-wrap gap-3 text-sm"><Link className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-purple-200" href="/planner/analysis">Mobility analytics</Link><Link className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-purple-200" href="/planner/reports">Mobility reports</Link><Link className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-purple-200" href="/dashboard/maps">Explore source map</Link></nav></header><PlanningWorkspace/><details className="hmi-surface p-5"><summary className="cursor-pointer font-semibold text-white">Active mobility dataset and realtime status</summary><div className="mt-5 space-y-5"><DatasetOverview/><RealtimeStatus/></div></details></div></main><Footer/></>
}
