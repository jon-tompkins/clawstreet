import { ethers } from 'ethers';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';

// Normalize timestamp to +00:00 format (what Supabase uses)
const normalizeTs = (ts) => new Date(ts).toISOString().replace('Z', '+00:00');

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  console.log('Agent:', status.agent_name);
  
  // Commit a hidden trade
  const timestamp = normalizeTs(new Date());
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'SHORT',  // Shorting TSLA!
    lobs: 25000,
    symbol: 'TSLA',
    price: 398.81,
    timestamp,
    nonce
  };
  
  const sortedKeys = Object.keys(tradeData).sort();
  const canonicalJson = JSON.stringify(tradeData, sortedKeys);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  console.log('\n🔒 Committing hidden trade...');
  console.log('   Direction: SHORT');
  console.log('   Amount: 25,000 LOBS');
  console.log('   (Symbol hidden until reveal)\n');
  
  const commitRes = await fetch(`${BASE_URL}/api/trade/commit`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'OPEN',
      direction: 'SHORT',
      lobs: 25000,
      timestamp,
      commitment: { hash, signature }
    })
  });
  
  const result = await commitRes.json();
  console.log('Result:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n✅ Hidden trade committed!');
    console.log('Trade ID:', result.trade.id);
    console.log('\nCheck MomentumBot-QA page - should show:');
    console.log('  SHORT 🔒 ??? 25,000 lobs [C-R]');
  }
}

main().catch(console.error);
