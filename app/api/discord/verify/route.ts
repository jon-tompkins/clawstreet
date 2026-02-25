import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMessage } from 'viem'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!
const VERIFIED_ROLE_ID = '1476312213827354696' // Created by setup-channels

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Store pending verifications (in production, use Redis or DB)
// For now, we'll use a simple in-memory store with expiry
const pendingVerifications = new Map<string, { discordUserId: string; discordUsername: string; createdAt: number }>()

// Clean up old verifications (older than 10 minutes)
function cleanupPending() {
  const now = Date.now()
  for (const [code, data] of pendingVerifications) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingVerifications.delete(code)
    }
  }
}

/**
 * POST /api/discord/verify
 * 
 * Two modes:
 * 1. { action: 'create', discordUserId, discordUsername } - Create pending verification, return code
 * 2. { action: 'complete', code, address, signature } - Verify signature and complete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    
    cleanupPending()
    
    if (action === 'create') {
      // Create a new pending verification
      const { discordUserId, discordUsername } = body
      
      if (!discordUserId) {
        return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 })
      }
      
      // Generate random code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      
      pendingVerifications.set(code, {
        discordUserId,
        discordUsername: discordUsername || 'Unknown',
        createdAt: Date.now()
      })
      
      return NextResponse.json({
        success: true,
        code,
        message: `Sign this message with your wallet: "ClawStreet verification: ${code}"`,
        verifyUrl: `https://clawstreet.club/verify?code=${code}`
      })
    }
    
    if (action === 'complete') {
      const { code, address, signature } = body
      
      if (!code || !address || !signature) {
        return NextResponse.json({ error: 'Missing code, address, or signature' }, { status: 400 })
      }
      
      // Check pending verification exists
      const pending = pendingVerifications.get(code)
      if (!pending) {
        return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 })
      }
      
      // Verify signature
      const message = `ClawStreet verification: ${code}`
      let isValid = false
      
      try {
        isValid = await verifyMessage({
          address: address as `0x${string}`,
          message,
          signature: signature as `0x${string}`
        })
      } catch (e) {
        return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 })
      }
      
      if (!isValid) {
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
      }
      
      // Check if address has an active agent
      const supabase = getSupabase()
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id, name, status, points, wallet_address')
        .eq('wallet_address', address.toLowerCase())
        .single()
      
      if (agentError || !agent) {
        return NextResponse.json({ 
          error: 'No agent found for this wallet address. Register at clawstreet.club first.' 
        }, { status: 404 })
      }
      
      if (agent.status !== 'active') {
        return NextResponse.json({ 
          error: 'Agent is not active. Complete registration and pay entry fee first.' 
        }, { status: 400 })
      }
      
      // Assign Discord role
      const roleRes = await fetch(
        `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${pending.discordUserId}/roles/${VERIFIED_ROLE_ID}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
        }
      )
      
      if (!roleRes.ok) {
        console.error('Failed to assign role:', await roleRes.text())
        return NextResponse.json({ error: 'Failed to assign Discord role' }, { status: 500 })
      }
      
      // Try to set nickname to agent name
      await fetch(
        `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${pending.discordUserId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ nick: agent.name })
        }
      )
      
      // Link Discord to agent in database
      await supabase
        .from('agents')
        .update({ discord_user_id: pending.discordUserId })
        .eq('id', agent.id)
      
      // Clean up pending verification
      pendingVerifications.delete(code)
      
      return NextResponse.json({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          points: agent.points
        },
        message: `Welcome to ClawStreet, ${agent.name}! You now have access to all agent channels.`
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error: any) {
    console.error('Verify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
