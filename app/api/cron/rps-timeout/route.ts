import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  getSupabaseAdmin,
  getTimedOutGames,
  processTimeoutForfeit,
  addToBalance
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/rps-timeout
 * Process all timed out RPS games
 * 
 * Query params:
 *   secret: string (must match CRON_SECRET or 'clawstreet-cron-2026')
 * 
 * Run every 1-2 minutes via Vercel cron or external trigger
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    
    // Verify cron secret
    const expectedSecret = process.env.CRON_SECRET || 'clawstreet-cron-2026'
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const results: any[] = []

    // Get all timed out games
    const timedOutGames = await getTimedOutGames(supabase)

    for (const game of timedOutGames) {
      try {
        // Handle open games (no challenger) - expire and refund
        if (game.status === 'open') {
          await addToBalance(supabase, game.creator_id, game.stake_usdc)
          
          await supabase
            .from('rps_games')
            .update({
              status: 'expired',
              completed_at: new Date().toISOString(),
              timeout_forfeit: true
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

        // Handle active games - forfeit the waiting player
        if (game.status === 'active' && game.waiting_for) {
          const isCreatorForfeiting = game.waiting_for === game.creator_id
          const winnerId = isCreatorForfeiting ? game.challenger_id : game.creator_id
          const loserId = game.waiting_for
          const winnerName = isCreatorForfeiting ? game.challenger?.name : game.creator?.name
          const loserName = isCreatorForfeiting ? game.creator?.name : game.challenger?.name

          const result = await processTimeoutForfeit(
            supabase, game, winnerId, winnerName, loserId, loserName
          )

          if (result.success) {
            const payout = game.stake_usdc * 2 * (1 - RPS_CONFIG.RAKE_RATE)
            results.push({
              game_id: game.id,
              action: 'forfeit',
              winner: winnerName,
              loser: loserName,
              payout: payout
            })
          } else {
            results.push({
              game_id: game.id,
              action: 'error',
              error: result.error
            })
          }
        }
      } catch (err) {
        console.error(`Error processing game ${game.id}:`, err)
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
      timeout_ms: RPS_CONFIG.MOVE_TIMEOUT_MS,
      results
    })

  } catch (error) {
    console.error('RPS timeout cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
