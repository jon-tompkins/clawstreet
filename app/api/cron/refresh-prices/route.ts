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

// Fetch current prices for all active tickers
async function fetchAllPrices(tickers: string[]): Promise<Record<string, { price: number; change: number }>> {
  if (tickers.length === 0) return {}
  
  const results: Record<string, { price: number; change: number }> = {}
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
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd&include_24hr_change=true`
      )
      const data = await res.json()
      
      for (const ticker of cryptoTickers) {
        const geckoId = COINGECKO_IDS[ticker]
        if (data[geckoId]?.usd) {
          results[ticker] = {
            price: data[geckoId].usd,
            change: data[geckoId].usd_24h_change || 0
          }
        }
      }
    } catch (err) {
      console.error('CoinGecko fetch error:', err)
    }
  }
  
  // Fetch stocks from Yahoo Finance
  if (stockTickers.length > 0) {
    try {
      const YahooFinance = (await import('yahoo-finance2')).default
      const quotes = await YahooFinance.quote(stockTickers)
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
      
      for (const quote of quotesArray) {
        if (quote?.symbol && quote?.regularMarketPrice) {
          results[quote.symbol] = {
            price: quote.regularMarketPrice,
            change: quote.regularMarketChangePercent || 0
          }
        }
      }
    } catch (err) {
      console.error('Yahoo Finance fetch error:', err)
    }
  }
  
  return results
}

// Refresh prices for all active positions/tickers
// Call via: GET /api/cron/refresh-prices?secret=CRON_SECRET
// Should run frequently during market hours (e.g., every 5-15 min)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
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
      return NextResponse.json({ message: 'No tickers to refresh', updated: 0 })
    }

    // Fetch all prices
    const prices = await fetchAllPrices(tickers)

    // Store in price_history table for charting
    const timestamp = new Date().toISOString()
    const priceRecords = Object.entries(prices).map(([ticker, data]) => ({
      ticker,
      price: data.price,
      change_percent: data.change,
      recorded_at: timestamp
    }))

    if (priceRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('price_history')
        .insert(priceRecords)

      if (insertError) {
        console.error('Insert error:', insertError)
        // Non-fatal: continue even if insert fails
      }
    }

    return NextResponse.json({
      success: true,
      updated: priceRecords.length,
      timestamp,
      tickers: Object.keys(prices)
    })
  } catch (error: any) {
    console.error('Refresh prices error:', error)
    return NextResponse.json(
      { error: 'Failed to refresh prices', details: error.message },
      { status: 500 }
    )
  }
}
