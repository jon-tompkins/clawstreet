/**
 * Base Logger - On-chain trade logging for Clawstreet
 * 
 * Logs trades to Base mainnet for cryptographic proof of trade history.
 * Designed to be non-blocking - fire and forget, errors are logged but don't fail the API.
 */

import { ethers } from 'ethers'

// Contract ABI (only the functions we need)
const TRADE_LOG_ABI = [
  "function logCommit(bytes32 agentId, bytes32 commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "function logReveal(bytes32 agentId, bytes32 commitmentHash, string ticker, uint256 price, uint256 timestamp)",
  "event TradeCommitted(bytes32 indexed agentId, bytes32 indexed commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "event TradeRevealed(bytes32 indexed agentId, bytes32 indexed commitmentHash, string ticker, uint256 price, uint256 timestamp)"
]

// Configuration from environment
const CONTRACT_ADDRESS = process.env.TRADE_LOG_CONTRACT
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY

// Price scaling factor (1e8 for 8 decimal places)
const PRICE_SCALE = 100000000n

/**
 * Check if Base logging is enabled
 */
export function isBaseLoggingEnabled(): boolean {
  return Boolean(CONTRACT_ADDRESS && DEPLOYER_PRIVATE_KEY)
}

/**
 * Get a connected contract instance
 */
function getContract(): ethers.Contract | null {
  if (!isBaseLoggingEnabled()) {
    return null
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL)
    const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY!, provider)
    return new ethers.Contract(CONTRACT_ADDRESS!, TRADE_LOG_ABI, wallet)
  } catch (error) {
    console.error('[Base Logger] Failed to create contract instance:', error)
    return null
  }
}

/**
 * Convert a UUID string to bytes32 (keccak256 hash)
 * @deprecated Use walletToBytes32 for new code
 */
export function uuidToBytes32(uuid: string): string {
  // Remove dashes and convert to consistent format
  const normalized = uuid.toLowerCase().replace(/-/g, '')
  // Hash the UUID string to get bytes32
  return ethers.keccak256(ethers.toUtf8Bytes(normalized))
}

/**
 * Convert a wallet address to bytes32 (left-padded)
 * This is the preferred method - wallet = identity
 */
export function walletToBytes32(wallet: string): string {
  // Ensure valid address format
  const address = ethers.getAddress(wallet) // checksums and validates
  // Pad to 32 bytes (address is 20 bytes)
  return ethers.zeroPadValue(address, 32)
}

/**
 * Convert agent identifier to bytes32
 * Supports both wallet addresses (0x...) and UUIDs
 */
export function agentToBytes32(agentIdOrWallet: string): string {
  // If it looks like an Ethereum address, use wallet method
  if (agentIdOrWallet.startsWith('0x') && agentIdOrWallet.length === 42) {
    return walletToBytes32(agentIdOrWallet)
  }
  // Otherwise treat as UUID (legacy)
  return uuidToBytes32(agentIdOrWallet)
}

/**
 * Convert a commitment hash to bytes32 (ensure proper format)
 */
export function hashToBytes32(hash: string): string {
  // If already a valid bytes32 hex string, return as-is
  if (hash.startsWith('0x') && hash.length === 66) {
    return hash.toLowerCase()
  }
  // Otherwise hash it
  return ethers.keccak256(ethers.toUtf8Bytes(hash))
}

/**
 * Scale a price to uint256 (multiply by 1e8)
 */
export function scalePrice(price: number): bigint {
  // Convert to bigint with 8 decimal places
  // e.g., 875.50 -> 87550000000
  return BigInt(Math.round(price * Number(PRICE_SCALE)))
}

/**
 * Convert Date to Unix timestamp in seconds
 */
export function dateToTimestamp(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000))
}

interface LogCommitParams {
  agentId?: string        // UUID (legacy)
  agentWallet?: string    // Wallet address (preferred)
  commitmentHash: string  // 0x... hash
  action: string          // OPEN or CLOSE
  direction: string       // LONG or SHORT
  lobs: number           // Amount in LOBS
  timestamp: Date
}

interface LogCommitResult {
  txHash: string
  agentIdBytes32: string
  commitmentHashBytes32: string
}

/**
 * Log a trade commitment on-chain
 * 
 * Non-blocking - returns immediately after sending transaction.
 * Errors are logged but don't throw.
 * 
 * @returns Transaction hash if successful, null otherwise
 */
export async function logTradeCommit(params: LogCommitParams): Promise<LogCommitResult | null> {
  if (!isBaseLoggingEnabled()) {
    console.log('[Base Logger] Logging disabled - missing CONTRACT or PRIVATE_KEY')
    return null
  }
  
  try {
    const contract = getContract()
    if (!contract) return null
    
    // Prefer wallet address, fall back to UUID
    const agentIdentifier = params.agentWallet || params.agentId
    if (!agentIdentifier) {
      console.error('[Base Logger] No agent identifier provided')
      return null
    }
    
    const agentIdBytes32 = agentToBytes32(agentIdentifier)
    const commitmentHashBytes32 = hashToBytes32(params.commitmentHash)
    const timestamp = dateToTimestamp(params.timestamp)
    
    const displayId = params.agentWallet 
      ? `wallet=${params.agentWallet.slice(0, 10)}...`
      : `uuid=${params.agentId?.slice(0, 8)}...`
    console.log(`[Base Logger] Logging commit: ${displayId} action=${params.action} direction=${params.direction} lobs=${params.lobs}`)
    
    // Send transaction (don't wait for confirmation)
    const tx = await contract.logCommit(
      agentIdBytes32,
      commitmentHashBytes32,
      params.action,
      params.direction,
      BigInt(params.lobs),
      timestamp,
      {
        // Use reasonable gas limits
        gasLimit: 100000n,
      }
    )
    
    console.log(`[Base Logger] Commit tx sent: ${tx.hash}`)
    
    // Fire and forget - don't wait for confirmation
    // Log confirmation in background
    tx.wait().then((receipt: any) => {
      console.log(`[Base Logger] Commit confirmed in block ${receipt.blockNumber}`)
    }).catch((err: any) => {
      console.error(`[Base Logger] Commit tx failed:`, err.message)
    })
    
    return {
      txHash: tx.hash,
      agentIdBytes32,
      commitmentHashBytes32,
    }
  } catch (error: any) {
    console.error('[Base Logger] Failed to log commit:', error.message)
    return null
  }
}

interface LogRevealParams {
  agentId?: string        // UUID (legacy)
  agentWallet?: string    // Wallet address (preferred)
  commitmentHash: string  // 0x... hash (original commitment)
  ticker: string          // Symbol (e.g., NVDA, BTC)
  price: number          // Execution price
  timestamp: Date
}

interface LogRevealResult {
  txHash: string
  agentIdBytes32: string
  commitmentHashBytes32: string
  scaledPrice: string
}

/**
 * Log a trade reveal on-chain
 * 
 * Non-blocking - returns immediately after sending transaction.
 * Errors are logged but don't throw.
 * 
 * @returns Transaction hash if successful, null otherwise
 */
export async function logTradeReveal(params: LogRevealParams): Promise<LogRevealResult | null> {
  if (!isBaseLoggingEnabled()) {
    console.log('[Base Logger] Logging disabled - missing CONTRACT or PRIVATE_KEY')
    return null
  }
  
  try {
    const contract = getContract()
    if (!contract) return null
    
    // Prefer wallet address, fall back to UUID
    const agentIdentifier = params.agentWallet || params.agentId
    if (!agentIdentifier) {
      console.error('[Base Logger] No agent identifier provided')
      return null
    }
    
    const agentIdBytes32 = agentToBytes32(agentIdentifier)
    const commitmentHashBytes32 = hashToBytes32(params.commitmentHash)
    const scaledPrice = scalePrice(params.price)
    const timestamp = dateToTimestamp(params.timestamp)
    
    const displayId = params.agentWallet 
      ? `wallet=${params.agentWallet.slice(0, 10)}...`
      : `uuid=${params.agentId?.slice(0, 8)}...`
    console.log(`[Base Logger] Logging reveal: ${displayId} ticker=${params.ticker} price=${params.price}`)
    
    // Send transaction (don't wait for confirmation)
    const tx = await contract.logReveal(
      agentIdBytes32,
      commitmentHashBytes32,
      params.ticker.toUpperCase(),
      scaledPrice,
      timestamp,
      {
        gasLimit: 100000n,
      }
    )
    
    console.log(`[Base Logger] Reveal tx sent: ${tx.hash}`)
    
    // Fire and forget - don't wait for confirmation
    tx.wait().then((receipt: any) => {
      console.log(`[Base Logger] Reveal confirmed in block ${receipt.blockNumber}`)
    }).catch((err: any) => {
      console.error(`[Base Logger] Reveal tx failed:`, err.message)
    })
    
    return {
      txHash: tx.hash,
      agentIdBytes32,
      commitmentHashBytes32,
      scaledPrice: scaledPrice.toString(),
    }
  } catch (error: any) {
    console.error('[Base Logger] Failed to log reveal:', error.message)
    return null
  }
}

/**
 * Query trade history for an agent from Base
 * 
 * @param agentId Agent UUID
 * @param fromBlock Starting block (default: contract deployment block)
 * @returns Array of trade events
 */
export async function queryAgentTrades(agentId: string, fromBlock?: number): Promise<{
  commits: any[]
  reveals: any[]
} | null> {
  if (!CONTRACT_ADDRESS) {
    return null
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, TRADE_LOG_ABI, provider)
    
    const agentIdBytes32 = uuidToBytes32(agentId)
    
    // Query TradeCommitted events
    const commitFilter = contract.filters.TradeCommitted(agentIdBytes32)
    const commits = await contract.queryFilter(commitFilter, fromBlock || 0)
    
    // Query TradeRevealed events
    const revealFilter = contract.filters.TradeRevealed(agentIdBytes32)
    const reveals = await contract.queryFilter(revealFilter, fromBlock || 0)
    
    return {
      commits: commits.map(e => {
        const event = e as ethers.EventLog
        return {
          blockNumber: e.blockNumber,
          transactionHash: e.transactionHash,
          args: event.args ? {
            agentId: event.args[0],
            commitmentHash: event.args[1],
            action: event.args[2],
            direction: event.args[3],
            lobs: event.args[4].toString(),
            timestamp: new Date(Number(event.args[5]) * 1000).toISOString(),
          } : null
        }
      }),
      reveals: reveals.map(e => {
        const event = e as ethers.EventLog
        return {
          blockNumber: e.blockNumber,
          transactionHash: e.transactionHash,
          args: event.args ? {
            agentId: event.args[0],
            commitmentHash: event.args[1],
            ticker: event.args[2],
            price: (Number(event.args[3]) / Number(PRICE_SCALE)).toFixed(8),
            timestamp: new Date(Number(event.args[4]) * 1000).toISOString(),
          } : null
        }
      }),
    }
  } catch (error: any) {
    console.error('[Base Logger] Failed to query trades:', error.message)
    return null
  }
}

/**
 * Get Base explorer URL for a transaction
 */
export function getBaseScanUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`
}

/**
 * Get Base explorer URL for contract events
 */
export function getBaseScanEventsUrl(): string {
  return `https://basescan.org/address/${CONTRACT_ADDRESS}#events`
}
