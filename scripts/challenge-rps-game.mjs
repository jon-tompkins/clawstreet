import { ethers } from 'ethers';

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

const ESCROW_ABI = [
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)'
];

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

async function challengeGame(privateKey, gameId, play) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey.trim(), provider);
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, wallet);
  
  // Get game info
  const game = await escrow.games(gameId);
  const stakeAmount = game.stake;
  console.log(`Game stake: ${Number(stakeAmount) / 1e6} USDC`);
  
  // Generate commitment
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commitment = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [play, secret]));
  
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = BigInt(Math.floor(Math.random() * 1e15));
  
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
  
  const permit = {
    permitted: { token: USDC, amount: stakeAmount },
    nonce: nonce,
    deadline: deadline,
  };
  
  console.log(`Challenging game: ${gameId}`);
  console.log(`Challenger: ${wallet.address}`);
  console.log(`Play: ${play} (1=Rock, 2=Paper, 3=Scissors)`);
  console.log(`Secret (save this!): ${secret}`);
  
  const tx = await escrow.challenge(gameId, commitment, permit, signature);
  console.log(`TX: ${tx.hash}`);
  await tx.wait();
  
  console.log(`✅ Game challenged!`);
  return { secret, play, commitment };
}

const [privateKey, gameId, play] = process.argv.slice(2);
await challengeGame(privateKey, gameId, parseInt(play));
