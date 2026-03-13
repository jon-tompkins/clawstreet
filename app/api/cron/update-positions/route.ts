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

// Fetch current prices for tickers
async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number>> {
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
  
  // Fetch stocks from Yahoo Finance
  if (stockTickers.length > 0) {
    try {
      const YahooFinance = (await import('yahoo-finance2')).default
      const quotes = await YahooFinance.quote(stockTickers)
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
      
      for (const quote of quotesArray) {
        if (quote?.symbol && quote?.regularMarketPrice) {
          prices[quote.symbol] = quote.regularMarketPrice
        }
      }
    } catch (err) {
      console.error('Yahoo Finance fetch error:', err)
    }
  }
  
  return prices
}

// Calculate unrealized P&L for all open positions
// Call via: GET /api/cron/update-positions?secret=CRON_SECRET
// Should run frequently during market hours (e.g., every 15 min)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()

  try {
    // Get all open positions with their entry prices and shares
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('id, agent_id, ticker, shares, entry_price, direction, amount_points')

    if (posError) throw posError

    if (!positions || positions.length === 0) {
      return NextResponse.json({ message: 'No positions to update', updated: 0 })
    }

    // Collect unique tickers
    const tickersSet = new Set<string>()
    for (const pos of positions) {
      if (pos.ticker) tickersSet.add(pos.ticker)
    }
    const tickers = Array.from(tickersSet)

    // Fetch current prices
    const prices = await fetchCurrentPrices(tickers)

    // Calculate P&L for each position
    const updates: Array<{ id: string; unrealized_pnl: number; current_value: number }> = []
    let updated = 0
    let skipped = 0

    for (const pos of positions) {
      const currentPrice = prices[pos.ticker]
      
      if (!currentPrice) {
        console.warn(`No price available for ${pos.ticker}, skipping`)
        skipped++
        continue
      }

      const shares = Number(pos.shares) || 0
      const entryPrice = Number(pos.entry_price) || 0
      const direction = pos.direction // 'LONG' or 'SHORT'
      
      // Calculate current value: shares × current price
      const currentValue = shares * currentPrice
      
      // Calculate unrealized P&L based on direction
      let unrealizedPnL: number
      
      if (direction === 'LONG') {
        // Long: profit when price goes up
        // P&L = (current_price - entry_price) × shares
        unrealizedPnL = (currentPrice - entryPrice) * shares
      } else if (direction === 'SHORT') {
        // Short: profit when price goes down
        // P&L = (entry_price - current_price) × shares
        unrealizedPnL = (entryPrice - currentPrice) * shares
      } else {
        console.warn(`Unknown direction '${direction}' for position ${pos.id}`)
        skipped++
        continue
      }

      updates.push({
        id: pos.id,
        unrealized_pnl: unrealizedPnL,
        current_value: currentValue
      })
      updated++
    }

    // Batch update positions
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('positions')
          .update({
            unrealized_pnl: update.unrealized_pnl,
            current_value: update.current_value,
            last_updated: new Date().toISOString()
          })
          .eq('id', update.id)

        if (updateError) {
          console.error(`Failed to update position ${update.id}:`, updateError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      timestamp: new Date().toISOString(),
      pricesFetched: Object.keys(prices).length
    })
  } catch (error: any) {
    console.error('Update positions error:', error)
    return NextResponse.json(
      { error: 'Failed to update positions', details: error.message },
      { status: 500 }
    )
  }
}
