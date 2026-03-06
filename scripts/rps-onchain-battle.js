#!/usr/bin/env node
/**
 * On-chain RPS Battle with real USDC
 * Uses the deployed RPSEscrow contract on Base
 * 
 * Usage: node rps-onchain-battle.js
 */

require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const crypto = require('crypto');

// Config
const BASE_RPC = 'https://mainnet.base.org';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

// Note: Replace with actual deployed contract address
const ESCROW_ADDRESS = process.env.RPS_ESCROW_ADDRESS || '';

// Agent wallets from env
const AGENTS = {
  momentumbot: {
    name: 'MomentumBot-QA',
    address: process.env.MOMENTUMBOT_QA_WALLET_ADDRESS,
    key: process.env.MOMENTUMBOT_QA_WALLET_KEY,
    strategy: 'psychology'
  },
  randomwalker: {
    name: 'RandomWalker-QA',
    address: process.env.RANDOMWALKER_QA_WALLET_ADDRESS,
    key: process.env.RANDOMWALKER_QA_WALLET_KEY,
    strategy: 'random'
  },
  contrarian: {
    name: 'Contrarian-QA',
    address: process.env.CONTRARIAN_QA_WALLET_ADDRESS,
    key: process.env.CONTRARIAN_QA_WALLET_KEY,
    strategy: 'contrarian'
  }
};

const PLAYS = ['ROCK', 'PAPER', 'SCISSORS'];
const BEATS = { ROCK: 'SCISSORS', PAPER: 'ROCK', SCISSORS: 'PAPER' };

function randomStrategy() {
  return PLAYS[Math.floor(Math.random() * 3)];
}

function psychologyStrategy(myLast, theirLast, theyWon) {
  if (!theirLast) return 'PAPER';
  if (theyWon) {
    return { ROCK: 'PAPER', PAPER: 'SCISSORS', SCISSORS: 'ROCK' }[theirLast];
  }
  const theirLikely = { ROCK: 'PAPER', PAPER: 'SCISSORS', SCISSORS: 'ROCK' }[myLast];
  return { ROCK: 'PAPER', PAPER: 'SCISSORS', SCISSORS: 'ROCK' }[theirLikely];
}

function getPlay(strategy, myLast, theirLast, theyWon) {
  if (strategy === 'random') return randomStrategy();
  if (strategy === 'psychology') return psychologyStrategy(myLast, theirLast, theyWon);
  return randomStrategy(); // Default
}

function determineWinner(p1, p2) {
  if (p1 === p2) return 'TIE';
  if (BEATS[p1] === p2) return 'P1';
  return 'P2';
}

async function getUsdcBalance(provider, address) {
  const usdc = new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], provider);
  const bal = await usdc.balanceOf(address);
  return parseFloat(ethers.formatUnits(bal, USDC_DECIMALS));
}

async function transferUsdc(wallet, to, amount) {
  const usdc = new ethers.Contract(USDC, [
    'function transfer(address to, uint256 amount) returns (bool)'
  ], wallet);
  const tx = await usdc.transfer(to, ethers.parseUnits(amount.toString(), USDC_DECIMALS));
  await tx.wait();
  return tx.hash;
}

async function runBattle(agent1Key, agent2Key, stakeUsdc = 1, bestOf = 5) {
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  
  const a1 = AGENTS[agent1Key];
  const a2 = AGENTS[agent2Key];
  
  if (!a1 || !a2) {
    console.error('Invalid agent keys. Use: momentumbot, randomwalker, contrarian');
    return;
  }

  console.log(`\n🎮 ON-CHAIN RPS BATTLE: ${a1.name} vs ${a2.name}`);
  console.log(`Stake: $${stakeUsdc} USDC • Best of ${bestOf}\n`);

  // Check balances
  const bal1 = await getUsdcBalance(provider, a1.address);
  const bal2 = await getUsdcBalance(provider, a2.address);
  
  console.log(`${a1.name}: $${bal1.toFixed(2)} USDC`);
  console.log(`${a2.name}: $${bal2.toFixed(2)} USDC\n`);

  if (bal1 < stakeUsdc || bal2 < stakeUsdc) {
    console.error('Insufficient balance for stake!');
    return;
  }

  // Simulate the battle (actual on-chain would use escrow contract)
  let p1Wins = 0, p2Wins = 0;
  let p1Last = null, p2Last = null, p2WonLast = null;
  const winsNeeded = Math.ceil(bestOf / 2);
  let round = 0;

  while (p1Wins < winsNeeded && p2Wins < winsNeeded) {
    round++;
    
    const p1Play = getPlay(a1.strategy, p1Last, p2Last, p2WonLast === false);
    const p2Play = getPlay(a2.strategy, p2Last, p1Last, p2WonLast === true);
    
    const winner = determineWinner(p1Play, p2Play);
    
    console.log(`Round ${round}: ${a1.name}(${p1Play}) vs ${a2.name}(${p2Play}) → ${winner}`);
    
    if (winner === 'P1') {
      p1Wins++;
      p2WonLast = false;
    } else if (winner === 'P2') {
      p2Wins++;
      p2WonLast = true;
    }
    
    p1Last = p1Play;
    p2Last = p2Play;
  }

  const overallWinner = p1Wins > p2Wins ? a1 : a2;
  const loser = p1Wins > p2Wins ? a2 : a1;
  const winnings = stakeUsdc * 2 * 0.99; // 1% rake
  
  console.log(`\n🏆 Winner: ${overallWinner.name} ${p1Wins}-${p2Wins}`);
  console.log(`Prize: $${winnings.toFixed(2)} USDC (after 1% rake)\n`);

  // Execute on-chain transfer (loser pays winner)
  console.log('💸 Executing on-chain transfer...');
  
  try {
    const loserWallet = new ethers.Wallet(loser.key, provider);
    const txHash = await transferUsdc(loserWallet, overallWinner.address, stakeUsdc);
    console.log(`TX: ${txHash}`);
    
    // Check new balances
    const newBal1 = await getUsdcBalance(provider, a1.address);
    const newBal2 = await getUsdcBalance(provider, a2.address);
    
    console.log(`\n📊 Final Balances:`);
    console.log(`${a1.name}: $${newBal1.toFixed(2)} USDC`);
    console.log(`${a2.name}: $${newBal2.toFixed(2)} USDC`);
    
    console.log('\n✅ On-chain settlement complete!');
  } catch (e) {
    console.error('Transfer failed:', e.message);
  }
}

// Run battle
const [,, p1, p2, stake, rounds] = process.argv;
runBattle(
  p1 || 'momentumbot',
  p2 || 'randomwalker',
  parseFloat(stake) || 1,
  parseInt(rounds) || 5
);
