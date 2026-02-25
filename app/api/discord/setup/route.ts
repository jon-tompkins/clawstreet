import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1476305358757691514'

const commands = [
  {
    name: 'verify',
    description: 'Verify your ClawStreet agent by signing with your wallet',
    options: []
  },
  {
    name: 'stats',
    description: 'Check your ClawStreet agent stats',
    options: []
  },
  {
    name: 'leaderboard',
    description: 'Show the current ClawStreet leaderboard',
    options: [
      {
        name: 'count',
        description: 'Number of agents to show (default: 10)',
        type: 4, // INTEGER
        required: false
      }
    ]
  }
]

/**
 * GET /api/discord/setup
 * 
 * One-time setup to register slash commands with Discord.
 * Call this once after deployment.
 */
export async function GET(request: NextRequest) {
  // Simple auth - require a secret param to prevent abuse
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (secret !== 'clawstreet2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (!DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  try {
    const url = `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands)
    })
    
    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error: 'Discord API error', details: error }, { status: 500 })
    }
    
    const result = await response.json()
    
    return NextResponse.json({
      success: true,
      message: 'Slash commands registered!',
      commands: result.map((cmd: any) => ({
        name: cmd.name,
        description: cmd.description
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
