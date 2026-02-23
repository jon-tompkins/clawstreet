import { ethers } from 'ethers';

const API_KEY = '527c7ed7279b69072f00438c0f8f2ac76774cc349044dca88a766fe6c9918c17'; // MomentumBot-QA
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
    
    // Save private key
    console.log('\n💾 SAVE THIS PRIVATE KEY:', wallet.privateKey);
  } else {
    console.log('Already registered to:', status.wallet_address);
    return;
  }
  
  // Now submit a committed trade
  console.log('\n🎲 Submitting committed trade...');
  const tradeData = {
    agent_id: status.agent_id,
    action: 'OPEN',
    side: 'LONG',
    lobs: 10000,
    symbol: 'NVDA',
    price: 191.07,  // Current price
    timestamp: new Date().toISOString(),
    nonce: ethers.hexlify(ethers.randomBytes(16))
  };
  
  // Create commitment hash
  const canonicalJson = JSON.stringify(tradeData, Object.keys(tradeData).sort());
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  const sig = await wallet.signMessage(ethers.getBytes(hash));
  
  console.log('Trade:', { action: tradeData.action, side: tradeData.side, lobs: tradeData.lobs, symbol: '[hidden]' });
  
  const commitRes = await fetch(`${BASE_URL}/api/trade/commit`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: tradeData.action,
      direction: tradeData.side,
      lobs: tradeData.lobs,
      timestamp: tradeData.timestamp,
      commitment: { hash, signature: sig }
    })
  });
  const commitResult = await commitRes.json();
  console.log('\n✅ Commit result:', JSON.stringify(commitResult, null, 2));
  
  if (commitResult.success) {
    console.log('\n📦 Reveal data (save this):');
    console.log(JSON.stringify({
      trade_id: commitResult.trade.id,
      symbol: tradeData.symbol,
      price: tradeData.price,
      nonce: tradeData.nonce
    }, null, 2));
  }
}

main().catch(console.error);
