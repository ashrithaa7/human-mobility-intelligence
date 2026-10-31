'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface Corridor {
  origin: [number, number]
  destination: [number, number]
  trip_count: number
  distance_m?: number
  modes?: { [mode: string]: number }
}

interface CorridorChartProps {
  corridors?: Corridor[]
  title?: string
  loading?: boolean
}

export function CorridorChart({ corridors = [], title = 'Top Movement Corridors', loading = false }: CorridorChartProps) {
  const chartData = corridors.slice(0, 10).map((corridor, idx) => ({
    name: `Corridor ${idx + 1}`,
    trips: corridor.trip_count,
    distance: corridor.distance_m ? (corridor.distance_m / 1000).toFixed(1) : 'N/A',
  }))

  if (loading) {
    return <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (chartData.length === 0) {
    return (
      <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">
        No corridor data available
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="text-white font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
          <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
          <YAxis stroke="#9ca3af" label={{ value: 'Trips', angle: -90, position: 'insideLeft' }} />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #9ca3af', borderRadius: '4px' }} />
          <Legend />
          <Bar dataKey="trips" fill="#8b5cf6" name="Trip Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}