import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export const dynamic = 'force-dynamic'

// Cache prices for 60 seconds
let priceCache: Record<string, { price: number; change: number; timestamp: number }> = {}
const CACHE_TTL = 60 * 1000

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get('symbols')?.split(',').filter(Boolean) || []
  
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 })
  }
  
  if (symbols.length > 50) {
    return NextResponse.json({ error: 'Max 50 symbols' }, { status: 400 })
  }
  
  const now = Date.now()
  const results: Record<string, { price: number; change: number; cached: boolean }> = {}
  const toFetch: string[] = []
  
  // Check cache first
  for (const symbol of symbols) {
    const cached = priceCache[symbol]
    if (cached && now - cached.timestamp < CACHE_TTL) {
      results[symbol] = { price: cached.price, change: cached.change, cached: true }
    } else {
      toFetch.push(symbol)
    }
  }
  
  // Fetch missing prices
  if (toFetch.length > 0) {
    try {
      const quotes = await yahooFinance.quote(toFetch)
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
      
      for (const quote of quotesArray) {
        if (quote && quote.symbol && quote.regularMarketPrice) {
          const price = quote.regularMarketPrice
          const change = quote.regularMarketChangePercent || 0
          
          priceCache[quote.symbol] = { price, change, timestamp: now }
          results[quote.symbol] = { price, change, cached: false }
        }
      }
    } catch (err) {
      console.error('Error fetching prices:', err)
    }
  }
  
  return NextResponse.json({
    prices: results,
    timestamp: new Date().toISOString()
  })
}

// POST - fetch historical prices for a date range
export async function POST(request: NextRequest) {
  try {
    const { symbols, from, to } = await request.json()
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 })
    }
    
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const toDate = to ? new Date(to) : new Date()
    
    const results: Record<string, any[]> = {}
    
    for (const symbol of symbols.slice(0, 20)) {
      try {
        const history = await yahooFinance.historical(symbol, {
          period1: fromDate,
          period2: toDate,
          interval: '1d'
        })
        results[symbol] = history.map(h => ({
          date: h.date.toISOString().split('T')[0],
          close: h.close,
          volume: h.volume
        }))
      } catch (err) {
        console.error(`Error fetching history for ${symbol}:`, err)
        results[symbol] = []
      }
    }
    
    return NextResponse.json({ history: results })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
