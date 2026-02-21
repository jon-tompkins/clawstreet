'use client'

import { useState, useMemo } from 'react'

interface HistoryPoint {
  recorded_at: string
  total_points: number
}

interface LobsChartProps {
  history: HistoryPoint[]
}

type TimeRange = '1w' | '1m' | '6m' | '1y' | 'all'

export default function LobsChart({ history }: LobsChartProps) {
  const [range, setRange] = useState<TimeRange>('all')
  
  const filteredHistory = useMemo(() => {
    if (range === 'all' || history.length === 0) return history
    
    const now = new Date()
    const cutoff = new Date()
    
    switch (range) {
      case '1w': cutoff.setDate(now.getDate() - 7); break
      case '1m': cutoff.setMonth(now.getMonth() - 1); break
      case '6m': cutoff.setMonth(now.getMonth() - 6); break
      case '1y': cutoff.setFullYear(now.getFullYear() - 1); break
    }
    
    return history.filter(h => new Date(h.recorded_at) >= cutoff)
  }, [history, range])
  
  // Reverse to get chronological order for chart
  const chartData = [...filteredHistory].reverse()
  
  if (chartData.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        No history data
      </div>
    )
  }
  
  // Calculate chart dimensions
  const minLobs = Math.min(...chartData.map(d => d.total_points))
  const maxLobs = Math.max(...chartData.map(d => d.total_points))
  const lobsRange = maxLobs - minLobs || 1
  const startingBalance = 1000000
  
  // Determine color based on overall trend
  const firstValue = chartData[0]?.total_points || startingBalance
  const lastValue = chartData[chartData.length - 1]?.total_points || startingBalance
  const isUp = lastValue >= firstValue
  const lineColor = isUp ? 'var(--green)' : 'var(--red)'
  
  // Generate SVG path
  const width = 100
  const height = 60
  const padding = 2
  
  const points = chartData.map((d, i) => {
    const x = padding + (i / (chartData.length - 1 || 1)) * (width - 2 * padding)
    const y = height - padding - ((d.total_points - minLobs) / lobsRange) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')
  
  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`
  
  return (
    <div>
      {/* Time Range Selector */}
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)'
      }}>
        {(['1w', '1m', '6m', '1y', 'all'] as TimeRange[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: '2px 8px',
              fontSize: '10px',
              background: range === r ? 'var(--bb-orange)' : 'var(--bg-secondary)',
              color: range === r ? '#000' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: range === r ? 700 : 400,
            }}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>
      
      {/* Chart */}
      <div style={{ padding: '12px' }}>
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          style={{ width: '100%', height: '80px' }}
          preserveAspectRatio="none"
        >
          {/* Area fill */}
          <polygon
            points={areaPoints}
            fill={lineColor}
            fillOpacity="0.1"
          />
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Starting balance reference line */}
          {minLobs <= startingBalance && maxLobs >= startingBalance && (
            <line
              x1={padding}
              y1={height - padding - ((startingBalance - minLobs) / lobsRange) * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - ((startingBalance - minLobs) / lobsRange) * (height - 2 * padding)}
              stroke="var(--text-muted)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        
        {/* Stats */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '10px',
          marginTop: '8px',
          color: 'var(--text-muted)'
        }}>
          <span>Low: {minLobs.toLocaleString()}</span>
          <span>High: {maxLobs.toLocaleString()}</span>
        </div>
      </div>
      
      {/* Data Table */}
      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th className="right">LOBS</th>
              <th className="right">CHANGE</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map((h, i) => {
              const prevLobs = filteredHistory[i + 1]?.total_points || startingBalance
              const change = h.total_points - prevLobs
              return (
                <tr key={h.recorded_at}>
                  <td style={{ fontSize: '11px' }}>
                    {new Date(h.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="right num font-bold">{h.total_points.toLocaleString()}</td>
                  <td className={`right num ${change > 0 ? 'text-green' : change < 0 ? 'text-red' : 'text-muted'}`}>
                    {change !== 0 ? (change > 0 ? '+' : '') + change.toLocaleString() : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
