import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getSupabase()
  
  try {
    // First try to get from price_history table
    const { data: priceHistory, error: priceError } = await supabase
      .from('price_history')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(500)
    
    if (!priceError && priceHistory && priceHistory.length > 0) {
      return NextResponse.json({ 
        prices: priceHistory,
        source: 'price_history'
      })
    }
    
    // Fallback: extract prices from trades
    const { data: trades, error: tradeError } = await supabase
      .from('trades')
      .select('ticker, execution_price, submitted_at')
      .order('submitted_at', { ascending: false })
      .limit(500)
    
    if (tradeError) throw tradeError
    
    // Convert trades to price records
    const prices = trades?.map(t => ({
      id: `${t.ticker}-${t.submitted_at}`,
      ticker: t.ticker,
      price: Number(t.execution_price),
      recorded_at: t.submitted_at
    })) || []
    
    // Dedupe by ticker+date (keep latest price per ticker per day)
    const seen = new Set<string>()
    const deduped = prices.filter(p => {
      const dateKey = `${p.ticker}-${p.recorded_at.split('T')[0]}`
      if (seen.has(dateKey)) return false
      seen.add(dateKey)
      return true
    })
    
    return NextResponse.json({ 
      prices: deduped,
      source: 'trades'
    })
    
  } catch (error: any) {
    console.error('Price history error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
