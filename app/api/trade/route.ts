import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const VALID_ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER']
const MAX_TRADES_PER_DAY = 10

// Get the current week ID (e.g., "2026-W07")
function getWeekId(date: Date): string {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${year}-W${week.toString().padStart(2, '0')}`
}

// Get reveal date (Friday of next week)
function getRevealDate(date: Date): string {
  const d = new Date(date)
  // Move to next week's Friday
  const daysUntilFriday = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + daysUntilFriday + 7) // Next week's Friday
  return d.toISOString().split('T')[0]
}

// Verify API key and get agent
async function verifyApiKey(apiKey: string): Promise<{ agent_id: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const { data, error } = await getSupabaseAdmin()
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  
  // Update last_used_at
  await getSupabaseAdmin()
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)

  return data
}

export async function POST(request: NextRequest) {
  try {
    // Get API key from header
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    // Verify API key
    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Check agent is active
    const { data: agent, error: agentError } = await getSupabaseAdmin()
      .from('agents')
      .select('id, name, status')
      .eq('id', keyData.agent_id)
      .single()

    if (agentError || !agent || agent.status !== 'active') {
      return NextResponse.json(
        { error: 'Agent not active' },
        { status: 403 }
      )
    }

    // Parse trade request
    const body = await request.json()
    const { ticker, action } = body

    // Validate
    if (!ticker || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, action' },
        { status: 400 }
      )
    }

    if (!VALID_ACTIONS.includes(action.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Check daily trade limit
    const today = new Date().toISOString().split('T')[0]
    const { count } = await getSupabaseAdmin()
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('submitted_at', `${today}T00:00:00`)
      .lt('submitted_at', `${today}T23:59:59`)

    if ((count || 0) >= MAX_TRADES_PER_DAY) {
      return NextResponse.json(
        { error: `Daily trade limit (${MAX_TRADES_PER_DAY}) reached` },
        { status: 429 }
      )
    }

    // Check trading hours (before 3:30 PM ET)
    const now = new Date()
    const etHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours()
    const etMinute = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getMinutes()
    
    // For now, allow trading anytime (TODO: enforce 3:30 PM cutoff)
    // if (etHour > 15 || (etHour === 15 && etMinute >= 30)) {
    //   return NextResponse.json(
    //     { error: 'Trading closed for today. Cutoff is 3:30 PM ET.' },
    //     { status: 400 }
    //   )
    // }

    // Insert trade
    const weekId = getWeekId(now)
    const revealDate = getRevealDate(now)

    const { data: trade, error: tradeError } = await getSupabaseAdmin()
      .from('trades')
      .insert({
        agent_id: agent.id,
        ticker: ticker.toUpperCase(),
        action: action.toUpperCase(),
        week_id: weekId,
        reveal_date: revealDate,
      })
      .select()
      .single()

    if (tradeError) {
      throw tradeError
    }

    return NextResponse.json({
      success: true,
      trade: {
        id: trade.id,
        ticker: trade.ticker,
        action: trade.action,
        submitted_at: trade.submitted_at,
        reveal_date: trade.reveal_date,
        week_id: trade.week_id,
      },
      trades_remaining_today: MAX_TRADES_PER_DAY - (count || 0) - 1,
    })
  } catch (error: any) {
    console.error('Trade error:', error)
    return NextResponse.json(
      { error: 'Trade failed', details: error.message },
      { status: 500 }
    )
  }
}

// GET: List agent's own trades
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    const { data: trades, error } = await getSupabaseAdmin()
      .from('trades')
      .select('*')
      .eq('agent_id', keyData.agent_id)
      .order('submitted_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ trades })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch trades', details: error.message },
      { status: 500 }
    )
  }
}
