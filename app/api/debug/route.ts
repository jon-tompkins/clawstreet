import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  const supabase = createClient(url, serviceKey)
  
  // EXACT same query as leaderboard API
  const { data: allAgents, error: agentError } = await supabase
    .from('agents')
    .select('id, name, points, cash_balance, status, created_at')
  
  const momentum = allAgents?.find(a => a.name === 'MomentumBot-QA')
  
  return NextResponse.json({
    total_agents: allAgents?.length,
    momentum: momentum,
    all_agents: allAgents?.map(a => ({ name: a.name, cash: a.cash_balance, status: a.status })),
    error: agentError,
    timestamp: new Date().toISOString()
  })
}
