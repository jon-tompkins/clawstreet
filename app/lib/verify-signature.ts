import { ethers } from 'ethers'

export interface RevealData {
  agent_id: string
  action: string
  side: string
  lobs: number
  symbol: string
  price: number
  timestamp: string
  nonce: string
}

export interface VerificationResult {
  valid: boolean
  error?: string
  computedHash?: string
  recoveredAddress?: string
}

/**
 * Normalize timestamp to handle timezone variations
 * Z and +00:00 are equivalent, remove trailing microseconds
 */
export function normalizeTimestamp(ts: string): string {
  return ts
    .replace(/\+00:00$/, 'Z')
    .replace(/\.(\d{3})\d*Z$/, '.$1Z')
}

/**
 * Create canonical JSON string with sorted keys for consistent hashing
 */
export function canonicalizeRevealData(data: RevealData): string {
  // Sort keys alphabetically for canonical representation
  const sorted = {
    action: data.action,
    agent_id: data.agent_id,
    lobs: data.lobs,
    nonce: data.nonce,
    price: data.price,
    side: data.side,
    symbol: data.symbol.toUpperCase(),
    timestamp: normalizeTimestamp(data.timestamp),
  }
  return JSON.stringify(sorted)
}

/**
 * Compute the commitment hash from reveal data
 */
export function computeCommitmentHash(revealData: RevealData): string {
  const canonical = canonicalizeRevealData(revealData)
  return ethers.keccak256(ethers.toUtf8Bytes(canonical))
}

/**
 * Verify that reveal data matches a stored commitment hash
 */
export function verifyRevealMatchesCommitment(
  revealData: RevealData,
  expectedHash: string
): VerificationResult {
  try {
    const computedHash = computeCommitmentHash(revealData)
    
    if (computedHash.toLowerCase() !== expectedHash.toLowerCase()) {
      return {
        valid: false,
        error: 'Reveal does not match commitment hash. Check symbol, price, timestamp, and nonce.',
        computedHash,
      }
    }
    
    return { valid: true, computedHash }
  } catch (e: any) {
    return {
      valid: false,
      error: `Failed to compute hash: ${e.message}`,
    }
  }
}

/**
 * Verify that a signature was created by the expected wallet
 */
export function verifySignature(
  hash: string,
  signature: string,
  expectedAddress: string
): VerificationResult {
  try {
    // The signature is over the hash bytes (EIP-191 personal_sign)
    const hashBytes = ethers.getBytes(hash)
    const recoveredAddress = ethers.verifyMessage(hashBytes, signature)
    
    if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      return {
        valid: false,
        error: 'Signature does not match registered wallet',
        recoveredAddress,
      }
    }
    
    return { valid: true, recoveredAddress }
  } catch (e: any) {
    return {
      valid: false,
      error: `Invalid signature format: ${e.message}`,
    }
  }
}

/**
 * Full verification: reveal matches commitment AND signature is valid
 */
export function verifyTradeCommitment(
  revealData: RevealData,
  expectedHash: string,
  signature: string,
  expectedAddress: string
): VerificationResult {
  // Step 1: Verify reveal matches commitment hash
  const hashResult = verifyRevealMatchesCommitment(revealData, expectedHash)
  if (!hashResult.valid) {
    return hashResult
  }
  
  // Step 2: Verify signature
  const sigResult = verifySignature(expectedHash, signature, expectedAddress)
  if (!sigResult.valid) {
    return {
      valid: false,
      error: sigResult.error,
      computedHash: hashResult.computedHash,
      recoveredAddress: sigResult.recoveredAddress,
    }
  }
  
  return {
    valid: true,
    computedHash: hashResult.computedHash,
    recoveredAddress: sigResult.recoveredAddress,
  }
}

/**
 * Debug helper: show what hash would be generated from reveal data
 */
export function debugRevealHash(data: Partial<RevealData>): {
  canonical: string
  hash: string
} {
  const fullData: RevealData = {
    agent_id: data.agent_id || '',
    action: data.action || 'OPEN',
    side: data.side || '',
    lobs: data.lobs || 0,
    symbol: data.symbol || '',
    price: data.price || 0,
    timestamp: data.timestamp || '',
    nonce: data.nonce || '',
  }
  
  const canonical = canonicalizeRevealData(fullData)
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonical))
  
  return { canonical, hash }
}
