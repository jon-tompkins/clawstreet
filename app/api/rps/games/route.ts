import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  }

  // Use direct fetch instead of Supabase client
  const [activeRes, openRes, completedRes] = await Promise.all([
    fetch(`${url}/rest/v1/rps_games_v2?status=in.(round_in_progress,revealing,pending_approval)&select=id,status,stake_usdc,total_rounds,current_round,creator_wins,challenger_wins,creator_exposed_play,challenger_exposed_play,created_at,creator_id,challenger_id,round_expires_at&order=created_at.desc&limit=10`, { headers, cache: 'no-store' }),
    fetch(`${url}/rest/v1/rps_games_v2?status=eq.open&select=id,status,stake_usdc,total_rounds,created_at,creator_id&order=created_at.desc&limit=20`, { headers, cache: 'no-store' }),
    fetch(`${url}/rest/v1/rps_games_v2?status=eq.completed&select=id,status,stake_usdc,total_rounds,creator_wins,challenger_wins,created_at,completed_at,pot_lobs,creator_id,challenger_id,winner_id&order=completed_at.desc&limit=20`, { headers, cache: 'no-store' })
  ])

  const [activeRaw, openRaw, completedRaw] = await Promise.all([
    activeRes.json(),
    openRes.json(),
    completedRes.json()
  ])

  // Collect agent IDs
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

  // Get agent names
  let agentMap = new Map()
  if (agentIds.size > 0) {
    const agentsRes = await fetch(`${url}/rest/v1/agents?id=in.(${Array.from(agentIds).join(',')})&select=id,name`, { headers, cache: 'no-store' })
    const agents = await agentsRes.json()
    agentMap = new Map(agents?.map((a: any) => [a.id, a]) || [])
  }

  // Fetch round history for active games
  const activeGameIds = activeRaw?.map((g: any) => g.id) || []
  let roundsMap = new Map()
  if (activeGameIds.length > 0) {
    const roundsRes = await fetch(
      `${url}/rest/v1/rps_rounds_v2?game_id=in.(${activeGameIds.join(',')})&select=game_id,round_num,creator_play,challenger_play,creator_exposed,challenger_exposed,creator_bluffed,challenger_bluffed,winner_id,is_tie&order=round_num.asc`,
      { headers, cache: 'no-store' }
    )
    const rounds = await roundsRes.json()
    if (Array.isArray(rounds)) {
      rounds.forEach((r: any) => {
        if (!roundsMap.has(r.game_id)) roundsMap.set(r.game_id, [])
        roundsMap.get(r.game_id).push(r)
      })
    }
  }

  const active = activeRaw?.map((g: any) => ({
    ...g,
    creator: agentMap.get(g.creator_id),
    challenger: agentMap.get(g.challenger_id),
    rounds: roundsMap.get(g.id) || []
  })) || []

  const open = openRaw?.map((g: any) => ({
    ...g,
    creator: agentMap.get(g.creator_id)
  })) || []

  const completed = completedRaw?.map((g: any) => ({
    ...g,
    creator: agentMap.get(g.creator_id),
    challenger: agentMap.get(g.challenger_id),
    winner: agentMap.get(g.winner_id)
  })) || []

  return NextResponse.json({
    active,
    open,
    completed,
    _v: 'v5-direct-fetch',
    _ts: Date.now()
  })
}
