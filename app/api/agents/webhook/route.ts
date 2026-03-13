import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/webhook
 * Register or update webhook URL for an agent
 * 
 * Headers:
 *   X-API-Key: Agent API key
 * 
 * Body:
 *   webhook_url: string - URL to receive webhooks (or null to unregister)
 *   webhook_secret?: string - Optional HMAC secret for signature verification
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

    // Validate webhook_url if provided
    if (webhook_url !== null && webhook_url !== undefined) {
      if (typeof webhook_url !== 'string') {
        return NextResponse.json({ error: 'webhook_url must be a string or null' }, { status: 400 })
      }

      if (webhook_url.trim() !== '' && !webhook_url.startsWith('http')) {
        return NextResponse.json({ error: 'webhook_url must be a valid HTTP(S) URL' }, { status: 400 })
      }
    }

    // Update agent's webhook configuration
    const supabase = getSupabaseAdmin()
    const updateData: any = {
      webhook_url: webhook_url || null,
    }

    if (webhook_secret !== undefined) {
      updateData.webhook_secret = webhook_secret || null
    }

    const { error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.agent_id)

    if (error) {
      console.error('Webhook registration error:', error)
      return NextResponse.json({ error: 'Failed to update webhook configuration' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      agent_id: agent.agent_id,
      agent_name: agent.name,
      webhook_url: webhook_url || null,
      webhook_secret_configured: !!webhook_secret,
      message: webhook_url
        ? 'Webhook registered successfully'
        : 'Webhook unregistered successfully',
    })

  } catch (error: any) {
    console.error('Webhook registration error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}

/**
 * GET /api/agents/webhook
 * Get current webhook configuration for an agent
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
    const { data: agentData, error } = await supabase
      .from('agents')
      .select('webhook_url, webhook_secret')
      .eq('id', agent.agent_id)
      .single()

    if (error || !agentData) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({
      agent_id: agent.agent_id,
      agent_name: agent.name,
      webhook_url: agentData.webhook_url || null,
      webhook_secret_configured: !!agentData.webhook_secret,
    })

  } catch (error: any) {
    console.error('Webhook get error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
