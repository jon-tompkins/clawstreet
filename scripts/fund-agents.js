#!/usr/bin/env node
/**
 * Fund agent wallets with ETH and USDC on Base
 * 
 * Usage: 
 *   source .env.local && node fund-agents.js [--dry-run]
 * 
 * Reads wallet keys from environment variables (never from files!)
 */

require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');

// Base mainnet
const BASE_RPC = 'https://mainnet.base.org';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

// Distribution config
const ETH_PER_AGENT = '0.0002';  // ~$0.50 at $2500/ETH
const USDC_PER_AGENT = 10;       // $10 USDC

// Agent wallets from env vars
const AGENTS = [
  {
    name: 'MomentumBot-QA',
    address: process.env.MOMENTUMBOT_QA_WALLET_ADDRESS,
    key: process.env.MOMENTUMBOT_QA_WALLET_KEY
  },
  {
    name: 'RandomWalker-QA', 
    address: process.env.RANDOMWALKER_QA_WALLET_ADDRESS,
    key: process.env.RANDOMWALKER_QA_WALLET_KEY
  },
  {
    name: 'Contrarian-QA',
    address: process.env.CONTRARIAN_QA_WALLET_ADDRESS,
    key: process.env.CONTRARIAN_QA_WALLET_KEY
  }
];

// Jai-Alpha (funder)
const JAI_ALPHA = {
  name: 'Jai-Alpha',
  address: process.env.JAI_ALPHA_WALLET_ADDRESS,
  key: process.env.JAI_ALPHA_WALLET_KEY
};

async function getBalances(provider, address) {
  const ethBalance = await provider.getBalance(address);
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  const usdcBalance = await usdc.balanceOf(address);
  
  return {
    eth: ethers.formatEther(ethBalance),
    usdc: ethers.formatUnits(usdcBalance, USDC_DECIMALS)
  };
}

async function distributeEth(wallet, agents, ethPerAgent, dryRun = false) {
  console.log(`\n⛽ Distributing ${ethPerAgent} ETH to each agent...`);
  
  for (const agent of agents) {
    console.log(`  → ${agent.name}: ${agent.address}`);
    
    if (dryRun) {
      console.log(`    [DRY RUN] Would send ${ethPerAgent} ETH`);
      continue;
    }
    
    const tx = await wallet.sendTransaction({
      to: agent.address,
      value: ethers.parseEther(ethPerAgent)
    });
    console.log(`    TX: ${tx.hash}`);
    await tx.wait();
    console.log(`    ✅ Confirmed`);
  }
}

async function distributeUsdc(wallet, agents, usdcPerAgent, dryRun = false) {
  console.log(`\n💵 Distributing ${usdcPerAgent} USDC to each agent...`);
  
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    'function transfer(address to, uint256 amount) returns (bool)'
  ], wallet);
  
  const amount = ethers.parseUnits(usdcPerAgent.toString(), USDC_DECIMALS);
  
  for (const agent of agents) {
    console.log(`  → ${agent.name}: ${agent.address}`);
    
    if (dryRun) {
      console.log(`    [DRY RUN] Would send ${usdcPerAgent} USDC`);
      continue;
    }
    
    const tx = await usdc.transfer(agent.address, amount);
    console.log(`    TX: ${tx.hash}`);
    await tx.wait();
    console.log(`    ✅ Confirmed`);
  }
}

async function main() {
  // Validate env vars
  if (!JAI_ALPHA.address || !JAI_ALPHA.key) {
    console.error('❌ Missing JAI_ALPHA wallet env vars');
    console.error('Run: source .env.local');
    process.exit(1);
  }
  
  for (const agent of AGENTS) {
    if (!agent.address) {
      console.error(`❌ Missing ${agent.name} wallet address env var`);
      process.exit(1);
    }
  }
  
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('🔍 DRY RUN MODE\n');
  
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const wallet = new ethers.Wallet(JAI_ALPHA.key, provider);
  
  console.log('=== Jai-Alpha Wallet ===');
  console.log(`Address: ${JAI_ALPHA.address}`);
  
  const balances = await getBalances(provider, JAI_ALPHA.address);
  console.log(`ETH Balance: ${balances.eth}`);
  console.log(`USDC Balance: ${balances.usdc}`);
  
  const totalEthNeeded = parseFloat(ETH_PER_AGENT) * AGENTS.length + 0.001;
  const totalUsdcNeeded = USDC_PER_AGENT * AGENTS.length;
  
  console.log(`\n=== Distribution Plan ===`);
  console.log(`ETH needed: ~${totalEthNeeded.toFixed(4)} (${ETH_PER_AGENT} × ${AGENTS.length} + gas)`);
  console.log(`USDC needed: ${totalUsdcNeeded} (${USDC_PER_AGENT} × ${AGENTS.length})`);
  
  if (parseFloat(balances.eth) < totalEthNeeded) {
    console.error(`\n❌ Insufficient ETH. Need ${totalEthNeeded.toFixed(4)}, have ${balances.eth}`);
    process.exit(1);
  }
  
  if (parseFloat(balances.usdc) < totalUsdcNeeded) {
    console.error(`\n❌ Insufficient USDC. Need ${totalUsdcNeeded}, have ${balances.usdc}`);
    console.error('Send USDC to Jai-Alpha or swap ETH→USDC first');
    process.exit(1);
  }
  
  // Distribute
  await distributeEth(wallet, AGENTS, ETH_PER_AGENT, dryRun);
  await distributeUsdc(wallet, AGENTS, USDC_PER_AGENT, dryRun);
  
  console.log('\n=== Final Balances ===');
  for (const agent of [...AGENTS, JAI_ALPHA]) {
    const bal = await getBalances(provider, agent.address);
    console.log(`${agent.name}: ${bal.eth} ETH, ${bal.usdc} USDC`);
  }
  
  console.log('\n✅ Distribution complete!');
}

main().catch(console.error);
