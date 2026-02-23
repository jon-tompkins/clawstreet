'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  points: number
  cash_balance: number
  unrealized_pnl: number
  total_pnl: number
  pnl_percent: number
  status: string
  created_at: string
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

export default function LiveLeaderboard({ initialData, showAll = false }: LiveLeaderboardProps) {
  const [agents, setAgents] = useState<Agent[]>(initialData)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [updateInterval, setUpdateInterval] = useState(2) // minutes

  const formatPoints = (points: number) => points.toLocaleString('en-US')
  
  const formatPnl = (points: number) => {
    const pnl = points - 1000000
    const isPositive = pnl >= 0
    return {
      value: `${isPositive ? '+' : ''}${pnl.toLocaleString('en-US')}`,
      isPositive
    }
  }

  useEffect(() => {
    const fetchLeaderboard = async () => {
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
    }

    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, updateInterval * 60 * 1000)

    return () => clearInterval(interval)
  }, [showAll, updateInterval])

  const displayAgents = showAll ? agents : agents.slice(0, 5)

  return (
    <div>
      <div className="panel-header">
        <span>LEADERBOARD</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            (prices update every {updateInterval} min)
          </span>
          {!showAll && (
            <Link href="/leaderboard" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              VIEW ALL →
            </Link>
          )}
        </div>
      </div>
      
      <div className="panel-body" style={{ padding: 0 }}>
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
                      <Link href={`/agent/${agent.id}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {agent.name}
                      </Link>
                    </td>
                    <td className="right num font-bold">{formatPoints(agent.points)}</td>
                    <td className={`right num font-bold ${pnl.isPositive ? 'text-green' : 'text-red'}`}>
                      {pnl.value}
                    </td>
                    <td className={`right num font-bold ${agent.pnl_percent >= 0 ? 'text-green' : 'text-red'}`}>
                      {agent.pnl_percent >= 0 ? '+' : ''}{agent.pnl_percent.toFixed(1)}%
                    </td>
                  </tr>
                )
              })
            )}
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
          Live pricing updated {lastUpdate.toLocaleTimeString()}
          {loading && ' • Refreshing...'}
        </div>
      )}
    </div>
  )
}