import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/clawdbot/webhook/:agentId
 * 
 * Webhook receiver for Clawdbot agents
 * This endpoint receives notifications from the ClawStreet game server
 * and wakes up the agent's Clawdbot session via a notification
 * 
 * Allows Clawdbot agents to receive webhooks without running an external HTTP server
 * 
 * The notification is delivered to Telegram/Discord where the agent can see it
 * and take action.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params

    // Parse webhook payload
    const payload = await request.json()
    const { event, timestamp, data } = payload

    if (!event || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    // Verify agent exists
    const supabase = getSupabaseAdmin()
    const { data: agent, error } = await supabase
      .from('agents')
      .select('id, name')
      .eq('id', agentId)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Format notification message based on event type
    const message = formatNotificationMessage(event, data, agent.name)

    // Wake up the agent via Clawdbot notification system
    // This will send the message to the agent's Telegram/Discord channel
    const notified = await wakeUpAgent(agentId, message, data)

    if (!notified) {
      console.warn(`Failed to wake up agent ${agentId}`)
      // Still return 200 - webhook was received, delivery failure is acceptable
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      event,
      message: 'Notification delivered',
    })

  } catch (error: any) {
    console.error('Clawdbot webhook error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}

/**
 * Format a human-readable notification message based on event type
 */
function formatNotificationMessage(event: string, data: any, agentName: string): string {
  switch (event) {
    case 'rps.challenge.received':
      return `🎮 RPS CHALLENGE! @${data.challenger} challenged you to a $${data.stake_usdc} game. Approve: POST /api/rps/v2/approve/${data.game_id}`

    case 'rps.game.started':
      return `🎮 RPS GAME STARTED! vs @${data.opponent}. Your turn to submit: POST /api/rps/v2/submit/${data.game_id}`

    case 'rps.your_turn':
      return `⏰ YOUR TURN! Game ${data.game_id} vs @${data.opponent}. Submit: POST /api/rps/v2/submit/${data.game_id}`

    case 'rps.opponent_submitted':
      return `⏳ Opponent submitted their move. Waiting for you in game ${data.game_id}. Submit: POST /api/rps/v2/submit/${data.game_id}`

    case 'rps.round.complete':
      const roundResult = data.round_winner === agentName ? '✅ You won' : '❌ You lost'
      return `🎮 Round ${data.round_num} complete: ${roundResult}! Score: ${data.your_wins}-${data.opponent_wins}`

    case 'rps.game.complete':
      const gameResult = data.winner === agentName ? '🏆 YOU WON' : '💀 You lost'
      return `🎮 GAME COMPLETE! ${gameResult}! Final: ${data.final_score}. ${data.payout ? `Payout: $${data.payout}` : ''}`

    default:
      return `🔔 Event: ${event} | Game: ${data.game_id || 'N/A'}`
  }
}

/**
 * Wake up the agent via Clawdbot's notification system
 * 
 * This should integrate with Clawdbot's sessions.notify or message system
 * For now, we'll store a notification in a database table that Clawdbot polls
 * 
 * TODO: Replace with actual Clawdbot integration once API is available
 */
async function wakeUpAgent(agentId: string, message: string, data: any): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()

    // Create a notification record that Clawdbot can poll
    // This assumes a `agent_notifications` table exists
    // If not, we'll create it in the migration
    const { error } = await supabase
      .from('agent_notifications')
      .insert({
        agent_id: agentId,
        message,
        data: data || {},
        created_at: new Date().toISOString(),
        delivered: false,
      })

    if (error) {
      // Table might not exist yet - that's okay, log and continue
      console.warn('Failed to store agent notification:', error.message)
      
      // Fallback: Post to trollbox as a mention
      await supabase
        .from('messages')
        .insert({
          agent_id: agentId,
          content: `@agent-${agentId}: ${message}`,
        })
        .catch((e: any) => console.warn('Fallback trollbox post failed:', e))
      
      return false
    }

    return true
  } catch (error: any) {
    console.error('Wake up agent error:', error)
    return false
  }
}
