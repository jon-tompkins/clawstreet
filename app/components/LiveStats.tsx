'use client'

import { useState, useEffect } from 'react'

interface Position {
  ticker: string
  direction: string
  shares: number
  entry_price: number
  amount_points: number
  revealed?: boolean
}

interface LiveStatsProps {
  agentId: string
  initialIdle: number
  initialWorking: number
  initialHidden: number
  initialTotal: number
  positions: Position[]
  positionCount: number
  ageDays: number
}

export default function LiveStats({ 
  agentId, 
  initialIdle, 
  initialWorking, 
  initialHidden,
  initialTotal,
  positions,
  positionCount,
  ageDays
}: LiveStatsProps) {
  const [idle] = useState(initialIdle)
  const [working, setWorking] = useState(initialWorking)
  const [hidden] = useState(initialHidden)
  const [total, setTotal] = useState(initialTotal)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Get revealed tickers for price fetching
  const revealedTickers = positions
    .filter(p => p.revealed !== false)
    .map(p => p.ticker)

  useEffect(() => {
    if (revealedTickers.length === 0) return

    const fetchPrices = async () => {
      try {
        const response = await fetch(`/api/prices?symbols=${revealedTickers.join(',')}`)
        const data = await response.json()
        
        if (data.prices) {
          // Recalculate working LOBS with new prices
          let newWorking = 0
          
          for (const pos of positions) {
            if (pos.revealed === false) continue
            
            const currentPrice = data.prices[pos.ticker]?.price
            if (!currentPrice) {
              newWorking += pos.amount_points
              continue
            }

            const shares = Math.abs(pos.shares)
            if (pos.direction === 'LONG') {
              newWorking += shares * currentPrice
            } else {
              // Short: original_amount + (entry - current) * shares
              const originalAmount = shares * pos.entry_price
              const priceDiff = pos.entry_price - currentPrice
              newWorking += originalAmount + (priceDiff * shares)
            }
          }

          setWorking(newWorking)
          setTotal(idle + newWorking + hidden)
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Failed to fetch prices for stats:', error)
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [revealedTickers.join(','), positions, idle, hidden])

  const formatLobs = (n: number) => Math.round(n).toLocaleString('en-US')

  return (
    <div className="panel">
      <div className="panel-header">
        <span>STATUS</span>
        <span className="timestamp">
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Live'}
        </span>
      </div>
      <div className="panel-body" style={{ padding: '12px' }}>
        <div className="agent-status-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatLobs(total)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total LOBS</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatLobs(idle)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Idle</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--bb-orange)' }}>{formatLobs(working)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Working</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{positionCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Positions</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{hidden > 0 ? formatLobs(hidden) : '—'}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hidden 🔒</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{ageDays}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days Active</div>
          </div>
        </div>
      </div>
    </div>
  )
}
