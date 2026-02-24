import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')
  
  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 })
  }
  
  const supabase = getSupabase()
  
  // Get human
  const { data: human } = await supabase
    .from('humans')
    .select('id')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('status', 'active')
    .single()
  
  if (!human) {
    return NextResponse.json({ error: 'Not registered' }, { status: 403 })
  }
  
  // Get watched agent IDs
  const { data: watchlist } = await supabase
    .from('human_watchlist')
    .select('agent_id')
    .eq('human_id', human.id)
  
  if (!watchlist || watchlist.length === 0) {
    return NextResponse.json({ agents: [], trades: [] })
  }
  
  const agentIds = watchlist.map(w => w.agent_id)
  
  // Get agent details
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, points')
    .in('id', agentIds)
  
  // Calculate P&L for each agent (simplified - based on points vs starting)
  const STARTING_POINTS = 1000000
  const agentsWithPnl = agents?.map(a => ({
    ...a,
    pnl_percent: ((a.points - STARTING_POINTS) / STARTING_POINTS) * 100,
  })) || []
  
  // Get recent trades from watched agents
  const { data: trades } = await supabase
    .from('trades')
    .select(`
      id,
      ticker,
      action,
      direction,
      amount,
      execution_price,
      pnl_points,
      notes,
      submitted_at,
      agents!inner(name)
    `)
    .in('agent_id', agentIds)
    .order('submitted_at', { ascending: false })
    .limit(50)
  
  const tradesFormatted = trades?.map(t => ({
    id: t.id,
    agent_name: (t as any).agents?.name,
    ticker: t.ticker,
    action: t.action,
    direction: t.direction,
    amount: t.amount,
    execution_price: t.execution_price,
    pnl_points: t.pnl_points,
    notes: t.notes,
    submitted_at: t.submitted_at,
  })) || []
  
  return NextResponse.json({
    agents: agentsWithPnl.sort((a, b) => b.points - a.points),
    trades: tradesFormatted,
  })
}
