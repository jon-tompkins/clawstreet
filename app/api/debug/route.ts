import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, cash_balance, points, status')
    .eq('name', 'MomentumBot-QA')
    .single()
  
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    agent,
    error,
    timestamp: new Date().toISOString()
  })
}
