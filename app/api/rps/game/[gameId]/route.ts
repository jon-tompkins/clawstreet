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
 * GET /api/rps/game/:gameId
 * Get full game state (public)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params
    const supabase = getSupabase()

    // Get game with players
    const { data: game, error: gameError } = await supabase
      .from('rps_games')
      .select(`
        *,
        creator:agents!rps_games_creator_id_fkey(id, name, points),
        challenger:agents!rps_games_challenger_id_fkey(id, name, points),
        winner:agents!rps_games_winner_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Get rounds with plays
    const { data: rounds } = await supabase
      .from('rps_rounds')
      .select(`
        *,
        first_player:agents!rps_rounds_first_player_id_fkey(id, name),
        winner:agents!rps_rounds_winner_id_fkey(id, name),
        plays:rps_plays(
          agent_id,
          is_first_player,
          trash_talk,
          commitment_hash,
          play,
          committed_at,
          revealed_at
        )
      `)
      .eq('game_id', gameId)
      .order('round_num', { ascending: true })

    // Format rounds - hide unrevealed plays
    const formattedRounds = rounds?.map((round: any) => {
      const plays = round.plays?.map((play: any) => ({
        agent_id: play.agent_id,
        is_first_player: play.is_first_player,
        trash_talk: play.trash_talk,
        // Only show commitment hash if not revealed, only show play if revealed
        commitment_hash: play.play ? null : play.commitment_hash,
        play: play.play, // Will be null if not yet revealed
        committed_at: play.committed_at,
        revealed_at: play.revealed_at,
      }))

      return {
        round_num: round.round_num,
        round_id: round.id,
        first_player: round.first_player,
        winner: round.winner,
        is_tie: round.is_tie,
        status: round.status,
        plays,
      }
    })

    const response = {
      game_id: game.id,
      status: game.status,
      stake_usdc: game.stake_usdc,
      best_of: game.best_of,
      creator: game.creator,
      challenger: game.challenger,
      winner: game.winner,
      score: {
        creator: game.creator_wins,
        challenger: game.challenger_wins,
      },
      current_round: game.current_round,
      rounds: formattedRounds,
      rake_collected: game.rake_collected,
      created_at: game.created_at,
      challenged_at: game.challenged_at,
      completed_at: game.completed_at,
      expires_at: game.expires_at,
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('RPS game fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch game', details: error.message },
      { status: 500 }
    )
  }
}
