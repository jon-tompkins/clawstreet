import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DAILY_DECAY = 100  // 100 LOBS per day

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/system/decay
 * 
 * Daily decay job - deducts 100 LOBS from each active agent.
 * Decay goes into the prize pool for Friday distribution.
 * 
 * Should be called once per day (via cron).
 * Protected by system secret.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  
  // Simple auth - check for system secret
  const authHeader = request.headers.get('Authorization')
  const expectedSecret = process.env.SYSTEM_SECRET || 'clawstreet-decay-2026'
  
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Get all active agents
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, name, cash_balance, points')
      .eq('status', 'active')
    
    if (agentError) throw agentError
    
    let totalDecay = 0
    const results: any[] = []
    
    for (const agent of agents || []) {
      const cashBalance = Number(agent.cash_balance) || 0
      const points = Number(agent.points) || 0
      
      // Can't go below 0
      const actualDecay = Math.min(DAILY_DECAY, cashBalance)
      
      if (actualDecay > 0) {
        const newCash = cashBalance - actualDecay
        const newPoints = points - actualDecay
        
        await supabase
          .from('agents')
          .update({ 
            cash_balance: newCash,
            points: newPoints
          })
          .eq('id', agent.id)
        
        totalDecay += actualDecay
        results.push({
          agent: agent.name,
          decayed: actualDecay,
          new_balance: newCash
        })
      } else {
        results.push({
          agent: agent.name,
          decayed: 0,
          reason: 'No cash balance'
        })
      }
    }
    
    // Add decay to prize pool (stored in system_stats table)
    // First, try to get current prize pool
    const { data: stats } = await supabase
      .from('system_stats')
      .select('value')
      .eq('key', 'prize_pool')
      .single()
    
    const currentPool = stats?.value || 0
    const newPool = currentPool + totalDecay
    
    // Upsert prize pool
    await supabase
      .from('system_stats')
      .upsert({ 
        key: 'prize_pool', 
        value: newPool,
        updated_at: new Date().toISOString()
      })
    
    return NextResponse.json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      total_decay: totalDecay,
      prize_pool: newPool,
      agents_processed: results.length,
      results
    })
    
  } catch (error: any) {
    console.error('Decay job error:', error)
    return NextResponse.json({ 
      error: 'Decay job failed', 
      details: error.message 
    }, { status: 500 })
  }
}

// GET: Check prize pool status
export async function GET() {
  const supabase = getSupabase()
  
  try {
    const { data: stats } = await supabase
      .from('system_stats')
      .select('value, updated_at')
      .eq('key', 'prize_pool')
      .single()
    
    // Calculate next Friday 4pm EST
    const now = new Date()
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = est.getDay()
    const daysUntilFriday = day <= 5 ? 5 - day : 6
    const nextFriday = new Date(est)
    nextFriday.setDate(nextFriday.getDate() + daysUntilFriday)
    nextFriday.setHours(16, 0, 0, 0)
    
    const msUntilDistribution = nextFriday.getTime() - now.getTime()
    
    return NextResponse.json({
      prize_pool: stats?.value || 0,
      last_updated: stats?.updated_at || null,
      next_distribution: nextFriday.toISOString(),
      ms_until_distribution: msUntilDistribution,
      daily_decay: DAILY_DECAY,
      sources: ['trading_fees', 'daily_decay']
    })
    
  } catch (error: any) {
    return NextResponse.json({ 
      prize_pool: 0,
      error: error.message 
    })
  }
}
