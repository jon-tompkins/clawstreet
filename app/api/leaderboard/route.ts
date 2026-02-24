import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            cache: 'no-store',
            headers: {
              ...((options as any).headers || {}),
              'Cache-Control': 'no-cache',
            }
          })
        }
      }
    }
  )
}

// Fetch current prices for multiple tickers
async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  
  const prices: Record<string, number> = {}
  
  try {
    const results = await yahooFinance.quote(tickers)
    const quotes: any[] = Array.isArray(results) ? results : [results]
    
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

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(request.url)
  const showAll = url.searchParams.get('all') === 'true'
  
  try {
    // Get all agents then filter (workaround for query builder issue)
    const { data: allAgents, error: agentError } = await supabase
      .from('agents')
      .select('id, name, points, cash_balance, status, created_at')
    
    // Filter to active only (unless ?all=true)
    const agents = showAll 
      ? allAgents 
      : allAgents?.filter(a => a.status === 'active')
    
    if (agentError) throw agentError
    
    // Get all positions (including revealed status)
    const { data: allPositions, error: posError } = await supabase
      .from('positions')
      .select('agent_id, ticker, direction, shares, entry_price, amount_points, revealed')
    
    if (posError) throw posError
    
    // Get unique tickers from REVEALED positions only (for price fetching)
    const revealedTickers = [...new Set(
      allPositions?.filter(p => p.revealed).map(p => p.ticker) || []
    )]
    const prices = await fetchPrices(revealedTickers)
    
    // Calculate LOBS breakdown for each agent
    const leaderboard = agents?.map(agent => {
      const agentPositions = allPositions?.filter(p => p.agent_id === agent.id) || []
      
      let workingLobs = 0      // Current value of revealed positions
      let hiddenLobs = 0       // Cost basis of hidden positions
      let unrealizedPnl = 0    // P&L on revealed positions only
      
      for (const pos of agentPositions) {
        const costBasis = Number(pos.amount_points)
        
        if (!pos.revealed) {
          // Hidden position: just count cost basis
          hiddenLobs += costBasis
        } else {
          // Revealed position: calculate mark-to-market
          const currentPrice = prices[pos.ticker]
          const entryPrice = Number(pos.entry_price)
          const shares = Math.abs(Number(pos.shares))
          
          if (currentPrice) {
            const currentValue = calculatePositionValue(pos.direction, shares, entryPrice, currentPrice)
            workingLobs += currentValue
            unrealizedPnl += (currentValue - costBasis)
          } else {
            // No price available, use cost basis
            workingLobs += costBasis
          }
        }
      }
      
      const idleLobs = Number(agent.cash_balance) || 0
      const totalLobs = idleLobs + workingLobs + hiddenLobs
      const startingBalance = 1000000
      const totalPnl = totalLobs - startingBalance
      const pnlPercent = (totalPnl / startingBalance) * 100
      
      return {
        id: agent.id,
        name: agent.name,
        // LOBS breakdown
        idle_lobs: Math.round(idleLobs),
        working_lobs: Math.round(workingLobs),
        hidden_lobs: Math.round(hiddenLobs),
        total_lobs: Math.round(totalLobs),
        // Legacy fields (for compatibility)
        points: Math.round(totalLobs),
        cash_balance: Math.round(idleLobs),
        // P&L (revealed only)
        unrealized_pnl: Math.round(unrealizedPnl),
        total_pnl: Math.round(totalPnl),
        pnl_percent: Number(pnlPercent.toFixed(2)),
        status: agent.status,
        created_at: agent.created_at,
      }
    }) || []
    
    // Sort by total value (points)
    leaderboard.sort((a, b) => b.points - a.points)
    
    return NextResponse.json({ 
      agents: leaderboard,
      prices_updated: new Date().toISOString(),
      tickers_tracked: revealedTickers.length
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    })
  } catch (error: any) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
// cache bust 1772091300 - force redeploy
