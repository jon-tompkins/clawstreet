import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || 'clawstreet-cron-2026'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'BNB-USD': 'binancecoin',
  'SOL-USD': 'solana',
  'XRP-USD': 'ripple',
  'ADA-USD': 'cardano',
  'DOGE-USD': 'dogecoin',
  'AVAX-USD': 'avalanche-2',
  'LINK-USD': 'chainlink',
  'DOT-USD': 'polkadot',
  'MATIC-USD': 'matic-network',
  'SHIB-USD': 'shiba-inu',
  'LTC-USD': 'litecoin',
  'UNI-USD': 'uniswap',
  'ATOM-USD': 'cosmos',
  'NEAR-USD': 'near',
  'ARB-USD': 'arbitrum',
  'OP-USD': 'optimism',
  'HBAR-USD': 'hedera-hashgraph',
  'FIL-USD': 'filecoin',
  'APT-USD': 'aptos',
  'SUI-USD': 'sui',
  'SEI-USD': 'sei-network',
  'TIA-USD': 'celestia',
  'PEPE-USD': 'pepe',
  'WIF-USD': 'dogwifcoin',
  'BONK-USD': 'bonk',
}

// Fetch EOD closing prices for all tickers
async function fetchEODPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  
  const prices: Record<string, number> = {}
  const cryptoTickers: string[] = []
  const stockTickers: string[] = []
  
  // Categorize
  for (const ticker of tickers) {
    if (COINGECKO_IDS[ticker]) {
      cryptoTickers.push(ticker)
    } else {
      stockTickers.push(ticker)
    }
  }
  
  // Fetch crypto from CoinGecko
  if (cryptoTickers.length > 0) {
    try {
      const geckoIds = cryptoTickers.map(t => COINGECKO_IDS[t]).join(',')
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd`
      )
      const data = await res.json()
      
      for (const ticker of cryptoTickers) {
        const geckoId = COINGECKO_IDS[ticker]
        if (data[geckoId]?.usd) {
          prices[ticker] = data[geckoId].usd
        }
      }
    } catch (err) {
      console.error('CoinGecko fetch error:', err)
    }
  }
  
  // Fetch stocks from Yahoo Finance (gets regularMarketPreviousClose at EOD)
  if (stockTickers.length > 0) {
    try {
      const YahooFinance = (await import('yahoo-finance2')).default
      const quotes = await YahooFinance.quote(stockTickers)
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
      
      for (const quote of quotesArray) {
        if (quote?.symbol) {
          // Use regularMarketPreviousClose for true EOD price after hours
          // Falls back to regularMarketPrice if previous close not available
          const price = quote.regularMarketPreviousClose || quote.regularMarketPrice
          if (price) {
            prices[quote.symbol] = price
          }
        }
      }
    } catch (err) {
      console.error('Yahoo Finance fetch error:', err)
    }
  }
  
  return prices
}

// Snapshot EOD closing prices for historical record
// Call via: GET /api/cron/snapshot-eod-prices?secret=CRON_SECRET
// Should run once daily at market close (4:00 PM ET / 9:00 PM UTC)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date()
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)

  try {
    // Check if we already have EOD snapshot for today (dedupe)
    const force = request.nextUrl.searchParams.get('force') === 'true'
    
    if (!force) {
      const { data: existingToday } = await supabase
        .from('price_history')
        .select('id')
        .gte('recorded_at', today.toISOString())
        .lt('recorded_at', new Date(today.getTime() + 86400000).toISOString())
        .contains('metadata', { eod: true })
        .limit(1)

      if (existingToday && existingToday.length > 0) {
        return NextResponse.json({ 
          message: 'EOD snapshot already exists for today (use ?force=true to override)', 
          skipped: true 
        })
      }
    }

    // Get all unique tickers from active positions
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('ticker')

    if (posError) throw posError

    // Dedupe tickers
    const tickersSet = new Set<string>()
    for (const pos of positions || []) {
      if (pos.ticker) tickersSet.add(pos.ticker)
    }
    const tickers = Array.from(tickersSet)

    if (tickers.length === 0) {
      return NextResponse.json({ message: 'No tickers to snapshot', recorded: 0 })
    }

    // Fetch EOD prices
    const prices = await fetchEODPrices(tickers)

    // Store in price_history table with EOD marker
    const timestamp = now.toISOString()
    const priceRecords = Object.entries(prices).map(([ticker, price]) => ({
      ticker,
      price,
      change_percent: 0, // EOD snapshot doesn't track intraday change
      recorded_at: timestamp,
      metadata: { eod: true, date: today.toISOString().split('T')[0] }
    }))

    if (priceRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('price_history')
        .insert(priceRecords)

      if (insertError) throw insertError
    }

    return NextResponse.json({
      success: true,
      recorded: priceRecords.length,
      timestamp,
      date: today.toISOString().split('T')[0],
      tickers: Object.keys(prices)
    })
  } catch (error: any) {
    console.error('EOD snapshot error:', error)
    return NextResponse.json(
      { error: 'Failed to snapshot EOD prices', details: error.message },
      { status: 500 }
    )
  }
}
