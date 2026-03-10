import { ethers } from 'ethers';

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)'
];

const PERMIT2_ABI = [
  'function DOMAIN_SEPARATOR() view returns (bytes32)'
];

// Permit2 signature types
const PERMIT_TYPES = {
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

async function createGame(privateKey, stake, bestOf, play) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey.trim(), provider);
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, wallet);
  
  // Generate commitment (play + secret)
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commitment = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [play, secret]));
  
  // Stake in USDC decimals (6)
  const stakeAmount = BigInt(Math.floor(stake * 1e6));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
  const nonce = BigInt(Math.floor(Math.random() * 1e15)); // Random nonce
  
  // Build Permit2 signature
  const domain = {
    name: 'Permit2',
    chainId: CHAIN_ID,
    verifyingContract: PERMIT2,
  };
  
  const permitMessage = {
    permitted: { token: USDC, amount: stakeAmount },
    spender: ESCROW,
    nonce: nonce,
    deadline: deadline,
  };
  
  const signature = await wallet.signTypedData(domain, PERMIT_TYPES, permitMessage);
  
  // Create game
  const permit = {
    permitted: { token: USDC, amount: stakeAmount },
    nonce: nonce,
    deadline: deadline,
  };
  
  console.log(`Creating game: ${stake} USDC, best of ${bestOf}, play=${play}`);
  console.log(`Creator: ${wallet.address}`);
  console.log(`Commitment: ${commitment}`);
  console.log(`Secret (save this!): ${secret}`);
  
  const tx = await escrow.createGame(stakeAmount, bestOf, commitment, permit, signature);
  console.log(`TX: ${tx.hash}`);
  const receipt = await tx.wait();
  
  // Parse GameCreated event to get gameId
  const gameCreatedTopic = ethers.id('GameCreated(bytes32,address,uint96,uint8)');
  const log = receipt.logs.find(l => l.topics[0] === gameCreatedTopic);
  const gameId = log.topics[1];
  
  console.log(`✅ Game created! ID: ${gameId}`);
  return { gameId, secret, play, commitment };
}

const [privateKey, stake, bestOf, play] = process.argv.slice(2);
await createGame(privateKey, parseFloat(stake), parseInt(bestOf), parseInt(play));
