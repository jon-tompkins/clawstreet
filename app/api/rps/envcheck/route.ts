import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  const supabase = createClient(url!, key!)
  
  const { data, error } = await supabase
    .from('rps_games_v2')
    .select('id, status')
    .in('status', ['round_in_progress', 'revealing', 'pending_approval'])
    .limit(5)
  
  return NextResponse.json({
    url_set: !!url,
    url_starts: url?.substring(0, 30),
    key_set: !!key,
    key_len: key?.length,
    data,
    error: error?.message
  })
}
