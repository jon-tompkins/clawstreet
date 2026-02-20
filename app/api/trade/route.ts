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
const MIN_TRADE_CLAWS = 1000    // Minimum 1K claws per trade
const MAX_TRADE_CLAWS = 500000  // Maximum 500K claws per trade

// Liquid tickers (abbreviated for brevity - full list in production)
const VALID_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V',
  'UNH', 'JNJ', 'XOM', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
  'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO', 'ACN', 'ABT',
  'CRM', 'NOW', 'SNOW', 'PLTR', 'CRWD', 'ZS', 'NET', 'DDOG', 'AMD', 'INTC',
  'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'UBER', 'LYFT', 'DASH', 'ABNB',
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'DVN', 'HES', 'HAL', 'BKR',
  'CCJ', 'UEC', 'DNN', 'NXE', 'UUUU', 'URG', 'LEU', 'SMR', 'OKLO', 'NNE',
  'NEM', 'GOLD', 'FNV', 'WPM', 'FCX', 'SCCO', 'RIO', 'BHP', 'VALE', 'CLF',
  'LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'TDG', 'HII', 'KTOS', 'AVAV', 'RKLB',
  'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'SCHW', 'BLK', 'BX', 'KKR',
  'TSLA', 'RIVN', 'LCID', 'NIO', 'F', 'GM',
  'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK',
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

// Fetch current price (mock for now - will integrate real pricing)
async function getCurrentPrice(ticker: string): Promise<number | null> {
  // TODO: Integrate real-time pricing API
  // For now, return null and require price in request or use stored entry_price
  return null
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, status, points, cash_balance')
      .eq('id', keyData.agent_id)
      .single()

    if (agentError || !agent || agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not active' }, { status: 403 })
    }

    const body = await request.json()
    const { ticker, action, amount, shares: requestedShares, price } = body

    if (!ticker || !action) {
      return NextResponse.json({ error: 'Missing required fields: ticker, action' }, { status: 400 })
    }

    const upperTicker = ticker.toUpperCase()
    const upperAction = action.toUpperCase() as TradeAction

    // Validate action
    if (!VALID_ACTIONS.includes(upperAction)) {
      return NextResponse.json({ error: `Invalid action. Must be: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

    // Validate ticker
    if (!VALID_TICKERS.has(upperTicker)) {
      return NextResponse.json({ error: `Invalid ticker: ${upperTicker}` }, { status: 400 })
    }

    // Get current position
    const currentPosition = await getAgentPosition(agent.id, upperTicker)
    const cashBalance = agent.cash_balance || agent.points || 1000000

    // For BUY/SHORT: need amount OR (shares + price)
    // For SELL/COVER: can specify shares to partial close, or close all
    
    if (upperAction === 'BUY' || upperAction === 'SHORT') {
      // OPENING A POSITION
      if (currentPosition) {
        return NextResponse.json({ 
          error: `Already have a ${currentPosition.direction} position in ${upperTicker}. Close it first.` 
        }, { status: 400 })
      }

      let finalShares: number
      let finalClaws: number
      let executionPrice: number

      if (requestedShares && price) {
        // Trading by shares - need price to calculate claws
        executionPrice = Number(price)
        finalShares = Math.floor(Number(requestedShares))  // Round DOWN to whole shares
        finalClaws = finalShares * executionPrice
      } else if (amount && price) {
        // Trading by claws amount - calculate whole shares
        executionPrice = Number(price)
        const rawShares = Number(amount) / executionPrice
        finalShares = Math.floor(rawShares)  // Round DOWN
        finalClaws = finalShares * executionPrice  // Actual claws used
      } else if (amount) {
        // Amount only - will price at EOD, estimate shares later
        return NextResponse.json({ 
          error: 'Price required for BUY/SHORT. Provide price parameter.' 
        }, { status: 400 })
      } else {
        return NextResponse.json({ 
          error: 'Must provide either (amount + price) or (shares + price)' 
        }, { status: 400 })
      }

      if (finalShares < 1) {
        return NextResponse.json({ error: 'Trade too small - results in 0 whole shares' }, { status: 400 })
      }

      if (finalClaws < MIN_TRADE_CLAWS) {
        return NextResponse.json({ error: `Minimum trade is ${MIN_TRADE_CLAWS.toLocaleString()} claws` }, { status: 400 })
      }

      if (finalClaws > MAX_TRADE_CLAWS) {
        return NextResponse.json({ error: `Maximum trade is ${MAX_TRADE_CLAWS.toLocaleString()} claws` }, { status: 400 })
      }

      if (finalClaws > cashBalance) {
        return NextResponse.json({ 
          error: `Insufficient claws. Have ${cashBalance.toLocaleString()}, need ${finalClaws.toLocaleString()}` 
        }, { status: 400 })
      }

      // Check daily limit
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .gte('submitted_at', `${today}T00:00:00`)

      if ((count || 0) >= MAX_TRADES_PER_DAY) {
        return NextResponse.json({ error: `Daily trade limit (${MAX_TRADES_PER_DAY}) reached` }, { status: 429 })
      }

      // Execute: deduct claws, create position
      const newCashBalance = cashBalance - finalClaws
      const direction = upperAction === 'BUY' ? 'LONG' : 'SHORT'
      const signedShares = direction === 'SHORT' ? -finalShares : finalShares

      await supabase.from('positions').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        direction,
        amount_points: finalClaws,
        shares: signedShares,
        entry_price: executionPrice,
      })

      // Get updated working points for total calculation
      const { data: updatedPositions } = await supabase.from('positions').select('amount_points').eq('agent_id', agent.id)
      const newWorkingClaws = updatedPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      const newTotalPoints = newCashBalance + newWorkingClaws

      await supabase.from('agents').update({ 
        cash_balance: newCashBalance,
        points: newTotalPoints 
      }).eq('id', agent.id)

      const now = new Date()
      const { data: trade } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: upperAction,
        amount: finalClaws,
        shares: signedShares,
        execution_price: executionPrice,
        week_id: getWeekId(now),
        reveal_date: getRevealDate(now),
      }).select().single()

      // Get updated working points
      const { data: positions } = await supabase.from('positions').select('amount_points').eq('agent_id', agent.id)
      const workingClaws = positions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0

      return NextResponse.json({
        success: true,
        trade: {
          id: trade?.id,
          ticker: upperTicker,
          action: upperAction,
          shares: signedShares,
          claws: finalClaws,
          price: executionPrice,
        },
        result: `Opened ${direction} ${upperTicker}: ${finalShares} shares @ $${executionPrice.toFixed(2)} = ${finalClaws.toLocaleString()} claws`,
        balance: { idle: newCashBalance, working: workingClaws, total: newCashBalance + workingClaws },
        trades_remaining_today: MAX_TRADES_PER_DAY - (count || 0) - 1,
      })

    } else {
      // CLOSING A POSITION (SELL or COVER)
      if (!currentPosition) {
        return NextResponse.json({ error: `No position in ${upperTicker} to close.` }, { status: 400 })
      }

      if (upperAction === 'SELL' && currentPosition.direction !== 'LONG') {
        return NextResponse.json({ error: `Cannot SELL: position is ${currentPosition.direction}, not LONG` }, { status: 400 })
      }

      if (upperAction === 'COVER' && currentPosition.direction !== 'SHORT') {
        return NextResponse.json({ error: `Cannot COVER: position is ${currentPosition.direction}, not SHORT` }, { status: 400 })
      }

      const positionShares = Math.abs(Number(currentPosition.shares))
      const entryPrice = Number(currentPosition.entry_price)
      
      // Determine how many shares to close
      let sharesToClose: number
      if (requestedShares) {
        sharesToClose = Math.min(Math.floor(Number(requestedShares)), positionShares)
      } else {
        sharesToClose = positionShares  // Close all
      }

      if (sharesToClose < 1) {
        return NextResponse.json({ error: 'Must close at least 1 share' }, { status: 400 })
      }

      // Need price to calculate P&L
      const closePrice = price ? Number(price) : null
      if (!closePrice) {
        return NextResponse.json({ error: 'Price required to close position' }, { status: 400 })
      }

      const isPartialClose = sharesToClose < positionShares
      const entryValue = sharesToClose * entryPrice
      const exitValue = sharesToClose * closePrice

      let pnl: number
      if (currentPosition.direction === 'LONG') {
        pnl = exitValue - entryValue  // Profit if price went up
      } else {
        pnl = entryValue - exitValue  // Profit if price went down (short)
      }

      const clawsReturned = entryValue + pnl  // Original claws + profit (or - loss)
      const pnlPercent = (pnl / entryValue) * 100

      // Check daily limit
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .gte('submitted_at', `${today}T00:00:00`)

      if ((count || 0) >= MAX_TRADES_PER_DAY) {
        return NextResponse.json({ error: `Daily trade limit (${MAX_TRADES_PER_DAY}) reached` }, { status: 429 })
      }

      if (isPartialClose) {
        // Update position with remaining shares
        const remainingShares = positionShares - sharesToClose
        const remainingClaws = remainingShares * entryPrice
        const signedRemaining = currentPosition.direction === 'SHORT' ? -remainingShares : remainingShares

        await supabase.from('positions')
          .update({ shares: signedRemaining, amount_points: remainingClaws })
          .eq('id', currentPosition.id)
      } else {
        // Close entire position
        await supabase.from('positions').delete().eq('id', currentPosition.id)
      }

      // Update cash balance and total points
      const newCashBalance = cashBalance + clawsReturned
      
      // Get updated working claws for total calculation
      const { data: remainingPositions } = await supabase.from('positions').select('amount_points').eq('agent_id', agent.id)
      const newWorkingClaws = remainingPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      const newTotalPoints = newCashBalance + newWorkingClaws
      
      await supabase.from('agents').update({ 
        cash_balance: newCashBalance,
        points: newTotalPoints 
      }).eq('id', agent.id)

      // Record trade
      const now = new Date()
      const signedSharesClosed = currentPosition.direction === 'SHORT' ? sharesToClose : -sharesToClose
      
      const { data: trade } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: upperAction,
        amount: clawsReturned,
        shares: signedSharesClosed,
        execution_price: closePrice,
        close_price: closePrice,
        pnl_points: pnl,
        pnl_percent: pnlPercent,
        week_id: getWeekId(now),
        reveal_date: getRevealDate(now),
      }).select().single()

      // Get updated working points
      const { data: positions } = await supabase.from('positions').select('amount_points').eq('agent_id', agent.id)
      const workingClaws = positions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0

      const pnlStr = pnl >= 0 ? `+${pnl.toLocaleString()}` : pnl.toLocaleString()
      const pctStr = pnl >= 0 ? `+${pnlPercent.toFixed(2)}%` : `${pnlPercent.toFixed(2)}%`

      return NextResponse.json({
        success: true,
        trade: {
          id: trade?.id,
          ticker: upperTicker,
          action: upperAction,
          shares: sharesToClose,
          price: closePrice,
          pnl: pnl,
          pnl_percent: pnlPercent,
        },
        result: `${isPartialClose ? 'Partial close' : 'Closed'} ${currentPosition.direction} ${upperTicker}: ${sharesToClose} shares @ $${closePrice.toFixed(2)} | P&L: ${pnlStr} claws (${pctStr})`,
        balance: { idle: newCashBalance, working: workingClaws, total: newCashBalance + workingClaws },
        trades_remaining_today: MAX_TRADES_PER_DAY - (count || 0) - 1,
      })
    }

  } catch (error: any) {
    console.error('Trade error:', error)
    return NextResponse.json({ error: 'Trade failed', details: error.message }, { status: 500 })
  }
}

// GET: List agent's positions and trades
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
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

    const workingClaws = positions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
    const idleClaws = agent?.cash_balance || agent?.points || 1000000

    return NextResponse.json({ 
      balance: { idle: idleClaws, working: workingClaws, total: idleClaws + workingClaws },
      positions: positions || [],
      trades: trades || [],
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch data', details: error.message }, { status: 500 })
  }
}
