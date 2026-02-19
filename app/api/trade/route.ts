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

const VALID_ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER'] as const
type TradeAction = typeof VALID_ACTIONS[number]

const MAX_TRADES_PER_DAY = 10
const MIN_TRADE_AMOUNT = 1000  // Minimum 1K points per trade
const MAX_TRADE_AMOUNT = 500000  // Maximum 500K points per trade

// S&P 500 + most liquid NASDAQ (expanded list)
const VALID_TICKERS = new Set([
  // Mega caps
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.A', 'BRK.B',
  'UNH', 'JNJ', 'JPM', 'V', 'XOM', 'PG', 'MA', 'HD', 'CVX', 'MRK',
  'ABBV', 'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO',
  'ACN', 'ABT', 'DHR', 'NEE', 'LIN', 'ADBE', 'NKE', 'TXN', 'PM', 'UNP',
  'RTX', 'BMY', 'ORCL', 'HON', 'QCOM', 'COP', 'LOW', 'AMGN', 'UPS', 'IBM',
  'SPGI', 'CAT', 'BA', 'GE', 'SBUX', 'INTC', 'INTU', 'AMD', 'PLD', 'AMAT',
  'DE', 'ISRG', 'MDLZ', 'ADP', 'GILD', 'ADI', 'BKNG', 'REGN', 'VRTX', 'MMC',
  'TJX', 'SYK', 'CVS', 'LRCX', 'PGR', 'ZTS', 'CB', 'CI', 'SCHW', 'MO',
  // Tech
  'CRM', 'NOW', 'SNOW', 'PLTR', 'CRWD', 'ZS', 'NET', 'DDOG', 'MDB', 'OKTA',
  'PANW', 'WDAY', 'TEAM', 'VEEV', 'HUBS', 'TTD', 'SHOP', 'SQ', 'PYPL', 'COIN',
  'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'UBER', 'LYFT', 'DASH', 'ABNB',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'DVN', 'HES', 'HAL', 'BKR',
  'VLO', 'MPC', 'PSX', 'FANG', 'ET', 'EPD', 'KMI', 'WMB', 'OKE', 'LNG',
  // Uranium/Nuclear
  'CCJ', 'UEC', 'DNN', 'NXE', 'UUUU', 'URG', 'LEU', 'SMR', 'OKLO', 'NNE',
  // Mining/Materials  
  'NEM', 'GOLD', 'FNV', 'WPM', 'FCX', 'SCCO', 'RIO', 'BHP', 'VALE', 'CLF',
  'NUE', 'STLD', 'AA', 'LAC', 'ALB', 'SQM', 'MP',
  // Defense
  'LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'TDG', 'HII', 'KTOS', 'AVAV',
  'RKLB', 'AXON', 'LDOS', 'SAIC',
  // Financials
  'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'SCHW', 'BLK', 'BX', 'KKR',
  // EV/Auto
  'TSLA', 'RIVN', 'LCID', 'NIO', 'F', 'GM',
  // Crypto-adjacent
  'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK',
  // ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'XLF', 'XLE', 'XLK', 'XLV',
  'GLD', 'SLV', 'USO', 'TLT', 'HYG', 'ARKK', 'SOXL', 'TQQQ', 'URA',
])

function getWeekId(date: Date): string {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${year}-W${week.toString().padStart(2, '0')}`
}

function getRevealDate(date: Date): string {
  const d = new Date(date)
  const daysUntilFriday = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + daysUntilFriday + 7)
  return d.toISOString().split('T')[0]
}

async function verifyApiKey(apiKey: string): Promise<{ agent_id: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const { data, error } = await getSupabaseAdmin()
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  
  await getSupabaseAdmin()
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)

  return data
}

async function getAgentPosition(agentId: string, ticker: string) {
  const { data } = await getSupabaseAdmin()
    .from('positions')
    .select('*')
    .eq('agent_id', agentId)
    .eq('ticker', ticker)
    .single()
  return data
}

export async function POST(request: NextRequest) {
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

    const supabase = getSupabaseAdmin()
    
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, status, points, cash_balance')
      .eq('id', keyData.agent_id)
      .single()

    if (agentError || !agent || agent.status !== 'active') {
      return NextResponse.json(
        { error: 'Agent not active' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { ticker, action, amount } = body

    if (!ticker || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, action' },
        { status: 400 }
      )
    }

    const upperTicker = ticker.toUpperCase()
    const upperAction = action.toUpperCase() as TradeAction
    const tradeAmount = amount ? Number(amount) : null

    // Validate action
    if (!VALID_ACTIONS.includes(upperAction)) {
      return NextResponse.json(
        { error: `Invalid action. Must be: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate ticker
    if (!VALID_TICKERS.has(upperTicker)) {
      return NextResponse.json(
        { error: `Invalid ticker: ${upperTicker}. Must be a liquid NYSE/NASDAQ stock or ETF.` },
        { status: 400 }
      )
    }

    // Get current position
    const currentPosition = await getAgentPosition(agent.id, upperTicker)
    const cashBalance = agent.cash_balance || agent.points || 1000000

    // Validate based on action
    if (upperAction === 'BUY' || upperAction === 'SHORT') {
      // Opening a new position - amount required
      if (!tradeAmount) {
        return NextResponse.json(
          { error: 'Amount required for BUY/SHORT. Specify points to allocate (e.g., amount: 10000)' },
          { status: 400 }
        )
      }
      
      if (tradeAmount < MIN_TRADE_AMOUNT) {
        return NextResponse.json(
          { error: `Minimum trade amount is ${MIN_TRADE_AMOUNT.toLocaleString()} points` },
          { status: 400 }
        )
      }
      
      if (tradeAmount > MAX_TRADE_AMOUNT) {
        return NextResponse.json(
          { error: `Maximum trade amount is ${MAX_TRADE_AMOUNT.toLocaleString()} points` },
          { status: 400 }
        )
      }
      
      if (tradeAmount > cashBalance) {
        return NextResponse.json(
          { error: `Insufficient idle points. Have ${cashBalance.toLocaleString()}, need ${tradeAmount.toLocaleString()}` },
          { status: 400 }
        )
      }

      if (currentPosition) {
        return NextResponse.json(
          { error: `Already have a ${currentPosition.direction} position in ${upperTicker}. Close it first.` },
          { status: 400 }
        )
      }
    }

    if (upperAction === 'SELL' || upperAction === 'COVER') {
      // Closing a position
      if (!currentPosition) {
        return NextResponse.json(
          { error: `No position in ${upperTicker} to close.` },
          { status: 400 }
        )
      }
      
      if (upperAction === 'SELL' && currentPosition.direction !== 'LONG') {
        return NextResponse.json(
          { error: `Cannot SELL: position is ${currentPosition.direction}, not LONG` },
          { status: 400 }
        )
      }
      
      if (upperAction === 'COVER' && currentPosition.direction !== 'SHORT') {
        return NextResponse.json(
          { error: `Cannot COVER: position is ${currentPosition.direction}, not SHORT` },
          { status: 400 }
        )
      }
    }

    // Check daily trade limit
    const today = new Date().toISOString().split('T')[0]
    const { count } = await supabase
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

    const now = new Date()
    const weekId = getWeekId(now)
    const revealDate = getRevealDate(now)

    // Execute the trade
    let newCashBalance = cashBalance
    let positionResult: string

    if (upperAction === 'BUY' || upperAction === 'SHORT') {
      // Open position: deduct from cash
      newCashBalance = cashBalance - tradeAmount!
      
      await supabase.from('positions').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        direction: upperAction === 'BUY' ? 'LONG' : 'SHORT',
        amount_points: tradeAmount,
      })
      
      positionResult = `Opened ${upperAction === 'BUY' ? 'LONG' : 'SHORT'} ${upperTicker} with ${tradeAmount!.toLocaleString()} points`
    } else {
      // Close position: add back to cash
      const positionAmount = currentPosition!.amount_points
      newCashBalance = cashBalance + Number(positionAmount)
      
      await supabase.from('positions')
        .delete()
        .eq('agent_id', agent.id)
        .eq('ticker', upperTicker)
      
      positionResult = `Closed ${currentPosition!.direction} ${upperTicker}, returned ${Number(positionAmount).toLocaleString()} points`
    }

    // Update agent's cash balance
    await supabase.from('agents')
      .update({ cash_balance: newCashBalance })
      .eq('id', agent.id)

    // Record the trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: upperAction,
        amount: tradeAmount || (currentPosition?.amount_points),
        week_id: weekId,
        reveal_date: revealDate,
      })
      .select()
      .single()

    if (tradeError) throw tradeError

    // Calculate working points (sum of all positions)
    const { data: positions } = await supabase
      .from('positions')
      .select('amount_points')
      .eq('agent_id', agent.id)
    
    const workingPoints = positions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0

    return NextResponse.json({
      success: true,
      trade: {
        id: trade.id,
        ticker: trade.ticker,
        action: trade.action,
        amount: trade.amount,
        submitted_at: trade.submitted_at,
        reveal_date: trade.reveal_date,
      },
      result: positionResult,
      balance: {
        idle_points: newCashBalance,
        working_points: workingPoints,
        total_points: newCashBalance + workingPoints,
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

// GET: List agent's positions and trades
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

    const supabase = getSupabaseAdmin()
    
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, points, cash_balance')
      .eq('id', keyData.agent_id)
      .single()

    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('agent_id', keyData.agent_id)

    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('agent_id', keyData.agent_id)
      .order('submitted_at', { ascending: false })
      .limit(50)

    const workingPoints = positions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
    const idlePoints = agent?.cash_balance || agent?.points || 1000000

    return NextResponse.json({ 
      balance: {
        idle_points: idlePoints,
        working_points: workingPoints,
        total_points: idlePoints + workingPoints,
      },
      positions: positions || [],
      trades: trades || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch data', details: error.message },
      { status: 500 }
    )
  }
}
