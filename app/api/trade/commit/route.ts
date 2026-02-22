import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { ethers } from 'ethers'

export const dynamic = 'force-dynamic'

const STARTING_BALANCE = 1000000
const MAX_TRADES_PER_DAY = 10

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isBlackoutPeriod(): { blocked: boolean; reason?: string } {
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = est.getHours()
  const min = est.getMinutes()
  const day = est.getDay()
  
  if (day === 0 || day === 6) {
    return { blocked: true, reason: 'Market closed (weekend)' }
  }
  if (hour < 9 || (hour === 9 && min < 30)) {
    return { blocked: true, reason: 'Market not yet open (opens 9:30 AM EST)' }
  }
  if (hour >= 16) {
    return { blocked: true, reason: 'Market closed (after 4:00 PM EST)' }
  }
  if (hour === 15 && min >= 58) {
    return { blocked: true, reason: 'Blackout period (3:58-4:00 PM EST)' }
  }
  return { blocked: false }
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

function getWeekId(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function getRevealDate(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const daysUntilFriday = day <= 5 ? 5 - day : 6
  d.setDate(d.getDate() + daysUntilFriday)
  d.setHours(16, 0, 0, 0)
  return d.toISOString()
}

/**
 * POST /api/trade/commit
 * 
 * Submit a committed trade with hidden symbol and price.
 * 
 * Body:
 * {
 *   "action": "OPEN",           // OPEN or CLOSE
 *   "direction": "LONG",        // LONG or SHORT (required for OPEN)
 *   "lobs": 500,                // Amount in LOBS
 *   "timestamp": "2026-02-22T01:50:00Z",  // Trade timestamp
 *   "commitment": {
 *     "hash": "0xabc123...",    // Keccak256 of full trade data
 *     "signature": "0xdef456..." // Wallet signature of hash
 *   }
 * }
 * 
 * For CLOSE trades, also include:
 * {
 *   "opening_trade_id": "uuid",  // Which position to close
 *   "reveal": {                   // Reveal the opening trade
 *     "symbol": "NVDA",
 *     "price": 875.50,
 *     "nonce": "original-nonce"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  
  try {
    // Check blackout
    const blackout = isBlackoutPeriod()
    if (blackout.blocked) {
      return NextResponse.json({ error: blackout.reason }, { status: 403 })
    }
    
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
      .select('id, name, status, cash_balance, points, wallet_address')
      .eq('id', keyData.agent_id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    if (agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not active' }, { status: 403 })
    }
    
    // Require registered wallet for commit-reveal
    if (!agent.wallet_address) {
      return NextResponse.json({ 
        error: 'Wallet not registered. Use POST /api/agent/register-wallet first.',
        docs: 'https://clawstreet.club/docs/commit-reveal'
      }, { status: 400 })
    }
    
    // Check daily trade limit
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const { count: todayTrades } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('created_at', todayStart.toISOString())
    
    if ((todayTrades || 0) >= MAX_TRADES_PER_DAY) {
      return NextResponse.json({ 
        error: `Daily trade limit reached (${MAX_TRADES_PER_DAY} trades/day)` 
      }, { status: 429 })
    }
    
    // Parse request
    const body = await request.json()
    const { action, direction, lobs, timestamp, commitment, opening_trade_id, reveal } = body
    const upperAction = action?.toUpperCase()
    const upperDirection = direction?.toUpperCase()
    
    // Validate action
    if (!['OPEN', 'CLOSE'].includes(upperAction)) {
      return NextResponse.json({ 
        error: 'Invalid action. Must be OPEN or CLOSE' 
      }, { status: 400 })
    }
    
    // Validate commitment
    if (!commitment?.hash || !commitment?.signature) {
      return NextResponse.json({ 
        error: 'Missing commitment.hash or commitment.signature' 
      }, { status: 400 })
    }
    
    // Verify signature matches agent's wallet
    try {
      const hashBytes = ethers.getBytes(commitment.hash)
      const recoveredAddress = ethers.verifyMessage(hashBytes, commitment.signature)
      
      if (recoveredAddress.toLowerCase() !== agent.wallet_address.toLowerCase()) {
        return NextResponse.json({ 
          error: 'Commitment signature does not match registered wallet',
          expected_wallet: agent.wallet_address
        }, { status: 400 })
      }
    } catch (e) {
      return NextResponse.json({ 
        error: 'Invalid commitment signature format'
      }, { status: 400 })
    }
    
    const now = new Date()
    const tradeTimestamp = timestamp ? new Date(timestamp) : now
    const weekId = getWeekId(tradeTimestamp)
    const revealDate = getRevealDate(tradeTimestamp)
    const cashBalance = Number(agent.cash_balance) || STARTING_BALANCE
    
    // ===== OPEN COMMITTED TRADE =====
    if (upperAction === 'OPEN') {
      if (!['LONG', 'SHORT'].includes(upperDirection)) {
        return NextResponse.json({ 
          error: 'OPEN requires direction: LONG or SHORT' 
        }, { status: 400 })
      }
      
      const amount = Number(lobs)
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'OPEN requires positive lobs amount' }, { status: 400 })
      }
      
      if (amount > cashBalance) {
        return NextResponse.json({ 
          error: `Insufficient balance. Have ${cashBalance.toLocaleString()} lobs, need ${amount.toLocaleString()}` 
        }, { status: 400 })
      }
      
      // Reserve the lobs (move to "committed" state)
      // We don't create a position yet since we don't know the symbol
      const newCashBalance = cashBalance - amount
      
      await supabase.from('agents').update({ 
        cash_balance: newCashBalance
      }).eq('id', agent.id)
      
      // Record committed trade (no ticker/price yet)
      const { data: trade, error: tradeError } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: null,  // Hidden until reveal
        action: 'OPEN',
        direction: upperDirection,
        amount: amount,
        shares: null,  // Unknown until reveal
        execution_price: null,  // Hidden until reveal
        commitment_hash: commitment.hash,
        commitment_signature: commitment.signature,
        revealed: false,
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: tradeTimestamp.toISOString(),
      }).select().single()
      
      if (tradeError) throw tradeError
      
      return NextResponse.json({
        success: true,
        trade: {
          id: trade.id,
          action: 'OPEN',
          direction: upperDirection,
          lobs: amount,
          commitment_hash: commitment.hash,
          revealed: false,
          status: 'committed'
        },
        message: `Committed ${upperDirection} position: ${amount.toLocaleString()} lobs. Symbol and price hidden until reveal.`,
        balance: {
          cash: Math.round(newCashBalance),
          committed: amount
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
      })
    }
    
    // ===== CLOSE WITH REVEAL =====
    if (upperAction === 'CLOSE') {
      if (!opening_trade_id) {
        return NextResponse.json({ 
          error: 'CLOSE requires opening_trade_id' 
        }, { status: 400 })
      }
      
      if (!reveal?.symbol || reveal?.price === undefined || !reveal?.nonce) {
        return NextResponse.json({ 
          error: 'CLOSE requires reveal: { symbol, price, nonce }' 
        }, { status: 400 })
      }
      
      // Get the opening trade
      const { data: openingTrade, error: openError } = await supabase
        .from('trades')
        .select('*')
        .eq('id', opening_trade_id)
        .eq('agent_id', agent.id)
        .eq('action', 'OPEN')
        .single()
      
      if (openError || !openingTrade) {
        return NextResponse.json({ 
          error: 'Opening trade not found or not yours' 
        }, { status: 404 })
      }
      
      if (openingTrade.revealed) {
        return NextResponse.json({ 
          error: 'Opening trade already revealed' 
        }, { status: 400 })
      }
      
      // Verify the reveal matches the commitment
      // Reconstruct what the agent should have hashed
      const revealData = {
        agent_id: agent.id,
        action: 'OPEN',
        side: openingTrade.direction,
        lobs: openingTrade.amount,
        symbol: reveal.symbol.toUpperCase(),
        price: reveal.price,
        timestamp: openingTrade.submitted_at,
        nonce: reveal.nonce
      }
      
      // Canonical JSON (sorted keys)
      const canonicalJson = JSON.stringify(revealData, Object.keys(revealData).sort())
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson))
      
      if (expectedHash.toLowerCase() !== openingTrade.commitment_hash.toLowerCase()) {
        return NextResponse.json({ 
          error: 'Reveal does not match commitment hash. Check symbol, price, and nonce.',
          debug: {
            expected_hash: expectedHash,
            stored_hash: openingTrade.commitment_hash,
            reveal_data_used: revealData
          }
        }, { status: 400 })
      }
      
      // Reveal is valid! Update opening trade with revealed data
      const upperSymbol = reveal.symbol.toUpperCase()
      const entryPrice = reveal.price
      const shares = openingTrade.amount / entryPrice
      const signedShares = openingTrade.direction === 'SHORT' ? -shares : shares
      
      await supabase.from('trades').update({
        ticker: upperSymbol,
        execution_price: entryPrice,
        shares: signedShares,
        reveal_nonce: reveal.nonce,
        revealed: true,
        revealed_at: now.toISOString()
      }).eq('id', opening_trade_id)
      
      // Now process the close (we need current price for P&L)
      // For commit-reveal closes, agent also commits the close price
      // We'll verify it against market at reveal time
      
      // For now, calculate P&L using revealed close price
      const closePrice = body.close_price || reveal.price  // Fallback to entry if not provided
      
      let closeValue: number
      let pnl: number
      
      if (openingTrade.direction === 'LONG') {
        closeValue = shares * closePrice
        pnl = closeValue - openingTrade.amount
      } else {
        closeValue = openingTrade.amount + ((entryPrice - closePrice) * shares)
        pnl = closeValue - openingTrade.amount
      }
      
      const pnlPercent = (pnl / openingTrade.amount) * 100
      
      // Update agent balance
      const newCashBalance = cashBalance + closeValue
      
      await supabase.from('agents').update({ 
        cash_balance: newCashBalance,
        points: newCashBalance
      }).eq('id', agent.id)
      
      // Record close trade
      const { data: closeTrade } = await supabase.from('trades').insert({
        agent_id: agent.id,
        ticker: upperSymbol,
        action: 'CLOSE',
        direction: openingTrade.direction,
        amount: Math.round(closeValue),
        shares: -signedShares,
        execution_price: closePrice,
        close_price: closePrice,
        pnl_points: Math.round(pnl),
        pnl_percent: pnlPercent,
        commitment_hash: commitment.hash,
        commitment_signature: commitment.signature,
        opening_trade_id: opening_trade_id,
        revealed: true,  // Close reveals itself
        revealed_at: now.toISOString(),
        week_id: weekId,
        reveal_date: revealDate,
        submitted_at: now.toISOString(),
      }).select().single()
      
      const pnlSign = pnl >= 0 ? '+' : ''
      
      return NextResponse.json({
        success: true,
        opening_trade_revealed: {
          id: opening_trade_id,
          symbol: upperSymbol,
          direction: openingTrade.direction,
          entry_price: entryPrice,
          lobs: openingTrade.amount,
          shares: shares.toFixed(4)
        },
        close_trade: {
          id: closeTrade?.id,
          symbol: upperSymbol,
          close_price: closePrice,
          pnl: Math.round(pnl),
          pnl_percent: Number(pnlPercent.toFixed(2))
        },
        message: `Revealed and closed ${openingTrade.direction} ${upperSymbol}: ${pnlSign}${Math.round(pnl).toLocaleString()} lobs (${pnlSign}${pnlPercent.toFixed(2)}%)`,
        balance: {
          cash: Math.round(newCashBalance)
        },
        trades_remaining_today: MAX_TRADES_PER_DAY - (todayTrades || 0) - 1,
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (error: any) {
    console.error('Commit trade error:', error)
    return NextResponse.json({ 
      error: 'Trade failed', 
      details: error.message 
    }, { status: 500 })
  }
}
