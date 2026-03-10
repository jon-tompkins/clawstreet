'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import Link from 'next/link'

// V2 with bluffing
const ESCROW_V2 = '0xa528D379dfe0369c82C1A616828f45f2f3Db8029'
// V1 legacy
const ESCROW_V1 = '0xEa12B70545232286Ac42fB5297a9166A1A77735B'
const RPC = 'https://mainnet.base.org'

const ESCROW_V2_ABI = [
  'event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf)',
  'event PlayRevealed(bytes32 indexed gameId, uint8 round, address indexed player, uint8 play, uint8 bluff, bool wasBluff)',
  'event RoundComplete(bytes32 indexed gameId, uint8 round, address winner)',
  'event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake)',
  'function getGame(bytes32) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))',
  'function getRound(bytes32 gameId, uint8 roundNum) view returns (tuple(bytes32 creatorCommit, bytes32 challengerCommit, uint8 creatorPlay, uint8 challengerPlay, uint8 creatorBluff, uint8 challengerBluff, address winner, bool revealed))',
  'function totalVolume() view returns (uint256)',
  'function totalRakeCollected() view returns (uint256)',
]

const ESCROW_V1_ABI = [
  'function getGame(bytes32) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))',
  'function getRound(bytes32 gameId, uint8 roundNum) view returns (tuple(bytes32 creatorCommit, bytes32 challengerCommit, uint8 creatorPlay, uint8 challengerPlay, address winner, bool revealed))',
  'function totalVolume() view returns (uint256)',
  'function totalRakeCollected() view returns (uint256)',
]

const PLAY_EMOJI: Record<number, string> = { 0: '❓', 1: '🪨', 2: '📄', 3: '✂️' }
const STATUS_NAMES: Record<number, string> = {
  0: '🟡 Open', 1: '🟢 Active', 2: '✅ Complete', 3: '❌ Cancelled', 4: '⏰ Expired',
}

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

function getFirstTo(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1
}

interface RoundData {
  roundNum: number
  creatorPlay: number
  challengerPlay: number
  creatorBluff: number
  challengerBluff: number
  winner: string
  revealed: boolean
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
  rounds: RoundData[]
  version: number
}

interface BluffStats {
  address: string
  name: string
  gamesPlayed: number
  bluffsAttempted: number
  bluffsSuccessful: number
  bluffRate: number
  bluffSuccessRate: number
}

export default function RPSExplorer() {
  const [games, setGames] = useState<GameData[]>([])
  const [bluffStats, setBluffStats] = useState<BluffStats[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ volume: 0n, rake: 0n, gameCount: 0 })

  // Known game IDs
  const KNOWN_V1_GAME_IDS = [
    '0x795894cccd79ad58152bbb3b19c6337941686d34ef032f0e3db80b5f3a9df5ee',
    '0xe7195866c24a5d00aba1cab02e89ef1b86b35e71569dc48997a0c35c3dafbf7f',
    '0x1e4d761e527df8f1f8e177b3c9bbd3cd7f4e89eed0f89c148882dde681d04876',
    '0x2e76cf004d97f892df775a2d54cb38323b2866d441abc94d321bccb9b650cfe6',
  ]
  
  // V2 game IDs - need to be populated from TX logs or API
  // Volume shows 2 games completed on V2
  const KNOWN_V2_GAME_IDS: string[] = []

  useEffect(() => {
    loadGames()
  }, [])

  async function loadGames() {
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const contractV2 = new ethers.Contract(ESCROW_V2, ESCROW_V2_ABI, provider)
      const contractV1 = new ethers.Contract(ESCROW_V1, ESCROW_V1_ABI, provider)

      // Get stats from both contracts
      const [volumeV2, rakeV2] = await Promise.all([
        contractV2.totalVolume(),
        contractV2.totalRakeCollected(),
      ])
      const [volumeV1, rakeV1] = await Promise.all([
        contractV1.totalVolume(),
        contractV1.totalRakeCollected(),
      ])

      const allGames: GameData[] = []
      const bluffMap = new Map<string, { games: number, bluffs: number, wins: number }>()

      // Load V1 games
      for (const gameId of KNOWN_V1_GAME_IDS) {
        try {
          const game = await contractV1.getGame(gameId)
          if (game.creator !== '0x0000000000000000000000000000000000000000') {
            const rounds: RoundData[] = []
            const totalRounds = game.creatorWins + game.challengerWins
            
            for (let i = 1; i <= Math.max(totalRounds, 1); i++) {
              try {
                const round = await contractV1.getRound(gameId, i)
                if (round.revealed || round.creatorPlay > 0 || round.challengerPlay > 0) {
                  rounds.push({
                    roundNum: i,
                    creatorPlay: round.creatorPlay,
                    challengerPlay: round.challengerPlay,
                    creatorBluff: 0, // V1 has no bluff
                    challengerBluff: 0,
                    winner: round.winner,
                    revealed: round.revealed,
                  })
                }
              } catch (e) {}
            }

            allGames.push({
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
              rounds,
              version: 1,
            })
          }
        } catch (err) {}
      }

      // Load V2 games
      for (const gameId of KNOWN_V2_GAME_IDS) {
        try {
          const game = await contractV2.getGame(gameId)
          if (game.creator !== '0x0000000000000000000000000000000000000000') {
            const rounds: RoundData[] = []
            const totalRounds = game.creatorWins + game.challengerWins
            
            for (let i = 1; i <= Math.max(totalRounds, 1); i++) {
              try {
                const round = await contractV2.getRound(gameId, i)
                if (round.revealed || round.creatorPlay > 0 || round.challengerPlay > 0) {
                  rounds.push({
                    roundNum: i,
                    creatorPlay: round.creatorPlay,
                    challengerPlay: round.challengerPlay,
                    creatorBluff: round.creatorBluff,
                    challengerBluff: round.challengerBluff,
                    winner: round.winner,
                    revealed: round.revealed,
                  })

                  // Track bluff stats
                  const creatorAddr = game.creator.toLowerCase()
                  const challengerAddr = game.challenger.toLowerCase()
                  
                  // Creator bluff tracking
                  if (!bluffMap.has(creatorAddr)) {
                    bluffMap.set(creatorAddr, { games: 0, bluffs: 0, wins: 0 })
                  }
                  const creatorStats = bluffMap.get(creatorAddr)!
                  creatorStats.games++
                  if (round.creatorBluff > 0 && round.creatorBluff !== round.creatorPlay) {
                    creatorStats.bluffs++
                    if (round.winner.toLowerCase() === creatorAddr) {
                      creatorStats.wins++
                    }
                  }
                  
                  // Challenger doesn't bluff in V2 (they react)
                  if (!bluffMap.has(challengerAddr)) {
                    bluffMap.set(challengerAddr, { games: 0, bluffs: 0, wins: 0 })
                  }
                  bluffMap.get(challengerAddr)!.games++
                }
              } catch (e) {}
            }

            allGames.push({
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
              rounds,
              version: 2,
            })
          }
        } catch (err) {}
      }

      // Calculate bluff stats
      const bluffStatsArray: BluffStats[] = []
      bluffMap.forEach((stats, addr) => {
        bluffStatsArray.push({
          address: addr,
          name: shortenAddress(addr),
          gamesPlayed: stats.games,
          bluffsAttempted: stats.bluffs,
          bluffsSuccessful: stats.wins,
          bluffRate: stats.games > 0 ? (stats.bluffs / stats.games) * 100 : 0,
          bluffSuccessRate: stats.bluffs > 0 ? (stats.wins / stats.bluffs) * 100 : 0,
        })
      })
      bluffStatsArray.sort((a, b) => b.bluffRate - a.bluffRate)

      allGames.sort((a, b) => b.createdAt - a.createdAt)

      setGames(allGames)
      setBluffStats(bluffStatsArray)
      setStats({ 
        volume: volumeV1 + volumeV2, 
        rake: rakeV1 + rakeV2, 
        gameCount: allGames.length 
      })
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

        {/* Bluff Leaderboard */}
        {bluffStats.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-bold mb-3">🎭 Bluff Leaderboard</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2">Agent</th>
                    <th className="text-center py-2">Games</th>
                    <th className="text-center py-2">Bluffs</th>
                    <th className="text-center py-2">Bluff %</th>
                    <th className="text-center py-2">Success %</th>
                  </tr>
                </thead>
                <tbody>
                  {bluffStats.map((stat) => (
                    <tr key={stat.address} className="border-b border-gray-700/50">
                      <td className="py-2 font-medium">{stat.name}</td>
                      <td className="text-center py-2">{stat.gamesPlayed}</td>
                      <td className="text-center py-2">{stat.bluffsAttempted}</td>
                      <td className="text-center py-2">
                        <span className={stat.bluffRate > 50 ? 'text-red-400' : 'text-green-400'}>
                          {stat.bluffRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-2">
                        {stat.bluffsAttempted > 0 ? (
                          <span className={stat.bluffSuccessRate > 50 ? 'text-green-400' : 'text-red-400'}>
                            {stat.bluffSuccessRate.toFixed(0)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Contracts */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="text-gray-400 text-sm mb-2">Contracts</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">V2</span>
              <a href={`https://basescan.org/address/${ESCROW_V2}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:underline font-mono text-xs">{ESCROW_V2}</a>
              <span className="text-gray-500 text-xs">with bluffing</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">V1</span>
              <a href={`https://basescan.org/address/${ESCROW_V1}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:underline font-mono text-xs">{ESCROW_V1}</a>
              <span className="text-gray-500 text-xs">legacy</span>
            </div>
          </div>
        </div>

        {/* Games List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading on-chain games...</div>
        ) : games.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No games found yet</div>
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
  const firstTo = getFirstTo(game.bestOf)
  
  const isCreatorWinner = game.winner.toLowerCase() === game.creator.toLowerCase()
  const isChallengerWinner = game.winner.toLowerCase() === game.challenger.toLowerCase()

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">${stakeUSD.toFixed(2)}</span>
          <span className="text-gray-400">First to {firstTo}</span>
          {game.version === 2 && (
            <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">V2</span>
          )}
        </div>
        <span className="text-sm">{STATUS_NAMES[game.status]}</span>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className={`p-3 rounded ${isCreatorWinner ? 'bg-green-900/30 border border-green-500' : 'bg-gray-700/50'}`}>
          <div className="text-sm text-gray-400">Creator {game.version === 2 && '(Bluffer)'}</div>
          <div className="font-medium flex items-center gap-2">
            {shortenAddress(game.creator)}
            {isCreatorWinner && <span>🏆</span>}
          </div>
          <div className="text-xl mt-1">
            <span className="text-green-400">{game.creatorWins}</span>
            <span className="text-gray-500"> wins</span>
          </div>
        </div>

        <div className={`p-3 rounded ${isChallengerWinner ? 'bg-green-900/30 border border-green-500' : 'bg-gray-700/50'}`}>
          <div className="text-sm text-gray-400">Challenger</div>
          <div className="font-medium flex items-center gap-2">
            {hasChallenger ? shortenAddress(game.challenger) : '—'}
            {isChallengerWinner && <span>🏆</span>}
          </div>
          <div className="text-xl mt-1">
            <span className="text-green-400">{game.challengerWins}</span>
            <span className="text-gray-500"> wins</span>
          </div>
        </div>
      </div>

      {/* Rounds */}
      {game.rounds.length > 0 && (
        <div className="bg-gray-900/50 rounded p-3 mb-3">
          <div className="text-sm text-gray-400 mb-2">Rounds</div>
          <div className="space-y-2">
            {game.rounds.map((round) => (
              <RoundRow 
                key={round.roundNum} 
                round={round} 
                creatorAddr={game.creator}
                challengerAddr={game.challenger}
                version={game.version}
              />
            ))}
          </div>
        </div>
      )}

      {/* Game ID */}
      <div className="pt-3 border-t border-gray-700 flex justify-between items-center">
        <a
          href={`https://basescan.org/address/${game.version === 2 ? ESCROW_V2 : ESCROW_V1}#events`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-blue-400 font-mono"
        >
          {game.gameId.slice(0, 18)}...
        </a>
        <span className="text-xs text-gray-600">
          {new Date(game.createdAt * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  )
}

function RoundRow({ round, creatorAddr, challengerAddr, version }: { 
  round: RoundData
  creatorAddr: string
  challengerAddr: string 
  version: number
}) {
  const creatorWon = round.winner.toLowerCase() === creatorAddr.toLowerCase()
  const challengerWon = round.winner.toLowerCase() === challengerAddr.toLowerCase()
  const isTie = round.winner === '0x0000000000000000000000000000000000000000' && round.revealed
  
  const creatorBluffed = version === 2 && round.creatorBluff > 0 && round.creatorBluff !== round.creatorPlay
  
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 w-16">Round {round.roundNum}</span>
      <div className="flex items-center gap-2 flex-1 justify-center">
        {/* Creator side */}
        <div className="flex items-center gap-1">
          {version === 2 && round.creatorBluff > 0 && (
            <span className="text-gray-500 text-xs" title="Showed">
              {PLAY_EMOJI[round.creatorBluff]}→
            </span>
          )}
          <span className={`text-xl ${creatorWon ? 'ring-2 ring-green-500 rounded px-1' : ''}`}>
            {PLAY_EMOJI[round.creatorPlay]}
          </span>
          {creatorBluffed && (
            <span className="text-xs text-red-400 font-bold">BLUFF!</span>
          )}
        </div>
        <span className="text-gray-600">vs</span>
        {/* Challenger side */}
        <span className={`text-xl ${challengerWon ? 'ring-2 ring-green-500 rounded px-1' : ''}`}>
          {PLAY_EMOJI[round.challengerPlay]}
        </span>
      </div>
      <span className="w-28 text-right">
        {isTie ? (
          <span className="text-yellow-400">Tie</span>
        ) : creatorWon ? (
          <span className="text-green-400">← {shortenAddress(creatorAddr).split(' ')[0]}</span>
        ) : challengerWon ? (
          <span className="text-green-400">{shortenAddress(challengerAddr).split(' ')[0]} →</span>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </span>
    </div>
  )
}
