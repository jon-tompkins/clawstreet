import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
  }

  try {
    // Get all completed games with count header
    const completedRes = await fetch(
      `${url}/rest/v1/rps_games_v2?status=eq.completed&select=id,stake_usdc,winner_id`,
      { headers, cache: 'no-store' }
    )
    const completedGames = await completedRes.json()
    const contentRange = completedRes.headers.get('content-range')
    const totalGames = contentRange ? parseInt(contentRange.split('/')[1]) : completedGames?.length || 0
    
    // Count draws (completed with no winner)
    const totalDraws = completedGames?.filter((g: any) => !g.winner_id).length || 0
    
    // Total wagered (stake * 2 for each completed game)
    const totalWagered = completedGames?.reduce((sum: number, g: any) => sum + (g.stake_usdc * 2), 0) || 0
    
    // Biggest win (highest stake * 2 * 0.99)
    const maxStake = Math.max(...(completedGames?.map((g: any) => g.stake_usdc) || [0]))
    const biggestWin = maxStake * 2 * 0.99

    // Active players (distinct in last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentRes = await fetch(
      `${url}/rest/v1/rps_games_v2?created_at=gte.${weekAgo}&select=creator_id,challenger_id`,
      { headers: { ...headers, 'Prefer': '' }, cache: 'no-store' }
    )
    const recentGames = await recentRes.json()
    
    const activePlayers = new Set<string>()
    recentGames?.forEach((g: any) => {
      if (g.creator_id) activePlayers.add(g.creator_id)
      if (g.challenger_id) activePlayers.add(g.challenger_id)
    })

    // Games today
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayRes = await fetch(
      `${url}/rest/v1/rps_games_v2?created_at=gte.${todayStart.toISOString()}&select=id`,
      { headers, cache: 'no-store' }
    )
    const todayRange = todayRes.headers.get('content-range')
    const gamesToday = todayRange ? parseInt(todayRange.split('/')[1]) : 0

    // Average stake
    const avgStake = totalGames > 0 ? totalWagered / (totalGames * 2) : 0

    return NextResponse.json({
      total_games: totalGames,
      total_draws: totalDraws,
      total_wagered: totalWagered,
      biggest_win: biggestWin,
      active_players: activePlayers.size,
      games_today: gamesToday,
      avg_stake: avgStake,
      _ts: Date.now()
    })
  } catch (error: any) {
    console.error('Error fetching RPS stats:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
