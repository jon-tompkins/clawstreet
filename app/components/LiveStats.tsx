'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

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
  initialPnl: number
  positions: Position[]
  positionCount: number
  ageDays: number
}

const REFRESH_INTERVAL_SECONDS = 120

// Calculate seconds until next global refresh (synced to wall clock)
function getSecondsUntilNextRefresh(): number {
  const now = Math.floor(Date.now() / 1000)
  return REFRESH_INTERVAL_SECONDS - (now % REFRESH_INTERVAL_SECONDS)
}

export default function LiveStats({ 
  agentId, 
  initialIdle, 
  initialWorking, 
  initialHidden,
  initialTotal,
  initialPnl,
  positions,
  positionCount,
  ageDays
}: LiveStatsProps) {
  const [idle] = useState(initialIdle)
  const [working, setWorking] = useState(initialWorking)
  const [hidden] = useState(initialHidden)
  const [total, setTotal] = useState(initialTotal)
  const [pnl, setPnl] = useState(initialPnl)

  // Memoize ticker string to prevent infinite re-renders
  const tickerString = useMemo(() => {
    return positions.filter(p => p.revealed !== false).map(p => p.ticker).join(',')
  }, [positions])

  const fetchPrices = useCallback(async () => {
    if (!tickerString) return
    
    try {
      const response = await fetch(`/api/prices?symbols=${tickerString}`)
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

        const newTotal = idle + newWorking + hidden
        setWorking(newWorking)
        setTotal(newTotal)
        setPnl(newTotal - 1000000)
      }
    } catch (error) {
      console.error('Failed to fetch prices for stats:', error)
    }
  }, [tickerString, positions, idle, hidden])

  // Initial fetch
  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // Sync to global wall clock (same timing as LivePositions)
  useEffect(() => {
    const timer = setInterval(() => {
      const secondsUntilRefresh = getSecondsUntilNextRefresh()
      
      // Trigger fetch when we hit the refresh boundary
      if (secondsUntilRefresh === REFRESH_INTERVAL_SECONDS) {
        fetchPrices()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [fetchPrices])

  const formatLobs = (n: number) => Math.round(n).toLocaleString('en-US')
  const formatPnl = (n: number) => {
    const prefix = n >= 0 ? '+' : ''
    return `${prefix}${Math.round(n).toLocaleString('en-US')}`
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>STATUS</span>
        <span className="timestamp">Live</span>
      </div>
      <div className="panel-body" style={{ padding: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{formatLobs(total)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total LOBS</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }} className={pnl >= 0 ? 'text-green' : 'text-red'}>{formatPnl(pnl)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>P&L</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{positionCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Open Positions</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{ageDays}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days Active</div>
            </div>
          </div>
          
          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--bb-orange)' }}>
                {formatLobs(working)}
                {hidden > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}> ({formatLobs(hidden)})</span>}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Working {hidden > 0 && '(Hidden)'}</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatLobs(idle)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Idle</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-muted)' }}>—</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reward</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{hidden > 0 ? formatLobs(hidden) : '—'}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hidden 🔒</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
