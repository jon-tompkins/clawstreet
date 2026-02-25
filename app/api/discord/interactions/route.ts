import { NextRequest, NextResponse } from 'next/server'
import { verifyKey } from 'discord-interactions'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!
const VERIFIED_ROLE_NAME = 'Verified Agent'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
}

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
}

async function verifyAgent(agentId: string) {
  const supabase = getSupabase()
  
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, status, points')
    .eq('id', agentId)
    .single()
  
  if (error || !agent) return null
  if (agent.status !== 'active') return null
  
  return agent
}

async function getOrCreateVerifiedRole(guildId: string): Promise<string | null> {
  // Get existing roles
  const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
  })
  
  if (!rolesRes.ok) return null
  const roles = await rolesRes.json()
  
  // Check if role exists
  const existingRole = roles.find((r: any) => r.name === VERIFIED_ROLE_NAME)
  if (existingRole) return existingRole.id
  
  // Create role
  const createRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: VERIFIED_ROLE_NAME,
      color: 0xF5A623, // Orange
      hoist: true,
      mentionable: true
    })
  })
  
  if (!createRes.ok) return null
  const newRole = await createRes.json()
  return newRole.id
}

async function assignRole(guildId: string, userId: string, roleId: string): Promise<boolean> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    }
  )
  return res.ok
}

async function setNickname(guildId: string, userId: string, nickname: string): Promise<boolean> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nick: nickname })
    }
  )
  return res.ok
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-signature-ed25519')
    const timestamp = request.headers.get('x-signature-timestamp')
    
    // Verify request is from Discord
    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    
    const isValid = verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    
    const interaction = JSON.parse(body)
    
    // Handle PING (Discord verification)
    if (interaction.type === InteractionType.PING) {
      return NextResponse.json({ type: InteractionResponseType.PONG })
    }
    
    // Handle slash commands
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data
      const userId = interaction.member?.user?.id || interaction.user?.id
      const guildId = interaction.guild_id || DISCORD_GUILD_ID
      
      if (name === 'verify') {
        const username = interaction.member?.user?.username || interaction.user?.username || 'Unknown'
        
        // Call our verify API to create a pending verification
        const verifyRes = await fetch('https://clawstreet.club/api/discord/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            discordUserId: userId,
            discordUsername: username
          })
        })
        
        if (!verifyRes.ok) {
          return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to create verification. Please try again.',
              flags: 64
            }
          })
        }
        
        const verifyData = await verifyRes.json()
        
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `🦀 **ClawStreet Verification**\n\nTo verify your agent, sign a message with your wallet:\n\n**1.** Click the link below\n**2.** Connect your agent's wallet\n**3.** Sign the verification message (no gas!)\n\n🔗 **[Verify Now](${verifyData.verifyUrl})**\n\n*Code expires in 10 minutes.*`,
            flags: 64 // Ephemeral - only visible to the user
          }
        })
      }
      
      // Unknown command
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Unknown command',
          flags: 64
        }
      })
    }
    
    return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 })
    
  } catch (error: any) {
    console.error('Discord interaction error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
