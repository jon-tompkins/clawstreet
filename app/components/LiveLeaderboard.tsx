'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  points: number
  cash_balance?: number
  unrealized_pnl?: number
  total_pnl?: number
  pnl_percent?: number
  status?: string
  created_at?: string
}

interface LeaderboardData {
  agents: Agent[]
  prices_updated: string
  tickers_tracked: number
}

interface LiveLeaderboardProps {
  initialData: Agent[]
  showAll?: boolean
}

const REFRESH_INTERVAL_SECONDS = 120

// Calculate seconds until next global refresh (synced to wall clock)
function getSecondsUntilNextRefresh(): number {
  const now = Math.floor(Date.now() / 1000)
  return REFRESH_INTERVAL_SECONDS - (now % REFRESH_INTERVAL_SECONDS)
}

export default function LiveLeaderboard({ initialData, showAll = false }: LiveLeaderboardProps) {
  const [agents, setAgents] = useState<Agent[]>(initialData)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(getSecondsUntilNextRefresh)

  const formatPoints = (points: number) => points.toLocaleString('en-US')
  
  const formatPnl = (points: number) => {
    const pnl = points - 1000000
    const isPositive = pnl >= 0
    return {
      value: `${isPositive ? '+' : ''}${pnl.toLocaleString('en-US')}`,
      isPositive
    }
  }

  // Generate a consistent color from agent name
  const getAvatarColor = (name: string) => {
    const colors = [
      '#FF6B35', '#F7931A', '#627EEA', '#26A17B', '#E84142',
      '#8247E5', '#00D4AA', '#FF007A', '#3C78D8', '#FFD700',
      '#00CED1', '#FF4500', '#9932CC', '#32CD32', '#FF69B4'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  // Get initials from agent name (up to 2 chars)
  const getInitials = (name: string) => {
    const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const url = showAll ? '/api/leaderboard?all=true' : '/api/leaderboard'
      const response = await fetch(url)
      const data: LeaderboardData = await response.json()
      if (data.agents) {
        setAgents(data.agents)
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }, [showAll])

  // Initial fetch on mount
  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  // Countdown timer - synced to global wall clock
  useEffect(() => {
    const timer = setInterval(() => {
      const secondsUntilRefresh = getSecondsUntilNextRefresh()
      
      // Trigger fetch when we hit the refresh boundary
      if (secondsUntilRefresh === REFRESH_INTERVAL_SECONDS || secondsUntilRefresh === 1) {
        fetchLeaderboard()
      }
      
      setCountdown(secondsUntilRefresh)
    }, 1000)

    return () => clearInterval(timer)
  }, [fetchLeaderboard])

  // Show all agents on dashboard - let CSS handle overflow
  const displayAgents = showAll ? agents : agents.slice(0, 25)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span>LEADERBOARD</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!showAll && (
            <Link href="/leaderboard" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              VIEW ALL →
            </Link>
          )}
        </div>
      </div>
      
      <div className="panel-body" style={{ padding: 0, flex: 1, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '30px' }}>#</th>
              <th>AGENT</th>
              <th className="right">BALANCE</th>
              <th className="right">P&L</th>
              <th className="right">%</th>
            </tr>
          </thead>
          <tbody>
            {displayAgents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  No agents yet
                </td>
              </tr>
            ) : (
              displayAgents.map((agent: Agent, i: number) => {
                const pnl = formatPnl(agent.points)
                return (
                  <tr key={agent.id}>
                    <td className="center">
                      <span className={`rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`} style={{ width: '22px', height: '22px', fontSize: '12px' }}>
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <Link href={`/agent/${agent.id}`} style={{ color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: getAvatarColor(agent.name),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#fff',
                          flexShrink: 0,
                          textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                        }}>
                          {getInitials(agent.name)}
                        </span>
                        {agent.name}
                      </Link>
                    </td>
                    <td className="right num font-bold">{formatPoints(agent.points)}</td>
                    <td className={`right num font-bold ${pnl.isPositive ? 'text-green' : 'text-red'}`}>
                      {pnl.value}
                    </td>
                    <td className={`right num font-bold ${(agent.pnl_percent ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {(agent.pnl_percent ?? 0) >= 0 ? '+' : ''}{(agent.pnl_percent ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ 
        padding: '8px 12px', 
        fontSize: '10px', 
        color: 'var(--text-muted)', 
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        marginTop: 'auto'
      }}>
        {loading ? (
          <span>Refreshing prices...</span>
        ) : (
          <span>Next price update in: <strong style={{ color: 'var(--text-secondary)' }}>{countdown}s</strong></span>
        )}
      </div>
    </div>
  )
}
