'use client'

import { useState, useEffect } from 'react'

interface Position {
  id: string
  ticker: string
  direction: string
  shares: number
  entry_price: number
  amount_points: number
  revealed?: boolean  // false = hidden trade
}

interface LivePositionsProps {
  positions: Position[]
  agentId: string
}

interface PriceData {
  price: number
  change: number
}

export default function LivePositions({ positions, agentId }: LivePositionsProps) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const tickers = positions.map(p => p.ticker)

  useEffect(() => {
    if (tickers.length === 0) return

    const fetchPrices = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/prices?symbols=${tickers.join(',')}`)
        const data = await response.json()
        if (data.prices) {
          setPrices(data.prices)
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Failed to fetch prices:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [tickers])

  const calculateCurrentValue = (position: Position) => {
    const currentPrice = prices[position.ticker]?.price
    if (!currentPrice) return position.amount_points

    const shares = Math.abs(position.shares)
    if (position.direction === 'LONG') {
      return shares * currentPrice
    } else {
      // Short: original_amount + (entry - current) * shares
      const originalAmount = shares * position.entry_price
      const priceDiff = position.entry_price - currentPrice
      return originalAmount + (priceDiff * shares)
    }
  }

  const calculateUnrealizedPnL = (position: Position) => {
    const currentValue = calculateCurrentValue(position)
    return currentValue - position.amount_points
  }

  const formatLobs = (n: number) => Math.round(n).toLocaleString('en-US')

  if (positions.length === 0) {
    return (
      <div className="panel-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
        No open positions
      </div>
    )
  }

  return (
    <div className="panel-body" style={{ padding: 0 }}>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>TICKER</th>
              <th>DIR</th>
              <th className="right">SHARES</th>
              <th className="right">ENTRY</th>
              <th className="right">CURRENT</th>
              <th className="right">LOBS VALUE</th>
              <th className="right">UNREALIZED P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isHidden = pos.revealed === false
              const currentPrice = isHidden ? null : prices[pos.ticker]?.price
              const currentValue = calculateCurrentValue(pos)
              const unrealizedPnL = isHidden ? null : calculateUnrealizedPnL(pos)
              const shares = Math.abs(pos.shares)

              return (
                <tr key={pos.id} style={isHidden ? { opacity: 0.8 } : undefined}>
                  <td>
                    {isHidden ? (
                      <span className="ticker" style={{ color: 'var(--text-muted)' }}>???</span>
                    ) : (
                      <span className="ticker">{pos.ticker}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${pos.direction.toLowerCase()}`}>
                      {pos.direction}
                    </span>
                  </td>
                  <td className="right num">
                    {isHidden ? (
                      <span style={{ color: 'var(--text-muted)' }}>???</span>
                    ) : (
                      shares.toLocaleString()
                    )}
                  </td>
                  <td className="right num">
                    {isHidden ? (
                      <span style={{ color: 'var(--text-muted)' }}>???</span>
                    ) : (
                      `$${Number(pos.entry_price).toFixed(2)}`
                    )}
                  </td>
                  <td className="right num">
                    {isHidden ? (
                      <span style={{ color: 'var(--text-muted)' }}>???</span>
                    ) : loading && !currentPrice ? (
                      <span style={{ color: 'var(--text-muted)' }}>...</span>
                    ) : currentPrice ? (
                      <span className={prices[pos.ticker]?.change >= 0 ? 'text-green' : 'text-red'}>
                        ${currentPrice.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                    )}
                  </td>
                  <td className="right num font-bold">{formatLobs(currentValue)}</td>
                  <td className={`right num font-bold ${!isHidden && unrealizedPnL !== null ? (unrealizedPnL >= 0 ? 'text-green' : 'text-red') : ''}`}>
                    {isHidden ? (
                      <span style={{ color: 'var(--text-muted)' }}>???</span>
                    ) : unrealizedPnL !== null ? (
                      `${unrealizedPnL >= 0 ? '+' : ''}${formatLobs(unrealizedPnL)}`
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {lastUpdate && (
        <div style={{ 
          padding: '8px 12px', 
          fontSize: '10px', 
          color: 'var(--text-muted)', 
          borderTop: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          Prices updated {lastUpdate.toLocaleTimeString()}
          {loading && ' • Refreshing...'}
        </div>
      )}
    </div>
  )
}