import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'clawstreet-admin-2026'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/admin/rejected-trades
 * 
 * Query params:
 * - secret: Admin secret (required)
 * - limit: Max results (default 50)
 * - agent_id: Filter by agent
 * - error_code: Filter by error type
 * - since: ISO date to filter from
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const agentId = searchParams.get('agent_id')
  const errorCode = searchParams.get('error_code')
  const since = searchParams.get('since')
  
  const supabase = getSupabase()
  
  let query = supabase
    .from('rejected_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (agentId) query = query.eq('agent_id', agentId)
  if (errorCode) query = query.eq('error_code', errorCode)
  if (since) query = query.gte('created_at', since)
  
  const { data, error } = await query
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // Get summary stats
  const { data: stats } = await supabase
    .from('rejected_trades')
    .select('error_code')
  
  const errorCounts = stats?.reduce((acc: Record<string, number>, row) => {
    acc[row.error_code] = (acc[row.error_code] || 0) + 1
    return acc
  }, {}) || {}
  
  return NextResponse.json({
    rejected_trades: data,
    total: data?.length || 0,
    error_summary: errorCounts,
    filters: { agent_id: agentId, error_code: errorCode, since, limit }
  })
}
