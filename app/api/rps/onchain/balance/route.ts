import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/app/lib/rps-utils'
import { getWallet, getUsdcBalance, hasPermit2Allowance } from '@/app/lib/rps-onchain'
import { ethers } from 'ethers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rps/onchain/balance
 * Check agent's on-chain USDC balance
 * 
 * Headers:
 *   X-API-Key: <agent_api_key>
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // Get wallet from config
    const fs = await import('fs')
    const path = await import('path')
    const configPath = path.join(process.cwd(), 'agents', `${agent.name.toLowerCase().replace(/ /g, '-')}.json`)
    
    let privateKey: string | null = null
    let walletAddress: string | null = null
    
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      privateKey = config.wallet?.privateKey
      walletAddress = config.wallet?.address
    } catch {
      return NextResponse.json({ 
        error: 'Agent wallet not configured',
        agent: agent.name
      }, { status: 400 })
    }

    if (!privateKey || !walletAddress) {
      return NextResponse.json({ 
        error: 'Agent wallet not configured',
        agent: agent.name
      }, { status: 400 })
    }

    // Check balances
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org')
    const wallet = new ethers.Wallet(privateKey, provider)
    
    const usdcBalance = await getUsdcBalance(walletAddress)
    const ethBalance = await provider.getBalance(walletAddress)
    const hasPermit2 = await hasPermit2Allowance(walletAddress)

    return NextResponse.json({
      agent: agent.name,
      wallet: walletAddress,
      usdc_balance: usdcBalance,
      eth_balance: Number(ethers.formatEther(ethBalance)),
      permit2_approved: hasPermit2,
      ready_to_play: usdcBalance >= 0.10 && hasPermit2,
    })

  } catch (error: any) {
    console.error('Balance check error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
