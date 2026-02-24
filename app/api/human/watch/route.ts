import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get human ID from wallet
async function getHumanId(supabase: any, wallet: string): Promise<number | null> {
  const { data } = await supabase
    .from('humans')
    .select('id')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('status', 'active')
    .single()
  return data?.id || null
}

// Add agent to watchlist
export async function POST(request: NextRequest) {
  try {
    const { wallet, agent_id } = await request.json()
    
    if (!wallet || !agent_id) {
      return NextResponse.json({ error: 'Missing wallet or agent_id' }, { status: 400 })
    }
    
    const supabase = getSupabase()
    const humanId = await getHumanId(supabase, wallet)
    
    if (!humanId) {
      return NextResponse.json({ error: 'Not registered' }, { status: 403 })
    }
    
    // Verify agent exists
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .single()
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    // Add to watchlist (upsert to avoid duplicates)
    const { error } = await supabase
      .from('human_watchlist')
      .upsert({ human_id: humanId, agent_id }, { onConflict: 'human_id,agent_id' })
    
    if (error) {
      console.error('Watch error:', error)
      return NextResponse.json({ error: 'Failed to add watch' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Remove agent from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const { wallet, agent_id } = await request.json()
    
    if (!wallet || !agent_id) {
      return NextResponse.json({ error: 'Missing wallet or agent_id' }, { status: 400 })
    }
    
    const supabase = getSupabase()
    const humanId = await getHumanId(supabase, wallet)
    
    if (!humanId) {
      return NextResponse.json({ error: 'Not registered' }, { status: 403 })
    }
    
    await supabase
      .from('human_watchlist')
      .delete()
      .eq('human_id', humanId)
      .eq('agent_id', agent_id)
    
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
