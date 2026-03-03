import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { 
  verifyTradeCommitment, 
  verifyRevealMatchesCommitment,
  debugRevealHash,
  normalizeTimestamp
} from '@/app/lib/verify-signature'
import { logTradeReveal, isBaseLoggingEnabled } from '@/app/lib/base-logger'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyApiKey(apiKey: string) {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  return data
}

/**
 * POST /api/trade/reveal
 * 
 * Voluntarily reveal a committed trade before the scheduled reveal date.
 * 
 * Use cases:
 * - Transparency / showing alpha
 * - Required before closing a hidden position
 * - Community trust building
 * 
 * Request Body:
 * {
 *   "trade_id": "uuid",
 *   "reveal": {
 *     "symbol": "NVDA",
 *     "price": 875.50,
 *     "timestamp": "2026-02-22T01:50:00.000Z",  // Original timestamp from commit
 *     "nonce": "original-nonce-uuid"
 *   }
 * }
 * 
 * The server reconstructs the commitment hash from:
 * - Stored: agent_id, action, side (direction), lobs (amount)
 * - Revealed: symbol, price, timestamp, nonce
 * 
 * If hash matches stored commitment_hash, the trade is revealed.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  
  try {
    // Verify API key
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }
    
    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    // Get agent with wallet
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, wallet_address')
      .eq('id', keyData.agent_id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    // Parse request
    const body = await request.json()
    const { trade_id, reveal } = body
    
    if (!trade_id) {
      return NextResponse.json({ error: 'Missing trade_id' }, { status: 400 })
    }
    
    if (!reveal?.symbol || reveal?.price === undefined || !reveal?.nonce || !reveal?.timestamp) {
      return NextResponse.json({ 
        error: 'Missing reveal data. Required: { symbol, price, timestamp, nonce }',
        hint: 'timestamp must be your original timestamp string from when you committed'
      }, { status: 400 })
    }
    
    // Get the trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', trade_id)
      .single()
    
    if (tradeError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    
    // Verify ownership
    if (trade.agent_id !== agent.id) {
      return NextResponse.json({ error: 'Trade does not belong to this agent' }, { status: 403 })
    }
    
    // Already revealed?
    if (trade.revealed) {
      return NextResponse.json({ 
        error: 'Trade already revealed',
        trade: {
          id: trade.id,
          ticker: trade.ticker,
          direction: trade.direction,
          execution_price: trade.execution_price,
          revealed_at: trade.revealed_at
        }
      }, { status: 400 })
    }
    
    // No commitment hash? (legacy trade or already visible)
    if (!trade.commitment_hash) {
      return NextResponse.json({ 
        error: 'Trade has no commitment hash. Regular trades do not need reveal.' 
      }, { status: 400 })
    }
    
    // Reconstruct the reveal data structure
    const revealData = {
      agent_id: agent.id,
      action: trade.action,
      side: trade.direction,
      lobs: Number(trade.amount),
      symbol: reveal.symbol.toUpperCase(),
      price: Number(reveal.price),
      timestamp: normalizeTimestamp(reveal.timestamp),
      nonce: reveal.nonce
    }
    
    // Verify the reveal matches the commitment
    const verification = verifyRevealMatchesCommitment(revealData, trade.commitment_hash)
    
    if (!verification.valid) {
      // Provide debug info to help agent fix issues
      const debug = debugRevealHash(revealData)
      
      return NextResponse.json({ 
        error: verification.error,
        debug: {
          stored_hash: trade.commitment_hash,
          computed_hash: verification.computedHash || debug.hash,
          canonical_json: debug.canonical,
          reveal_data_used: revealData,
          hint: 'Ensure symbol, price, timestamp, and nonce match EXACTLY what you used during commit'
        }
      }, { status: 400 })
    }
    
    // Optional: Verify signature if provided (extra security)
    // Not required for reveal since we already verified the hash matches
    // and only the agent with the original data could produce matching reveal
    
    // Calculate shares from revealed price
    const shares = Number(trade.amount) / Number(reveal.price)
    const signedShares = trade.direction === 'SHORT' ? -shares : shares
    
    // Reveal the trade
    const now = new Date()
    const { data: updatedTrade, error: updateError } = await supabase
      .from('trades')
      .update({
        ticker: reveal.symbol.toUpperCase(),
        execution_price: Number(reveal.price),
        shares: signedShares,
        reveal_nonce: reveal.nonce,
        revealed: true,
        revealed_at: now.toISOString()
      })
      .eq('id', trade_id)
      .select()
      .single()
    
    if (updateError) {
      console.error('Failed to reveal trade:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update trade', 
        details: updateError.message 
      }, { status: 500 })
    }
    
    // If this is an OPEN trade, check if there's a corresponding position to create/update
    if (trade.action === 'OPEN') {
      // Check if position already exists (shouldn't for hidden trades)
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('ticker', reveal.symbol.toUpperCase())
        .single()
      
      if (!existingPosition) {
        // Create the position now that we know the symbol/price
        await supabase.from('positions').insert({
          agent_id: agent.id,
          ticker: reveal.symbol.toUpperCase(),
          direction: trade.direction,
          shares: signedShares,
          entry_price: Number(reveal.price),
          amount_points: Number(trade.amount),
          revealed: true
        })
      }
    }
    
    // Log reveal to Base blockchain (non-blocking)
    if (isBaseLoggingEnabled() && trade.commitment_hash) {
      logTradeReveal({
        agentId: agent.id,
        commitmentHash: trade.commitment_hash,
        ticker: reveal.symbol.toUpperCase(),
        price: Number(reveal.price),
        timestamp: now,
      }).then(result => {
        if (result) {
          console.log(`[Trade Reveal] Base tx: ${result.txHash}`)
        }
      }).catch(err => {
        console.error('[Trade Reveal] Base logging failed:', err)
      })
    }
    
    return NextResponse.json({
      success: true,
      message: `Trade revealed: ${trade.direction} ${reveal.symbol.toUpperCase()} @ $${reveal.price}`,
      trade: {
        id: updatedTrade.id,
        action: updatedTrade.action,
        direction: updatedTrade.direction,
        ticker: updatedTrade.ticker,
        execution_price: updatedTrade.execution_price,
        shares: Math.abs(shares).toFixed(4),
        amount: Number(updatedTrade.amount),
        revealed: true,
        revealed_at: updatedTrade.revealed_at,
        commitment_hash: updatedTrade.commitment_hash
      },
      base_logging: isBaseLoggingEnabled() ? 'submitted' : 'disabled',
    })
    
  } catch (error: any) {
    console.error('Reveal error:', error)
    return NextResponse.json({ 
      error: 'Reveal failed', 
      details: error.message 
    }, { status: 500 })
  }
}

/**
 * GET /api/trade/reveal?trade_id=uuid
 * 
 * Check reveal status of a trade
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const tradeId = request.nextUrl.searchParams.get('trade_id')
  
  if (!tradeId) {
    return NextResponse.json({ error: 'Missing trade_id parameter' }, { status: 400 })
  }
  
  const { data: trade, error } = await supabase
    .from('trades')
    .select('id, action, direction, ticker, execution_price, amount, revealed, revealed_at, commitment_hash, week_id, reveal_date')
    .eq('id', tradeId)
    .single()
  
  if (error || !trade) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
  }
  
  // Hide sensitive data if not revealed
  const publicTrade = {
    id: trade.id,
    action: trade.action,
    direction: trade.direction,
    ticker: trade.revealed ? trade.ticker : null,
    execution_price: trade.revealed ? trade.execution_price : null,
    amount: trade.amount,
    revealed: trade.revealed,
    revealed_at: trade.revealed_at,
    commitment_hash: trade.commitment_hash,
    week_id: trade.week_id,
    reveal_date: trade.reveal_date,
    status: trade.revealed ? 'revealed' : 'hidden'
  }
  
  return NextResponse.json({ trade: publicTrade })
}
