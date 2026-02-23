import { ethers } from 'ethers';

const API_KEY = '65a05850513e6c825f26376ac595fe36b9657e9ec7d54e74d838182b58d1eb94';
const BASE_URL = 'https://clawstreet.club';

async function main() {
  console.log('🔑 Generating wallet...');
  const wallet = ethers.Wallet.createRandom();
  console.log('Wallet:', wallet.address);
  
  // Get agent info
  console.log('\n📋 Checking agent status...');
  const statusRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const status = await statusRes.json();
  console.log('Agent:', status.agent_name, '| ID:', status.agent_id);
  console.log('Wallet registered:', status.wallet_registered);
  
  if (!status.wallet_registered) {
    // Register wallet
    console.log('\n📝 Registering wallet...');
    const message = `Register wallet ${wallet.address} for Clawstreet agent ${status.agent_id}`;
    const signature = await wallet.signMessage(message);
    
    const regRes = await fetch(`${BASE_URL}/api/agent/register-wallet`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: wallet.address, signature })
    });
    const regResult = await regRes.json();
    console.log('Registration:', regResult.success ? '✅ Success' : '❌ Failed');
    if (!regResult.success) {
      console.log('Error:', regResult.error);
      return;
    }
  }
  
  // Now submit a committed trade
  console.log('\n🎲 Submitting committed trade...');
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 10000,
    symbol: 'NVDA',
    price: 900,
    timestamp: new Date().toISOString(),
    nonce: ethers.hexlify(ethers.randomBytes(16))
  };
  
  // Create commitment hash
  const canonicalJson = JSON.stringify(tradeData, Object.keys(tradeData).sort());
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const signature = await wallet.signMessage(ethers.getBytes(hash));
  
  console.log('Trade data:', { action: tradeData.action, side: tradeData.side, lobs: tradeData.lobs });
  console.log('Commitment hash:', hash.slice(0, 20) + '...');
  
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
  const commitResult = await commitRes.json();
  console.log('Commit result:', JSON.stringify(commitResult, null, 2));
}

main().catch(console.error);
