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

// CoinGecko ID mapping (subset for crypto tickers)
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
async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  
  const prices: Record<string, number> = {}
  const cryptoTickers: string[] = []
  const stockTickers: string[] = []
  
  // Separate crypto vs stocks
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
  
  // Fetch stocks from Yahoo via internal API (or direct if needed)
  if (stockTickers.length > 0) {
    try {
      // Use Yahoo Finance directly
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

// Record daily balance snapshot for all active agents
// Call via: GET /api/cron/record-history?secret=CRON_SECRET
// Should run once daily at EOD (e.g., 9 PM EST / 02:00 UTC)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date().toISOString()

  try {
    // Get all active agents with their current balances
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, cash_balance, points')
      .eq('status', 'active')

    if (agentsError) throw agentsError
    if (!agents || agents.length === 0) {
      return NextResponse.json({ message: 'No active agents', recorded: 0 })
    }

    // Get ALL positions with shares and ticker info
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('agent_id, ticker, shares, amount_points, revealed')

    if (posError) throw posError

    // Collect unique tickers that need pricing
    const tickersSet = new Set<string>()
    for (const pos of positions || []) {
      if (pos.ticker) tickersSet.add(pos.ticker)
    }
    const uniqueTickers = Array.from(tickersSet)
    
    // Fetch current prices for all tickers
    const prices = await fetchPrices(uniqueTickers)
    
    // Build position summaries by agent using CURRENT VALUE (shares × price)
    const positionsByAgent: Record<string, { working: number; hidden: number }> = {}
    
    for (const pos of positions || []) {
      if (!positionsByAgent[pos.agent_id]) {
        positionsByAgent[pos.agent_id] = { working: 0, hidden: 0 }
      }
      
      const shares = Number(pos.shares) || 0
      const currentPrice = prices[pos.ticker]
      
      // Calculate current value: shares × current price
      // Fallback to amount_points if price not available
      let currentValue: number
      if (currentPrice && shares > 0) {
        currentValue = shares * currentPrice
      } else {
        // Fallback: use entry amount if no price available
        currentValue = Number(pos.amount_points) || 0
        console.warn(`No price for ${pos.ticker}, using entry amount`)
      }
      
      if (pos.revealed === false) {
        positionsByAgent[pos.agent_id].hidden += currentValue
      } else {
        positionsByAgent[pos.agent_id].working += currentValue
      }
    }

    // Build history records
    const historyRecords = agents.map(agent => {
      const idle = Number(agent.cash_balance) || 0
      const posData = positionsByAgent[agent.id] || { working: 0, hidden: 0 }
      const total = idle + posData.working + posData.hidden

      return {
        agent_id: agent.id,
        recorded_at: now,
        total_points: total,
        idle_points: idle,
        working_points: posData.working,
        hidden_points: posData.hidden,
      }
    })

    // Also update agents.points to match calculated total
    for (const record of historyRecords) {
      await supabase
        .from('agents')
        .update({ points: record.total_points })
        .eq('id', record.agent_id)
    }

    // Insert all records
    const { error: insertError } = await supabase
      .from('balance_history')
      .insert(historyRecords)

    if (insertError) throw insertError

    return NextResponse.json({
      success: true,
      recorded: historyRecords.length,
      timestamp: now,
      pricesFetched: Object.keys(prices).length,
      tickers: uniqueTickers,
    })
  } catch (error: any) {
    console.error('Record history error:', error)
    return NextResponse.json(
      { error: 'Failed to record history', details: error.message },
      { status: 500 }
    )
  }
}
