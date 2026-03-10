'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import Link from 'next/link'

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B'
const RPC = 'https://mainnet.base.org'

const ESCROW_ABI = [
  'event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf)',
  'event GameChallenged(bytes32 indexed gameId, address indexed challenger)',
  'event PlayRevealed(bytes32 indexed gameId, uint8 round, address indexed player, uint8 play)',
  'event RoundComplete(bytes32 indexed gameId, uint8 round, address winner)',
  'event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake)',
  'event GameCancelled(bytes32 indexed gameId, address indexed by)',
  'function getGame(bytes32) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))',
  'function totalVolume() view returns (uint256)',
  'function totalRakeCollected() view returns (uint256)',
]

const PLAY_NAMES: Record<number, string> = {
  0: '❓',
  1: '🪨 Rock',
  2: '📄 Paper', 
  3: '✂️ Scissors',
}

const STATUS_NAMES: Record<number, string> = {
  0: '🟡 Open',
  1: '🟢 Active',
  2: '✅ Complete',
  3: '❌ Cancelled',
  4: '⏰ Expired',
}

// Known agent addresses
const KNOWN_AGENTS: Record<string, string> = {
  '0x8f71727a6576a663d9387cf0980739a271be0e76': 'Jai-Alpha',
  '0xb01b6917cc50057cb12736b51bf6895ab144d7e6': 'MomentumBot',
  '0xd50bbd13be310812884dc6ff0c42cf05dd390810': 'RandomWalker',
  '0x7d192bd4f587e06c62677ba2809dddb9b603be7c': 'Contrarian',
}

function shortenAddress(addr: string): string {
  const lower = addr.toLowerCase()
  return KNOWN_AGENTS[lower] || `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

interface GameData {
  gameId: string
  creator: string
  challenger: string
  stake: bigint
  bestOf: number
  status: number
  winner: string
  creatorWins: number
  challengerWins: number
  createdAt: number
  plays: { round: number; player: string; play: number }[]
}

export default function RPSExplorer() {
  const [games, setGames] = useState<GameData[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ volume: 0n, rake: 0n, gameCount: 0 })

  useEffect(() => {
    loadGames()
  }, [])

  // Known game IDs (populated from TX logs, fallback for RPC indexing issues)
  const KNOWN_GAME_IDS = [
    '0x795894cccd79ad58152bbb3b19c6337941686d34ef032f0e3db80b5f3a9df5ee',
  ]

  async function loadGames() {
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const contract = new ethers.Contract(ESCROW, ESCROW_ABI, provider)

      // Get stats
      const [volume, rake] = await Promise.all([
        contract.totalVolume(),
        contract.totalRakeCollected(),
      ])

      const gameMap = new Map<string, GameData>()

      // First try events (may fail on some RPCs)
      try {
        const filter = contract.filters.GameCreated()
        const currentBlock = await provider.getBlockNumber()
        const fromBlock = Math.max(0, currentBlock - 5000) // ~25 min
        const events = await contract.queryFilter(filter, fromBlock)

        for (const event of events) {
          const args = (event as ethers.EventLog).args
          const gameId = args[0]
          if (!gameMap.has(gameId)) {
            KNOWN_GAME_IDS.push(gameId) // Add to known list
          }
        }
      } catch (err) {
        console.log('Event query failed, using known games')
      }

      // Load all known games directly
      for (const gameId of KNOWN_GAME_IDS) {
        try {
          const game = await contract.getGame(gameId)
          if (game.creator !== '0x0000000000000000000000000000000000000000') {
            gameMap.set(gameId, {
              gameId,
              creator: game.creator,
              challenger: game.challenger,
              stake: game.stake,
              bestOf: game.bestOf,
              status: game.status,
              winner: game.winner,
              creatorWins: game.creatorWins,
              challengerWins: game.challengerWins,
              createdAt: Number(game.createdAt),
              plays: [],
            })
          }
        } catch (err) {
          console.log('Failed to load game:', gameId)
        }
      }

      // Try to get revealed plays
      try {
        const revealFilter = contract.filters.PlayRevealed()
        const currentBlock = await provider.getBlockNumber()
        const revealEvents = await contract.queryFilter(revealFilter, currentBlock - 5000)
        
        for (const event of revealEvents) {
          const args = (event as ethers.EventLog).args
          const gameId = args[0]
          const gameData = gameMap.get(gameId)
          if (gameData) {
            gameData.plays.push({
              round: args[1],
              player: args[2],
              play: args[3],
            })
          }
        }
      } catch (err) {
        console.log('Play events query failed')
      }

      const gamesArray = Array.from(gameMap.values())
        .sort((a, b) => b.createdAt - a.createdAt)

      setGames(gamesArray)
      setStats({ volume, rake, gameCount: gamesArray.length })
      setLoading(false)
    } catch (err) {
      console.error('Failed to load games:', err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">🎮 RPS Explorer</h1>
          <Link href="/rps" className="text-blue-400 hover:underline">
            ← Back to RPS
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              ${(Number(stats.volume) / 1e6).toFixed(2)}
            </div>
            <div className="text-gray-400 text-sm">Total Volume</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              ${(Number(stats.rake) / 1e6).toFixed(4)}
            </div>
            <div className="text-gray-400 text-sm">Rake Collected</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {stats.gameCount}
            </div>
            <div className="text-gray-400 text-sm">Games</div>
          </div>
        </div>

        {/* Contract Link */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="text-gray-400 text-sm mb-1">Contract</div>
          <a 
            href={`https://basescan.org/address/${ESCROW}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline font-mono text-sm"
          >
            {ESCROW}
          </a>
        </div>

        {/* Games List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            Loading on-chain games...
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No games found yet
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <GameCard key={game.gameId} game={game} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GameCard({ game }: { game: GameData }) {
  const stakeUSD = Number(game.stake) / 1e6
  const hasChallenger = game.challenger !== '0x0000000000000000000000000000000000000000'
  
  // Group plays by player
  const creatorPlays = game.plays.filter(p => p.player.toLowerCase() === game.creator.toLowerCase())
  const challengerPlays = game.plays.filter(p => p.player.toLowerCase() === game.challenger.toLowerCase())

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className="text-lg font-bold">${stakeUSD.toFixed(2)}</span>
          <span className="text-gray-400 ml-2">Best of {game.bestOf}</span>
        </div>
        <span className="text-sm">{STATUS_NAMES[game.status]}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* Creator */}
        <div className={`p-3 rounded ${game.status === 2 && game.winner.toLowerCase() === game.creator.toLowerCase() ? 'bg-green-900/30 border border-green-500' : 'bg-gray-700/50'}`}>
          <div className="text-sm text-gray-400">Creator</div>
          <div className="font-medium">{shortenAddress(game.creator)}</div>
          <div className="text-sm mt-1">
            Wins: {game.creatorWins}
            {creatorPlays.length > 0 && (
              <span className="ml-2">
                {creatorPlays.map((p, i) => (
                  <span key={i} className="mr-1">{PLAY_NAMES[p.play]?.split(' ')[0]}</span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Challenger */}
        <div className={`p-3 rounded ${game.status === 2 && game.winner.toLowerCase() === game.challenger.toLowerCase() ? 'bg-green-900/30 border border-green-500' : 'bg-gray-700/50'}`}>
          <div className="text-sm text-gray-400">Challenger</div>
          <div className="font-medium">
            {hasChallenger ? shortenAddress(game.challenger) : '—'}
          </div>
          <div className="text-sm mt-1">
            Wins: {game.challengerWins}
            {challengerPlays.length > 0 && (
              <span className="ml-2">
                {challengerPlays.map((p, i) => (
                  <span key={i} className="mr-1">{PLAY_NAMES[p.play]?.split(' ')[0]}</span>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Winner */}
      {game.status === 2 && game.winner !== '0x0000000000000000000000000000000000000000' && (
        <div className="text-center py-2 bg-green-900/20 rounded text-green-400">
          🏆 Winner: {shortenAddress(game.winner)}
        </div>
      )}

      {/* Game ID */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <a
          href={`https://basescan.org/address/${ESCROW}#events`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-blue-400 font-mono"
        >
          {game.gameId.slice(0, 18)}...
        </a>
        <span className="text-xs text-gray-600 ml-2">
          {new Date(game.createdAt * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  )
}
