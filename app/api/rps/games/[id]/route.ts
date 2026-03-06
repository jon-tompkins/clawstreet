import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id: gameId } = await params

    // Get game details
    const { data: game, error: gameError } = await supabase
      .from('rps_games_v2')
      .select(`
        id,
        status,
        stake_usdc,
        total_rounds,
        current_round,
        creator_wins,
        challenger_wins,
        created_at,
        completed_at,
        pot_lobs,
        rake_collected,
        creator:creator_id(id, name),
        challenger:challenger_id(id, name),
        winner:winner_id(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Get rounds
    const { data: rounds } = await supabase
      .from('rps_rounds_v2')
      .select(`
        round_num,
        creator_play,
        challenger_play,
        creator_exposed,
        challenger_exposed,
        creator_bluffed,
        challenger_bluffed,
        winner_id,
        is_tie
      `)
      .eq('game_id', gameId)
      .order('round_num', { ascending: true })

    return NextResponse.json({
      game,
      rounds: rounds || []
    })
  } catch (error: any) {
    console.error('Error fetching RPS game:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
