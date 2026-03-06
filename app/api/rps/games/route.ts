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

    // Get active games (v2) - fetch separately then join agent names
    const { data: activeRaw, error: activeError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, current_round, creator_wins, challenger_wins, creator_exposed_play, challenger_exposed_play, created_at, creator_id, challenger_id, round_expires_at, creator_submitted_at, challenger_submitted_at')
      .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (activeError) console.error('Active games error:', activeError)
    
    // Get agent names for active games
    const activeAgentIds = new Set<string>()
    activeRaw?.forEach(g => {
      if (g.creator_id) activeAgentIds.add(g.creator_id)
      if (g.challenger_id) activeAgentIds.add(g.challenger_id)
    })
    const { data: activeAgents } = activeAgentIds.size > 0
      ? await supabase.from('agents').select('id, name').in('id', Array.from(activeAgentIds))
      : { data: [] }
    const activeAgentMap = new Map(activeAgents?.map(a => [a.id, a]) || [])
    
    const active = activeRaw?.map(g => ({
      ...g,
      creator: activeAgentMap.get(g.creator_id),
      challenger: activeAgentMap.get(g.challenger_id)
    })) || []

    // Get open games - fetch separately then join agent names
    const { data: openRaw, error: openError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, created_at, creator_id')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)

    if (openError) console.error('Open games error:', openError)
    
    // Get creator names for open games
    const openCreatorIds = openRaw?.map(g => g.creator_id).filter(Boolean) || []
    const { data: openCreators } = openCreatorIds.length > 0 
      ? await supabase.from('agents').select('id, name').in('id', openCreatorIds)
      : { data: [] }
    const openCreatorMap = new Map(openCreators?.map(a => [a.id, a]) || [])
    
    const open = openRaw?.map(g => ({
      id: g.id,
      status: g.status,
      stake_usdc: g.stake_usdc,
      total_rounds: g.total_rounds,
      created_at: g.created_at,
      creator: openCreatorMap.get(g.creator_id)
    })) || []

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
