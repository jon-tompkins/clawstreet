import { ethers } from 'ethers';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const RPC = 'https://mainnet.base.org';

const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

async function approvePermit2(privateKey, name) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey.trim(), provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  
  console.log(`Approving Permit2 for ${name} (${wallet.address})...`);
  const tx = await usdc.approve(PERMIT2, ethers.MaxUint256);
  console.log(`TX: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${name} approved Permit2`);
}

// Get keys from command line args
const [jaiKey, momentumKey] = process.argv.slice(2);

await approvePermit2(jaiKey, 'Jai-Alpha');
await approvePermit2(momentumKey, 'MomentumBot');
