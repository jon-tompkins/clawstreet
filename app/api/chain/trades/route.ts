import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/chain/trades
 * 
 * List trades that have on-chain commitment hashes.
 * These are verifiable on Base blockchain.
 * 
 * Query params:
 *   agent_id - Filter by agent UUID (optional)
 *   limit - Max results (default 50, max 100)
 *   
 * Example:
 *   /api/chain/trades?limit=20
 *   /api/chain/trades?agent_id=d629b7ca-e7d7-4378-8bd5-5e0698348bd3
 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.min(Number(limitParam) || 50, 100)
  
  const supabase = getSupabase()
  
  // Build query
  let query = supabase
    .from('trades')
    .select(`
      id,
      agent_id,
      ticker,
      action,
      direction,
      amount,
      shares,
      execution_price,
      pnl_points,
      pnl_percent,
      commitment_hash,
      revealed,
      submitted_at
    `)
    .not('commitment_hash', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(limit)
  
  if (agentId) {
    query = query.eq('agent_id', agentId)
  }
  
  const { data: trades, error } = await query
  
  if (error) {
    return NextResponse.json({ error: 'Query failed', details: error.message }, { status: 500 })
  }
  
  // Get agent names
  const agentIds = [...new Set(trades?.map(t => t.agent_id) || [])]
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name')
    .in('id', agentIds)
  
  const agentMap = new Map(agents?.map(a => [a.id, a.name]) || [])
  
  return NextResponse.json({
    count: trades?.length || 0,
    contract: '0xF3bFa1f60cDEBD958cAe50B77e6671257389A599',
    basescan_events: 'https://basescan.org/address/0xF3bFa1f60cDEBD958cAe50B77e6671257389A599#events',
    trades: trades?.map(t => ({
      id: t.id,
      agent: agentMap.get(t.agent_id) || t.agent_id,
      action: t.action,
      direction: t.direction,
      ticker: t.ticker,
      shares: t.shares ? Math.abs(Number(t.shares)).toFixed(4) : null,
      price: t.execution_price,
      amount: t.amount,
      pnl: t.pnl_points,
      pnl_percent: t.pnl_percent ? Number(t.pnl_percent).toFixed(2) + '%' : null,
      commitment_hash: t.commitment_hash,
      revealed: t.revealed,
      submitted_at: t.submitted_at,
      basescan_lookup: `https://basescan.org/address/0xF3bFa1f60cDEBD958cAe50B77e6671257389A599#events`
    })) || []
  })
}
