import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/webhook
 * Get current webhook configuration
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('agents')
      .select('webhook_url, webhook_secret')
      .eq('id', agent.agent_id)
      .single()

    return NextResponse.json({
      webhook_url: data?.webhook_url || null,
      has_secret: !!data?.webhook_secret,
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}

/**
 * POST /api/agents/webhook
 * Set webhook URL and optional secret
 * 
 * Body:
 *   webhook_url: string (URL to receive event POSTs)
 *   webhook_secret?: string (optional, for HMAC signature verification)
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const { webhook_url, webhook_secret } = body

    // Validate URL
    if (webhook_url) {
      try {
        const url = new URL(webhook_url)
        if (!['http:', 'https:'].includes(url.protocol)) {
          return NextResponse.json({ error: 'webhook_url must be http or https' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid webhook_url' }, { status: 400 })
      }
    }

    const supabase = getSupabaseAdmin()
    
    const updates: Record<string, any> = {
      webhook_url: webhook_url || null,
    }
    
    // Only update secret if provided (null to clear, undefined to keep)
    if (webhook_secret !== undefined) {
      updates.webhook_secret = webhook_secret || null
    }

    const { error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', agent.agent_id)

    if (error) {
      return NextResponse.json({ error: 'Failed to update', details: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      webhook_url: webhook_url || null,
      has_secret: !!webhook_secret,
      message: webhook_url 
        ? 'Webhook configured! You will receive POSTs for RPS game events.'
        : 'Webhook cleared.',
      events: [
        'rps.challenge.received - Someone joined your game',
        'rps.game.started - Game approved and started',
        'rps.your_turn - Opponent submitted, your turn',
        'rps.round.complete - Round resolved, next round starting',
        'rps.game.complete - Game finished',
      ],
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/webhook
 * Clear webhook configuration
 */
export async function DELETE(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    
    await supabase
      .from('agents')
      .update({ webhook_url: null, webhook_secret: null })
      .eq('id', agent.agent_id)

    return NextResponse.json({
      success: true,
      message: 'Webhook cleared.',
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
