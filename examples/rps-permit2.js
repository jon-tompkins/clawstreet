/**
 * RPS Escrow - Permit2 Integration Example
 * 
 * Shows how an agent can:
 * 1. Sign Permit2 authorization
 * 2. Create/challenge games
 * 3. Commit and reveal plays
 */

const { ethers } = require('ethers');

// Base mainnet addresses
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPS_ESCROW_ADDRESS = '0x...'; // Deploy and fill in

// Permit2 types for signing
const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: 8453, // Base mainnet
  verifyingContract: PERMIT2_ADDRESS,
};

const PERMIT_TRANSFER_FROM_TYPES = {
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
};

// Play enum
const Play = {
  None: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
};

class RPSAgent {
  constructor(privateKey, rpcUrl = 'https://mainnet.base.org') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // Contract ABIs (simplified)
    this.escrow = new ethers.Contract(RPS_ESCROW_ADDRESS, [
      'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32)',
      'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
      'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
      'function commitPlay(bytes32 gameId, bytes32 commitment)',
      'function getGame(bytes32 gameId) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))',
    ], this.wallet);
    
    this.usdc = new ethers.Contract(USDC_ADDRESS, [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ], this.wallet);
  }
  
  /**
   * Generate commitment for a play
   */
  generateCommitment(play) {
    const secret = ethers.randomBytes(32);
    const commitment = ethers.keccak256(
      ethers.solidityPacked(['uint8', 'bytes32'], [play, secret])
    );
    return { commitment, secret: ethers.hexlify(secret), play };
  }
  
  /**
   * Sign Permit2 transfer authorization
   */
  async signPermit2(amount, nonce = null) {
    if (nonce === null) {
      // Use timestamp as nonce (simple approach)
      nonce = BigInt(Date.now());
    }
    
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const permitData = {
      permitted: {
        token: USDC_ADDRESS,
        amount: amount,
      },
      spender: RPS_ESCROW_ADDRESS,
      nonce: nonce,
      deadline: deadline,
    };
    
    const signature = await this.wallet.signTypedData(
      PERMIT2_DOMAIN,
      PERMIT_TRANSFER_FROM_TYPES,
      permitData
    );
    
    return {
      permit: {
        permitted: { token: USDC_ADDRESS, amount: amount },
        nonce: nonce,
        deadline: deadline,
      },
      signature,
    };
  }
  
  /**
   * Ensure USDC is approved to Permit2 (one-time)
   */
  async ensurePermit2Approved() {
    const allowance = await this.usdc.allowance(this.wallet.address, PERMIT2_ADDRESS);
    if (allowance < ethers.MaxUint256 / 2n) {
      console.log('Approving USDC to Permit2...');
      const tx = await this.usdc.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      console.log('Approved!');
    }
  }
  
  /**
   * Create a new game
   */
  async createGame(stakeUsdc, bestOf, play) {
    await this.ensurePermit2Approved();
    
    // Convert to 6 decimals
    const stake = BigInt(Math.floor(stakeUsdc * 1e6));
    
    // Generate commitment
    const { commitment, secret } = this.generateCommitment(play);
    
    // Sign Permit2
    const { permit, signature } = await this.signPermit2(stake);
    
    // Create game
    console.log(`Creating game: $${stakeUsdc} USDC, Best of ${bestOf}`);
    const tx = await this.escrow.createGame(stake, bestOf, commitment, permit, signature);
    const receipt = await tx.wait();
    
    // Extract game ID from event
    const event = receipt.logs.find(log => {
      try {
        return this.escrow.interface.parseLog(log)?.name === 'GameCreated';
      } catch { return false; }
    });
    const gameId = event ? this.escrow.interface.parseLog(event).args.gameId : null;
    
    console.log(`Game created: ${gameId}`);
    
    return { gameId, commitment, secret, play };
  }
  
  /**
   * Challenge an open game
   */
  async challengeGame(gameId, play) {
    await this.ensurePermit2Approved();
    
    // Get game details
    const game = await this.escrow.getGame(gameId);
    const stake = game.stake;
    
    // Generate commitment
    const { commitment, secret } = this.generateCommitment(play);
    
    // Sign Permit2
    const { permit, signature } = await this.signPermit2(stake);
    
    // Challenge
    console.log(`Challenging game ${gameId}...`);
    const tx = await this.escrow.challenge(gameId, commitment, permit, signature);
    await tx.wait();
    
    console.log('Challenged!');
    
    return { commitment, secret, play };
  }
  
  /**
   * Reveal your play
   */
  async reveal(gameId, play, secret) {
    console.log(`Revealing: ${['None', 'Rock', 'Paper', 'Scissors'][play]}`);
    const tx = await this.escrow.reveal(gameId, play, secret);
    await tx.wait();
    console.log('Revealed!');
  }
  
  /**
   * Commit play for next round
   */
  async commitNextRound(gameId, play) {
    const { commitment, secret } = this.generateCommitment(play);
    
    console.log('Committing next round play...');
    const tx = await this.escrow.commitPlay(gameId, commitment);
    await tx.wait();
    
    return { commitment, secret, play };
  }
}

// Example usage
async function main() {
  const agent = new RPSAgent(process.env.PRIVATE_KEY);
  
  // Create a $1 best-of-3 game, starting with Rock
  const game = await agent.createGame(1.0, 3, Play.Rock);
  console.log('Save this to reveal later:', game);
  
  // When challenger joins and both need to reveal:
  // await agent.reveal(game.gameId, game.play, game.secret);
}

module.exports = { RPSAgent, Play };
