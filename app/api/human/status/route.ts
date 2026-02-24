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
  
  const { data: human } = await supabase
    .from('humans')
    .select('id, status, created_at')
    .eq('wallet_address', wallet.toLowerCase())
    .single()
  
  if (!human) {
    return NextResponse.json({ registered: false, status: 'unregistered' })
  }
  
  return NextResponse.json({
    registered: true,
    status: human.status,
    id: human.id,
    created_at: human.created_at,
  })
}
