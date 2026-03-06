import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get active games
    const { data: activeRaw, error: activeError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, current_round, creator_wins, challenger_wins, creator_exposed_play, challenger_exposed_play, created_at, creator_id, challenger_id, round_expires_at, creator_submitted_at, challenger_submitted_at')
      .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (activeError) {
      console.error('Active games error:', activeError)
    }

    // Get open games
    const { data: openRaw, error: openError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, created_at, creator_id')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)

    if (openError) {
      console.error('Open games error:', openError)
    }

    // Get completed games
    const { data: completedRaw, error: completedError } = await supabase
      .from('rps_games_v2')
      .select('id, status, stake_usdc, total_rounds, creator_wins, challenger_wins, created_at, completed_at, pot_lobs, creator_id, challenger_id, winner_id')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20)

    if (completedError) {
      console.error('Completed games error:', completedError)
    }

    // Collect all agent IDs
    const agentIds = new Set<string>()
    activeRaw?.forEach(g => {
      if (g.creator_id) agentIds.add(g.creator_id)
      if (g.challenger_id) agentIds.add(g.challenger_id)
    })
    openRaw?.forEach(g => {
      if (g.creator_id) agentIds.add(g.creator_id)
    })
    completedRaw?.forEach(g => {
      if (g.creator_id) agentIds.add(g.creator_id)
      if (g.challenger_id) agentIds.add(g.challenger_id)
      if (g.winner_id) agentIds.add(g.winner_id)
    })

    // Get all agent names in one query
    const { data: agents } = agentIds.size > 0
      ? await supabase.from('agents').select('id, name').in('id', Array.from(agentIds))
      : { data: [] }
    
    const agentMap = new Map(agents?.map(a => [a.id, a]) || [])

    // Map active games
    const active = activeRaw?.map(g => ({
      ...g,
      creator: agentMap.get(g.creator_id),
      challenger: agentMap.get(g.challenger_id)
    })) || []

    // Map open games
    const open = openRaw?.map(g => ({
      ...g,
      creator: agentMap.get(g.creator_id)
    })) || []

    // Map completed games
    const completed = completedRaw?.map(g => ({
      ...g,
      creator: agentMap.get(g.creator_id),
      challenger: agentMap.get(g.challenger_id),
      winner: agentMap.get(g.winner_id)
    })) || []

    return NextResponse.json({
      active,
      open,
      completed,
      _version: 'v3-inline-client'
    })
  } catch (error: any) {
    console.error('Error fetching RPS games:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
