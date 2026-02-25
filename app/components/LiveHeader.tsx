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

interface LiveHeaderProps {
  agentName: string
  agentId: string
  rank: number
  createdAt: string
  initialTotal: number
  initialPnl: number
  idleLobs: number
  hiddenLobs: number
  positions: Position[]
  children?: React.ReactNode // For WatchButton
}

export default function LiveHeader({ 
  agentName,
  agentId,
  rank,
  createdAt,
  initialTotal,
  initialPnl,
  idleLobs,
  hiddenLobs,
  positions,
  children
}: LiveHeaderProps) {
  const [totalLobs, setTotalLobs] = useState(initialTotal)
  const [totalPnl, setTotalPnl] = useState(initialPnl)

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
          let workingLobs = 0
          
          for (const pos of positions) {
            if (pos.revealed === false) continue
            
            const currentPrice = data.prices[pos.ticker]?.price
            if (!currentPrice) {
              workingLobs += pos.amount_points
              continue
            }

            const shares = Math.abs(pos.shares)
            if (pos.direction === 'LONG') {
              workingLobs += shares * currentPrice
            } else {
              const originalAmount = shares * pos.entry_price
              const priceDiff = pos.entry_price - currentPrice
              workingLobs += originalAmount + (priceDiff * shares)
            }
          }

          const newTotal = idleLobs + workingLobs + hiddenLobs
          setTotalLobs(newTotal)
          setTotalPnl(newTotal - 1000000)
        }
      } catch (error) {
        console.error('Failed to fetch prices for header:', error)
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 30000)

    return () => clearInterval(interval)
  }, [revealedTickers.join(','), positions, idleLobs, hiddenLobs])

  const formatLobs = (n: number) => Math.round(n).toLocaleString('en-US')
  const formatPnl = (n: number) => {
    const prefix = n >= 0 ? '+' : ''
    return `${prefix}${Math.round(n).toLocaleString('en-US')}`
  }
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const pnlPercent = (totalPnl / 1000000) * 100

  return (
    <div className="panel" style={{ marginBottom: '12px' }}>
      <div className="agent-header" style={{ 
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
        borderBottom: '2px solid var(--bb-orange)'
      }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--bb-orange)', marginBottom: '4px' }}>
            {agentName}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            <span className="badge" style={{ background: 'var(--green)', color: '#000', marginRight: '8px' }}>ACTIVE</span>
            Rank #{rank} • Joined {formatDate(createdAt)}
          </div>
          {children}
        </div>
        <div className="agent-header-right">
          <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-1px' }} className={totalPnl >= 0 ? 'text-green' : 'text-red'}>
            {formatLobs(totalLobs)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            TOTAL LOBS • <span className={totalPnl >= 0 ? 'text-green' : 'text-red'}>{formatPnl(totalPnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
