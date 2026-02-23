import { ethers } from 'ethers';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';
const STORAGE_FILE = '/tmp/committed-trade.json';

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  
  // Check if we have a saved trade to reveal
  if (existsSync(STORAGE_FILE)) {
    console.log('📂 Found saved trade, attempting reveal...\n');
    const saved = JSON.parse(readFileSync(STORAGE_FILE, 'utf8'));
    
    // Close with reveal
    const closeHash = ethers.keccak256(ethers.toUtf8Bytes('close-' + saved.trade_id));
    const closeSig = await wallet.signMessage(ethers.getBytes(closeHash));
    
    const closeRes = await fetch(`${BASE_URL}/api/trade/commit`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CLOSE',
        opening_trade_id: saved.trade_id,
        close_price: 195.00,  // Simulated profit
        reveal: {
          symbol: saved.symbol,
          price: saved.price,
          nonce: saved.nonce
        },
        commitment: { hash: closeHash, signature: closeSig }
      })
    });
    
    const closeResult = await closeRes.json();
    console.log('🔓 Close/Reveal result:');
    console.log(JSON.stringify(closeResult, null, 2));
    
    // Clean up
    require('fs').unlinkSync(STORAGE_FILE);
    return;
  }
  
  // Fresh commit
  console.log('🆕 Creating new committed trade...\n');
  console.log('Agent:', status.agent_name, '| Wallet:', wallet.address);
  
  const timestamp = new Date().toISOString();
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 5000,
    symbol: 'AMD',
    price: 196.70,
    timestamp,
    nonce
  };
  
  const sortedKeys = Object.keys(tradeData).sort();
  const canonicalJson = JSON.stringify(tradeData, sortedKeys);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  console.log('Trade: LONG AMD @ $196.70, 5000 LOBS');
  console.log('Hash:', hash.slice(0, 20) + '...\n');
  
  const commitRes = await fetch(`${BASE_URL}/api/trade/commit`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'OPEN',
      direction: 'LONG',
      lobs: 5000,
      timestamp,
      commitment: { hash, signature }
    })
  });
  
  const result = await commitRes.json();
  console.log('✅ Commit result:', result.success ? 'SUCCESS' : 'FAILED');
  
  if (result.success) {
    // Save for reveal
    const saveData = {
      trade_id: result.trade.id,
      symbol: tradeData.symbol,
      price: tradeData.price,
      nonce: tradeData.nonce,
      timestamp: tradeData.timestamp
    };
    writeFileSync(STORAGE_FILE, JSON.stringify(saveData, null, 2));
    console.log('\n📦 Saved reveal data. Run again to close/reveal!');
    console.log('Trade ID:', result.trade.id);
  } else {
    console.log('Error:', result.error);
  }
}

main().catch(console.error);
