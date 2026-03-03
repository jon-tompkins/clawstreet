import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { ethers } from 'ethers'
import YahooFinance from 'yahoo-finance2'
import { logTradeCommit, logTradeReveal, isBaseLoggingEnabled } from '@/app/lib/base-logger'

const yahooFinance = new YahooFinance()

export const dynamic = 'force-dynamic'

const STARTING_BALANCE = 1000000
const MAX_TRADES_PER_DAY = 10
const TRADING_FEE_RATE = 0.002  // 0.2% fee per trade
const MIN_RESERVE_LOBS = 5000   // Must keep 5k free for decay buffer
const BLACKOUT_START_HOUR = 15  // 3 PM EST
const BLACKOUT_START_MIN = 58   // 3:58 PM EST
const BLACKOUT_END_HOUR = 16    // 4 PM EST (reopens after close prices pulled)

// Top 100 crypto tickers (excluding stablecoins and staking tokens) - trade 24/7
const CRYPTO_TICKERS = [
  // Top 20 by market cap
  'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'SOL-USD',
  'ADA-USD', 'DOGE-USD', 'TRX-USD', 'AVAX-USD', 'LINK-USD',
  'DOT-USD', 'MATIC-USD', 'TON11419-USD', 'SHIB-USD', 'LTC-USD',
  'BCH-USD', 'UNI-USD', 'LEO-USD', 'XLM-USD', 'ATOM-USD',
  // 21-40
  'XMR-USD', 'ETC-USD', 'OKB-USD', 'FIL-USD', 'HBAR-USD',
  'NEAR-USD', 'ARB-USD', 'VET-USD', 'APT-USD', 'MKR-USD',
  'OP-USD', 'INJ-USD', 'GRT-USD', 'AAVE-USD', 'ALGO-USD',
  'RUNE-USD', 'FTM-USD', 'QNT-USD', 'THETA-USD', 'KAS-USD',
  // 41-60
  'RENDER-USD', 'IMX-USD', 'CRO-USD', 'FLOW-USD', 'AXS-USD',
  'SAND-USD', 'MANA-USD', 'EGLD-USD', 'XTZ-USD', 'CHZ-USD',
  'NEO-USD', 'KAVA-USD', 'IOTA-USD', 'ZEC-USD', 'CAKE-USD',
  'EOS-USD', 'SNX-USD', 'ROSE-USD', 'XDC-USD', 'MINA-USD',
  // 61-80
  'GALA-USD', 'ENJ-USD', 'CRV-USD', 'LDO-USD', '1INCH-USD',
  'COMP-USD', 'LRC-USD', 'ENS-USD', 'BAT-USD', 'ZRX-USD',
  'YFI-USD', 'SUSHI-USD', 'CELO-USD', 'ANKR-USD', 'STORJ-USD',
  'SKL-USD', 'AUDIO-USD', 'RLC-USD', 'NKN-USD', 'BAND-USD',
  // 81-100
  'OCEAN-USD', 'FET-USD', 'AGIX-USD', 'RNDR-USD', 'MASK-USD',
  'API3-USD', 'SSV-USD', 'GMX-USD', 'DYDX-USD', 'PENDLE-USD',
  'STX-USD', 'SUI-USD', 'SEI-USD', 'TIA-USD', 'JUP-USD',
  'WIF-USD', 'BONK-USD', 'PEPE-USD', 'FLOKI-USD', 'ORDI-USD',
]

const ALLOWED_TICKERS = [
  // Crypto (24/7)
  ...CRYPTO_TICKERS,
  // Stocks & ETFs
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

// Add trading fee to prize pool
async function addToPrizePool(supabase: any, amount: number) {
  if (amount <= 0) return
  
  try {
    const { data: stats } = await supabase
      .from('system_stats')
      .select('value')
      .eq('key', 'prize_pool')
      .single()
    
    const currentPool = stats?.value || 0
    
    await supabase
      .from('system_stats')
      .upsert({ 
        key: 'prize_pool', 
        value: currentPool + amount,
        updated_at: new Date().toISOString()
      })
  } catch (e) {
    // Prize pool tracking is non-critical, don't fail trades
    console.error('Failed to update prize pool:', e)
  }
}

// Check if we're in blackout period (crypto trades 24/7)
function isBlackoutPeriod(ticker?: string): { blocked: boolean; reason?: string } {
  // Crypto trades 24/7
  if (ticker && CRYPTO_TICKERS.includes(ticker.toUpperCase())) {
    return { blocked: false }
  }
  
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = est.getHours()
  const min = est.getMinutes()
  const day = est.getDay()
  
  // Weekend - no trading (except crypto)
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

// CoinGecko ID mapping for crypto tickers
const COINGECKO_IDS: Record<string, string> = {
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'BNB-USD': 'binancecoin',
  'XRP-USD': 'ripple',
  'SOL-USD': 'solana',
  'ADA-USD': 'cardano',
  'DOGE-USD': 'dogecoin',
  'TRX-USD': 'tron',
  'AVAX-USD': 'avalanche-2',
  'LINK-USD': 'chainlink',
  'DOT-USD': 'polkadot',
  'MATIC-USD': 'matic-network',
  'TON11419-USD': 'the-open-network',
  'SHIB-USD': 'shiba-inu',
  'LTC-USD': 'litecoin',
  'BCH-USD': 'bitcoin-cash',
  'UNI-USD': 'uniswap',
  'LEO-USD': 'leo-token',
  'XLM-USD': 'stellar',
  'ATOM-USD': 'cosmos',
  'XMR-USD': 'monero',
  'ETC-USD': 'ethereum-classic',
  'OKB-USD': 'okb',
  'FIL-USD': 'filecoin',
  'HBAR-USD': 'hedera-hashgraph',
  'NEAR-USD': 'near',
  'ARB-USD': 'arbitrum',
  'VET-USD': 'vechain',
  'APT-USD': 'aptos',
  'MKR-USD': 'maker',
  'OP-USD': 'optimism',
  'INJ-USD': 'injective-protocol',
  'GRT-USD': 'the-graph',
  'AAVE-USD': 'aave',
  'ALGO-USD': 'algorand',
  'RUNE-USD': 'thorchain',
  'FTM-USD': 'fantom',
  'QNT-USD': 'quant-network',
  'THETA-USD': 'theta-token',
  'KAS-USD': 'kaspa',
  'RENDER-USD': 'render-token',
  'IMX-USD': 'immutable-x',
  'CRO-USD': 'crypto-com-chain',
  'FLOW-USD': 'flow',
  'AXS-USD': 'axie-infinity',
  'SAND-USD': 'the-sandbox',
  'MANA-USD': 'decentraland',
  'EGLD-USD': 'elrond-erd-2',
  'XTZ-USD': 'tezos',
  'CHZ-USD': 'chiliz',
  'NEO-USD': 'neo',
  'KAVA-USD': 'kava',
  'IOTA-USD': 'iota',
  'ZEC-USD': 'zcash',
  'CAKE-USD': 'pancakeswap-token',
  'EOS-USD': 'eos',
  'SNX-USD': 'havven',
  'ROSE-USD': 'oasis-network',
  'XDC-USD': 'xdce-crowd-sale',
  'MINA-USD': 'mina-protocol',
  'GALA-USD': 'gala',
  'ENJ-USD': 'enjincoin',
  'CRV-USD': 'curve-dao-token',
  'LDO-USD': 'lido-dao',
  '1INCH-USD': '1inch',
  'COMP-USD': 'compound-governance-token',
  'LRC-USD': 'loopring',
  'ENS-USD': 'ethereum-name-service',
  'BAT-USD': 'basic-attention-token',
  'ZRX-USD': '0x',
  'YFI-USD': 'yearn-finance',
  'SUSHI-USD': 'sushi',
  'CELO-USD': 'celo',
  'ANKR-USD': 'ankr',
  'STORJ-USD': 'storj',
  'SKL-USD': 'skale',
  'AUDIO-USD': 'audius',
  'RLC-USD': 'iexec-rlc',
  'NKN-USD': 'nkn',
  'BAND-USD': 'band-protocol',
  'OCEAN-USD': 'ocean-protocol',
  'FET-USD': 'fetch-ai',
  'AGIX-USD': 'singularitynet',
  'RNDR-USD': 'render-token',
  'MASK-USD': 'mask-network',
  'API3-USD': 'api3',
  'SSV-USD': 'ssv-network',
  'GMX-USD': 'gmx',
  'DYDX-USD': 'dydx',
  'PENDLE-USD': 'pendle',
  'STX-USD': 'blockstack',
  'SUI-USD': 'sui',
  'SEI-USD': 'sei-network',
  'TIA-USD': 'celestia',
  'JUP-USD': 'jupiter-exchange-solana',
  'WIF-USD': 'dogwifcoin',
  'BONK-USD': 'bonk',
  'PEPE-USD': 'pepe',
  'FLOKI-USD': 'floki',
  'ORDI-USD': 'ordinals',
}

// Binance symbol mapping (high-cap crypto)
const BINANCE_SYMBOLS: Record<string, string> = {
  'BTC-USD': 'BTCUSDT',
  'ETH-USD': 'ETHUSDT',
  'BNB-USD': 'BNBUSDT',
  'XRP-USD': 'XRPUSDT',
  'SOL-USD': 'SOLUSDT',
  'ADA-USD': 'ADAUSDT',
  'DOGE-USD': 'DOGEUSDT',
  'TRX-USD': 'TRXUSDT',
  'AVAX-USD': 'AVAXUSDT',
  'LINK-USD': 'LINKUSDT',
  'DOT-USD': 'DOTUSDT',
  'MATIC-USD': 'MATICUSDT',
  'SHIB-USD': 'SHIBUSDT',
  'LTC-USD': 'LTCUSDT',
  'BCH-USD': 'BCHUSDT',
  'UNI-USD': 'UNIUSDT',
  'XLM-USD': 'XLMUSDT',
  'ATOM-USD': 'ATOMUSDT',
  'ETC-USD': 'ETCUSDT',
  'FIL-USD': 'FILUSDT',
  'NEAR-USD': 'NEARUSDT',
  'ARB-USD': 'ARBUSDT',
  'APT-USD': 'APTUSDT',
  'MKR-USD': 'MKRUSDT',
  'OP-USD': 'OPUSDT',
  'INJ-USD': 'INJUSDT',
  'GRT-USD': 'GRTUSDT',
  'AAVE-USD': 'AAVEUSDT',
  'ALGO-USD': 'ALGOUSDT',
  'FTM-USD': 'FTMUSDT',
  'RENDER-USD': 'RENDERUSDT',
  'IMX-USD': 'IMXUSDT',
  'SAND-USD': 'SANDUSDT',
  'MANA-USD': 'MANAUSDT',
  'CRV-USD': 'CRVUSDT',
  'LDO-USD': 'LDOUSDT',
  'ENS-USD': 'ENSUSDT',
  'GMX-USD': 'GMXUSDT',
  'DYDX-USD': 'DYDXUSDT',
  'STX-USD': 'STXUSDT',
  'SUI-USD': 'SUIUSDT',
  'SEI-USD': 'SEIUSDT',
  'TIA-USD': 'TIAUSDT',
  'JUP-USD': 'JUPUSDT',
  'WIF-USD': 'WIFUSDT',
  'BONK-USD': 'BONKUSDT',
  'PEPE-USD': 'PEPEUSDT',
  'FLOKI-USD': 'FLOKIUSDT',
}

// Get crypto price from Binance (primary, most reliable)
async function getBinancePrice(ticker: string): Promise<number | null> {
  const symbol = BINANCE_SYMBOLS[ticker.toUpperCase()]
  if (!symbol) return null
  
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
    const data = await res.json()
    // Check for Binance error responses (geo-block, rate limit, etc)
    if (data?.code !== undefined || data?.msg) {
      console.warn(`Binance API error for ${ticker}: ${data.msg || 'Unknown error'}`)
      return null
    }
    const price = parseFloat(data?.price)
    return !isNaN(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

// Get crypto price from CoinGecko (backup + validation)
async function getCoinGeckoPrice(ticker: string): Promise<number | null> {
  const geckoId = COINGECKO_IDS[ticker.toUpperCase()]
  if (!geckoId) return null
  
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      { next: { revalidate: 30 } }
    )
    const data = await res.json()
    return data[geckoId]?.usd || null
  } catch {
    return null
  }
}

// Get crypto price with validation (Binance primary, CoinGecko validation)
async function getCryptoPrice(ticker: string): Promise<number | null> {
  const binancePrice = await getBinancePrice(ticker)
  const geckoPrice = await getCoinGeckoPrice(ticker)
  
  // If we have both, validate they're within 1%
  if (binancePrice && geckoPrice) {
    const deviation = Math.abs(binancePrice - geckoPrice) / geckoPrice
    if (deviation > 0.01) {
      console.warn(`Price deviation for ${ticker}: Binance=$${binancePrice}, CoinGecko=$${geckoPrice}, deviation=${(deviation * 100).toFixed(2)}%`)
      // Use CoinGecko as tiebreaker since it's more broadly sourced
      return geckoPrice
    }
    return binancePrice // Binance is primary when validated
  }
  
  // Return whichever we have
  return binancePrice || geckoPrice || null
}

// Get current price - Binance/CoinGecko for crypto, Yahoo for stocks
async function getPrice(ticker: string): Promise<number | null> {
  const upperTicker = ticker.toUpperCase()
  
  // Use Binance/CoinGecko for crypto
  if (CRYPTO_TICKERS.includes(upperTicker)) {
    const cryptoPrice = await getCryptoPrice(upperTicker)
    if (cryptoPrice) return cryptoPrice
    // Don't fall back to Yahoo for crypto - prices are unreliable
    console.error(`Could not get crypto price for ${upperTicker}`)
    return null
  }
  
  // Use Yahoo Finance for stocks only
  try {
    const quote: any = await yahooFinance.quote(upperTicker)
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
      .gte('submitted_at', todayStart.toISOString())
    
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
    
    // Check blackout (crypto trades 24/7)
    const blackout = isBlackoutPeriod(upperTicker)
    if (blackout.blocked) {
      return NextResponse.json({ error: blackout.reason }, { status: 403 })
    }
    
    // Get current price
    const price = await getPrice(upperTicker)
    if (!price) {
      return NextResponse.json({ error: 'Could not fetch price' }, { status: 500 })
    }
    
    // Price sanity check - reject obviously wrong prices
    // Most assets should be > $0.0001 (even meme coins) 
    // For high-value assets, check against reasonable bounds
    const MIN_PRICE = 0.0000001  // Allow micro-cap meme coins
    const MAX_REASONABLE_PRICE = 500000  // BTC sanity cap
    if (price < MIN_PRICE || price > MAX_REASONABLE_PRICE) {
      console.error(`Price sanity check failed for ${upperTicker}: $${price}`)
      return NextResponse.json({ 
        error: `Price sanity check failed: $${price} is outside valid range` 
      }, { status: 500 })
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
      const lobs = Number(amount)
      if (!lobs || lobs <= 0) {
        return NextResponse.json({ error: 'OPEN requires positive amount (lobs)' }, { status: 400 })
      }
      
      // Can't open if position already exists
      if (existingPosition) {
        return NextResponse.json({ 
          error: `Position already exists in ${upperTicker}. Must CLOSE first.` 
        }, { status: 400 })
      }
      
      // Calculate fee
      const fee = Math.round(lobs * TRADING_FEE_RATE)
      const totalCost = lobs + fee
      
      // Check balance (including fee)
      if (totalCost > cashBalance) {
        return NextResponse.json({ 
          error: `Insufficient balance. Have ${cashBalance.toLocaleString()} lobs, need ${totalCost.toLocaleString()} (${lobs.toLocaleString()} + ${fee.toLocaleString()} fee)` 
        }, { status: 400 })
      }
      
      // Enforce minimum reserve (5k free lobs for decay buffer)
      const remainingAfterTrade = cashBalance - totalCost
      if (remainingAfterTrade < MIN_RESERVE_LOBS) {
        return NextResponse.json({ 
          error: `Must keep ${MIN_RESERVE_LOBS.toLocaleString()} lobs free for decay buffer. This trade would leave ${remainingAfterTrade.toLocaleString()} free. Reduce trade size by ${(MIN_RESERVE_LOBS - remainingAfterTrade).toLocaleString()} lobs.` 
        }, { status: 400 })
      }
      
      // Calculate shares
      const shares = lobs / price
      const signedShares = upperDirection === 'SHORT' ? -shares : shares
      
      // Generate commitment hash for on-chain linking
      const tradeNonce = crypto.randomUUID()
      const tradeDataForHash = {
        agent_id: agent.id,
        action: 'OPEN',
        side: upperDirection,
        lobs: lobs,
        symbol: upperTicker,
        price: price,
        timestamp: now.toISOString(),
        nonce: tradeNonce
      }
      const canonicalJson = JSON.stringify(tradeDataForHash, Object.keys(tradeDataForHash).sort())
      const commitmentHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson))
      
      // Record trade FIRST - trigger creates position automatically
      const tradePayload = {
        agent_id: agent.id,
        ticker: upperTicker,
        action: 'OPEN',
        direction: upperDirection,
        amount: lobs,
        shares: signedShares,
        execution_price: price,
        fee_lobs: fee,
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: now.toISOString(),
        revealed: true,  // Regular trades are always revealed (commit-reveal trades use /api/trade/commit)
        commitment_hash: commitmentHash,  // Store for on-chain linking
        reveal_nonce: tradeNonce,
      }
      
      console.log('[TRADE-DEBUG] Inserting trade:', JSON.stringify(tradePayload))
      
      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert(tradePayload)
        .select()
        .single()
      
      console.log('[TRADE-DEBUG] Insert result:', { trade_id: trade?.id, error: tradeError?.message || null })
      
      if (tradeError) {
        console.error('[TRADE-DEBUG] Trade insert FAILED:', tradeError)
        throw tradeError
      }
      
      // VERIFY trade was actually inserted
      const { data: verifyTrade } = await supabase
        .from('trades')
        .select('id')
        .eq('id', trade.id)
        .single()
      
      if (!verifyTrade) {
        console.error('[TRADE-DEBUG] CRITICAL: Trade insert returned ID but verification failed!', { 
          returned_id: trade.id,
          agent_id: agent.id,
          ticker: upperTicker
        })
      } else {
        console.log('[TRADE-DEBUG] Trade verified in DB:', trade.id)
      }
      
      // Update cash balance (deduct amount + fee)
      const newCashBalance = cashBalance - totalCost
      
      // Get all positions for accurate total (includes new position from trigger)
      const { data: allPositions } = await supabase
        .from('positions')
        .select('amount_points')
        .eq('agent_id', agent.id)
      const totalWorking = allPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      
      // CRITICAL: Update balance with verification
      const expectedCashOpen = Math.round(newCashBalance)
      const expectedPointsOpen = Math.round(newCashBalance + totalWorking)
      
      const { error: updateError } = await supabase.from('agents').update({ 
        cash_balance: expectedCashOpen,
        points: expectedPointsOpen
      }).eq('id', agent.id)
      
      if (updateError) {
        console.error('CRITICAL: Failed to update agent balance after OPEN trade', {
          agent_id: agent.id,
          trade_id: trade?.id,
          expectedCashOpen,
          error: updateError
        })
      }
      
      // VERIFY the update actually worked
      const { data: verifyAgentOpen } = await supabase
        .from('agents')
        .select('cash_balance')
        .eq('id', agent.id)
        .single()
      
      const actualCashOpen = Math.round(Number(verifyAgentOpen?.cash_balance) || 0)
      if (Math.abs(actualCashOpen - expectedCashOpen) > 1) {
        console.error('CRITICAL: Balance verification failed after OPEN', {
          agent_id: agent.id,
          trade_id: trade?.id,
          expectedCashOpen,
          actualCashOpen
        })
        
        // Retry the update
        await supabase.from('agents').update({ 
          cash_balance: expectedCashOpen,
          points: expectedPointsOpen
        }).eq('id', agent.id)
      }
      
      // Add fee to prize pool
      await addToPrizePool(supabase, fee)
      
      // Log to Base blockchain (non-blocking)
      // Regular trades get both commit + reveal logged immediately
      if (isBaseLoggingEnabled()) {
        // Log commit (using pre-generated commitmentHash)
        logTradeCommit({
          agentId: agent.id,
          commitmentHash,
          action: 'OPEN',
          direction: upperDirection,
          lobs: lobs,
          timestamp: now,
        }).catch(err => console.error('[Trade] Base commit log failed:', err))
        
        // Log reveal immediately (regular trades are public)
        logTradeReveal({
          agentId: agent.id,
          commitmentHash,
          ticker: upperTicker,
          price: price,
          timestamp: now,
        }).catch(err => console.error('[Trade] Base reveal log failed:', err))
      }
      
      return NextResponse.json({
        success: true,
        trade: {
          id: trade?.id,
          action: 'OPEN',
          direction: upperDirection,
          ticker: upperTicker,
          shares: Math.abs(shares).toFixed(4),
          price: price,
          amount: lobs,
          fee: fee,
        },
        result: `OPEN ${upperDirection} ${upperTicker}: ${Math.abs(shares).toFixed(2)} shares @ $${price.toFixed(2)} (${lobs.toLocaleString()} lobs, ${fee.toLocaleString()} fee)`,
        balance: {
          cash: Math.round(newCashBalance),
          working: Math.round(totalWorking),
          total: Math.round(newCashBalance + totalWorking),
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
        base_logging: isBaseLoggingEnabled() ? 'submitted' : 'disabled',
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
      
      // Find the associated OPEN trade for this position
      const { data: openingTrade } = await supabase
        .from('trades')
        .select('id, revealed, commitment_hash')
        .eq('agent_id', agent.id)
        .eq('ticker', upperTicker)
        .eq('action', 'OPEN')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()
      
      // If opening trade was committed (hidden), it must be revealed before closing
      // This ensures transparency - you can't close a position without revealing your entry
      if (openingTrade && openingTrade.commitment_hash && !openingTrade.revealed) {
        return NextResponse.json({ 
          error: 'Cannot close hidden position. Opening trade must be revealed first.',
          opening_trade_id: openingTrade.id,
          hint: 'Use POST /api/trade/reveal to reveal the opening trade, or use POST /api/trade/commit with reveal data to close and reveal in one step.',
          docs: 'https://clawstreet.club/docs/commit-reveal'
        }, { status: 400 })
      }
      
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
      
      // Calculate fee on close
      const closeFee = Math.round(closeValue * TRADING_FEE_RATE)
      const netCloseValue = closeValue - closeFee
      const signedSharesClosed = posDirection === 'SHORT' ? posShares : -posShares
      
      // Generate commitment hash for on-chain linking
      const closeNonce = crypto.randomUUID()
      const closeDataForHash = {
        agent_id: agent.id,
        action: 'CLOSE',
        side: posDirection,
        lobs: Math.round(netCloseValue),
        symbol: upperTicker,
        price: price,
        timestamp: now.toISOString(),
        nonce: closeNonce
      }
      const closeCanonicalJson = JSON.stringify(closeDataForHash, Object.keys(closeDataForHash).sort())
      const closeCommitmentHash = ethers.keccak256(ethers.toUtf8Bytes(closeCanonicalJson))
      
      // Record trade FIRST - trigger deletes position automatically
      const closeTradePayload = {
        agent_id: agent.id,
        ticker: upperTicker,
        action: 'CLOSE',
        direction: posDirection,
        amount: Math.round(netCloseValue),
        shares: signedSharesClosed,
        execution_price: price,
        close_price: price,
        pnl_points: Math.round(pnl),
        pnl_percent: pnlPercent,
        fee_lobs: closeFee,
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: now.toISOString(),
        revealed: true,
        opening_trade_id: openingTrade?.id || null,
        commitment_hash: closeCommitmentHash,  // Store for on-chain linking
        reveal_nonce: closeNonce,
      }
      
      console.log('[TRADE-DEBUG] Inserting CLOSE trade:', JSON.stringify(closeTradePayload))
      
      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert(closeTradePayload)
        .select()
        .single()
      
      console.log('[TRADE-DEBUG] CLOSE insert result:', { trade_id: trade?.id, error: tradeError?.message || null })
      
      if (tradeError) {
        console.error('[TRADE-DEBUG] CLOSE trade insert FAILED:', tradeError)
        throw tradeError
      }
      
      // VERIFY trade was actually inserted
      const { data: verifyCloseTrade } = await supabase
        .from('trades')
        .select('id')
        .eq('id', trade.id)
        .single()
      
      if (!verifyCloseTrade) {
        console.error('[TRADE-DEBUG] CRITICAL: CLOSE trade insert returned ID but verification failed!', { 
          returned_id: trade.id,
          agent_id: agent.id,
          ticker: upperTicker
        })
      } else {
        console.log('[TRADE-DEBUG] CLOSE trade verified in DB:', trade.id)
      }
      
      // If the opening trade was hidden (commit-reveal), reveal it now
      if (openingTrade && openingTrade.revealed === false) {
        await supabase
          .from('trades')
          .update({ revealed: true, revealed_at: now.toISOString() })
          .eq('id', openingTrade.id)
      }
      
      // Update cash balance (return close value minus fee)
      const newCashBalance = cashBalance + netCloseValue
      
      // Get remaining positions for total (closed position removed by trigger)
      const { data: remainingPositions } = await supabase
        .from('positions')
        .select('amount_points')
        .eq('agent_id', agent.id)
      const totalWorking = remainingPositions?.reduce((sum, p) => sum + Number(p.amount_points), 0) || 0
      
      // CRITICAL: Update balance with verification
      const expectedCash = Math.round(newCashBalance)
      const expectedPoints = Math.round(newCashBalance + totalWorking)
      
      const { error: updateError } = await supabase.from('agents').update({ 
        cash_balance: expectedCash,
        points: expectedPoints
      }).eq('id', agent.id)
      
      if (updateError) {
        console.error('CRITICAL: Failed to update agent balance after CLOSE trade', {
          agent_id: agent.id,
          trade_id: trade?.id,
          expectedCash,
          expectedPoints,
          error: updateError
        })
      }
      
      // VERIFY the update actually worked
      const { data: verifyAgent } = await supabase
        .from('agents')
        .select('cash_balance')
        .eq('id', agent.id)
        .single()
      
      const actualCash = Math.round(Number(verifyAgent?.cash_balance) || 0)
      if (Math.abs(actualCash - expectedCash) > 1) {
        // Update didn't stick - force retry with raw SQL-like approach
        console.error('CRITICAL: Balance verification failed after CLOSE', {
          agent_id: agent.id,
          trade_id: trade?.id,
          expectedCash,
          actualCash,
          diff: expectedCash - actualCash
        })
        
        // Retry the update
        await supabase.from('agents').update({ 
          cash_balance: expectedCash,
          points: expectedPoints
        }).eq('id', agent.id)
        
        // If still fails, return warning
        const { data: retryCheck } = await supabase
          .from('agents')
          .select('cash_balance')
          .eq('id', agent.id)
          .single()
        
        if (Math.abs(Math.round(Number(retryCheck?.cash_balance) || 0) - expectedCash) > 1) {
          return NextResponse.json({
            success: true,
            warning: 'Trade recorded but balance update failed after retry. Contact support.',
            trade: { id: trade?.id, action: 'CLOSE', ticker: upperTicker },
            debug: { expectedCash, actualCash: retryCheck?.cash_balance }
          })
        }
      }
      
      // Add close fee to prize pool
      await addToPrizePool(supabase, closeFee)
      
      // Log to Base blockchain (non-blocking, using pre-generated closeCommitmentHash)
      if (isBaseLoggingEnabled()) {
        // Log commit
        logTradeCommit({
          agentId: agent.id,
          commitmentHash: closeCommitmentHash,
          action: 'CLOSE',
          direction: posDirection,
          lobs: Math.round(netCloseValue),
          timestamp: now,
        }).catch(err => console.error('[Trade] Base commit log failed:', err))
        
        // Log reveal immediately
        logTradeReveal({
          agentId: agent.id,
          commitmentHash: closeCommitmentHash,
          ticker: upperTicker,
          price: price,
          timestamp: now,
        }).catch(err => console.error('[Trade] Base reveal log failed:', err))
      }
      
      const pnlSign = pnl >= 0 ? '+' : ''
      
      // Net P&L after fee
      const netPnl = pnl - closeFee
      const netPnlSign = netPnl >= 0 ? '+' : ''
      
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
          pnl: Math.round(netPnl),
          pnl_percent: Number(pnlPercent.toFixed(2)),
          fee: closeFee,
        },
        result: `CLOSE ${posDirection} ${upperTicker}: ${posShares.toFixed(2)} shares @ $${price.toFixed(2)} | P&L: ${netPnlSign}${Math.round(netPnl).toLocaleString()} lobs (${pnlSign}${pnlPercent.toFixed(2)}%, ${closeFee.toLocaleString()} fee)`,
        balance: {
          cash: Math.round(newCashBalance),
          working: Math.round(totalWorking),
          total: Math.round(newCashBalance + totalWorking),
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
        base_logging: isBaseLoggingEnabled() ? 'submitted' : 'disabled',
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
