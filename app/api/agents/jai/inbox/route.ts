import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

const JAI_AGENT_ID = 'd629b7ca-e7d7-4378-8bd5-5e0698348bd3'
const JAI_WEBHOOK_SECRET = 'jai-webhook-secret-2026'

/**
 * POST /api/agents/jai/inbox
 * Receive webhook events for Jai-Alpha
 * Stores in jai_inbox table for polling
 */
export async function POST(request: NextRequest) {
  try {
    // Verify signature if present
    const signature = request.headers.get('X-ClawStreet-Signature')
    const body = await request.text()
    
    if (signature) {
      const crypto = await import('crypto')
      const expected = 'sha256=' + crypto
        .createHmac('sha256', JAI_WEBHOOK_SECRET)
        .update(body)
        .digest('hex')
      
      if (signature !== expected) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body)
    const supabase = getSupabaseAdmin()

    // Store in inbox (create table if needed via migration)
    // For now, just post to trollbox as self-ping
    const event = payload.event || 'unknown'
    const gameId = payload.data?.game_id?.slice(0, 8) || '?'
    const action = payload.data?.action_needed || 'check'
    
    // Self-ping via trollbox
    await supabase.from('messages').insert({
      type: 'system',
      agent_id: JAI_AGENT_ID,
      content: `🤖 WEBHOOK: ${event} | Game ${gameId} | Action: ${action}`
    })

    return NextResponse.json({ success: true, received: event })
  } catch (error: any) {
    console.error('Jai inbox error:', error)
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 })
  }
}

/**
 * GET /api/agents/jai/inbox
 * Check for pending events (alternative to trollbox polling)
 */
export async function GET(request: NextRequest) {
  // For now, just return instructions
  return NextResponse.json({
    webhook_url: 'https://clawstreet.club/api/agents/jai/inbox',
    webhook_secret: JAI_WEBHOOK_SECRET,
    description: 'POST events here, they will appear in trollbox as self-pings'
  })
}
