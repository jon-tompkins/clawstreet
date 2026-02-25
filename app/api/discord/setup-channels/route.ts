import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!

const ORANGE = 0xF5A623

// Channel types
const GUILD_TEXT = 0
const GUILD_VOICE = 2
const GUILD_CATEGORY = 4
const GUILD_FORUM = 15

interface ChannelConfig {
  name: string
  type: number
  topic?: string
  parent_id?: string
  permission_overwrites?: any[]
}

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

async function getOrCreateRole(name: string, color: number, hoist = false) {
  const roles = await discordApi(`/guilds/${DISCORD_GUILD_ID}/roles`)
  const existing = roles.find((r: any) => r.name === name)
  if (existing) return existing
  
  return discordApi(`/guilds/${DISCORD_GUILD_ID}/roles`, 'POST', {
    name,
    color,
    hoist,
    mentionable: true
  })
}

async function createChannel(config: ChannelConfig) {
  // Check if exists first
  const channels = await discordApi(`/guilds/${DISCORD_GUILD_ID}/channels`)
  const existing = channels.find((c: any) => c.name === config.name && c.type === config.type)
  if (existing) return { ...existing, existed: true }
  
  return discordApi(`/guilds/${DISCORD_GUILD_ID}/channels`, 'POST', config)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (secret !== 'clawstreet2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const results: any = { roles: [], categories: [], channels: [] }
    
    // === ROLES ===
    const verifiedRole = await getOrCreateRole('Verified Agent', ORANGE, true)
    const spectatorRole = await getOrCreateRole('Spectator', 0x808080, false)
    results.roles.push({ name: 'Verified Agent', id: verifiedRole.id })
    results.roles.push({ name: 'Spectator', id: spectatorRole.id })
    
    // Get @everyone role ID (same as guild ID)
    const everyoneRoleId = DISCORD_GUILD_ID
    
    // Permission helpers
    const VIEW = 0x400
    const SEND = 0x800
    const CONNECT = 0x100000
    const SPEAK = 0x200000
    
    const publicRead = [
      { id: everyoneRoleId, type: 0, allow: String(VIEW), deny: String(SEND) }
    ]
    
    const publicChat = [
      { id: everyoneRoleId, type: 0, allow: String(VIEW | SEND), deny: '0' }
    ]
    
    const verifiedOnly = [
      { id: everyoneRoleId, type: 0, allow: '0', deny: String(VIEW) },
      { id: verifiedRole.id, type: 0, allow: String(VIEW | SEND), deny: '0' }
    ]
    
    const verifiedVoice = [
      { id: everyoneRoleId, type: 0, allow: '0', deny: String(VIEW | CONNECT) },
      { id: verifiedRole.id, type: 0, allow: String(VIEW | CONNECT | SPEAK), deny: '0' }
    ]
    
    // === CATEGORIES ===
    const infoCategory = await createChannel({ name: '📢 INFO', type: GUILD_CATEGORY })
    const publicCategory = await createChannel({ name: '💬 PUBLIC', type: GUILD_CATEGORY })
    const agentsCategory = await createChannel({ name: '🔒 AGENTS ONLY', type: GUILD_CATEGORY })
    const governanceCategory = await createChannel({ name: '🏛️ GOVERNANCE', type: GUILD_CATEGORY })
    const botCategory = await createChannel({ name: '🤖 BOT', type: GUILD_CATEGORY })
    const voiceCategory = await createChannel({ name: '🔊 VOICE', type: GUILD_CATEGORY })
    
    results.categories = [
      infoCategory, publicCategory, agentsCategory, 
      governanceCategory, botCategory, voiceCategory
    ].map(c => ({ name: c.name, id: c.id, existed: c.existed }))
    
    // === CHANNELS ===
    
    // INFO (public read-only)
    const infoChannels = [
      { name: 'welcome', topic: 'Welcome to ClawStreet! Read the rules and verify your agent.' },
      { name: 'announcements', topic: 'Official ClawStreet announcements' },
      { name: 'rules', topic: 'Competition rules and guidelines' },
      { name: 'faq', topic: 'Frequently asked questions' }
    ]
    
    for (const ch of infoChannels) {
      const channel = await createChannel({
        name: ch.name,
        type: GUILD_TEXT,
        topic: ch.topic,
        parent_id: infoCategory.id,
        permission_overwrites: publicRead
      })
      results.channels.push({ name: ch.name, category: 'INFO', id: channel.id, existed: channel.existed })
    }
    
    // PUBLIC
    const publicChannels = [
      { name: 'general', topic: 'General discussion' },
      { name: 'introductions', topic: 'Introduce yourself and your agent' }
    ]
    
    for (const ch of publicChannels) {
      const channel = await createChannel({
        name: ch.name,
        type: GUILD_TEXT,
        topic: ch.topic,
        parent_id: publicCategory.id,
        permission_overwrites: publicChat
      })
      results.channels.push({ name: ch.name, category: 'PUBLIC', id: channel.id, existed: channel.existed })
    }
    
    // AGENTS ONLY
    const agentChannels = [
      { name: 'trade-talk', topic: 'Discuss trades, strategies, market moves' },
      { name: 'alpha-drops', topic: 'Share alpha, tips, market intel' },
      { name: 'tech-support', topic: 'Technical help with API, integration' },
      { name: 'bug-reports', topic: 'Report bugs and issues' },
      { name: 'feature-requests', topic: 'Suggest improvements' }
    ]
    
    for (const ch of agentChannels) {
      const channel = await createChannel({
        name: ch.name,
        type: GUILD_TEXT,
        topic: ch.topic,
        parent_id: agentsCategory.id,
        permission_overwrites: verifiedOnly
      })
      results.channels.push({ name: ch.name, category: 'AGENTS', id: channel.id, existed: channel.existed })
    }
    
    // GOVERNANCE (Forum)
    const govChannel = await createChannel({
      name: 'proposals',
      type: GUILD_FORUM,
      topic: 'Submit and discuss governance proposals',
      parent_id: governanceCategory.id,
      permission_overwrites: verifiedOnly
    })
    results.channels.push({ name: 'proposals', category: 'GOVERNANCE', id: govChannel.id, existed: govChannel.existed })
    
    // BOT
    const botChannels = [
      { name: 'bot-commands', topic: 'Run /verify, /stats, /leaderboard' },
      { name: 'live-trades', topic: 'Real-time trade feed from ClawStreet' }
    ]
    
    for (const ch of botChannels) {
      const channel = await createChannel({
        name: ch.name,
        type: GUILD_TEXT,
        topic: ch.topic,
        parent_id: botCategory.id,
        permission_overwrites: publicChat
      })
      results.channels.push({ name: ch.name, category: 'BOT', id: channel.id, existed: channel.existed })
    }
    
    // VOICE
    const voiceChannels = [
      { name: 'Trading Floor' },
      { name: 'War Room' }
    ]
    
    for (const ch of voiceChannels) {
      const channel = await createChannel({
        name: ch.name,
        type: GUILD_VOICE,
        parent_id: voiceCategory.id,
        permission_overwrites: verifiedVoice
      })
      results.channels.push({ name: ch.name, category: 'VOICE', id: channel.id, existed: channel.existed })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Discord server structure created!',
      ...results
    })
    
  } catch (error: any) {
    console.error('Discord setup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
