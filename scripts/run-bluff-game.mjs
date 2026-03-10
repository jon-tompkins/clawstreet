import { ethers } from 'ethers';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('/mnt/data/clawstreet/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) env[key.trim()] = val.join('=').trim();
});

const ESCROW_V2 = '0xa528D379dfe0369c82C1A616828f45f2f3Db8029';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, uint8 bluff, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)',
  'function getRound(bytes32 gameId, uint8 roundNum) view returns (tuple(bytes32 creatorCommit, bytes32 challengerCommit, uint8 creatorPlay, uint8 challengerPlay, uint8 creatorBluff, uint8 challengerBluff, address winner, bool revealed))'
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

const PLAY_NAMES = { 1: '🪨 Rock', 2: '📄 Paper', 3: '✂️ Scissors' };
const PLAY_EMOJI = { 1: '🪨', 2: '📄', 3: '✂️' };

async function runBluffGame(creatorKey, challengerKey, creatorName, challengerName, stake) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const creator = new ethers.Wallet(creatorKey, provider);
  const challenger = new ethers.Wallet(challengerKey, provider);
  
  const escrowCreator = new ethers.Contract(ESCROW_V2, ESCROW_ABI, creator);
  const escrowChallenger = new ethers.Contract(ESCROW_V2, ESCROW_ABI, challenger);
  
  console.log(`\n🎮 BLUFF GAME: ${creatorName} vs ${challengerName} | $${stake}`);
  
  const stakeAmount = BigInt(Math.floor(stake * 1e6));
  const domain = { name: 'Permit2', chainId: CHAIN_ID, verifyingContract: PERMIT2 };
  
  // Creator picks real play and bluff (different = bluffing!)
  const creatorRealPlay = Math.floor(Math.random() * 3) + 1;
  const creatorBluff = ((creatorRealPlay) % 3) + 1; // Bluff something else
  
  console.log(`  ${creatorName} bluffs: ${PLAY_EMOJI[creatorBluff]} (will actually play ${PLAY_EMOJI[creatorRealPlay]})`);
  
  // Creator creates with bluff
  const creatorSecret = ethers.hexlify(ethers.randomBytes(32));
  const creatorCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [creatorRealPlay, creatorSecret]));
  
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  
  let permitMsg = { permitted: { token: USDC, amount: stakeAmount }, spender: ESCROW_V2, nonce, deadline };
  let sig = await creator.signTypedData(domain, PERMIT_TYPES, permitMsg);
  let permit = { permitted: { token: USDC, amount: stakeAmount }, nonce, deadline };
  
  const tx1 = await escrowCreator.createGame(stakeAmount, 1, creatorCommit, creatorBluff, permit, sig);
  const receipt = await tx1.wait();
  
  const gameCreatedTopic = ethers.id('GameCreated(bytes32,address,uint96,uint8)');
  const log = receipt.logs.find(l => l.topics[0] === gameCreatedTopic);
  const gameId = log.topics[1];
  console.log(`  Game created: ${gameId.slice(0,18)}...`);
  
  // Challenger sees bluff and makes decision
  const challengerPlay = Math.floor(Math.random() * 3) + 1;
  console.log(`  ${challengerName} sees ${PLAY_EMOJI[creatorBluff]}, plays ${PLAY_EMOJI[challengerPlay]}`);
  
  const challengerSecret = ethers.hexlify(ethers.randomBytes(32));
  const challengerCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [challengerPlay, challengerSecret]));
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  permitMsg = { permitted: { token: USDC, amount: stakeAmount }, spender: ESCROW_V2, nonce, deadline };
  sig = await challenger.signTypedData(domain, PERMIT_TYPES, permitMsg);
  permit = { permitted: { token: USDC, amount: stakeAmount }, nonce, deadline };
  
  await (await escrowChallenger.challenge(gameId, challengerCommit, permit, sig)).wait();
  console.log(`  ${challengerName} joined!`);
  
  // Both reveal
  await (await escrowCreator.reveal(gameId, creatorRealPlay, creatorSecret)).wait();
  await (await escrowChallenger.reveal(gameId, challengerPlay, challengerSecret)).wait();
  
  // Get results
  const game = await escrowCreator.games(gameId);
  const round = await escrowCreator.getRound(gameId, 1);
  const winnerAddr = game[5];
  const winner = winnerAddr.toLowerCase() === creator.address.toLowerCase() ? creatorName : challengerName;
  const wasBluff = round[4] != round[2]; // creatorBluff != creatorPlay
  
  console.log(`\n  📊 RESULT:`);
  console.log(`    ${creatorName}: Showed ${PLAY_EMOJI[round[4]]} → Actually ${PLAY_EMOJI[round[2]]} ${wasBluff ? '(BLUFF!)' : ''}`);
  console.log(`    ${challengerName}: Played ${PLAY_EMOJI[round[3]]}`);
  console.log(`    🏆 Winner: ${winner}`);
  
  return { gameId, wasBluff, winner };
}

// Run a bluff game
const keys = {
  jaiAlpha: env.JAI_ALPHA_WALLET_KEY,
  momentum: env.MOMENTUMBOT_QA_WALLET_KEY,
};

await runBluffGame(keys.jaiAlpha, keys.momentum, 'Jai-Alpha', 'MomentumBot', 0.10);
console.log('\n✅ Bluff game complete!');
