import { ethers } from 'ethers';

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B';
const RPC = 'https://mainnet.base.org';

const ESCROW_ABI = [
  'function reveal(bytes32 gameId, uint8 play, bytes32 secret)',
  'function games(bytes32) view returns (address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn)',
  'function getGame(bytes32) view returns (tuple(address creator, address challenger, uint96 stake, uint8 bestOf, uint8 status, address winner, uint8 creatorWins, uint8 challengerWins, uint40 createdAt, uint40 challengedAt, bytes32 currentCommitment, bool creatorTurn))'
];

async function reveal(privateKey, gameId, play, secret) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey.trim(), provider);
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, wallet);
  
  console.log(`Revealing for ${wallet.address}...`);
  console.log(`Play: ${play} (1=Rock, 2=Paper, 3=Scissors)`);
  
  const tx = await escrow.reveal(gameId, play, secret);
  console.log(`TX: ${tx.hash}`);
  await tx.wait();
  
  // Check game state
  const game = await escrow.getGame(gameId);
  console.log(`\nGame state after reveal:`);
  console.log(`  Status: ${['Open', 'Active', 'Complete', 'Cancelled', 'Expired'][game.status]}`);
  console.log(`  Creator wins: ${game.creatorWins}`);
  console.log(`  Challenger wins: ${game.challengerWins}`);
  if (game.winner !== '0x0000000000000000000000000000000000000000') {
    console.log(`  🏆 Winner: ${game.winner}`);
  }
}

const [privateKey, gameId, play, secret] = process.argv.slice(2);
await reveal(privateKey, gameId, parseInt(play), secret);
