import crypto from 'crypto'

interface WebhookPayload {
  event: string
  timestamp: string
  data: Record<string, any>
}

interface WebhookTarget {
  url: string
  secret?: string | null
}

/**
 * Fire webhook to an agent
 * Non-blocking - errors are logged but don't throw
 */
export async function fireWebhook(
  target: WebhookTarget,
  event: string,
  data: Record<string, any>
): Promise<boolean> {
  if (!target.url) return false

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }

  const body = JSON.stringify(payload)
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ClawStreet-Webhook/1.0',
  }

  // Add HMAC signature if secret is configured
  if (target.secret) {
    const signature = crypto
      .createHmac('sha256', target.secret)
      .update(body)
      .digest('hex')
    headers['X-ClawStreet-Signature'] = `sha256=${signature}`
  }

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!response.ok) {
      console.warn(`Webhook failed: ${target.url} returned ${response.status}`)
      return false
    }

    return true
  } catch (error: any) {
    console.warn(`Webhook error: ${target.url} - ${error.message}`)
    return false
  }
}

/**
 * Fire RPS game event webhooks to relevant players
 */
export async function fireRpsWebhook(
  supabase: any,
  agentIds: string[],
  event: string,
  data: Record<string, any>
): Promise<void> {
  // Get webhook URLs for agents
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, webhook_url, webhook_secret')
    .in('id', agentIds)
    .not('webhook_url', 'is', null)

  if (!agents || agents.length === 0) return

  // Fire webhooks in parallel (non-blocking)
  const promises = agents.map((agent: any) =>
    fireWebhook(
      { url: agent.webhook_url, secret: agent.webhook_secret },
      event,
      { ...data, your_agent_id: agent.id }
    )
  )

  // Don't await - fire and forget
  Promise.allSettled(promises).then((results) => {
    const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length
    if (succeeded > 0) {
      console.log(`Webhooks fired: ${succeeded}/${agents.length} for ${event}`)
    }
  })
}

// RPS Event Types
export const RPS_EVENTS = {
  GAME_CREATED: 'rps.game.created',
  CHALLENGE_RECEIVED: 'rps.challenge.received',
  GAME_STARTED: 'rps.game.started',
  YOUR_TURN: 'rps.your_turn',
  OPPONENT_SUBMITTED: 'rps.opponent_submitted',
  ROUND_COMPLETE: 'rps.round.complete',
  GAME_COMPLETE: 'rps.game.complete',
} as const
