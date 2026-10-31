'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'

export function SystemStatus() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [dataStatus, setDataStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check backend health
        const healthResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'}/api/health`,
          { method: 'GET', cache: 'no-store' }
        )

        setBackendStatus(healthResponse.ok ? 'online' : 'offline')

        // Check data availability
        const dataResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'}/api/data`,
          { method: 'GET', cache: 'no-store' }
        )

        setDataStatus(dataResponse.ok ? 'available' : 'unavailable')
      } catch (err) {
        setBackendStatus('offline')
        setDataStatus('unavailable')
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4">
      {/* Backend Status */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold">Backend API</p>
            <p className="text-gray-400 text-sm">
              {backendStatus === 'checking' && 'Checking...'}
              {backendStatus === 'online' && 'Connected and operational'}
              {backendStatus === 'offline' && 'Connection unavailable'}
            </p>
          </div>
          {backendStatus === 'online' && <CheckCircle className="w-6 h-6 text-green-500" />}
          {backendStatus === 'offline' && <AlertCircle className="w-6 h-6 text-red-500" />}
          {backendStatus === 'checking' && <div className="w-6 h-6 border-2 border-gray-400 border-t-purple-600 rounded-full animate-spin" />}
        </div>
      </div>

      {/* Data Status */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold">Data Services</p>
            <p className="text-gray-400 text-sm">
              {dataStatus === 'checking' && 'Checking...'}
              {dataStatus === 'available' && 'Data sources ready'}
              {dataStatus === 'unavailable' && 'No data currently available'}
            </p>
          </div>
          {dataStatus === 'available' && <CheckCircle className="w-6 h-6 text-green-500" />}
          {dataStatus === 'unavailable' && <AlertCircle className="w-6 h-6 text-yellow-500" />}
          {dataStatus === 'checking' && <div className="w-6 h-6 border-2 border-gray-400 border-t-purple-600 rounded-full animate-spin" />}
        </div>
      </div>
    </div>
  )
}