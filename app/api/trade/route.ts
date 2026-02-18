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

// S&P 500 + most liquid NASDAQ (top ~600 tickers by liquidity)
// This is a subset — expand as needed
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
  'EOG', 'SO', 'DUK', 'BDX', 'ITW', 'CME', 'SLB', 'SNPS', 'CL', 'CDNS',
  'NOC', 'EQIX', 'HUM', 'PNC', 'APD', 'MMM', 'AON', 'MU', 'ETN', 'ICE',
  'FDX', 'MCO', 'WM', 'EMR', 'GD', 'NSC', 'CCI', 'ORLY', 'SHW', 'PXD',
  'AZO', 'ATVI', 'KLAC', 'MCHP', 'MAR', 'KMB', 'AEP', 'MSI', 'D', 'PSA',
  'FTNT', 'AIG', 'MET', 'F', 'GM', 'TGT', 'EL', 'ADSK', 'OXY', 'MRNA',
  'DVN', 'NEM', 'CTSH', 'TRV', 'HCA', 'PAYX', 'ROST', 'YUM', 'KDP', 'TEL',
  'VLO', 'AMP', 'NXPI', 'A', 'STZ', 'HPQ', 'SRE', 'WMB', 'CARR', 'GIS',
  'DG', 'O', 'DLTR', 'ALL', 'FAST', 'EA', 'HES', 'PRU', 'CTAS', 'LHX',
  'CMG', 'KR', 'MSCI', 'VRSK', 'PH', 'RMD', 'WELL', 'DLR', 'BIIB', 'IQV',
  'AFL', 'PCAR', 'HSY', 'IDXX', 'ALB', 'XEL', 'AME', 'DXCM', 'MTD', 'ODFL',
  'MNST', 'CPRT', 'EW', 'HAL', 'FANG', 'AJG', 'EXC', 'DOW', 'CTVA', 'GWW',
  'VICI', 'ED', 'CSGP', 'IT', 'KEYS', 'ON', 'ANSS', 'CDW', 'ROK', 'OTIS',
  'WST', 'DD', 'PPG', 'SBAC', 'WEC', 'WBD', 'GPN', 'APTV', 'VMC', 'MLM',
  'BKR', 'STT', 'ILMN', 'AWK', 'DHI', 'LEN', 'TSCO', 'CHD', 'RJF', 'URI',
  'CBOE', 'FIS', 'TROW', 'HBAN', 'FRC', 'FITB', 'DTE', 'ES', 'CFG', 'EIX',
  'CINF', 'RF', 'LUV', 'DAL', 'UAL', 'AAL', 'CCL', 'RCL', 'NCLH', 'MAA',
  'LVS', 'MGM', 'WYNN', 'HLT', 'IRM', 'TDG', 'WAB', 'BALL', 'HOLX', 'ALGN',
  'POOL', 'JBHT', 'EXPD', 'CHRW', 'XYL', 'WAT', 'FE', 'NTRS', 'SYF', 'KEY',
  'NDAQ', 'EPAM', 'TRMB', 'LDOS', 'TER', 'PAYC', 'MKTX', 'AKAM', 'PKI', 'TXT',
  'CE', 'ZBRA', 'PTC', 'SWKS', 'MOH', 'DRI', 'ULTA', 'BBY', 'ETSY', 'EBAY',
  'ENPH', 'SEDG', 'GNRC', 'MPWR', 'MTCH', 'SNAP', 'PINS', 'ROKU', 'ZM', 'DOCU',
  'CRWD', 'ZS', 'NET', 'DDOG', 'SNOW', 'MDB', 'OKTA', 'PANW', 'SPLK', 'WDAY',
  'NOW', 'CRM', 'TEAM', 'VEEV', 'HUBS', 'TTD', 'BILL', 'SHOP', 'SQ', 'PYPL',
  'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'LC', 'NFLX', 'DIS', 'CMCSA', 'T',
  'VZ', 'TMUS', 'CHTR', 'PARA', 'WBD', 'FOX', 'FOXA', 'NWS', 'NWSA', 'OMC',
  'IPG', 'MTCH', 'IAC', 'EXPE', 'BKNG', 'ABNB', 'UBER', 'LYFT', 'DASH', 'GRAB',
  'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'FSR', 'GOEV', 'NKLA', 'RIDE', 'WKHS',
  'PLTR', 'PATH', 'AI', 'BBAI', 'SOUN', 'GENI', 'STEM', 'CHPT', 'BLNK', 'EVGO',
  'PLUG', 'FCEL', 'BE', 'BLDP', 'CLNE', 'RUN', 'NOVA', 'ARRY', 'MAXN', 'JKS',
  'SPWR', 'CSIQ', 'DQ', 'FLNC', 'EOSE', 'QS', 'MVST', 'DCRC', 'SLDP', 'AMPX',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PXD', 'OXY', 'DVN', 'HES', 'HAL', 'BKR',
  'VLO', 'MPC', 'PSX', 'FANG', 'APA', 'CTRA', 'MRO', 'OVV', 'MTDR', 'PR',
  'ET', 'EPD', 'KMI', 'WMB', 'OKE', 'TRGP', 'LNG', 'PAA', 'MPLX', 'ENLC',
  // Uranium/Nuclear
  'CCJ', 'UEC', 'DNN', 'NXE', 'UUUU', 'URG', 'LEU', 'SMR', 'OKLO', 'NNE',
  // Mining/Materials  
  'NEM', 'GOLD', 'FNV', 'WPM', 'AEM', 'KGC', 'AU', 'AGI', 'BTG', 'EGO',
  'FCX', 'SCCO', 'TECK', 'RIO', 'BHP', 'VALE', 'CLF', 'X', 'NUE', 'STLD',
  'AA', 'CENX', 'ACH', 'LAC', 'ALB', 'SQM', 'LTHM', 'PLL', 'MP', 'UUUU',
  // Defense
  'LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'TDG', 'HII', 'TXT', 'KTOS',
  'PLTR', 'ONDS', 'AVAV', 'RKLB', 'ASTS', 'BWXT', 'AXON', 'CACI', 'LDOS', 'SAIC',
  // Financials
  'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'SCHW', 'BLK', 'BX', 'KKR', 'APO',
  'ARES', 'CG', 'OWL', 'TROW', 'BEN', 'IVZ', 'AMG', 'JEF', 'EVR', 'HLI',
  // Crypto-adjacent
  'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'IREN', 'HUT', 'BITF', 'CIFR', 'CORZ',
  // Healthcare
  'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'DHR', 'BMY',
  'AMGN', 'GILD', 'REGN', 'VRTX', 'MRNA', 'BNTX', 'ZTS', 'SYK', 'BDX', 'MDT',
  'ISRG', 'EW', 'BSX', 'ZBH', 'HOLX', 'DXCM', 'ALGN', 'PODD', 'IDXX', 'A',
  // REITs
  'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'SPG', 'WELL', 'DLR', 'O', 'VICI',
  'AVB', 'EQR', 'MAA', 'ESS', 'UDR', 'INVH', 'AMH', 'SUI', 'ELS', 'CPT',
  // ETFs (popular liquid ones)
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'VEA', 'VWO', 'EEM', 'EFA',
  'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'JNK', 'AGG', 'BND',
  'ARKK', 'ARKG', 'ARKF', 'ARKW', 'ARKQ', 'SOXL', 'SOXS', 'TQQQ', 'SQQQ', 'SPXS',
  'UVXY', 'VXX', 'SVXY', 'UPRO', 'SPXU', 'TNA', 'TZA', 'FAS', 'FAZ', 'LABU',
  'LABD', 'NUGT', 'DUST', 'JNUG', 'JDST', 'ERX', 'ERY', 'BOIL', 'KOLD', 'URA',
])

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
  const daysUntilFriday = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + daysUntilFriday + 7)
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
  
  await getSupabaseAdmin()
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)

  return data
}

// Get agent's current position for a ticker
async function getPosition(agentId: string, ticker: string): Promise<'LONG' | 'SHORT' | null> {
  const supabase = getSupabaseAdmin()
  
  // Get all trades for this agent/ticker, ordered by time
  const { data: trades } = await supabase
    .from('trades')
    .select('action')
    .eq('agent_id', agentId)
    .eq('ticker', ticker)
    .order('submitted_at', { ascending: true })

  if (!trades || trades.length === 0) return null

  // Calculate net position
  let position: 'LONG' | 'SHORT' | null = null
  
  for (const trade of trades) {
    switch (trade.action) {
      case 'BUY':
        position = 'LONG'
        break
      case 'SELL':
        position = null
        break
      case 'SHORT':
        position = 'SHORT'
        break
      case 'COVER':
        position = null
        break
    }
  }

  return position
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

    const body = await request.json()
    const { ticker, action } = body

    if (!ticker || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, action' },
        { status: 400 }
      )
    }

    const upperTicker = ticker.toUpperCase()
    const upperAction = action.toUpperCase() as TradeAction

    // Validate action
    if (!VALID_ACTIONS.includes(upperAction)) {
      return NextResponse.json(
        { error: `Invalid action. Must be: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate ticker is in whitelist
    if (!VALID_TICKERS.has(upperTicker)) {
      return NextResponse.json(
        { error: `Invalid ticker: ${upperTicker}. Must be a liquid NYSE/NASDAQ stock or ETF.` },
        { status: 400 }
      )
    }

    // Check position requirements
    const currentPosition = await getPosition(agent.id, upperTicker)

    if (upperAction === 'SELL') {
      if (currentPosition !== 'LONG') {
        return NextResponse.json(
          { error: `Cannot SELL ${upperTicker}: no long position. Must BUY first.` },
          { status: 400 }
        )
      }
    }

    if (upperAction === 'COVER') {
      if (currentPosition !== 'SHORT') {
        return NextResponse.json(
          { error: `Cannot COVER ${upperTicker}: no short position. Must SHORT first.` },
          { status: 400 }
        )
      }
    }

    if (upperAction === 'BUY') {
      if (currentPosition === 'LONG') {
        return NextResponse.json(
          { error: `Already LONG ${upperTicker}. SELL first to close, then BUY again.` },
          { status: 400 }
        )
      }
      if (currentPosition === 'SHORT') {
        return NextResponse.json(
          { error: `Currently SHORT ${upperTicker}. COVER first before going LONG.` },
          { status: 400 }
        )
      }
    }

    if (upperAction === 'SHORT') {
      if (currentPosition === 'SHORT') {
        return NextResponse.json(
          { error: `Already SHORT ${upperTicker}. COVER first to close, then SHORT again.` },
          { status: 400 }
        )
      }
      if (currentPosition === 'LONG') {
        return NextResponse.json(
          { error: `Currently LONG ${upperTicker}. SELL first before going SHORT.` },
          { status: 400 }
        )
      }
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

    const now = new Date()
    const weekId = getWeekId(now)
    const revealDate = getRevealDate(now)

    const { data: trade, error: tradeError } = await getSupabaseAdmin()
      .from('trades')
      .insert({
        agent_id: agent.id,
        ticker: upperTicker,
        action: upperAction,
        week_id: weekId,
        reveal_date: revealDate,
      })
      .select()
      .single()

    if (tradeError) throw tradeError

    // Determine new position after trade
    const newPosition = (upperAction === 'BUY') ? 'LONG' 
      : (upperAction === 'SHORT') ? 'SHORT' 
      : null

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
      position: newPosition ? `Now ${newPosition} ${upperTicker}` : `Closed ${upperTicker} position`,
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
