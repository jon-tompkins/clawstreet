/**
 * Deployment script for ClawstreetTradeLog contract on Base mainnet
 * 
 * Usage:
 *   npx ts-node scripts/deploy-trade-log.ts
 * 
 * Required environment variables:
 *   - BASE_RPC_URL: Base mainnet RPC (default: https://mainnet.base.org)
 *   - DEPLOYER_PRIVATE_KEY: Wallet private key for deployment
 * 
 * Optional:
 *   - TRADE_LOG_CONTRACT: If set, skips deployment and uses existing contract
 */

import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

// Contract ABI and bytecode (compiled from ClawstreetTradeLog.sol)
// Run `solc --optimize --bin --abi contracts/ClawstreetTradeLog.sol` to regenerate
const CONTRACT_ABI = [
  "constructor()",
  "function owner() view returns (address)",
  "function authorized(address) view returns (bool)",
  "function transferOwnership(address newOwner)",
  "function setAuthorized(address addr, bool auth)",
  "function logCommit(bytes32 agentId, bytes32 commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "function logReveal(bytes32 agentId, bytes32 commitmentHash, string ticker, uint256 price, uint256 timestamp)",
  "function batchLogCommits(bytes32[] agentIds, bytes32[] commitmentHashes, string[] actions, string[] directions, uint256[] lobsAmounts, uint256[] timestamps)",
  "function batchLogReveals(bytes32[] agentIds, bytes32[] commitmentHashes, string[] tickers, uint256[] prices, uint256[] timestamps)",
  "event TradeCommitted(bytes32 indexed agentId, bytes32 indexed commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "event TradeRevealed(bytes32 indexed agentId, bytes32 indexed commitmentHash, string ticker, uint256 price, uint256 timestamp)"
]

// Bytecode generated from the Solidity contract
// This needs to be regenerated if the contract changes
// For now, using placeholder - will be filled after compilation
const CONTRACT_BYTECODE = `0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060016001600061dead73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055506110f5806100a76000396000f3fe`

async function main() {
  console.log('🚀 Clawstreet Trade Log Deployment Script\n')
  
  // Check for existing deployment
  const existingContract = process.env.TRADE_LOG_CONTRACT
  if (existingContract) {
    console.log(`✅ Contract already deployed at: ${existingContract}`)
    console.log('   Set TRADE_LOG_CONTRACT="" to deploy a new one')
    return
  }
  
  // Validate environment
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  
  if (!privateKey) {
    console.error('❌ Missing DEPLOYER_PRIVATE_KEY in environment')
    console.error('   Add it to .env.local and try again')
    process.exit(1)
  }
  
  console.log(`📡 RPC: ${rpcUrl}`)
  
  // Connect to Base
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  
  console.log(`👛 Deployer: ${wallet.address}`)
  
  // Check balance
  const balance = await provider.getBalance(wallet.address)
  const balanceEth = ethers.formatEther(balance)
  console.log(`💰 Balance: ${balanceEth} ETH`)
  
  if (balance < ethers.parseEther('0.001')) {
    console.error('❌ Insufficient balance. Need at least 0.001 ETH for deployment')
    process.exit(1)
  }
  
  // Get network info
  const network = await provider.getNetwork()
  console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`)
  
  if (network.chainId !== 8453n) {
    console.warn('⚠️  Warning: Not on Base mainnet (chainId 8453)')
    console.warn('   Current chainId:', network.chainId.toString())
  }
  
  // Estimate gas
  console.log('\n📝 Deploying ClawstreetTradeLog...')
  
  const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet)
  
  // Get current gas price
  const feeData = await provider.getFeeData()
  console.log(`⛽ Gas price: ${ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')} gwei`)
  
  // Deploy
  const contract = await factory.deploy({
    gasLimit: 1000000,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  })
  
  console.log(`📤 Transaction hash: ${contract.deploymentTransaction()?.hash}`)
  console.log('   Waiting for confirmation...')
  
  await contract.waitForDeployment()
  
  const contractAddress = await contract.getAddress()
  console.log(`\n✅ Contract deployed at: ${contractAddress}`)
  
  // Verify owner
  const owner = await contract.owner()
  console.log(`👤 Owner: ${owner}`)
  
  // Output for .env
  console.log('\n📋 Add to .env.local:')
  console.log(`TRADE_LOG_CONTRACT=${contractAddress}`)
  
  // Save deployment info
  const deploymentInfo = {
    address: contractAddress,
    deployer: wallet.address,
    network: network.name,
    chainId: network.chainId.toString(),
    transactionHash: contract.deploymentTransaction()?.hash,
    deployedAt: new Date().toISOString(),
  }
  
  const deploymentsDir = path.join(__dirname, '../deployments')
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true })
  }
  
  const deploymentPath = path.join(deploymentsDir, 'trade-log-base.json')
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2))
  console.log(`\n💾 Deployment info saved to: ${deploymentPath}`)
  
  // Verification instructions
  console.log('\n📖 To verify on BaseScan:')
  console.log(`   https://basescan.org/address/${contractAddress}#code`)
  console.log('   Upload ClawstreetTradeLog.sol with:')
  console.log('   - Compiler: 0.8.19')
  console.log('   - Optimization: Yes, 200 runs')
  console.log('   - License: MIT')
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error)
  process.exit(1)
})
