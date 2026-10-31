'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ActivityData {
  [key: string]: number
}

interface ActivityChartProps {
  data?: ActivityData
  title?: string
  xAxisLabel?: string
  yAxisLabel?: string
  loading?: boolean
}

export function ActivityChart({
  data = {},
  title = 'Activity Distribution',
  xAxisLabel = 'Category',
  yAxisLabel = 'Count',
  loading = false,
}: ActivityChartProps) {
  const chartData = Object.entries(data)
    .map(([key, value]) => ({
      name: String(key),
      value: typeof value === 'number' ? value : 0,
    }))
    .slice(0, 20) // Limit to 20 items for readability

  if (loading) {
    return <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (chartData.length === 0) {
    return (
      <div className="h-80 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">
        No activity data available
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="text-white font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
          <XAxis
  dataKey="name"
  stroke="#9ca3af"
  angle={-45}
  textAnchor="end"
  height={100}
  label={{
    value: xAxisLabel,
    position: 'insideBottom',
    offset: -15,
    fill: '#9ca3af',
  }}
/>
          <YAxis stroke="#9ca3af" label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #9ca3af', borderRadius: '4px' }} />
          <Legend />
          <Bar dataKey="value" fill="#8b5cf6" name={yAxisLabel} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}