import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import yahooFinance from 'yahoo-finance2'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Fetch current prices for multiple tickers
async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  
  const prices: Record<string, number> = {}
  
  try {
    const results = await yahooFinance.quote(tickers)
    const quotes = Array.isArray(results) ? results : [results]
    
    for (const quote of quotes) {
      if (quote?.symbol && quote?.regularMarketPrice) {
        prices[quote.symbol] = quote.regularMarketPrice
      }
    }
  } catch (error) {
    console.error('Price fetch error:', error)
  }
  
  return prices
}

// Calculate mark-to-market value of a position
function calculatePositionValue(
  direction: string,
  shares: number,
  entryPrice: number,
  currentPrice: number
): number {
  const absShares = Math.abs(shares)
  
  if (direction === 'LONG') {
    // Long: value = shares * current price
    return absShares * currentPrice
  } else {
    // Short: value = original amount + (entry - current) * shares
    // If price went down, we profit; if up, we lose
    const originalAmount = absShares * entryPrice
    const priceDiff = entryPrice - currentPrice
    return originalAmount + (priceDiff * absShares)
  }
}

export async function GET() {
  const supabase = getSupabase()
  
  try {
    // Get all active agents
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, name, points, cash_balance, status, strategy, created_at')
      .eq('status', 'active')
    
    if (agentError) throw agentError
    
    // Get all positions
    const { data: allPositions, error: posError } = await supabase
      .from('positions')
      .select('agent_id, ticker, direction, shares, entry_price, amount_points')
    
    if (posError) throw posError
    
    // Get unique tickers and fetch prices
    const tickers = [...new Set(allPositions?.map(p => p.ticker) || [])]
    const prices = await fetchPrices(tickers)
    
    // Calculate mark-to-market for each agent
    const leaderboard = agents?.map(agent => {
      const agentPositions = allPositions?.filter(p => p.agent_id === agent.id) || []
      
      let markToMarket = 0
      let unrealizedPnl = 0
      
      for (const pos of agentPositions) {
        const currentPrice = prices[pos.ticker]
        const entryPrice = Number(pos.entry_price)
        const shares = Math.abs(Number(pos.shares))
        const costBasis = Number(pos.amount_points)
        
        if (currentPrice) {
          const currentValue = calculatePositionValue(pos.direction, shares, entryPrice, currentPrice)
          markToMarket += currentValue
          unrealizedPnl += (currentValue - costBasis)
        } else {
          // No price available, use cost basis
          markToMarket += costBasis
        }
      }
      
      const cashBalance = Number(agent.cash_balance) || 0
      const totalValue = cashBalance + markToMarket
      const startingBalance = 1000000
      const totalPnl = totalValue - startingBalance
      const pnlPercent = (totalPnl / startingBalance) * 100
      
      return {
        id: agent.id,
        name: agent.name,
        points: Math.round(totalValue),
        cash_balance: Math.round(cashBalance),
        unrealized_pnl: Math.round(unrealizedPnl),
        total_pnl: Math.round(totalPnl),
        pnl_percent: Number(pnlPercent.toFixed(2)),
        strategy: agent.strategy,
        status: agent.status,
        created_at: agent.created_at,
      }
    }) || []
    
    // Sort by total value (points)
    leaderboard.sort((a, b) => b.points - a.points)
    
    return NextResponse.json({ 
      agents: leaderboard,
      prices_updated: new Date().toISOString(),
      tickers_tracked: tickers.length
    })
  } catch (error: any) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
