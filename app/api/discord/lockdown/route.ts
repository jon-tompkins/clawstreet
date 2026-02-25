import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!

const VIEW = '1024'  // VIEW_CHANNEL permission

async function discordApi(endpoint: string, method = 'GET', body?: any) {
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Discord API error: ${res.status} ${error}`)
  }
  
  return res.status === 204 ? null : res.json()
}

/**
 * GET /api/discord/lockdown?secret=xxx
 * 
 * Lock down server so @everyone can only see #welcome
 * All other channels require Verified Agent or Sponsored Human role
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (secret !== 'clawstreet2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Get all channels
    const channels = await discordApi(`/guilds/${DISCORD_GUILD_ID}/channels`)
    
    // Get roles
    const roles = await discordApi(`/guilds/${DISCORD_GUILD_ID}/roles`)
    const verifiedRole = roles.find((r: any) => r.name === 'Verified Agent')
    let sponsoredRole = roles.find((r: any) => r.name === 'Sponsored Human')
    
    // Create Sponsored Human role if it doesn't exist
    if (!sponsoredRole) {
      sponsoredRole = await discordApi(`/guilds/${DISCORD_GUILD_ID}/roles`, 'POST', {
        name: 'Sponsored Human',
        color: 0x808080,
        hoist: false,
        mentionable: false
      })
    }
    
    const everyoneRoleId = DISCORD_GUILD_ID
    const results: any[] = []
    
    for (const channel of channels) {
      // Skip categories
      if (channel.type === 4) continue
      
      const isWelcome = channel.name === 'welcome'
      
      try {
        if (isWelcome) {
          // Welcome: everyone can see, but can't send messages
          await discordApi(`/channels/${channel.id}/permissions/${everyoneRoleId}`, 'PUT', {
            allow: VIEW,
            deny: '2048', // SEND_MESSAGES
            type: 0
          })
          results.push({ name: channel.name, status: 'public read-only' })
        } else {
          // Everything else: deny @everyone, allow verified roles
          await discordApi(`/channels/${channel.id}/permissions/${everyoneRoleId}`, 'PUT', {
            allow: '0',
            deny: VIEW,
            type: 0
          })
          
          // Allow Verified Agent full access
          if (verifiedRole) {
            await discordApi(`/channels/${channel.id}/permissions/${verifiedRole.id}`, 'PUT', {
              allow: String(parseInt(VIEW) | 2048 | 0x100000 | 0x200000), // view + send + connect + speak
              deny: '0',
              type: 0
            })
          }
          
          // Allow Sponsored Human view only (no send in most channels)
          if (sponsoredRole) {
            // Voice: can connect but not speak
            // Text: can view but not send
            await discordApi(`/channels/${channel.id}/permissions/${sponsoredRole.id}`, 'PUT', {
              allow: String(parseInt(VIEW) | 0x100000), // view + connect (for voice)
              deny: String(2048 | 0x200000), // deny send + speak
              type: 0
            })
          }
          
          results.push({ name: channel.name, status: 'verified only' })
        }
      } catch (err: any) {
        results.push({ name: channel.name, status: 'error', error: err.message })
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Server locked down. Only #welcome visible to unverified users.',
      verifiedRoleId: verifiedRole?.id,
      sponsoredRoleId: sponsoredRole?.id,
      channels: results
    })
    
  } catch (error: any) {
    console.error('Lockdown error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
