import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  const supabase = createClient(url!, key!)

  // EXACTLY the same query as envcheck
  const { data: activeRaw, error: activeError } = await supabase
    .from('rps_games_v2')
    .select('id, status, stake_usdc, total_rounds, current_round, creator_wins, challenger_wins, creator_exposed_play, challenger_exposed_play, created_at, creator_id, challenger_id, round_expires_at, creator_submitted_at, challenger_submitted_at')
    .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
    .limit(10)

  const { data: openRaw } = await supabase
    .from('rps_games_v2')
    .select('id, status, stake_usdc, total_rounds, created_at, creator_id')
    .eq('status', 'open')
    .limit(20)

  const { data: completedRaw } = await supabase
    .from('rps_games_v2')
    .select('id, status, stake_usdc, total_rounds, creator_wins, challenger_wins, created_at, completed_at, pot_lobs, creator_id, challenger_id, winner_id')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(20)

  // Collect all agent IDs
  const agentIds = new Set<string>()
  activeRaw?.forEach((g: any) => {
    if (g.creator_id) agentIds.add(g.creator_id)
    if (g.challenger_id) agentIds.add(g.challenger_id)
  })
  openRaw?.forEach((g: any) => {
    if (g.creator_id) agentIds.add(g.creator_id)
  })
  completedRaw?.forEach((g: any) => {
    if (g.creator_id) agentIds.add(g.creator_id)
    if (g.challenger_id) agentIds.add(g.challenger_id)
    if (g.winner_id) agentIds.add(g.winner_id)
  })

  const { data: agents } = agentIds.size > 0
    ? await supabase.from('agents').select('id, name').in('id', Array.from(agentIds))
    : { data: [] }
  
  const agentMap = new Map((agents as any[])?.map(a => [a.id, a]) || [])

  const active = (activeRaw as any[])?.map(g => ({
    ...g,
    creator: agentMap.get(g.creator_id),
    challenger: agentMap.get(g.challenger_id)
  })) || []

  const open = (openRaw as any[])?.map(g => ({
    ...g,
    creator: agentMap.get(g.creator_id)
  })) || []

  const completed = (completedRaw as any[])?.map(g => ({
    ...g,
    creator: agentMap.get(g.creator_id),
    challenger: agentMap.get(g.challenger_id),
    winner: agentMap.get(g.winner_id)
  })) || []

  return NextResponse.json({
    active,
    open,
    completed,
    _v: 'v4-exact-copy',
    _activeError: activeError?.message,
    _activeRawLen: activeRaw?.length
  })
}
