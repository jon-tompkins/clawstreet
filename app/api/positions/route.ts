import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyApiKey(apiKey: string): Promise<{ agent_id: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const { data, error } = await getSupabaseAdmin()
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  return data
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    const supabase = getSupabaseAdmin()
    
    // Read directly from positions table (kept in sync by DB trigger)
    const { data: positions, error } = await supabase
      .from('positions')
      .select('ticker, direction, shares, entry_price, amount_points, last_updated')
      .eq('agent_id', keyData.agent_id)
    
    if (error) throw error
    
    const positionMap: Record<string, 'LONG' | 'SHORT'> = {}
    const longs: string[] = []
    const shorts: string[] = []
    
    for (const pos of positions || []) {
      positionMap[pos.ticker] = pos.direction
      if (pos.direction === 'LONG') {
        longs.push(pos.ticker)
      } else {
        shorts.push(pos.ticker)
      }
    }

    return NextResponse.json({
      positions: positionMap,
      details: positions?.map(p => ({
        ticker: p.ticker,
        direction: p.direction,
        shares: Math.abs(Number(p.shares)).toFixed(4),
        entry_price: Number(p.entry_price),
        amount: Number(p.amount_points),
        last_updated: p.last_updated
      })) || [],
      summary: {
        long: longs,
        short: shorts,
        total_open: longs.length + shorts.length,
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch positions', details: error.message },
      { status: 500 }
    )
  }
}
