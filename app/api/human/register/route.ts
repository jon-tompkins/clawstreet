import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, parseEther } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'

const TREASURY_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91'.toLowerCase()
const REGISTRATION_FEE = parseEther('0.0001')

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

export async function POST(request: NextRequest) {
  try {
    const { wallet, tx } = await request.json()
    
    if (!wallet || !tx) {
      return NextResponse.json({ error: 'Missing wallet or tx' }, { status: 400 })
    }
    
    const walletLower = wallet.toLowerCase()
    const supabase = getSupabase()
    
    // Check if already registered
    const { data: existing } = await supabase
      .from('humans')
      .select('id, status')
      .eq('wallet_address', walletLower)
      .single()
    
    if (existing?.status === 'active') {
      return NextResponse.json({ success: true, message: 'Already registered' })
    }
    
    // Verify transaction on Base
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: tx as `0x${string}` })
      const transaction = await publicClient.getTransaction({ hash: tx as `0x${string}` })
      
      // Verify: correct recipient, sufficient value, from correct wallet
      if (transaction.to?.toLowerCase() !== TREASURY_ADDRESS) {
        return NextResponse.json({ error: 'Invalid tx recipient' }, { status: 400 })
      }
      
      if (transaction.value < REGISTRATION_FEE) {
        return NextResponse.json({ error: 'Insufficient fee' }, { status: 400 })
      }
      
      if (transaction.from.toLowerCase() !== walletLower) {
        return NextResponse.json({ error: 'Tx not from registering wallet' }, { status: 400 })
      }
      
      if (receipt.status !== 'success') {
        return NextResponse.json({ error: 'Tx failed' }, { status: 400 })
      }
    } catch (e: any) {
      console.error('Tx verification error:', e)
      return NextResponse.json({ error: 'Could not verify tx' }, { status: 400 })
    }
    
    // Create or update human record
    if (existing) {
      await supabase
        .from('humans')
        .update({ status: 'active', registration_tx: tx })
        .eq('id', existing.id)
    } else {
      const { error } = await supabase
        .from('humans')
        .insert({
          wallet_address: walletLower,
          registration_tx: tx,
          status: 'active',
        })
      
      if (error) {
        console.error('Insert error:', error)
        return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
      }
    }
    
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Registration error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
