import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const env = {};
readFileSync('/mnt/data/clawstreet/.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const ESCROW = '0xa528D379dfe0369c82C1A616828f45f2f3Db8029';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';

const ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, uint8 bluff, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function commitWithBluff(bytes32 gameId, bytes32 commitment, uint8 bluff)',
  'function commitReaction(bytes32 gameId, bytes32 commitment)',
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)',
  'function currentRound(bytes32) view returns (uint8)'
];

const PERMIT_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
};

const P = { 1: '🪨', 2: '📄', 3: '✂️' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const jai = new ethers.Wallet(env.JAI_ALPHA_WALLET_KEY, provider);
  const mom = new ethers.Wallet(env.MOMENTUMBOT_QA_WALLET_KEY, provider);
  const eJ = new ethers.Contract(ESCROW, ABI, jai);
  const eM = new ethers.Contract(ESCROW, ABI, mom);
  
  const stake = BigInt(0.20e6);
  const domain = { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2 };
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);
  
  const secrets = {};
  
  console.log('🎮 BEST OF 7: Jai-Alpha vs MomentumBot | $0.20\\n');
  
  // R1: Jai creates
  let jaiPlay = Math.floor(Math.random() * 3) + 1;
  let jaiBluff = ((jaiPlay) % 3) + 1;
  let jaiSecret = ethers.hexlify(ethers.randomBytes(32));
  let jaiCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [jaiPlay, jaiSecret]));
  secrets['jai1'] = { play: jaiPlay, secret: jaiSecret };
  
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let permitMsg = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  let sig = await jai.signTypedData(domain, PERMIT_TYPES, permitMsg);
  let permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('R1: Jai shows', P[jaiBluff], '(plays', P[jaiPlay] + ')');
  const tx = await eJ.createGame(stake, 7, jaiCommit, jaiBluff, permit, sig);
  const rx = await tx.wait();
  const gameId = rx.logs.find(l => l.topics[0] === ethers.id('GameCreated(bytes32,address,uint96,uint8)')).topics[1];
  console.log('    Game:', gameId.slice(0,22) + '...');
  
  // Mom challenges
  let momPlay = Math.floor(Math.random() * 3) + 1;
  let momSecret = ethers.hexlify(ethers.randomBytes(32));
  let momCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [momPlay, momSecret]));
  secrets['mom1'] = { play: momPlay, secret: momSecret };
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  permitMsg = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  sig = await mom.signTypedData(domain, PERMIT_TYPES, permitMsg);
  permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('    Mom plays', P[momPlay]);
  await (await eM.challenge(gameId, momCommit, permit, sig)).wait();
  
  // Reveals
  await (await eJ.reveal(gameId, secrets.jai1.play, secrets.jai1.secret)).wait();
  await (await eM.reveal(gameId, secrets.mom1.play, secrets.mom1.secret)).wait();
  
  let g = await eJ.games(gameId);
  console.log('    → Jai', Number(g.creatorWins), '-', Number(g.challengerWins), 'Mom\\n');
  
  // Continue
  while (Number(g.status) === 1) {
    await sleep(500);
    const rnd = Number(await eJ.currentRound(gameId));
    const jaiBluffs = (rnd % 2 === 1);
    
    // Bluffer
    const blufferPlay = Math.floor(Math.random() * 3) + 1;
    const blufferBluff = ((blufferPlay) % 3) + 1;
    const blufferSecret = ethers.hexlify(ethers.randomBytes(32));
    const blufferCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [blufferPlay, blufferSecret]));
    secrets[jaiBluffs ? 'jai' + rnd : 'mom' + rnd] = { play: blufferPlay, secret: blufferSecret };
    
    console.log('R' + rnd + ':', jaiBluffs ? 'Jai' : 'Mom', 'shows', P[blufferBluff], '(plays', P[blufferPlay] + ')');
    await (await (jaiBluffs ? eJ : eM).commitWithBluff(gameId, blufferCommit, blufferBluff)).wait();
    
    // Reactor
    const reactorPlay = Math.floor(Math.random() * 3) + 1;
    const reactorSecret = ethers.hexlify(ethers.randomBytes(32));
    const reactorCommit = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [reactorPlay, reactorSecret]));
    secrets[jaiBluffs ? 'mom' + rnd : 'jai' + rnd] = { play: reactorPlay, secret: reactorSecret };
    
    console.log('    ', jaiBluffs ? 'Mom' : 'Jai', 'plays', P[reactorPlay]);
    await (await (jaiBluffs ? eM : eJ).commitReaction(gameId, reactorCommit)).wait();
    
    // Reveals
    const blufferKey = jaiBluffs ? 'jai' + rnd : 'mom' + rnd;
    const reactorKey = jaiBluffs ? 'mom' + rnd : 'jai' + rnd;
    await (await (jaiBluffs ? eJ : eM).reveal(gameId, secrets[blufferKey].play, secrets[blufferKey].secret)).wait();
    await (await (jaiBluffs ? eM : eJ).reveal(gameId, secrets[reactorKey].play, secrets[reactorKey].secret)).wait();
    
    g = await eJ.games(gameId);
    console.log('    → Jai', Number(g.creatorWins), '-', Number(g.challengerWins), 'Mom\\n');
  }
  
  const winner = g.winner.toLowerCase() === jai.address.toLowerCase() ? 'JAI-ALPHA 🤖' : 'MOMENTUMBOT 🤖';
  console.log('🏆 WINNER:', winner);
  console.log('Final: Jai', Number(g.creatorWins), '-', Number(g.challengerWins), 'Mom');
  console.log('\\nGame ID:', gameId);
}

main().catch(e => { console.error('Error:', e.shortMessage || e.message); process.exit(1); });
