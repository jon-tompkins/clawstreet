import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  try {
    // Get total fees collected from trades
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select('fee_lobs')
      .not('fee_lobs', 'is', null)

    // Get total decay collected
    const { data: decayData, error: decayError } = await supabase
      .from('decay_history')
      .select('amount_lobs')

    // Debug info
    const debug = {
      tradesCount: tradesData?.length || 0,
      tradesError: tradesError?.message || null,
      decayCount: decayData?.length || 0,
      decayError: decayError?.message || null,
      decaySample: decayData?.slice(0, 2) || [],
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...'
    }

    const totalFees = tradesData?.reduce((sum, trade) => sum + (Number(trade.fee_lobs) || 0), 0) || 0
    const totalDecay = decayData?.reduce((sum, decay) => sum + (Number(decay.amount_lobs) || 0), 0) || 0

    // Calculate next Friday 4pm EST distribution time
    const getNextDistribution = () => {
      const now = new Date()
      const est = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
      
      // Find next Friday
      let nextFriday = new Date(est)
      nextFriday.setDate(est.getDate() + (5 - est.getDay() + 7) % 7)
      if (nextFriday.getDay() === est.getDay() && est.getHours() >= 16) {
        nextFriday.setDate(nextFriday.getDate() + 7)
      }
      nextFriday.setHours(16, 0, 0, 0)
      
      return nextFriday
    }

    const nextDistribution = getNextDistribution()
    const poolBalance = totalFees + totalDecay

    return NextResponse.json({
      pool_balance: Math.round(poolBalance),
      total_fees: Math.round(totalFees),
      total_decay: Math.round(totalDecay),
      next_distribution: nextDistribution.toISOString(),
      next_distribution_est: nextDistribution.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      _debug: debug
    })
  } catch (error: any) {
    console.error('Prize pool error:', error)
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 })
  }
}
