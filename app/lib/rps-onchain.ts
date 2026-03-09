import { ethers, Wallet, Contract } from 'ethers'
import { RPS_CONFIG } from './rps-utils'

// ABI for RPSEscrow contract (minimal)
// Permit2's PermitTransferFrom is a nested struct: { permitted: { token, amount }, nonce, deadline }
const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
  'function commitPlay(bytes32 gameId, bytes32 commitment)',
  'function cancelGame(bytes32 gameId)',
  'function claimExpired(bytes32 gameId)',
  'function getGame(bytes32 gameId) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))',
  'function getRound(bytes32 gameId, uint8 roundNum) view returns (tuple(bytes32 creatorCommit, bytes32 challengerCommit, uint8 creatorPlay, uint8 challengerPlay, address winner, bool revealed))',
  'function getCurrentRound(bytes32 gameId) view returns (uint8)',
  'event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf)',
  'event GameChallenged(bytes32 indexed gameId, address indexed challenger)',
  'event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake)',
]

// ABI for ERC20 (USDC)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]

// ABI for Permit2
const PERMIT2_ABI = [
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]

// Permit2 signature types
const PERMIT2_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
}

const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: RPS_CONFIG.CHAIN_ID,
  verifyingContract: RPS_CONFIG.PERMIT2_ADDRESS,
}

export function getProvider() {
  return new ethers.JsonRpcProvider(RPS_CONFIG.RPC_URL)
}

export function getEscrowContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new Contract(RPS_CONFIG.ESCROW_ADDRESS, ESCROW_ABI, signerOrProvider)
}

export function getUsdcContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new Contract(RPS_CONFIG.USDC_ADDRESS, ERC20_ABI, signerOrProvider)
}

export function getPermit2Contract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new Contract(RPS_CONFIG.PERMIT2_ADDRESS, PERMIT2_ABI, signerOrProvider)
}

// Get wallet from private key
export function getWallet(privateKey: string): Wallet {
  const provider = getProvider()
  return new Wallet(privateKey, provider)
}

// Check USDC balance
export async function getUsdcBalance(address: string): Promise<number> {
  const provider = getProvider()
  const usdc = getUsdcContract(provider)
  const balance = await usdc.balanceOf(address)
  return Number(balance) / 1e6  // USDC has 6 decimals
}

// Check if Permit2 has allowance for USDC
export async function hasPermit2Allowance(ownerAddress: string): Promise<boolean> {
  const provider = getProvider()
  const usdc = getUsdcContract(provider)
  const allowance = await usdc.allowance(ownerAddress, RPS_CONFIG.PERMIT2_ADDRESS)
  return allowance > 0n
}

// Approve Permit2 for USDC (one-time setup per wallet)
export async function approvePermit2(wallet: Wallet): Promise<string> {
  const usdc = getUsdcContract(wallet)
  const tx = await usdc.approve(RPS_CONFIG.PERMIT2_ADDRESS, ethers.MaxUint256)
  await tx.wait()
  return tx.hash
}

// Generate commitment hash
export function generateCommitment(play: 'ROCK' | 'PAPER' | 'SCISSORS'): { commitment: string; secret: string } {
  const playNum = play === 'ROCK' ? 1 : play === 'PAPER' ? 2 : 3
  const secret = ethers.hexlify(ethers.randomBytes(32))
  const commitment = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [playNum, secret]))
  return { commitment, secret }
}

// Generate a random nonce for SignatureTransfer
// Permit2 SignatureTransfer uses bitmap-based nonces - any unused nonce works
function generateNonce(): bigint {
  // Use current timestamp + random component for uniqueness
  const timestamp = BigInt(Date.now())
  const random = BigInt(Math.floor(Math.random() * 1000000))
  return (timestamp << 20n) | random
}

// Sign Permit2 transfer
export async function signPermit2Transfer(
  wallet: Wallet,
  amount: number  // in USDC (e.g., 1.00 for $1)
): Promise<{ permit: any; signature: string }> {
  const amountWei = BigInt(Math.floor(amount * 1e6))  // USDC has 6 decimals
  const nonce = generateNonce()  // Random nonce for SignatureTransfer
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)  // 1 hour

  const permit = {
    permitted: {
      token: RPS_CONFIG.USDC_ADDRESS,
      amount: amountWei,
    },
    spender: RPS_CONFIG.ESCROW_ADDRESS,
    nonce: nonce,
    deadline: deadline,
  }

  const signature = await wallet.signTypedData(PERMIT2_DOMAIN, PERMIT2_TYPES, permit)

  // Format for contract call - must match ISignatureTransfer.PermitTransferFrom struct
  const permitForContract = {
    permitted: {
      token: RPS_CONFIG.USDC_ADDRESS,
      amount: amountWei,
    },
    nonce: nonce,
    deadline: deadline,
  }

  return { permit: permitForContract, signature }
}

// Create on-chain game
export async function createOnchainGame(
  wallet: Wallet,
  stakeUsdc: number,
  bestOf: 1 | 3 | 5 | 7,
  commitment: string
): Promise<{ gameId: string; txHash: string }> {
  const escrow = getEscrowContract(wallet)
  const { permit, signature } = await signPermit2Transfer(wallet, stakeUsdc)
  
  const stakeWei = BigInt(Math.floor(stakeUsdc * 1e6))
  
  const tx = await escrow.createGame(stakeWei, bestOf, commitment, permit, signature)
  const receipt = await tx.wait()
  
  // Parse GameCreated event
  const event = receipt.logs.find((log: any) => {
    try {
      const parsed = escrow.interface.parseLog(log)
      return parsed?.name === 'GameCreated'
    } catch {
      return false
    }
  })
  
  const parsed = escrow.interface.parseLog(event)
  const gameId = parsed?.args[0]
  
  return { gameId, txHash: tx.hash }
}

// Challenge on-chain game
export async function challengeOnchainGame(
  wallet: Wallet,
  gameId: string,
  commitment: string,
  stakeUsdc: number
): Promise<{ txHash: string }> {
  const escrow = getEscrowContract(wallet)
  const { permit, signature } = await signPermit2Transfer(wallet, stakeUsdc)
  
  const tx = await escrow.challenge(gameId, commitment, permit, signature)
  await tx.wait()
  
  return { txHash: tx.hash }
}

// Reveal play on-chain
export async function revealOnchainPlay(
  wallet: Wallet,
  gameId: string,
  play: 'ROCK' | 'PAPER' | 'SCISSORS',
  secret: string
): Promise<{ txHash: string }> {
  const escrow = getEscrowContract(wallet)
  const playNum = play === 'ROCK' ? 1 : play === 'PAPER' ? 2 : 3
  
  const tx = await escrow.reveal(gameId, playNum, secret)
  await tx.wait()
  
  return { txHash: tx.hash }
}

// Commit play for next round
export async function commitOnchainPlay(
  wallet: Wallet,
  gameId: string,
  commitment: string
): Promise<{ txHash: string }> {
  const escrow = getEscrowContract(wallet)
  
  const tx = await escrow.commitPlay(gameId, commitment)
  await tx.wait()
  
  return { txHash: tx.hash }
}

// Get game state from chain
export async function getOnchainGame(gameId: string): Promise<any> {
  const provider = getProvider()
  const escrow = getEscrowContract(provider)
  
  const game = await escrow.getGame(gameId)
  const currentRound = await escrow.getCurrentRound(gameId)
  const round = await escrow.getRound(gameId, currentRound)
  
  return {
    creator: game.creator,
    challenger: game.challenger,
    stake: Number(game.stake) / 1e6,
    bestOf: game.bestOf,
    status: ['Open', 'Active', 'Completed', 'Cancelled', 'Expired'][game.status],
    winner: game.winner,
    creatorWins: game.creatorWins,
    challengerWins: game.challengerWins,
    createdAt: Number(game.createdAt),
    challengedAt: Number(game.challengedAt),
    currentRound,
    round: {
      creatorCommit: round.creatorCommit,
      challengerCommit: round.challengerCommit,
      creatorPlay: ['None', 'Rock', 'Paper', 'Scissors'][round.creatorPlay],
      challengerPlay: ['None', 'Rock', 'Paper', 'Scissors'][round.challengerPlay],
      winner: round.winner,
      revealed: round.revealed,
    }
  }
}

// Cancel open game
export async function cancelOnchainGame(wallet: Wallet, gameId: string): Promise<{ txHash: string }> {
  const escrow = getEscrowContract(wallet)
  const tx = await escrow.cancelGame(gameId)
  await tx.wait()
  return { txHash: tx.hash }
}

// Claim expired game
export async function claimExpiredOnchainGame(wallet: Wallet, gameId: string): Promise<{ txHash: string }> {
  const escrow = getEscrowContract(wallet)
  const tx = await escrow.claimExpired(gameId)
  await tx.wait()
  return { txHash: tx.hash }
}
