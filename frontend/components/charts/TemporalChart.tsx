'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TemporalData {
  hourly?: { [hour: number]: number }
  daily?: { [day: string]: number }
  peak_hour?: number
}

interface TemporalChartProps {
  data?: TemporalData
  type?: 'hourly' | 'daily' 
  title?: string
  loading?: boolean
}

export function TemporalChart({
  data = {},
  type = 'hourly',
  title = 'Temporal Patterns',
  loading = false,
}: TemporalChartProps) {
  let chartData: Array<{ name: string; count: number }> = []

  if (type === 'hourly' && data.hourly) {
    chartData = Object.entries(data.hourly)
      .sort((a, b) => (a[0] as any) - (b[0] as any))
      .map(([hour, count]) => ({
        name: `${String(hour).padStart(2, '0')}:00`,
        count: typeof count === 'number' ? count : 0,
      }))
  } else if (type === 'daily') {
  const daily = data.daily ?? {}
  const dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]

  chartData = dayOrder
    .filter((day) => Object.prototype.hasOwnProperty.call(daily, day))
    .map((day) => ({
      name: day.substring(0, 3),
      count: daily[day] ?? 0,
    }))
}

  if (loading) {
    return <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (chartData.length === 0) {
    return (
      <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">
        No temporal data available
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="text-white font-semibold">{title}</h3>}
      {data.peak_hour !== undefined && type === 'hourly' && (
        <p className="text-purple-300 text-sm">Peak hour: {String(data.peak_hour).padStart(2, '0')}:00</p>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #9ca3af', borderRadius: '4px' }} />
          <Legend />
          <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} name="Activity" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}