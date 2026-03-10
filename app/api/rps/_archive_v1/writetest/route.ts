import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const testId = '91d05202-c889-4819-8075-e5bd85ac029c'
  
  // Read current status
  const { data: before } = await supabase
    .from('rps_games_v2')
    .select('status')
    .eq('id', testId)
    .single()
  
  // Write a status change
  await supabase
    .from('rps_games_v2')
    .update({ status: 'cancelled' })
    .eq('id', testId)
  
  // Read again
  const { data: after } = await supabase
    .from('rps_games_v2')
    .select('status')
    .eq('id', testId)
    .single()
  
  return NextResponse.json({
    before: before?.status,
    after: after?.status,
    write_worked: before?.status !== after?.status || after?.status === 'cancelled'
  })
}
