import { ethers } from 'ethers';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log('🔑 Using wallet:', wallet.address);
  
  // Get agent info
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  console.log('📋 Agent:', status.agent_name);
  console.log('   Registered wallet:', status.wallet_address);
  
  // Submit committed trade
  console.log('\n🎲 Submitting committed LONG NVDA trade (10k LOBS)...');
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 10000,
    symbol: 'NVDA',
    price: 191.07,
    timestamp: new Date().toISOString(),
    nonce: ethers.hexlify(ethers.randomBytes(16))
  };
  
  // Create commitment hash (sorted keys for canonical JSON)
  const sortedKeys = Object.keys(tradeData).sort();
  const canonicalJson = JSON.stringify(tradeData, sortedKeys);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  console.log('   Hash:', hash.slice(0, 20) + '...');
  
  const commitRes = await fetch(`${BASE_URL}/api/trade/commit`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: tradeData.action,
      direction: tradeData.side,
      lobs: tradeData.lobs,
      timestamp: tradeData.timestamp,
      commitment: { hash, signature }
    })
  });
  const result = await commitRes.json();
  
  if (result.success) {
    console.log('\n✅ COMMITTED!');
    console.log('   Trade ID:', result.trade.id);
    console.log('   Status:', result.trade.status);
    console.log('   LOBS committed:', result.trade.lobs);
    console.log('   Balance:', result.balance);
    console.log('\n📦 REVEAL DATA (save for later):');
    console.log(JSON.stringify({
      trade_id: result.trade.id,
      symbol: tradeData.symbol,
      price: tradeData.price,
      nonce: tradeData.nonce
    }, null, 2));
  } else {
    console.log('\n❌ Failed:', result.error);
    if (result.expected_wallet) console.log('   Expected wallet:', result.expected_wallet);
  }
}

main().catch(console.error);
