import { ethers } from 'ethers';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';
const STORAGE_FILE = '/tmp/final-test.json';

// Normalize timestamp to always use +00:00 (what Supabase uses)
const normalizeTs = (ts) => new Date(ts).toISOString().replace('Z', '+00:00');

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  
  if (existsSync(STORAGE_FILE)) {
    console.log('📂 REVEAL PHASE...\n');
    const saved = JSON.parse(readFileSync(STORAGE_FILE, 'utf8'));
    
    const closeHash = ethers.keccak256(ethers.toUtf8Bytes('close-' + saved.trade_id));
    const closeSig = await wallet.signMessage(ethers.getBytes(closeHash));
    
    const closeRes = await fetch(`${BASE_URL}/api/trade/commit`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CLOSE',
        opening_trade_id: saved.trade_id,
        close_price: 400.00,
        reveal: {
          symbol: saved.symbol,
          price: saved.price,
          nonce: saved.nonce,
          timestamp: saved.timestamp  // Use normalized timestamp
        },
        commitment: { hash: closeHash, signature: closeSig }
      })
    });
    
    const result = await closeRes.json();
    console.log(JSON.stringify(result, null, 2));
    unlinkSync(STORAGE_FILE);
    return;
  }
  
  // COMMIT with normalized timestamp
  const timestamp = normalizeTs(new Date());  // Use +00:00 format
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 3000,
    symbol: 'GOOGL',
    price: 313.69,
    timestamp,
    nonce
  };
  
  console.log('🔐 COMMIT PHASE...');
  console.log('Timestamp format:', timestamp);
  
  const sortedKeys = Object.keys(tradeData).sort();
  const canonicalJson = JSON.stringify(tradeData, sortedKeys);
  console.log('Canonical JSON:', canonicalJson.substring(0, 100) + '...');
  
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  console.log('Hash:', hash);
  
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  const commitRes = await fetch(`${BASE_URL}/api/trade/commit`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'OPEN',
      direction: 'LONG',
      lobs: 3000,
      timestamp,
      commitment: { hash, signature }
    })
  });
  
  const result = await commitRes.json();
  
  if (result.success) {
    writeFileSync(STORAGE_FILE, JSON.stringify({
      trade_id: result.trade.id,
      symbol: tradeData.symbol,
      price: tradeData.price,
      nonce,
      timestamp
    }, null, 2));
    console.log('\n✅ COMMITTED! ID:', result.trade.id);
    console.log('Run again to reveal!');
  } else {
    console.log('❌', result.error);
  }
}

main().catch(console.error);
