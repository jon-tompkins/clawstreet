#!/usr/bin/env node
/**
 * End-to-end test of the on-chain RPS flow
 * Tests: sign-data, join-onchain, confirm-tx
 */

const { ethers } = require('ethers');

const API_BASE = 'https://clawstreet.club';
const API_KEY = 'cs_test_7f7259164689c16582efe5df6e1a8221';

const RPC_URL = 'https://mainnet.base.org';
const ESCROW_ADDRESS = '0xEa12B70545232286Ac42fB5297a9166A1A77735B';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const CHAIN_ID = 8453;

// Generate commitment hash: keccak256(abi.encodePacked(uint8(play), bytes32(secret)))
function generateCommitment(play, secret) {
  // play: 1=ROCK, 2=PAPER, 3=SCISSORS
  const playInt = play === 'ROCK' ? 1 : play === 'PAPER' ? 2 : 3;
  
  // Pack as: uint8 play + bytes32 secret
  const encoded = ethers.solidityPacked(
    ['uint8', 'bytes32'],
    [playInt, secret]
  );
  
  return ethers.keccak256(encoded);
}

async function checkBalances(wallet, provider) {
  console.log('\n📊 Checking balances...');
  
  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`  ETH: ${ethers.formatEther(ethBalance)} ETH`);
  
  // Check USDC balance
  const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  
  // Check Permit2 allowance
  const erc20Abi = ['function allowance(address,address) view returns (uint256)'];
  const usdcFull = new ethers.Contract(USDC_ADDRESS, erc20Abi, provider);
  const permit2Allowance = await usdcFull.allowance(wallet.address, PERMIT2_ADDRESS);
  console.log(`  Permit2 Allowance: ${ethers.formatUnits(permit2Allowance, 6)} USDC`);
  
  return {
    eth: ethBalance,
    usdc: usdcBalance,
    permit2Allowance
  };
}

async function approvePermit2IfNeeded(wallet, provider, amount) {
  const erc20Abi = [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)'
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, wallet);
  
  const allowance = await usdc.allowance(wallet.address, PERMIT2_ADDRESS);
  
  if (allowance < amount) {
    console.log('\n⏳ Approving Permit2 for USDC...');
    const tx = await usdc.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log('  ✅ Approved!');
  } else {
    console.log('\n✅ Permit2 already approved');
  }
}

async function testCreateOnchainGame(wallet, provider) {
  console.log('\n🎮 Step 1: Create on-chain game...');
  
  // Generate secret and commitment
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commitment = generateCommitment('ROCK', secret);
  console.log(`  Secret: ${secret}`);
  console.log(`  Commitment: ${commitment}`);
  
  // First get sign-data to get permit values
  // Actually for create-onchain, we need to build our own permit
  
  const stakeUsdc = 0.10;
  const bestOf = 3; // DB constraint: must be 3, 5, or 7
  const stakeWei = BigInt(Math.floor(stakeUsdc * 1e6));
  
  // Generate permit data locally
  const timestamp = BigInt(Date.now());
  const random = BigInt(Math.floor(Math.random() * 1000000));
  const nonce = ((timestamp << 20n) | random).toString();
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  
  const domain = {
    name: 'Permit2',
    chainId: CHAIN_ID,
    verifyingContract: PERMIT2_ADDRESS,
  };
  
  const types = {
    PermitTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  };
  
  const values = {
    permitted: {
      token: USDC_ADDRESS,
      amount: stakeWei.toString(),
    },
    spender: ESCROW_ADDRESS,
    nonce: nonce,
    deadline: deadline,
  };
  
  console.log('\n📝 Signing permit...');
  const signature = await wallet.signTypedData(domain, types, values);
  console.log(`  Signature: ${signature.slice(0, 42)}...`);
  
  // Call create-onchain endpoint
  const permit = {
    permitted: {
      token: USDC_ADDRESS,
      amount: stakeWei.toString(),
    },
    nonce: nonce,
    deadline: deadline,
  };
  
  console.log('\n📡 Calling create-onchain API...');
  const createRes = await fetch(`${API_BASE}/api/rps/v2/create-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      stake_usdc: stakeUsdc,
      best_of: bestOf,
      commitment,
      permit,
      signature,
      wallet_address: wallet.address,
    }),
  });
  
  const createData = await createRes.json();
  
  if (!createData.success) {
    console.error('❌ Create failed:', createData);
    return null;
  }
  
  console.log(`  Game ID: ${createData.game_id}`);
  console.log(`  Action: ${createData.action}`);
  console.log(`  Tx To: ${createData.tx.to}`);
  console.log(`  Tx Data: ${createData.tx.data.slice(0, 42)}...`);
  
  // Send transaction
  console.log('\n⛓️ Sending transaction to Base...');
  const tx = await wallet.sendTransaction({
    to: createData.tx.to,
    data: createData.tx.data,
    chainId: createData.tx.chainId,
  });
  
  console.log(`  Tx Hash: ${tx.hash}`);
  console.log('  Waiting for confirmation...');
  
  const receipt = await tx.wait();
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
  
  // Confirm with API
  console.log('\n📡 Confirming with API...');
  const confirmRes = await fetch(`${API_BASE}/api/rps/v2/confirm-tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      game_id: createData.game_id,
      tx_hash: tx.hash,
    }),
  });
  
  const confirmData = await confirmRes.json();
  
  if (!confirmData.success) {
    console.error('❌ Confirm failed:', confirmData);
    return null;
  }
  
  console.log(`  ✅ Confirmed!`);
  console.log(`  On-chain Game ID: ${confirmData.onchain_game_id}`);
  console.log(`  Basescan: ${confirmData.basescan}`);
  
  return {
    gameId: createData.game_id,
    onchainGameId: confirmData.onchain_game_id,
    txHash: tx.hash,
    secret,
    commitment,
  };
}

async function main() {
  console.log('🚀 On-Chain RPS Flow Test\n');
  console.log('='.repeat(50));
  
  // Load wallet
  const walletKey = process.env.JAI_ALPHA_WALLET_KEY;
  if (!walletKey) {
    console.error('❌ JAI_ALPHA_WALLET_KEY not set');
    process.exit(1);
  }
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(walletKey, provider);
  
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Chain: Base Mainnet (${CHAIN_ID})`);
  
  // Check balances
  const balances = await checkBalances(wallet, provider);
  
  // Check if we have enough
  const minEth = ethers.parseEther('0.0003'); // ~$0.60 for gas
  const minUsdc = BigInt(100000); // 0.10 USDC
  
  if (balances.eth < minEth) {
    console.error('\n❌ Insufficient ETH for gas. Need at least 0.0005 ETH');
    process.exit(1);
  }
  
  if (balances.usdc < minUsdc) {
    console.error('\n❌ Insufficient USDC. Need at least 0.10 USDC');
    process.exit(1);
  }
  
  // Approve Permit2 if needed
  await approvePermit2IfNeeded(wallet, provider, minUsdc);
  
  // Test create flow
  const result = await testCreateOnchainGame(wallet, provider);
  
  if (result) {
    console.log('\n' + '='.repeat(50));
    console.log('✅ TEST PASSED!');
    console.log('\nGame Details:');
    console.log(`  Off-chain ID: ${result.gameId}`);
    console.log(`  On-chain ID: ${result.onchainGameId}`);
    console.log(`  Tx: https://basescan.org/tx/${result.txHash}`);
    console.log(`  Secret (save this!): ${result.secret}`);
  } else {
    console.log('\n❌ TEST FAILED');
    process.exit(1);
  }
}

main().catch(console.error);
