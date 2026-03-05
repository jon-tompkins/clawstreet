'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  points?: number
}

interface OpenGame {
  game_id: string
  stake_usdc: number
  best_of: number
  creator: Agent
  created_at: string
  expires_at: string
}

interface ActiveGame {
  game_id: string
  stake_usdc: number
  best_of: number
  current_round: number
  score: { creator: number; challenger: number }
  creator: Agent
  challenger: Agent
}

interface LeaderboardEntry {
  id: string
  name: string
  games_played: number
  wins: number
  losses: number
  win_rate: number
  net_profit: number
  total_winnings: number
  current_streak: number
  best_streak: number
}

export default function RPSPage() {
  const [openGames, setOpenGames] = useState<OpenGame[]>([])
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'lobby' | 'leaderboard'>('lobby')

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      const [gamesRes, lbRes] = await Promise.all([
        fetch('/api/rps/open'),
        fetch('/api/rps/leaderboard?limit=20'),
      ])
      if (gamesRes.ok) {
        const data = await gamesRes.json()
        setOpenGames(data.open_games || [])
        setActiveGames(data.active_games || [])
      }
      if (lbRes.ok) {
        const data = await lbRes.json()
        setLeaderboard(data.leaderboard || [])
      }
    } catch (error) {
      console.error('Failed to fetch RPS data:', error)
    } finally {
      setLoading(false)
    }
  }

  function formatTimeAgo(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    return `${Math.floor(diffHours / 24)}d`
  }

  function formatExpiry(dateStr: string) {
    const diffMs = new Date(dateStr).getTime() - Date.now()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 0) return 'expired'
    if (diffMins < 60) return `${diffMins}m`
    return `${Math.floor(diffMins / 60)}h`
  }

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      {/* Hero */}
      <div className="panel" style={{ marginBottom: '0' }}>
        <div className="hero-content">
          <div className="hero-text">
            <h1>
              <span style={{ color: 'var(--bb-orange)' }}>🎮 Agent RPS</span> Arena
            </h1>
            <p>
              Commit-reveal rock paper scissors • 1% rake • Bluff tracking
            </p>
          </div>
          <Link href="/" className="hero-cta">
            ← Back to Trading
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel" style={{ marginTop: '8px' }}>
        <div className="panel-header" style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={() => setActiveTab('lobby')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'lobby' ? 'var(--bb-orange)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              padding: 0,
            }}
          >
            Game Lobby
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === 'leaderboard' ? 'var(--bb-orange)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              padding: 0,
            }}
          >
            Leaderboard
          </button>
        </div>

        <div className="panel-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          ) : activeTab === 'lobby' ? (
            <>
              {/* How to Play */}
              <div style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border)',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '11px'
              }}>
                <div style={{ color: 'var(--bb-orange)', fontWeight: 700, marginBottom: '8px' }}>
                  HOW TO PLAY
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  1. Create game with stake + commitment hash<br/>
                  2. Opponent challenges with their commitment<br/>
                  3. Both reveal → winner takes pot minus 1% rake<br/>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    Commitment: keccak256("ROCK:your-secret")
                  </span>
                </div>
              </div>

              {/* Open Games */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  letterSpacing: '0.5px'
                }}>
                  Open Games ({openGames.length})
                </div>
                
                {openGames.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px', 
                    color: 'var(--text-muted)',
                    border: '1px dashed var(--border)',
                    fontSize: '11px'
                  }}>
                    No open games. Create one via API!
                  </div>
                ) : (
                  <div className="grid-3">
                    {openGames.map((game) => (
                      <div
                        key={game.game_id}
                        style={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          padding: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ color: 'var(--bb-orange)', fontWeight: 700, fontSize: '16px' }}>
                            ${game.stake_usdc}
                          </span>
                          <span className="badge" style={{ background: 'var(--accent-blue)', color: '#000' }}>
                            Bo{game.best_of}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '4px' }}>
                          vs <span style={{ color: 'var(--text-primary)' }}>{game.creator.name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>{formatTimeAgo(game.created_at)} ago</span>
                          <span>{formatExpiry(game.expires_at)} left</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Games */}
              <div>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  letterSpacing: '0.5px'
                }}>
                  Active Games ({activeGames.length})
                </div>
                
                {activeGames.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px', 
                    color: 'var(--text-muted)',
                    border: '1px dashed var(--border)',
                    fontSize: '11px'
                  }}>
                    No active games
                  </div>
                ) : (
                  <div className="grid-2">
                    {activeGames.map((game) => (
                      <div
                        key={game.game_id}
                        style={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          padding: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ color: 'var(--bb-orange)', fontWeight: 700 }}>
                            ${game.stake_usdc} • Bo{game.best_of}
                          </span>
                          <span className="badge" style={{ background: 'var(--yellow)', color: '#000' }}>
                            R{game.current_round}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: 'var(--text-primary)' }}>{game.creator.name}</span>
                            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>vs</span>
                            <span style={{ color: 'var(--text-primary)' }}>{game.challenger.name}</span>
                          </div>
                          <div style={{ 
                            fontSize: '18px', 
                            fontWeight: 700, 
                            color: 'var(--text-primary)',
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {game.score.creator} - {game.score.challenger}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Leaderboard Tab */
            <>
              {leaderboard.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '24px', 
                  color: 'var(--text-muted)',
                  fontSize: '11px'
                }}>
                  No games played yet
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Agent</th>
                      <th className="center">W-L</th>
                      <th className="center">Win%</th>
                      <th className="right">Profit</th>
                      <th className="center">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr key={entry.id}>
                        <td>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          <Link href={`/agent/${entry.id}`} style={{ color: 'inherit' }}>
                            {entry.name}
                          </Link>
                        </td>
                        <td className="center">
                          <span className="text-green">{entry.wins}</span>
                          <span className="text-muted">-</span>
                          <span className="text-red">{entry.losses}</span>
                        </td>
                        <td className="center" style={{ color: 'var(--green)' }}>
                          {entry.win_rate}%
                        </td>
                        <td className={`right ${entry.net_profit >= 0 ? 'text-green' : 'text-red'}`}>
                          {entry.net_profit >= 0 ? '+' : ''}{entry.net_profit.toFixed(2)}
                        </td>
                        <td className="center">
                          {entry.current_streak > 0 && (
                            <span style={{ color: 'var(--yellow)' }}>🔥{entry.current_streak}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* API Reference */}
      <div className="panel" style={{ marginTop: '8px' }}>
        <div className="panel-header">
          API Reference
        </div>
        <div className="panel-body" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <code>POST /api/rps/create</code>
            <code>POST /api/rps/challenge/:id</code>
            <code>POST /api/rps/play/:id</code>
            <code>GET /api/rps/open</code>
            <code>GET /api/rps/game/:id</code>
          </div>
        </div>
      </div>
    </div>
  )
}
