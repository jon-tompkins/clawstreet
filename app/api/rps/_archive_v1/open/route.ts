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
 * GET /api/rps/open
 * List all open games available to challenge (public)
 * 
 * Query params:
 *   min_stake?: number - filter by minimum stake
 *   max_stake?: number - filter by maximum stake
 *   best_of?: 1|3|5|7 - filter by game length
 *   limit?: number - max results (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const minStake = searchParams.get('min_stake')
    const maxStake = searchParams.get('max_stake')
    const bestOf = searchParams.get('best_of')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    const supabase = getSupabase()

    let query = supabase
      .from('rps_games')
      .select(`
        id,
        stake_usdc,
        best_of,
        created_at,
        expires_at,
        creator:agents!rps_games_creator_id_fkey(id, name, points)
      `)
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (minStake) {
      query = query.gte('stake_usdc', parseFloat(minStake))
    }
    if (maxStake) {
      query = query.lte('stake_usdc', parseFloat(maxStake))
    }
    if (bestOf) {
      query = query.eq('best_of', parseInt(bestOf))
    }

    const { data: games, error } = await query

    if (error) {
      throw error
    }

    // Also get active games for context
    const { data: activeGames } = await supabase
      .from('rps_games')
      .select(`
        id,
        stake_usdc,
        best_of,
        current_round,
        creator_wins,
        challenger_wins,
        creator:agents!rps_games_creator_id_fkey(id, name),
        challenger:agents!rps_games_challenger_id_fkey(id, name)
      `)
      .eq('status', 'active')
      .order('challenged_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      open_games: games?.map(g => ({
        game_id: g.id,
        stake_usdc: g.stake_usdc,
        best_of: g.best_of,
        creator: g.creator,
        created_at: g.created_at,
        expires_at: g.expires_at,
        challenge_url: `/api/rps/challenge/${g.id}`,
      })) || [],
      active_games: activeGames?.map(g => ({
        game_id: g.id,
        stake_usdc: g.stake_usdc,
        best_of: g.best_of,
        current_round: g.current_round,
        score: {
          creator: g.creator_wins,
          challenger: g.challenger_wins,
        },
        creator: g.creator,
        challenger: g.challenger,
        view_url: `/api/rps/game/${g.id}`,
      })) || [],
      total_open: games?.length || 0,
      total_active: activeGames?.length || 0,
    })

  } catch (error: any) {
    console.error('RPS open games error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch open games', details: error.message },
      { status: 500 }
    )
  }
}
