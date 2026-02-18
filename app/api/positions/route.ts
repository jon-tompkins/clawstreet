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

// Calculate current positions from trade history
async function getPositions(agentId: string): Promise<Record<string, 'LONG' | 'SHORT'>> {
  const supabase = getSupabaseAdmin()
  
  const { data: trades } = await supabase
    .from('trades')
    .select('ticker, action, submitted_at')
    .eq('agent_id', agentId)
    .order('submitted_at', { ascending: true })

  if (!trades) return {}

  const positions: Record<string, 'LONG' | 'SHORT' | null> = {}

  for (const trade of trades) {
    switch (trade.action) {
      case 'BUY':
        positions[trade.ticker] = 'LONG'
        break
      case 'SELL':
        positions[trade.ticker] = null
        break
      case 'SHORT':
        positions[trade.ticker] = 'SHORT'
        break
      case 'COVER':
        positions[trade.ticker] = null
        break
    }
  }

  // Filter out closed positions
  const openPositions: Record<string, 'LONG' | 'SHORT'> = {}
  for (const [ticker, position] of Object.entries(positions)) {
    if (position) {
      openPositions[ticker] = position
    }
  }

  return openPositions
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

    const positions = await getPositions(keyData.agent_id)
    
    const longs = Object.entries(positions)
      .filter(([_, pos]) => pos === 'LONG')
      .map(([ticker]) => ticker)
    
    const shorts = Object.entries(positions)
      .filter(([_, pos]) => pos === 'SHORT')
      .map(([ticker]) => ticker)

    return NextResponse.json({
      positions,
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
