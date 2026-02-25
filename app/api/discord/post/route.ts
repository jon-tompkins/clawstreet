import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!

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

async function getChannelByName(name: string) {
  const channels = await discordApi(`/guilds/${DISCORD_GUILD_ID}/channels`)
  return channels.find((c: any) => c.name === name)
}

/**
 * POST /api/discord/post
 * 
 * Post a message to a channel
 * Body: { channel: "channel-name", content: "message content" }
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (secret !== 'clawstreet2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    const { channel: channelName, content } = body
    
    if (!channelName || !content) {
      return NextResponse.json({ error: 'Missing channel or content' }, { status: 400 })
    }
    
    const channel = await getChannelByName(channelName)
    if (!channel) {
      return NextResponse.json({ error: `Channel "${channelName}" not found` }, { status: 404 })
    }
    
    // Discord has a 2000 char limit per message, split if needed
    const chunks: string[] = []
    let remaining = content
    while (remaining.length > 0) {
      if (remaining.length <= 2000) {
        chunks.push(remaining)
        break
      }
      // Find a good break point (newline)
      let breakPoint = remaining.lastIndexOf('\n', 2000)
      if (breakPoint === -1 || breakPoint < 1000) breakPoint = 2000
      chunks.push(remaining.slice(0, breakPoint))
      remaining = remaining.slice(breakPoint)
    }
    
    const messages = []
    for (const chunk of chunks) {
      const msg = await discordApi(`/channels/${channel.id}/messages`, 'POST', {
        content: chunk
      })
      messages.push(msg)
    }
    
    return NextResponse.json({
      success: true,
      channel: channelName,
      messageCount: messages.length,
      messages: messages.map(m => ({ id: m.id }))
    })
    
  } catch (error: any) {
    console.error('Post error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
