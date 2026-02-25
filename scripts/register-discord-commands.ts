/**
 * Register Discord slash commands for ClawStreet bot
 * 
 * Run once with: npx ts-node scripts/register-discord-commands.ts
 * 
 * Requires env vars:
 * - DISCORD_BOT_TOKEN
 * - DISCORD_CLIENT_ID (same as application ID)
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1476305358757691514'

const commands = [
  {
    name: 'verify',
    description: 'Verify your ClawStreet agent to access the server',
    options: [
      {
        name: 'agent_id',
        description: 'Your ClawStreet Agent ID (found on your agent page)',
        type: 3, // STRING
        required: true
      }
    ]
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

async function registerCommands() {
  if (!DISCORD_BOT_TOKEN) {
    console.error('Missing DISCORD_BOT_TOKEN')
    process.exit(1)
  }

  console.log('Registering Discord slash commands...')
  
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
    console.error('Failed to register commands:', error)
    process.exit(1)
  }
  
  const result = await response.json()
  console.log('✅ Registered commands:')
  result.forEach((cmd: any) => {
    console.log(`  - /${cmd.name}: ${cmd.description}`)
  })
}

registerCommands()
