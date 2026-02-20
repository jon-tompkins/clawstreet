import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import yahooFinance from 'yahoo-finance2'

export const dynamic = 'force-dynamic'

const STARTING_BALANCE = 1000000
const MAX_TRADES_PER_DAY = 10
const BLACKOUT_START_HOUR = 15  // 3 PM EST
const BLACKOUT_START_MIN = 58   // 3:58 PM EST
const BLACKOUT_END_HOUR = 16    // 4 PM EST (reopens after close prices pulled)

const ALLOWED_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
  'JPM', 'V', 'UNH', 'MA', 'HD', 'PG', 'JNJ', 'ABBV', 'BAC', 'KO', 'MRK',
  'PEP', 'COST', 'AVGO', 'TMO', 'MCD', 'WMT', 'CSCO', 'ABT', 'CRM', 'ACN',
  'LLY', 'DHR', 'ADBE', 'NKE', 'TXN', 'NEE', 'PM', 'UPS', 'RTX', 'BMY',
  'QCOM', 'LOW', 'INTC', 'AMD', 'INTU', 'SPGI', 'IBM', 'HON', 'CAT', 'GE',
  'AMAT', 'DE', 'SBUX', 'GS', 'AXP', 'BKNG', 'ISRG', 'MDLZ', 'ADI', 'GILD',
  'CVS', 'BLK', 'SYK', 'TJX', 'MMC', 'LMT', 'REGN', 'CI', 'ZTS', 'CB',
  'VRTX', 'AMT', 'CME', 'TMUS', 'MO', 'DUK', 'SO', 'PLD', 'CL', 'EOG',
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY',
  'GLD', 'SLV', 'TLT', 'HYG', 'VXX', 'USO', 'EEM', 'FXI', 'EFA', 'VNQ',
  'PLTR', 'COIN', 'SNOW', 'NET', 'DDOG', 'ZS', 'CRWD', 'PANW', 'OKTA', 'MDB',
  'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'F', 'GM', 'TM', 'STLA', 'HMC',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY', 'MPC', 'VLO', 'PSX', 'PXD', 'DVN',
  'CCJ', 'URA', 'SMR', 'LEU', 'NNE', 'OKLO', 'CEG', 'VST', 'NRG', 'AES',
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'HII', 'LHX', 'TDG', 'HEI', 'TXT',
  'RKLB', 'LUNR', 'ASTS', 'MNTS', 'RDW', 'SPCE', 'ASTR', 'PL', 'BKSY', 'IRDM',
  'ARM', 'SMCI', 'MRVL', 'MU', 'KLAC', 'LRCX', 'ASML', 'TSM', 'SNPS', 'CDNS',
]

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Check if we're in blackout period
function isBlackoutPeriod(): { blocked: boolean; reason?: string } {
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = est.getHours()
  const min = est.getMinutes()
  const day = est.getDay()
  
  // Weekend - no trading
  if (day === 0 || day === 6) {
    return { blocked: true, reason: 'Market closed (weekend)' }
  }
  
  // Before market open (9:30 AM EST)
  if (hour < 9 || (hour === 9 && min < 30)) {
    return { blocked: true, reason: 'Market not yet open (opens 9:30 AM EST)' }
  }
  
  // After market close (4:00 PM EST)
  if (hour >= BLACKOUT_END_HOUR) {
    return { blocked: true, reason: 'Market closed (after 4:00 PM EST)' }
  }
  
  // Blackout period (3:58 PM - 4:00 PM EST)
  if (hour === BLACKOUT_START_HOUR && min >= BLACKOUT_START_MIN) {
    return { blocked: true, reason: 'Blackout period (3:58-4:00 PM EST)' }
  }
  
  return { blocked: false }
}

// Verify API key
async function verifyApiKey(apiKey: string) {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  return data
}

// Get current price from Yahoo Finance
async function getPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(ticker)
    return quote?.regularMarketPrice || null
  } catch {
    return null
  }
}

// Get week ID for grouping
function getWeekId(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

// Get reveal date (Friday of current week)
function getRevealDate(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const daysUntilFriday = day <= 5 ? 5 - day : 6
  d.setDate(d.getDate() + daysUntilFriday)
  d.setHours(16, 0, 0, 0)
  return d.toISOString()
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  
  try {
    // Check blackout
    const blackout = isBlackoutPeriod()
    if (blackout.blocked) {
      return NextResponse.json({ error: blackout.reason }, { status: 403 })
    }
    
    // Verify API key
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }
    
    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    // Get agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, status, cash_balance, points')
      .eq('id', keyData.agent_id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    if (agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not active' }, { status: 403 })
    }
    
    // Check daily trade limit
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const { count: todayTrades } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('created_at', todayStart.toISOString())
    
    if ((todayTrades || 0) >= MAX_TRADES_PER_DAY) {
      return NextResponse.json({ 
        error: `Daily trade limit reached (${MAX_TRADES_PER_DAY} trades/day)` 
      }, { status: 429 })
    }
    
    // Parse request
    const body = await request.json()
    const { action, direction, ticker, amount } = body
    const upperAction = action?.toUpperCase()
    const upperDirection = direction?.toUpperCase()
    const upperTicker = ticker?.toUpperCase()
    
    // Validate action
    if (!['OPEN', 'CLOSE'].includes(upperAction)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be OPEN or CLOSE' 
      }, { status: 400 })
    }
    
    // Validate ticker
    if (!upperTicker || !ALLOWED_TICKERS.includes(upperTicker)) {
      return NextResponse.json({ 
        error: `Invalid ticker. Must be one of: ${ALLOWED_TICKERS.slice(0, 20).join(', ')}...` 
      }, { status: 400 })
    }
    
    // Get current price
    const price = await getPrice(upperTicker)
    if (!price) {
      return NextResponse.json({ error: 'Could not fetch price' }, { status: 500 })
    }
    
    // Check for existing position
    const { data: existingPosition } = await supabase
      .from('positions')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('ticker', upperTicker)
      .single()
    
    const now = new Date()
    const weekId = getWeekId(now)
    const revealDate = getRevealDate(now)
    const cashBalance = Number(agent.cash_balance) || STARTING_BALANCE
    
    // ===== OPEN TRADE =====
    if (upperAction === 'OPEN') {
      // Validate direction for opens
      if (!['LONG', 'SHORT'].includes(upperDirection)) {
        return NextResponse.json({ 
          error: 'OPEN requires direction: LONG or SHORT' 
        }, { status: 400 })
      }
      
      // Validate amount
      const claws = Number(amount)
      if (!claws || claws <= 0) {
        return NextResponse.json({ error: 'OPEN requires positive amount (claws)' }, { status: 400 })
      }
      
      // Can't open if position already exists
      if (existingPosition) {
        return NextResponse.json({ 
          error: `Position already exists in ${upperTicker}. Must CLOSE first.` 
        }, { status: 400 })
      }
      
      // Check balance
      if (claws > cashBalance) {
        return NextResponse.json({ 
          error: `Insufficient balance. Have ${cashBalance.toLocaleString()} claws, need ${claws.toLocaleString()}` 
        }, { status: 400 })
      }
      
      // Calculate shares
      const shares = claws / price
      const signedShares = upperDirection === 'SHORT' ? -shares : shares
      
      // Create position
      const { error: posError } = await supabase.from('positions').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        direction: upperDirection,
        shares: signedShares,
        entry_price: price,
        amount_points: claws,
      })
      
      if (posError) throw posError
      
      // Update cash balance
      const newCashBalance = cashBalance - claws
      const newTotalPoints = newCashBalance + claws // working claws = claws just invested
      
      // Get all positions for accurate total
      const { data: allPositions } = await supabase
        .from('positions')
        .select('amount_points')
        .eq('agent_id', agent.id)
      const totalWorking = allPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      
      await supabase.from('agents').update({ 
        cash_balance: newCashBalance,
        points: newCashBalance + totalWorking
      }).eq('id', agent.id)
      
      // Record trade
      const { data: trade } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: 'OPEN',
        direction: upperDirection,
        amount: claws,
        shares: signedShares,
        execution_price: price,
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: now.toISOString(),
      }).select().single()
      
      return NextResponse.json({
        success: true,
        trade: {
          id: trade?.id,
          action: 'OPEN',
          direction: upperDirection,
          ticker: upperTicker,
          shares: Math.abs(shares).toFixed(4),
          price: price,
          amount: claws,
        },
        result: `OPEN ${upperDirection} ${upperTicker}: ${Math.abs(shares).toFixed(2)} shares @ $${price.toFixed(2)} (${claws.toLocaleString()} claws)`,
        balance: {
          cash: Math.round(newCashBalance),
          working: Math.round(totalWorking),
          total: Math.round(newCashBalance + totalWorking),
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
      })
    }
    
    // ===== CLOSE TRADE =====
    if (upperAction === 'CLOSE') {
      // Must have existing position
      if (!existingPosition) {
        return NextResponse.json({ 
          error: `No position in ${upperTicker} to close` 
        }, { status: 400 })
      }
      
      const posDirection = existingPosition.direction
      const posShares = Math.abs(Number(existingPosition.shares))
      const entryPrice = Number(existingPosition.entry_price)
      const costBasis = Number(existingPosition.amount_points)
      
      // Calculate P&L
      let closeValue: number
      let pnl: number
      
      if (posDirection === 'LONG') {
        closeValue = posShares * price
        pnl = closeValue - costBasis
      } else {
        // SHORT: profit when price drops
        closeValue = costBasis + ((entryPrice - price) * posShares)
        pnl = closeValue - costBasis
      }
      
      const pnlPercent = (pnl / costBasis) * 100
      
      // Delete position
      await supabase.from('positions').delete().eq('id', existingPosition.id)
      
      // Update cash balance (return close value)
      const newCashBalance = cashBalance + closeValue
      
      // Get remaining positions for total
      const { data: remainingPositions } = await supabase
        .from('positions')
        .select('amount_points')
        .eq('agent_id', agent.id)
      const totalWorking = remainingPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      
      await supabase.from('agents').update({ 
        cash_balance: newCashBalance,
        points: newCashBalance + totalWorking
      }).eq('id', agent.id)
      
      // Record trade
      const signedSharesClosed = posDirection === 'SHORT' ? posShares : -posShares
      
      const { data: trade } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: 'CLOSE',
        direction: posDirection,
        amount: Math.round(closeValue),
        shares: signedSharesClosed,
        execution_price: price,
        close_price: price,
        pnl_points: Math.round(pnl),
        pnl_percent: pnlPercent,
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: now.toISOString(),
      }).select().single()
      
      const pnlSign = pnl >= 0 ? '+' : ''
      
      return NextResponse.json({
        success: true,
        trade: {
          id: trade?.id,
          action: 'CLOSE',
          direction: posDirection,
          ticker: upperTicker,
          shares: posShares.toFixed(4),
          entry_price: entryPrice,
          close_price: price,
          pnl: Math.round(pnl),
          pnl_percent: Number(pnlPercent.toFixed(2)),
        },
        result: `CLOSE ${posDirection} ${upperTicker}: ${posShares.toFixed(2)} shares @ $${price.toFixed(2)} | P&L: ${pnlSign}${Math.round(pnl).toLocaleString()} claws (${pnlSign}${pnlPercent.toFixed(2)}%)`,
        balance: {
          cash: Math.round(newCashBalance),
          working: Math.round(totalWorking),
          total: Math.round(newCashBalance + totalWorking),
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error: any) {
    console.error('Trade error:', error)
    return NextResponse.json({ 
      error: 'Trade failed', 
      details: error.message 
    }, { status: 500 })
  }
}

// GET: Check trading status and agent balance
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('X-API-Key')
  if (!apiKey) {
    // Public status check
    const blackout = isBlackoutPeriod()
    return NextResponse.json({ 
      trading_open: !blackout.blocked,
      reason: blackout.reason || 'Trading open',
      max_trades_per_day: MAX_TRADES_PER_DAY,
    })
  }
  
  const keyData = await verifyApiKey(apiKey)
  if (!keyData) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }
  
  const supabase = getSupabase()
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, cash_balance, points')
    .eq('id', keyData.agent_id)
    .single()
  
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  
  // Get today's trade count
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  
  const { count: todayTrades } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .gte('created_at', todayStart.toISOString())
  
  // Get positions
  const { data: positions } = await supabase
    .from('positions')
    .select('ticker, direction, shares, entry_price, amount_points')
    .eq('agent_id', agent.id)
  
  const blackout = isBlackoutPeriod()
  
  return NextResponse.json({
    agent: agent.name,
    trading_open: !blackout.blocked,
    reason: blackout.reason || 'Trading open',
    balance: {
      cash: Number(agent.cash_balance),
      total: Number(agent.points),
    },
    positions: positions?.map(p => ({
      ticker: p.ticker,
      direction: p.direction,
      shares: Math.abs(Number(p.shares)).toFixed(4),
      entry_price: Number(p.entry_price),
      amount: Number(p.amount_points),
    })) || [],
    trades_today: todayTrades || 0,
    trades_remaining: MAX_TRADES_PER_DAY - (todayTrades || 0),
  })
}
