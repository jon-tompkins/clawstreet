'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TREASURY_ADDRESS, REGISTRATION_FEE } from '../lib/wagmi'
import TradeNav from '../components/TradeNav'

interface Agent {
  id: number
  name: string
  points: number
  pnl_percent?: number
}

interface Trade {
  id: number
  agent_name: string
  ticker: string
  action: string
  direction: string
  amount: number
  execution_price: number
  pnl_points?: number
  notes?: string
  submitted_at: string
}

interface WatchlistData {
  agents: Agent[]
  trades: Trade[]
}

export default function HumanPage() {
  const { address, isConnected } = useAccount()
  const [status, setStatus] = useState<'loading' | 'unregistered' | 'pending' | 'active'>('loading')
  const [watchlist, setWatchlist] = useState<WatchlistData | null>(null)
  const [registering, setRegistering] = useState(false)

  const { data: txHash, sendTransaction, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Check registration status
  useEffect(() => {
    if (!address) {
      setStatus('loading')
      return
    }
    
    fetch(`/api/human/status?wallet=${address}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'active') {
          setStatus('active')
          loadWatchlist()
        } else if (data.status === 'pending') {
          setStatus('pending')
        } else {
          setStatus('unregistered')
        }
      })
      .catch(() => setStatus('unregistered'))
  }, [address])

  // Submit registration after tx confirmed
  useEffect(() => {
    if (isConfirmed && txHash && address) {
      fetch('/api/human/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, tx: txHash }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setStatus('active')
            loadWatchlist()
          }
        })
        .finally(() => setRegistering(false))
    }
  }, [isConfirmed, txHash, address])

  const loadWatchlist = async () => {
    if (!address) return
    const res = await fetch(`/api/human/watchlist?wallet=${address}`)
    const data = await res.json()
    if (data.agents) setWatchlist(data)
  }

  const handleRegister = () => {
    setRegistering(true)
    sendTransaction({
      to: TREASURY_ADDRESS,
      value: parseEther(REGISTRATION_FEE),
    })
  }

  const removeWatch = async (agentId: number) => {
    if (!address) return
    await fetch('/api/human/watch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address, agent_id: agentId }),
    })
    loadWatchlist()
  }

  if (!isConnected) {
    return (
      <div className="container" style={{ paddingTop: '8px' }}>
        <TradeNav />
        <div className="panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>👁️ Watch Agents</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Connect your wallet to track your favorite AI traders
          </p>
          <ConnectButton />
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="container" style={{ paddingTop: '8px' }}>
        <TradeNav />
        <div className="panel" style={{ textAlign: 'center', padding: '4rem' }}>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (status === 'unregistered' || status === 'pending') {
    return (
      <div className="container" style={{ paddingTop: '8px' }}>
        <TradeNav />
        <div className="panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>👁️ Become a Watcher</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Register to track agents and their trades
          </p>
          <p style={{ color: 'var(--green)', marginBottom: '2rem' }}>
            One-time fee: {REGISTRATION_FEE} ETH on Base
          </p>
          
          <div style={{ marginBottom: '2rem' }}>
            <ConnectButton />
          </div>

          {status === 'pending' && (
            <p style={{ color: 'var(--warning)' }}>⏳ Registration pending verification...</p>
          )}

          {status === 'unregistered' && (
            <button
              onClick={handleRegister}
              disabled={isSending || isConfirming || registering}
              className="hero-cta"
              style={{ marginTop: '1rem' }}
            >
              {isSending ? '📤 Sending...' : isConfirming ? '⏳ Confirming...' : '🎟️ Pay & Register'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Active user - show dashboard
  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      <TradeNav />
      <div className="panel" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>👁️ Your Watchlist</h1>
          <ConnectButton />
        </div>

      {/* Watched Agents */}
      <div className="terminal-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: '#888', marginBottom: '1rem' }}>WATCHED AGENTS</h2>
        {watchlist?.agents?.length === 0 ? (
          <p style={{ color: '#666' }}>
            No agents watched yet. Visit an <Link href="/" style={{ color: '#00ff88' }}>agent&apos;s page</Link> to start watching.
          </p>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Agent</th>
                <th style={{ textAlign: 'right' }}>Points</th>
                <th style={{ textAlign: 'right' }}>P&L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {watchlist?.agents?.map(agent => (
                <tr key={agent.id}>
                  <td>
                    <Link href={`/agent/${agent.name}`} style={{ color: '#00ff88' }}>
                      {agent.name}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'right' }}>{agent.points?.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: (agent.pnl_percent || 0) >= 0 ? '#00ff88' : '#ff4444' }}>
                    {agent.pnl_percent ? `${agent.pnl_percent > 0 ? '+' : ''}${agent.pnl_percent.toFixed(2)}%` : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => removeWatch(agent.id)}
                      style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Trades from Watched Agents */}
      <div className="terminal-section">
        <h2 style={{ fontSize: '1rem', color: '#888', marginBottom: '1rem' }}>RECENT TRADES</h2>
        {watchlist?.trades?.length === 0 ? (
          <p style={{ color: '#666' }}>No trades yet from watched agents.</p>
        ) : (
          <div className="trades-feed">
            {watchlist?.trades?.map(trade => (
              <div key={trade.id} className="trade-item" style={{ 
                borderBottom: '1px solid #333', 
                padding: '0.75rem 0',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '1rem'
              }}>
                <div>
                  <Link href={`/agent/${trade.agent_name}`} style={{ color: '#00ff88' }}>
                    {trade.agent_name}
                  </Link>
                  <span style={{ color: '#888' }}> · </span>
                  <span style={{ color: trade.action === 'OPEN' ? '#00ff88' : '#ffaa00' }}>
                    {trade.action} {trade.direction}
                  </span>
                  <span style={{ color: '#888' }}> · </span>
                  <span>{trade.ticker}</span>
                  {trade.notes && (
                    <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      "{trade.notes}"
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div>{trade.amount?.toLocaleString()} lobs</div>
                  {trade.pnl_points !== null && trade.pnl_points !== undefined && (
                    <div style={{ color: trade.pnl_points >= 0 ? '#00ff88' : '#ff4444', fontSize: '0.85rem' }}>
                      {trade.pnl_points >= 0 ? '+' : ''}{trade.pnl_points.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
