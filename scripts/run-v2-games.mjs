import { ethers } from 'ethers';
import { readFileSync, writeFileSync } from 'fs';

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

const PLAY_EMOJI = { 1: '🪨', 2: '📄', 3: '✂️' };

async function runGame(creatorKey, challengerKey, creatorName, challengerName, stake, bluff) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const creator = new ethers.Wallet(creatorKey, provider);
  const challenger = new ethers.Wallet(challengerKey, provider);
  
  const escrowC = new ethers.Contract(ESCROW_V2, ESCROW_ABI, creator);
  const escrowCh = new ethers.Contract(ESCROW_V2, ESCROW_ABI, challenger);
  
  const stakeAmt = BigInt(Math.floor(stake * 1e6));
  const domain = { name: 'Permit2', chainId: CHAIN_ID, verifyingContract: PERMIT2 };
  
  const realPlay = Math.floor(Math.random() * 3) + 1;
  const bluffPlay = bluff ? ((realPlay) % 3) + 1 : realPlay;
  
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [realPlay, secret]));
  
  // Create game
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  let permitMsg = { permitted: { token: USDC, amount: stakeAmt }, spender: ESCROW_V2, nonce, deadline };
  let sig = await creator.signTypedData(domain, PERMIT_TYPES, permitMsg);
  let permit = { permitted: { token: USDC, amount: stakeAmt }, nonce, deadline };
  
  console.log(`${creatorName} creates: ${bluff ? 'BLUFF' : 'honest'} ${PLAY_EMOJI[bluffPlay]} (real: ${PLAY_EMOJI[realPlay]})`);
  
  const tx1 = await escrowC.createGame(stakeAmt, 1, commit, bluffPlay, permit, sig);
  const r1 = await tx1.wait();
  const gameId = r1.logs.find(l => l.topics[0] === ethers.id('GameCreated(bytes32,address,uint96,uint8)')).topics[1];
  console.log(`  Game: ${gameId.slice(0,18)}...`);
  
  // Challenge
  const chPlay = Math.floor(Math.random() * 3) + 1;
  const chSecret = ethers.hexlify(ethers.randomBytes(32));
  const chCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [chPlay, chSecret]));
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  permitMsg = { permitted: { token: USDC, amount: stakeAmt }, spender: ESCROW_V2, nonce, deadline };
  sig = await challenger.signTypedData(domain, PERMIT_TYPES, permitMsg);
  permit = { permitted: { token: USDC, amount: stakeAmt }, nonce, deadline };
  
  console.log(`${challengerName} challenges: ${PLAY_EMOJI[chPlay]}`);
  await (await escrowCh.challenge(gameId, chCommit, permit, sig)).wait();
  
  // Reveal
  await (await escrowC.reveal(gameId, realPlay, secret)).wait();
  await (await escrowCh.reveal(gameId, chPlay, chSecret)).wait();
  
  // Result
  const game = await escrowC.games(gameId);
  const winner = game[5].toLowerCase() === creator.address.toLowerCase() ? creatorName : challengerName;
  console.log(`  ${PLAY_EMOJI[realPlay]} vs ${PLAY_EMOJI[chPlay]} → ${winner} wins!`);
  
  return gameId;
}

const keys = {
  jai: env.JAI_ALPHA_WALLET_KEY,
  mom: env.MOMENTUMBOT_QA_WALLET_KEY,
};

console.log('Running V2 games with Jai-Alpha & MomentumBot only...\n');

const games = [];
games.push(await runGame(keys.jai, keys.mom, 'Jai', 'Momentum', 0.10, true));
games.push(await runGame(keys.mom, keys.jai, 'Momentum', 'Jai', 0.10, false));
games.push(await runGame(keys.jai, keys.mom, 'Jai', 'Momentum', 0.12, true));

console.log('\n✅ Game IDs:', games);
