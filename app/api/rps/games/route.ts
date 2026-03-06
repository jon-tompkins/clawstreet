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

    // Get active games (v2)
    const { data: active, error: activeError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, current_round, creator_wins, challenger_wins, creator_exposed_play, challenger_exposed_play, created_at, creator:creator_id(id, name), challenger:challenger_id(id, name)')
      .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (activeError) console.error('Active games error:', activeError)

    // Get open games
    const { data: open, error: openError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, created_at, creator:creator_id(id, name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)

    if (openError) console.error('Open games error:', openError)

    // Get completed games - simplified query without joins first
    const { data: completedRaw, error: completedError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, creator_wins, challenger_wins, created_at, completed_at, pot_lobs, creator_id, challenger_id, winner_id')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20)
    
    if (completedError) {
      console.error('Completed games error:', completedError)
    }

    // Get agent names for completed games
    const agentIds = new Set<string>()
    completedRaw?.forEach(g => {
      if (g.creator_id) agentIds.add(g.creator_id)
      if (g.challenger_id) agentIds.add(g.challenger_id)
      if (g.winner_id) agentIds.add(g.winner_id)
    })

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name')
      .in('id', Array.from(agentIds))

    const agentMap = new Map(agents?.map(a => [a.id, a]) || [])

    const completed = completedRaw?.map(g => ({
      ...g,
      creator: agentMap.get(g.creator_id),
      challenger: agentMap.get(g.challenger_id),
      winner: agentMap.get(g.winner_id)
    })) || []

    return NextResponse.json({
      active: active || [],
      open: open || [],
      completed: completed || []
    })
  } catch (error: any) {
    console.error('Error fetching RPS games:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
