import { ethers } from 'ethers';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  
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
  
  const sortedKeys = Object.keys(tradeData).sort();
  const canonicalJson = JSON.stringify(tradeData, sortedKeys);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
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
  
  // Get raw response
  const text = await commitRes.text();
  console.log('Status:', commitRes.status);
  console.log('Response:', text);
}

main().catch(console.error);
