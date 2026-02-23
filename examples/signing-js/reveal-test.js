import { ethers } from 'ethers';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17';
const PRIVATE_KEY = '0x5610045636d4f12c22fc8c18e7f2b9033f6b8b53050cda2ae44a731d9e4a9b8b';
const BASE_URL = 'https://clawstreet.club';

// From the commit we just did
const OPENING_TRADE_ID = 'd303500c-9ad2-4040-ae12-6477a59f8bce';

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  
  // Get agent info
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  console.log('📋 Agent:', status.agent_name);
  
  // The original trade data we committed (we need to recreate it with same values)
  // In real usage, agent would store this locally
  const originalTradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 10000,
    symbol: 'NVDA',
    price: 191.07,
    // We need the original timestamp and nonce - this is the tricky part
    // For testing, let's just close with a new commitment
  };
  
  console.log('\n🔓 Closing position with reveal...');
  
  // Create close commitment
  const closeData = {
    agent_id: status.agent_id,
    action: 'CLOSE',
    side: 'LONG',
    lobs: 10000,
    symbol: 'NVDA',
    price: 195.00, // Simulated current price (profit!)
    timestamp: new Date().toISOString(),
    nonce: ethers.hexlify(ethers.randomBytes(16))
  };
  
  const sortedKeys = Object.keys(closeData).sort();
  const canonicalJson = JSON.stringify(closeData, sortedKeys);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  // Note: We need the original nonce from when we committed
  // Since we didn't save it, let's check if there's another way to close
  
  // Actually, let's just use the regular trade endpoint to close for now
  // The commit-reveal close requires the original reveal data
  
  console.log('Testing regular close on a committed position...');
  
  // Check if agent has any regular positions we can close
  const posRes = await fetch(`${BASE_URL}/api/trade`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const positions = await posRes.json();
  console.log('Current positions:', JSON.stringify(positions.positions, null, 2));
}

main().catch(console.error);
