import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  // Method 1: Supabase JS client
  const supabase = createClient(url, serviceKey)
  const { data: jsData, error: jsError } = await supabase
    .from('agents')
    .select('id, name, points, cash_balance')
    .eq('name', 'MomentumBot-QA')
    .single()
  
  // Method 2: Direct REST fetch
  const restRes = await fetch(
    `${url}/rest/v1/agents?name=eq.MomentumBot-QA&select=id,name,points,cash_balance`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      cache: 'no-store'
    }
  )
  const restData = await restRes.json()
  
  return NextResponse.json({
    js_client: jsData,
    js_error: jsError,
    rest_api: restData[0],
    match: jsData?.cash_balance === restData[0]?.cash_balance,
    timestamp: new Date().toISOString()
  })
}
