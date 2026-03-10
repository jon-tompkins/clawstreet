import { ethers } from 'ethers';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('/mnt/data/clawstreet/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) env[key.trim()] = val.join('=').trim();
});

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
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

const PLAY_NAMES = { 1: '🪨', 2: '📄', 3: '✂️' };

async function runGame(creatorKey, challengerKey, creatorName, challengerName, stake, bestOf) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const creator = new ethers.Wallet(creatorKey, provider);
  const challenger = new ethers.Wallet(challengerKey, provider);
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, creator);
  
  console.log(`\n🎮 ${creatorName} vs ${challengerName} | $${stake} | Best of ${bestOf}`);
  
  const stakeAmount = BigInt(Math.floor(stake * 1e6));
  const domain = { name: 'Permit2', chainId: CHAIN_ID, verifyingContract: PERMIT2 };
  
  // Random plays
  const creatorPlay = Math.floor(Math.random() * 3) + 1;
  const challengerPlay = Math.floor(Math.random() * 3) + 1;
  
  // Creator creates game
  const creatorSecret = ethers.hexlify(ethers.randomBytes(32));
  const creatorCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [creatorPlay, creatorSecret]));
  
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  
  let permitMsg = { permitted: { token: USDC, amount: stakeAmount }, spender: ESCROW, nonce, deadline };
  let sig = await creator.signTypedData(domain, PERMIT_TYPES, permitMsg);
  let permit = { permitted: { token: USDC, amount: stakeAmount }, nonce, deadline };
  
  const tx1 = await escrow.createGame(stakeAmount, bestOf, creatorCommit, permit, sig);
  const receipt = await tx1.wait();
  const gameCreatedTopic = ethers.id('GameCreated(bytes32,address,uint96,uint8)');
  const log = receipt.logs.find(l => l.topics[0] === gameCreatedTopic);
  const gameId = log.topics[1];
  console.log(`  Created: ${gameId.slice(0,18)}...`);
  
  // Challenger joins
  const challengerSecret = ethers.hexlify(ethers.randomBytes(32));
  const challengerCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [challengerPlay, challengerSecret]));
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  permitMsg = { permitted: { token: USDC, amount: stakeAmount }, spender: ESCROW, nonce, deadline };
  sig = await challenger.signTypedData(domain, PERMIT_TYPES, permitMsg);
  permit = { permitted: { token: USDC, amount: stakeAmount }, nonce, deadline };
  
  const escrowChallenger = new ethers.Contract(ESCROW, ESCROW_ABI, challenger);
  await (await escrowChallenger.challenge(gameId, challengerCommit, permit, sig)).wait();
  console.log(`  Challenged!`);
  
  // Both reveal
  await (await escrow.reveal(gameId, creatorPlay, creatorSecret)).wait();
  await (await escrowChallenger.reveal(gameId, challengerPlay, challengerSecret)).wait();
  
  // Check result
  const game = await escrow.games(gameId);
  const winnerAddr = game[5];
  const winner = winnerAddr.toLowerCase() === creator.address.toLowerCase() ? creatorName : challengerName;
  
  console.log(`  ${PLAY_NAMES[creatorPlay]} vs ${PLAY_NAMES[challengerPlay]} → 🏆 ${winner}`);
  return gameId;
}

// Get keys from env
const keys = {
  jaiAlpha: env.JAI_ALPHA_WALLET_KEY,
  momentum: env.MOMENTUMBOT_QA_WALLET_KEY,
  random: env.RANDOMWALKER_QA_WALLET_KEY,
  contrarian: env.CONTRARIAN_QA_WALLET_KEY,
};

// Run 3 games
const games = [];
games.push(await runGame(keys.random, keys.contrarian, 'RandomWalker', 'Contrarian', 0.25, 1));
games.push(await runGame(keys.jaiAlpha, keys.random, 'Jai-Alpha', 'RandomWalker', 0.15, 1));
games.push(await runGame(keys.momentum, keys.contrarian, 'MomentumBot', 'Contrarian', 0.20, 1));

console.log('\n✅ All games complete!');
console.log('Game IDs:', games);
