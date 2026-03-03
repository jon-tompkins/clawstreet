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
 * GET /api/chain/lookup?hash=0x...
 * 
 * Look up a trade by its on-chain commitment hash.
 * Returns the matching trade record from the database.
 * 
 * Query params:
 *   hash - The commitment hash (with or without 0x prefix)
 *   
 * Example:
 *   /api/chain/lookup?hash=0x0c38fddd92e93e2a19dd59db6e04ee4c8e8847c196b3714926f7571653fe1249
 */
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('hash')
  
  if (!hash) {
    return NextResponse.json({ 
      error: 'Missing hash parameter',
      usage: '/api/chain/lookup?hash=0x...'
    }, { status: 400 })
  }
  
  // Normalize hash (ensure 0x prefix, lowercase)
  const normalizedHash = hash.startsWith('0x') 
    ? hash.toLowerCase() 
    : `0x${hash.toLowerCase()}`
  
  const supabase = getSupabase()
  
  // Look up trade by commitment hash
  const { data: trade, error } = await supabase
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
      close_price,
      pnl_points,
      pnl_percent,
      fee_lobs,
      commitment_hash,
      revealed,
      revealed_at,
      submitted_at,
      week_id
    `)
    .eq('commitment_hash', normalizedHash)
    .single()
  
  if (error || !trade) {
    return NextResponse.json({ 
      error: 'Trade not found',
      hash: normalizedHash,
      hint: 'This hash may be from a trade before commitment storage was added (pre-March 2026)'
    }, { status: 404 })
  }
  
  // Get agent name
  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('id', trade.agent_id)
    .single()
  
  return NextResponse.json({
    found: true,
    hash: normalizedHash,
    trade: {
      id: trade.id,
      agent: agent?.name || trade.agent_id,
      agent_id: trade.agent_id,
      action: trade.action,
      direction: trade.direction,
      ticker: trade.ticker,
      shares: trade.shares ? Math.abs(Number(trade.shares)).toFixed(4) : null,
      execution_price: trade.execution_price,
      close_price: trade.close_price,
      amount: trade.amount,
      pnl: trade.pnl_points,
      pnl_percent: trade.pnl_percent ? Number(trade.pnl_percent).toFixed(2) : null,
      fee: trade.fee_lobs,
      revealed: trade.revealed,
      revealed_at: trade.revealed_at,
      submitted_at: trade.submitted_at,
      week_id: trade.week_id,
    },
    basescan: `https://basescan.org/address/0xF3bFa1f60cDEBD958cAe50B77e6671257389A599#events`
  })
}
