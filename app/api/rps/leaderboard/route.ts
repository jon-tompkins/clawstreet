import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sort = searchParams.get('sort') || 'wins'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    const supabase = getSupabase()

    // Get all completed games from v2
    const { data: games, error } = await supabase
      .from('rps_games_v2')
      .select('creator_id, challenger_id, winner_id, stake_usdc')
      .eq('status', 'completed')

    if (error) throw error

    // Calculate stats per agent
    const statsMap = new Map<string, {
      wins: number
      losses: number
      draws: number
      total_won: number
      total_lost: number
    }>()

    games?.forEach(g => {
      const stake = g.stake_usdc || 0
      const winnings = stake * 2 * 0.99 // After rake
      const isDraw = !g.winner_id // No winner = draw

      // Creator stats
      if (g.creator_id) {
        const s = statsMap.get(g.creator_id) || { wins: 0, losses: 0, draws: 0, total_won: 0, total_lost: 0 }
        if (isDraw) {
          s.draws++
          // Draws return stakes (no profit, no loss)
        } else if (g.winner_id === g.creator_id) {
          s.wins++
          s.total_won += winnings
        } else {
          s.losses++
          s.total_lost += stake
        }
        statsMap.set(g.creator_id, s)
      }

      // Challenger stats
      if (g.challenger_id) {
        const s = statsMap.get(g.challenger_id) || { wins: 0, losses: 0, draws: 0, total_won: 0, total_lost: 0 }
        if (isDraw) {
          s.draws++
          // Draws return stakes (no profit, no loss)
        } else if (g.winner_id === g.challenger_id) {
          s.wins++
          s.total_won += winnings
        } else {
          s.losses++
          s.total_lost += stake
        }
        statsMap.set(g.challenger_id, s)
      }
    })

    // Get agent names
    const agentIds = Array.from(statsMap.keys())
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name')
      .in('id', agentIds)

    const agentMap = new Map(agents?.map(a => [a.id, a.name]) || [])

    // Build leaderboard
    let leaderboard = Array.from(statsMap.entries()).map(([id, s]) => {
      const decided = s.wins + s.losses // Games with a winner
      return {
        id,
        name: agentMap.get(id) || 'Unknown',
        games_played: s.wins + s.losses + s.draws,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        win_rate: decided > 0 ? Math.round((s.wins / decided) * 100) : 0,
        net_profit: s.total_won - s.total_lost,
        total_winnings: s.total_won,
        total_wagered: s.total_lost + s.total_won
      }
    })

    // Sort
    if (sort === 'money' || sort === 'profit') {
      leaderboard.sort((a, b) => b.net_profit - a.net_profit)
    } else {
      leaderboard.sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate)
    }

    leaderboard = leaderboard.slice(0, limit)

    return NextResponse.json({
      leaderboard,
      sort,
      total: leaderboard.length,
      _debug: {
        games_queried: games?.length || 0,
        unique_agents: statsMap.size,
        version: '2026-03-10-v3',
        env_check: {
          has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          has_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          url_preview: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30)
        },
        error_if_any: error?.message || null,
        first_game: games?.[0] || null,
        all_game_ids: games?.map(g => g.creator_id?.slice(0,8)) || []
      }
    })

  } catch (error: any) {
    console.error('RPS leaderboard error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
