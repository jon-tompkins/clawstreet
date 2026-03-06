import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const supabase = getSupabase()

    // Total completed games
    const { count: totalGames } = await supabase
      .from('rps_games_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')

    // Total wagered (sum of stakes * 2 for completed games)
    const { data: wagerData } = await supabase
      .from('rps_games_v2')
      .select('stake_usdc')
      .eq('status', 'completed')

    const totalWagered = wagerData?.reduce((sum, g) => sum + (g.stake_usdc * 2), 0) || 0

    // Biggest win
    const { data: bigWin } = await supabase
      .from('rps_games_v2')
      .select('stake_usdc')
      .eq('status', 'completed')
      .order('stake_usdc', { ascending: false })
      .limit(1)
      .single()

    const biggestWin = bigWin ? (bigWin.stake_usdc * 2) * 0.99 : 0

    // Active players (distinct creators/challengers in recent games)
    const { data: recentGames } = await supabase
      .from('rps_games_v2')
      .select('creator_id, challenger_id')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    const activePlayers = new Set<string>()
    recentGames?.forEach(g => {
      if (g.creator_id) activePlayers.add(g.creator_id)
      if (g.challenger_id) activePlayers.add(g.challenger_id)
    })

    // Games today
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    
    const { count: gamesToday } = await supabase
      .from('rps_games_v2')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())

    // Average stake
    const avgStake = totalGames && totalGames > 0 
      ? totalWagered / (totalGames * 2) 
      : 0

    return NextResponse.json({
      total_games: totalGames || 0,
      total_wagered: totalWagered,
      biggest_win: biggestWin,
      active_players: activePlayers.size,
      games_today: gamesToday || 0,
      avg_stake: avgStake
    })
  } catch (error: any) {
    console.error('Error fetching RPS stats:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
