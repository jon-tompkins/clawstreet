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
  'function createGame(uint96,uint8,bytes32,uint8,tuple(tuple(address,uint256),uint256,uint256),bytes) returns (bytes32)',
  'function challenge(bytes32,bytes32,tuple(tuple(address,uint256),uint256,uint256),bytes)',
  'function commitWithBluff(bytes32,bytes32,uint8)',
  'function commitReaction(bytes32,bytes32)',
  'function reveal(bytes32,uint8,bytes32)',
  'function games(bytes32) view returns (address,address,uint96,uint8,uint8,address,uint8,uint8,uint40,uint40,bytes32,bool)',
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

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const jai = new ethers.Wallet(env.JAI_ALPHA_WALLET_KEY, provider);
  const mom = new ethers.Wallet(env.MOMENTUMBOT_QA_WALLET_KEY, provider);
  const eJ = new ethers.Contract(ESCROW, ABI, jai);
  const eM = new ethers.Contract(ESCROW, ABI, mom);
  
  const stake = BigInt(0.20e6);
  const domain = { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2 };
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);
  
  // Secrets storage
  const secrets = { jai: {}, mom: {} };
  
  console.log('🎮 BEST OF 7: Jai-Alpha vs MomentumBot | $0.20\\n');
  
  // R1: Jai creates
  let p = Math.floor(Math.random() * 3) + 1;
  let b = ((p) % 3) + 1;
  let s = ethers.hexlify(ethers.randomBytes(32));
  let c = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [p, s]));
  secrets.jai[1] = { play: p, secret: s };
  
  let nonce = BigInt(Math.floor(Math.random() * 1e15));
  let pm = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  let sig = await jai.signTypedData(domain, PERMIT_TYPES, pm);
  let permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('R1: Jai shows', P[b], '(plays', P[p] + ')');
  const tx = await eJ.createGame(stake, 7, c, b, permit, sig);
  const rx = await tx.wait();
  const gameId = rx.logs.find(l => l.topics[0] === ethers.id('GameCreated(bytes32,address,uint96,uint8)')).topics[1];
  console.log('    Game:', gameId.slice(0,20) + '...');
  
  // Mom challenges
  p = Math.floor(Math.random() * 3) + 1;
  s = ethers.hexlify(ethers.randomBytes(32));
  c = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [p, s]));
  secrets.mom[1] = { play: p, secret: s };
  
  nonce = BigInt(Math.floor(Math.random() * 1e15));
  pm = { permitted: { token: USDC, amount: stake }, spender: ESCROW, nonce, deadline };
  sig = await mom.signTypedData(domain, PERMIT_TYPES, pm);
  permit = { permitted: { token: USDC, amount: stake }, nonce, deadline };
  
  console.log('    Mom plays', P[p]);
  await (await eM.challenge(gameId, c, permit, sig)).wait();
  
  // Reveals R1
  await (await eJ.reveal(gameId, secrets.jai[1].play, secrets.jai[1].secret)).wait();
  await (await eM.reveal(gameId, secrets.mom[1].play, secrets.mom[1].secret)).wait();
  
  let g = await eJ.games(gameId);
  console.log('    → Jai', g[6], '-', g[7], 'Mom\\n');
  
  // Loop until done
  while (g[4] === 1n) {
    const rnd = Number(await eJ.currentRound(gameId));
    const jaiBluffs = (rnd % 2 === 1);
    const bluffer = jaiBluffs ? 'Jai' : 'Mom';
    const reactor = jaiBluffs ? 'Mom' : 'Jai';
    const eB = jaiBluffs ? eJ : eM;
    const eR = jaiBluffs ? eM : eJ;
    
    // Bluffer commits
    p = Math.floor(Math.random() * 3) + 1;
    b = ((p) % 3) + 1;
    s = ethers.hexlify(ethers.randomBytes(32));
    c = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [p, s]));
    if (jaiBluffs) secrets.jai[rnd] = { play: p, secret: s };
    else secrets.mom[rnd] = { play: p, secret: s };
    
    console.log('R' + rnd + ':', bluffer, 'shows', P[b], '(plays', P[p] + ')');
    await (await eB.commitWithBluff(gameId, c, b)).wait();
    
    // Reactor commits
    p = Math.floor(Math.random() * 3) + 1;
    s = ethers.hexlify(ethers.randomBytes(32));
    c = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [p, s]));
    if (jaiBluffs) secrets.mom[rnd] = { play: p, secret: s };
    else secrets.jai[rnd] = { play: p, secret: s };
    
    console.log('    ', reactor, 'plays', P[p]);
    await (await eR.commitReaction(gameId, c)).wait();
    
    // Reveals
    await (await eB.reveal(gameId, jaiBluffs ? secrets.jai[rnd].play : secrets.mom[rnd].play, 
                                   jaiBluffs ? secrets.jai[rnd].secret : secrets.mom[rnd].secret)).wait();
    await (await eR.reveal(gameId, jaiBluffs ? secrets.mom[rnd].play : secrets.jai[rnd].play,
                                   jaiBluffs ? secrets.mom[rnd].secret : secrets.jai[rnd].secret)).wait();
    
    g = await eJ.games(gameId);
    console.log('    → Jai', g[6], '-', g[7], 'Mom\\n');
  }
  
  const winner = g[5].toLowerCase() === jai.address.toLowerCase() ? 'JAI-ALPHA' : 'MOMENTUMBOT';
  console.log('🏆 WINNER:', winner);
  console.log('Final: Jai', g[6], '- Mom', g[7]);
  console.log('Game:', gameId);
}

main().catch(e => console.error('Error:', e.message));
