import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const envContent = readFileSync('/mnt/data/clawstreet/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) env[key.trim()] = val.join('=').trim();
});

const ESCROW = '0xa528D379dfe0369c82C1A616828f45f2f3Db8029'; // V2 with bluff
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

const ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, uint8 bluff, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function commitWithBluff(bytes32 gameId, bytes32 commitment, uint8 bluff)',
  'function commitReaction(bytes32 gameId, bytes32 commitment)',
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)',
  'function currentRound(bytes32) view returns (uint8)',
  'function getRound(bytes32, uint8) view returns (tuple(bytes32 creatorCommit, bytes32 challengerCommit, uint8 creatorPlay, uint8 challengerPlay, uint8 creatorBluff, uint8 challengerBluff, address winner, bool revealed))'
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

const PLAY = { 1: '🪨', 2: '📄', 3: '✂️' };

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const jai = new ethers.Wallet(env.JAI_ALPHA_WALLET_KEY, provider);
  const mom = new ethers.Wallet(env.MOMENTUMBOT_QA_WALLET_KEY, provider);
  
  const escrowJai = new ethers.Contract(ESCROW, ABI, jai);
  const escrowMom = new ethers.Contract(ESCROW, ABI, mom);
  
  const stake = BigInt(0.25e6); // $0.25 USDC
  const bestOf = 7; // First to 4
  const domain = { name: 'Permit2', chainId: CHAIN_ID, verifyingContract: PERMIT2 };
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours
  
  console.log('🎮 BEST OF 7 (First to 4): Jai-Alpha vs MomentumBot | $0.25 stake\n');
  
  // Round 1: Jai creates with bluff
  let jaiPlay = Math.floor(Math.random() * 3) + 1;
  let jaiBluff = ((jaiPlay) % 3) + 1; // Always bluff
  let jaiSecret = ethers.hexlify(ethers.randomBytes(32));
  let jaiCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [jaiPlay, jaiSecret]));
  
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let permitMsg = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  let sig = await jai.signTypedData(domain, PERMIT_TYPES, permitMsg);
  let permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('R1: Jai bluffs', PLAY[jaiBluff], '(plays', PLAY[jaiPlay] + ')');
  const tx1 = await escrowJai.createGame(stake, bestOf, jaiCommit, jaiBluff, permit, sig);
  const r1 = await tx1.wait();
  const gameId = r1.logs.find(l => l.topics[0] === ethers.id('GameCreated(bytes32,address,uint96,uint8)')).topics[1];
  console.log('    Game:', gameId);
  
  // Mom challenges round 1
  let momPlay = Math.floor(Math.random() * 3) + 1;
  let momSecret = ethers.hexlify(ethers.randomBytes(32));
  let momCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [momPlay, momSecret]));
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  permitMsg = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  sig = await mom.signTypedData(domain, PERMIT_TYPES, permitMsg);
  permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('    Mom plays', PLAY[momPlay]);
  await (await escrowMom.challenge(gameId, momCommit, permit, sig)).wait();
  
  // Reveals round 1
  await (await escrowJai.reveal(gameId, jaiPlay, jaiSecret)).wait();
  await (await escrowMom.reveal(gameId, momPlay, momSecret)).wait();
  
  let game = await escrowJai.games(gameId);
  console.log('    Score: Jai', game.creatorWins, '- Mom', game.challengerWins);
  
  // Continue rounds until someone wins
  while (game.status === 1n) { // Active
    await sleep(1000);
    const roundNum = await escrowJai.currentRound(gameId);
    const isJaiBluffer = (Number(roundNum) % 2 === 1);
    
    console.log('\nR' + roundNum + ':', isJaiBluffer ? 'Jai bluffs' : 'Mom bluffs');
    
    // Bluffer commits first
    const blufferWallet = isJaiBluffer ? jai : mom;
    const reactorWallet = isJaiBluffer ? mom : jai;
    const blufferContract = isJaiBluffer ? escrowJai : escrowMom;
    const reactorContract = isJaiBluffer ? escrowMom : escrowJai;
    
    const blufferPlay = Math.floor(Math.random() * 3) + 1;
    const blufferBluff = ((blufferPlay) % 3) + 1;
    const blufferSecret = ethers.hexlify(ethers.randomBytes(32));
    const blufferCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [blufferPlay, blufferSecret]));
    
    console.log('    ' + (isJaiBluffer ? 'Jai' : 'Mom'), 'shows', PLAY[blufferBluff], '(plays', PLAY[blufferPlay] + ')');
    await (await blufferContract.commitWithBluff(gameId, blufferCommit, blufferBluff)).wait();
    
    // Reactor commits
    const reactorPlay = Math.floor(Math.random() * 3) + 1;
    const reactorSecret = ethers.hexlify(ethers.randomBytes(32));
    const reactorCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [reactorPlay, reactorSecret]));
    
    console.log('    ' + (isJaiBluffer ? 'Mom' : 'Jai'), 'plays', PLAY[reactorPlay]);
    await (await reactorContract.commitReaction(gameId, reactorCommit)).wait();
    
    // Both reveal
    await (await blufferContract.reveal(gameId, blufferPlay, blufferSecret)).wait();
    await (await reactorContract.reveal(gameId, reactorPlay, reactorSecret)).wait();
    
    game = await escrowJai.games(gameId);
    console.log('    Score: Jai', game.creatorWins, '- Mom', game.challengerWins);
  }
  
  // Game complete
  const winner = game.winner.toLowerCase() === jai.address.toLowerCase() ? 'Jai-Alpha' : 'MomentumBot';
  console.log('\n🏆 WINNER:', winner);
  console.log('Final Score: Jai', game.creatorWins, '- Mom', game.challengerWins);
  console.log('Game ID:', gameId);
}

main().catch(console.error);
