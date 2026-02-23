'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Trade {
  id: string
  action: string
  ticker: string | null
  direction?: string | null
  shares: number | null
  execution_price: number | null
  amount?: number | null
  submitted_at: string
  created_at: string
  pnl_points?: number | null
  revealed?: boolean
  commitment_hash?: string | null  // If present, was a commit-reveal trade
}

interface RecentTradesProps {
  trades: Trade[]
  agentId: string
  totalTrades: number
}

export default function RecentTrades({ trades, agentId, totalTrades }: RecentTradesProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const tradesPerPage = 20
  
  // Paginate trades
  const startIndex = currentPage * tradesPerPage
  const endIndex = startIndex + tradesPerPage
  const currentTrades = trades.slice(startIndex, endIndex)
  const totalPages = Math.ceil(trades.length / tradesPerPage)
  
  function formatTime(date: string): string {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatPnl(n: number): string {
    const prefix = n >= 0 ? '+' : ''
    return `${prefix}${n.toLocaleString('en-US')}`
  }

  function formatLobs(n: number): string {
    return Math.round(n).toLocaleString('en-US')
  }

  if (trades.length === 0) {
    return (
      <div className="panel-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
        No trades yet
      </div>
    )
  }

  return (
    <div>
      <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
        {currentTrades.map((trade: Trade) => {
          const isClosingTrade = trade.pnl_points !== null && trade.pnl_points !== undefined
          const isCommitReveal = !!trade.commitment_hash
          const isUnrevealed = trade.revealed === false && isCommitReveal
          const hasTradeDetails = trade.ticker && trade.execution_price
          
          // Calculate trade value
          const tradeValue = hasTradeDetails 
            ? Math.abs(Number(trade.shares || 0) * Number(trade.execution_price || 0))
            : (trade.amount || 0)
          const shares = Number(trade.shares || 0)
          
          // Determine display action and badge style
          let displayAction = trade.direction || trade.action
          let badgeStyle: React.CSSProperties = {}
          
          if (isUnrevealed) {
            badgeStyle = { background: '#444', color: '#aaa' }
          } else if (displayAction === 'SHORT' || (trade.action === 'OPEN' && trade.direction === 'SHORT')) {
            displayAction = 'SHORT'
            badgeStyle = { background: '#8b0000', color: '#fff' }
          } else if (displayAction === 'LONG' || trade.action === 'OPEN') {
            displayAction = 'LONG'
            badgeStyle = { background: '#006400', color: '#fff' }
          } else if (trade.action === 'CLOSE') {
            displayAction = 'CLOSE'
            badgeStyle = { background: '#333', color: '#fff' }
          }
          
          return (
            <div key={trade.id} style={{ 
              padding: '8px 10px', 
              borderBottom: '1px solid var(--border)',
              fontSize: '11px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`badge`} style={badgeStyle}>{displayAction}</span>
                  {isUnrevealed ? (
                    <span style={{ color: '#888' }}>🔒 ???</span>
                  ) : (
                    <span className="ticker">{trade.ticker || '???'}</span>
                  )}
                  <span style={{ color: 'var(--bb-orange)', fontWeight: 600 }}>{formatLobs(tradeValue)} lobs</span>
                  {isCommitReveal && (
                    <span style={{ 
                      fontSize: '8px', 
                      background: '#2a2a4a', 
                      color: '#8888ff', 
                      padding: '1px 4px', 
                      borderRadius: '3px',
                      fontWeight: 600
                    }}>C-R</span>
                  )}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                  {formatTime(trade.submitted_at || trade.created_at)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isUnrevealed ? (
                  <span style={{ color: '#666', fontSize: '10px' }}>
                    {trade.direction} position • reveals on close
                  </span>
                ) : hasTradeDetails ? (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {Math.abs(shares).toFixed(2)} sh @ ${Number(trade.execution_price).toFixed(2)}
                  </span>
                ) : (
                  <span style={{ color: '#666', fontSize: '10px' }}>Details pending</span>
                )}
                {isClosingTrade ? (
                  <span style={{ fontWeight: 700 }} className={
                    trade.pnl_points! > 0 ? 'text-green' : 
                    trade.pnl_points! < 0 ? 'text-red' : 'text-muted'
                  }>
                    P&L: {formatPnl(Number(trade.pnl_points))}
                  </span>
                ) : !isUnrevealed && trade.action === 'OPEN' ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>OPEN</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '10px'
        }}>
          <div style={{ color: 'var(--text-muted)' }}>
            Showing {startIndex + 1}-{Math.min(endIndex, trades.length)} of {trades.length}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 0 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <span style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage >= totalPages - 1 ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {/* View All Link */}
      <div style={{ 
        padding: '8px 12px', 
        borderTop: totalPages > 1 ? 'none' : '1px solid var(--border)',
        textAlign: 'center'
      }}>
        <Link 
          href={`/trades?agent=${agentId}`} 
          style={{ 
            color: 'var(--bb-orange)', 
            fontSize: '10px',
            textDecoration: 'none',
            fontWeight: 600
          }}
        >
          VIEW ALL {totalTrades} TRADES →
        </Link>
      </div>
    </div>
  )
}