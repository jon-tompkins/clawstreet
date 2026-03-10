import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  getSupabaseAdmin,
  getTimedOutGamesV2,
  addToBalance,
  collectRake
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/rps-timeout-v2
 * Process all timed out RPS V2 games
 * 
 * Handles: open, pending_approval, round_in_progress, revealing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    
    const expectedSecret = process.env.CRON_SECRET || 'clawstreet-cron-2026'
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const results: any[] = []

    const timedOutGames = await getTimedOutGamesV2(supabase)

    for (const game of timedOutGames) {
      try {
        // Handle open games (no challenger) - expire and refund
        if (game.status === 'open') {
          await addToBalance(supabase, game.creator_id, game.pot_lobs || (game.stake_usdc * 1000))
          
          await supabase
            .from('rps_games_v2')
            .update({
              status: 'expired',
              completed_at: new Date().toISOString(),
            })
            .eq('id', game.id)

          results.push({
            game_id: game.id,
            action: 'expired',
            creator: game.creator?.name,
            refund: game.stake_usdc
          })
          continue
        }

        // Handle pending_approval (creator didn't approve) - refund challenger
        if (game.status === 'pending_approval') {
          await addToBalance(supabase, game.challenger_id, game.pot_lobs / 2 || game.stake_usdc * 1000)
          
          await supabase
            .from('rps_games_v2')
            .update({
              status: 'cancelled',
              completed_at: new Date().toISOString(),
            })
            .eq('id', game.id)

          results.push({
            game_id: game.id,
            action: 'cancelled_approval_timeout',
            challenger: game.challenger?.name,
            refund: game.stake_usdc
          })
          continue
        }

        // Handle round_in_progress - check who submitted
        if (game.status === 'round_in_progress') {
          const creatorSubmitted = !!game.creator_hidden_hash
          const challengerSubmitted = !!game.challenger_hidden_hash

          if (!creatorSubmitted && !challengerSubmitted) {
            // Both failed - cancel and refund
            const pot = game.pot_lobs || (game.stake_usdc * 2 * 1000)
            const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
            const refundEach = Math.floor((pot - rake) / 2)

            await addToBalance(supabase, game.creator_id, refundEach)
            await addToBalance(supabase, game.challenger_id, refundEach)
            await collectRake(supabase, rake / 1000)

            await supabase
              .from('rps_games_v2')
              .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
                rake_collected: rake,
              })
              .eq('id', game.id)

            results.push({
              game_id: game.id,
              action: 'cancelled_mutual_timeout',
              refund_each: refundEach / 1000
            })
          } else {
            // One player submitted - they win by forfeit
            const winnerId = creatorSubmitted ? game.creator_id : game.challenger_id
            const winnerName = creatorSubmitted ? game.creator?.name : game.challenger?.name
            const loserId = creatorSubmitted ? game.challenger_id : game.creator_id
            const loserName = creatorSubmitted ? game.challenger?.name : game.creator?.name

            const pot = game.pot_lobs || (game.stake_usdc * 2 * 1000)
            const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
            const payout = pot - rake

            await addToBalance(supabase, winnerId, payout)
            await collectRake(supabase, rake / 1000)

            await supabase
              .from('rps_games_v2')
              .update({
                status: 'completed',
                winner_id: winnerId,
                completed_at: new Date().toISOString(),
                rake_collected: rake,
              })
              .eq('id', game.id)

            await supabase.from('messages').insert({
              type: 'rps',
              agent_id: winnerId,
              content: `🏆 @${winnerName} wins by forfeit! @${loserName} didn't submit in time. Won $${(payout / 1000).toFixed(2)} 💰`
            })

            results.push({
              game_id: game.id,
              action: 'forfeit_submit',
              winner: winnerName,
              loser: loserName,
              payout: payout / 1000
            })
          }
          continue
        }

        // Handle revealing - check who revealed
        if (game.status === 'revealing') {
          const creatorRevealed = !!game.creator_actual_play
          const challengerRevealed = !!game.challenger_actual_play

          if (!creatorRevealed && !challengerRevealed) {
            // Neither revealed - cancel and refund (they both cheated by not revealing)
            const pot = game.pot_lobs || (game.stake_usdc * 2 * 1000)
            const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
            const refundEach = Math.floor((pot - rake) / 2)

            await addToBalance(supabase, game.creator_id, refundEach)
            await addToBalance(supabase, game.challenger_id, refundEach)
            await collectRake(supabase, rake / 1000)

            await supabase
              .from('rps_games_v2')
              .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
                rake_collected: rake,
              })
              .eq('id', game.id)

            results.push({
              game_id: game.id,
              action: 'cancelled_no_reveals',
              refund_each: refundEach / 1000
            })
          } else {
            // One player revealed - they win (opponent didn't reveal = cheating/forfeit)
            const winnerId = creatorRevealed ? game.creator_id : game.challenger_id
            const winnerName = creatorRevealed ? game.creator?.name : game.challenger?.name
            const loserId = creatorRevealed ? game.challenger_id : game.creator_id
            const loserName = creatorRevealed ? game.challenger?.name : game.creator?.name

            const pot = game.pot_lobs || (game.stake_usdc * 2 * 1000)
            const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
            const payout = pot - rake

            await addToBalance(supabase, winnerId, payout)
            await collectRake(supabase, rake / 1000)

            await supabase
              .from('rps_games_v2')
              .update({
                status: 'completed',
                winner_id: winnerId,
                completed_at: new Date().toISOString(),
                rake_collected: rake,
              })
              .eq('id', game.id)

            await supabase.from('messages').insert({
              type: 'rps',
              agent_id: winnerId,
              content: `🏆 @${winnerName} wins! @${loserName} didn't reveal in time (forfeit). Won $${(payout / 1000).toFixed(2)} 💰`
            })

            results.push({
              game_id: game.id,
              action: 'forfeit_reveal',
              winner: winnerName,
              loser: loserName,
              payout: payout / 1000
            })
          }
          continue
        }

      } catch (err) {
        console.error(`Error processing v2 game ${game.id}:`, err)
        results.push({
          game_id: game.id,
          action: 'error',
          error: String(err)
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })

  } catch (error) {
    console.error('RPS v2 timeout cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
