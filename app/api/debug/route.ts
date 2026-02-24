import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Same query as leaderboard API
  const { data: allAgents, error: agentError } = await supabase
    .from('agents')
    .select('id, name, points, cash_balance, status, created_at')
  
  const momentum = allAgents?.find(a => a.name === 'MomentumBot-QA')
  
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    total_agents: allAgents?.length,
    momentum_from_array: momentum,
    momentum_cash_balance: momentum?.cash_balance,
    momentum_cash_type: typeof momentum?.cash_balance,
    all_cash_balances: allAgents?.map(a => ({ name: a.name, cash: a.cash_balance })),
    error: agentError,
    timestamp: new Date().toISOString()
  })
}
