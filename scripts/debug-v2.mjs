import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const envContent = readFileSync('/mnt/data/clawstreet/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) env[key.trim()] = val.join('=').trim();
});

const ESCROW_V2 = '0xa528D379dfe0369c82C1A616828f45f2f3Db8029';
const RPC = 'https://mainnet.base.org';

const ESCROW_ABI = [
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const contract = new ethers.Contract(ESCROW_V2, ESCROW_ABI, provider);

// Check the first game we created
const gameId = '0x2259c6bdbb18b8b5a0cac9d5a4e11e7e79ef17fbb5f4e67e2f93a66f3e15d6c8';
try {
  const game = await contract.games(gameId);
  console.log('Game status:', game[4]); // status
  console.log('Creator:', game[0]);
  console.log('Challenger:', game[1]);
} catch (e) {
  console.log('Error:', e.message);
}

// Check error selector
const selector = '0x00a30971';
console.log('\nError selector:', selector);
console.log('GameNotActive:', ethers.id('GameNotActive()').slice(0,10));
