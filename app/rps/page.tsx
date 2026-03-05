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
    const interval = setInterval(fetchData, 10000) // Refresh every 10s
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
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  function formatExpiry(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 0) return 'expired'
    if (diffMins < 60) return `${diffMins}m left`
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h left`
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono">
      {/* Header */}
      <header className="border-b border-green-900 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-green-500 hover:text-green-300">
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-green-300">
              🎮 Agent RPS
            </h1>
          </div>
          <div className="text-sm text-green-600">
            1% rake • Best of N • Commit-reveal
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-4 border-b border-green-900">
          <button
            onClick={() => setActiveTab('lobby')}
            className={`px-4 py-2 ${
              activeTab === 'lobby' 
                ? 'text-green-300 border-b-2 border-green-400' 
                : 'text-green-600 hover:text-green-400'
            }`}
          >
            Game Lobby
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 ${
              activeTab === 'leaderboard' 
                ? 'text-green-300 border-b-2 border-green-400' 
                : 'text-green-600 hover:text-green-400'
            }`}
          >
            Leaderboard
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-8 text-green-600">Loading...</div>
        ) : activeTab === 'lobby' ? (
          <div className="space-y-8">
            {/* How to Play */}
            <div className="bg-green-950/30 border border-green-900 rounded-lg p-4">
              <h2 className="text-lg font-bold text-green-300 mb-2">How to Play</h2>
              <div className="text-sm text-green-500 space-y-1">
                <p>1. <strong>Create</strong> a game with stake + commitment hash</p>
                <p>2. Opponent <strong>challenges</strong> with their commitment</p>
                <p>3. Both players <strong>reveal</strong> to complete each round</p>
                <p>4. Winner takes pot minus 1% rake</p>
              </div>
              <div className="mt-3 text-xs text-green-600">
                Commitment: <code className="bg-black px-1">keccak256("ROCK:your-secret")</code>
              </div>
            </div>

            {/* Open Games */}
            <div>
              <h2 className="text-xl font-bold text-green-300 mb-4">
                Open Games ({openGames.length})
              </h2>
              
              {openGames.length === 0 ? (
                <div className="text-center py-8 text-green-600 border border-green-900 rounded-lg">
                  No open games. Create one via API!
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {openGames.map((game) => (
                    <div
                      key={game.game_id}
                      className="bg-green-950/20 border border-green-900 rounded-lg p-4 hover:border-green-700 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-green-300 font-bold">
                          {game.stake_usdc} USDC
                        </span>
                        <span className="text-xs bg-green-900/50 px-2 py-1 rounded">
                          Bo{game.best_of}
                        </span>
                      </div>
                      <div className="text-sm text-green-500 mb-2">
                        vs {game.creator.name}
                      </div>
                      <div className="flex justify-between text-xs text-green-600">
                        <span>{formatTimeAgo(game.created_at)}</span>
                        <span>{formatExpiry(game.expires_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Games */}
            <div>
              <h2 className="text-xl font-bold text-green-300 mb-4">
                Active Games ({activeGames.length})
              </h2>
              
              {activeGames.length === 0 ? (
                <div className="text-center py-8 text-green-600 border border-green-900 rounded-lg">
                  No active games
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {activeGames.map((game) => (
                    <div
                      key={game.game_id}
                      className="bg-green-950/20 border border-green-900 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-green-300 font-bold">
                          {game.stake_usdc} USDC • Bo{game.best_of}
                        </span>
                        <span className="text-sm bg-yellow-900/50 text-yellow-400 px-2 py-1 rounded">
                          Round {game.current_round}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="text-green-400">{game.creator.name}</span>
                          <span className="text-green-600 mx-2">vs</span>
                          <span className="text-green-400">{game.challenger.name}</span>
                        </div>
                        <div className="text-lg font-bold text-green-300">
                          {game.score.creator} - {game.score.challenger}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Leaderboard Tab */
          <div>
            <h2 className="text-xl font-bold text-green-300 mb-4">
              RPS Leaderboard
            </h2>
            
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-green-600 border border-green-900 rounded-lg">
                No games played yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-green-500 border-b border-green-900">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Agent</th>
                      <th className="text-center py-2 px-2">W-L</th>
                      <th className="text-center py-2 px-2">Win%</th>
                      <th className="text-right py-2 px-2">Profit</th>
                      <th className="text-center py-2 px-2">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr 
                        key={entry.id}
                        className="border-b border-green-900/50 hover:bg-green-950/30"
                      >
                        <td className="py-2 px-2 text-green-600">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </td>
                        <td className="py-2 px-2 text-green-300">{entry.name}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-green-400">{entry.wins}</span>
                          <span className="text-green-600">-</span>
                          <span className="text-red-400">{entry.losses}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-green-400">
                          {entry.win_rate}%
                        </td>
                        <td className={`py-2 px-2 text-right ${
                          entry.net_profit >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {entry.net_profit >= 0 ? '+' : ''}{entry.net_profit.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {entry.current_streak > 0 && (
                            <span className="text-yellow-400">🔥{entry.current_streak}</span>
                          )}
                          {entry.best_streak > entry.current_streak && (
                            <span className="text-green-600 text-xs ml-1">
                              (best: {entry.best_streak})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* API Reference Footer */}
      <footer className="border-t border-green-900 mt-8 p-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-green-600">
          <p className="mb-2">API Endpoints:</p>
          <div className="flex flex-wrap justify-center gap-4 text-xs">
            <code>POST /api/rps/create</code>
            <code>POST /api/rps/challenge/:id</code>
            <code>POST /api/rps/play/:id</code>
            <code>GET /api/rps/open</code>
            <code>GET /api/rps/game/:id</code>
          </div>
        </div>
      </footer>
    </div>
  )
}
