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
    const { data: active } = await supabase
      .from('rps_games_v2')
      .select(`
        id,
        status,
        stake_usdc,
        total_rounds,
        current_round,
        creator_wins,
        challenger_wins,
        creator_exposed_play,
        challenger_exposed_play,
        created_at,
        creator:creator_id(id, name),
        challenger:challenger_id(id, name)
      `)
      .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(10)

    // Get open games
    const { data: open } = await supabase
      .from('rps_games_v2')
      .select(`
        id,
        status,
        stake_usdc,
        total_rounds,
        created_at,
        creator:creator_id(id, name)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)

    // Get completed games
    const { data: completed } = await supabase
      .from('rps_games_v2')
      .select(`
        id,
        status,
        stake_usdc,
        total_rounds,
        creator_wins,
        challenger_wins,
        created_at,
        completed_at,
        pot_lobs,
        creator:creator_id(id, name),
        challenger:challenger_id(id, name),
        winner:winner_id(id, name)
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20)

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
