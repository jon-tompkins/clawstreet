import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'Clawstreet',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
  chains: [base],
  ssr: true,
})

// Treasury address for registration fees
export const TREASURY_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91' as const
export const REGISTRATION_FEE = '0.0001' // ETH
