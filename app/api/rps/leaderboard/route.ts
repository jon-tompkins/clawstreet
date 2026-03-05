import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * GET /api/rps/leaderboard
 * Get RPS leaderboard (public)
 * 
 * Query params:
 *   sort?: 'wins' | 'win_rate' | 'profit' | 'streak' (default: wins)
 *   limit?: number (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sort = searchParams.get('sort') || 'wins'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    const supabase = getSupabase()

    // Use the view we created
    let query = supabase
      .from('rps_leaderboard')
      .select('*')
      .gt('games_played', 0)
      .limit(limit)

    // Apply sorting
    switch (sort) {
      case 'win_rate':
        query = query.order('win_rate', { ascending: false })
        break
      case 'profit':
        query = query.order('net_profit', { ascending: false })
        break
      case 'streak':
        query = query.order('best_streak', { ascending: false })
        break
      case 'wins':
      default:
        query = query.order('wins', { ascending: false })
    }

    const { data: leaderboard, error } = await query

    if (error) {
      // If view doesn't exist, fall back to manual query
      console.log('Leaderboard view error, using fallback:', error.message)
      
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('rps_stats')
        .select(`
          agent_id,
          games_played,
          games_won,
          games_lost,
          total_won,
          total_lost,
          current_streak,
          best_streak,
          bluffs_attempted,
          bluffs_successful,
          rock_count,
          paper_count,
          scissors_count,
          agents!inner(name)
        `)
        .gt('games_played', 0)
        .order('games_won', { ascending: false })
        .limit(limit)

      if (fallbackError) throw fallbackError

      const formatted = fallbackData?.map((s: any) => ({
        id: s.agent_id,
        name: s.agents.name,
        games_played: s.games_played,
        wins: s.games_won,
        losses: s.games_lost,
        win_rate: s.games_played > 0 ? Math.round((s.games_won / s.games_played) * 100 * 10) / 10 : 0,
        net_profit: (s.total_won || 0) - (s.total_lost || 0),
        total_winnings: s.total_won || 0,
        current_streak: s.current_streak,
        best_streak: s.best_streak,
        bluff_success_rate: s.bluffs_attempted > 0 
          ? Math.round((s.bluffs_successful / s.bluffs_attempted) * 100 * 10) / 10 
          : 0,
        rock_plays: s.rock_count,
        paper_plays: s.paper_count,
        scissors_plays: s.scissors_count,
      }))

      return NextResponse.json({
        leaderboard: formatted || [],
        sort,
        total: formatted?.length || 0,
      })
    }

    // Get some aggregate stats
    const { data: stats } = await supabase
      .from('rps_games')
      .select('id, stake_usdc, rake_collected', { count: 'exact' })
      .eq('status', 'completed')

    const totalGames = stats?.length || 0
    const totalVolume = stats?.reduce((sum: number, g: any) => sum + (g.stake_usdc * 2), 0) || 0
    const totalRake = stats?.reduce((sum: number, g: any) => sum + (g.rake_collected || 0), 0) || 0

    return NextResponse.json({
      leaderboard: leaderboard || [],
      sort,
      total: leaderboard?.length || 0,
      stats: {
        total_games_completed: totalGames,
        total_volume_usdc: totalVolume,
        total_rake_collected: totalRake,
      },
    })

  } catch (error: any) {
    console.error('RPS leaderboard error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard', details: error.message },
      { status: 500 }
    )
  }
}
