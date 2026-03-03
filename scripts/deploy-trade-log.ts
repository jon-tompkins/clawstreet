/**
 * Deployment script for ClawstreetTradeLog contract on Base mainnet
 */

import { ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env manually
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=')
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = vals.join('=').trim()
    }
  })
}

// Contract ABI
const CONTRACT_ABI = [
  "constructor()",
  "function owner() view returns (address)",
  "function authorized(address) view returns (bool)",
  "function setAuthorized(address addr, bool auth)",
  "function logCommit(bytes32 agentId, bytes32 commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "function logReveal(bytes32 agentId, bytes32 commitmentHash, string ticker, uint256 price, uint256 timestamp)",
  "event TradeCommitted(bytes32 indexed agentId, bytes32 indexed commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "event TradeRevealed(bytes32 indexed agentId, bytes32 indexed commitmentHash, string ticker, uint256 price, uint256 timestamp)"
]

// Load compiled bytecode
const bytecodePath = path.join(__dirname, '../build/contracts_ClawstreetTradeLog_sol_ClawstreetTradeLog.bin')
let CONTRACT_BYTECODE = ''
if (fs.existsSync(bytecodePath)) {
  CONTRACT_BYTECODE = '0x' + fs.readFileSync(bytecodePath, 'utf8').trim()
} else {
  console.error('❌ Bytecode not found. Run: npx solcjs --bin contracts/ClawstreetTradeLog.sol -o build/')
  process.exit(1)
}

async function main() {
  console.log('🚀 Clawstreet Trade Log Deployment Script\n')
  
  // Check for existing deployment
  const existingContract = process.env.TRADE_LOG_CONTRACT
  if (existingContract) {
    console.log(`✅ Contract already deployed at: ${existingContract}`)
    console.log('   Unset TRADE_LOG_CONTRACT to deploy a new one')
    return
  }
  
  // Validate environment
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  
  if (!privateKey) {
    console.error('❌ Missing DEPLOYER_PRIVATE_KEY in environment')
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
  
  if (balance < ethers.parseEther('0.0003')) {
    console.error('❌ Insufficient balance. Need at least 0.0003 ETH')
    process.exit(1)
  }
  
  // Get network info
  const network = await provider.getNetwork()
  console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})`)
  
  // Deploy
  console.log('\n📝 Deploying ClawstreetTradeLog...')
  
  const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet)
  
  const contract = await factory.deploy({ gasLimit: 1500000 })
  
  console.log(`📤 Tx: ${contract.deploymentTransaction()?.hash}`)
  console.log('   Waiting for confirmation...')
  
  await contract.waitForDeployment()
  
  const contractAddress = await contract.getAddress()
  console.log(`\n✅ Contract deployed at: ${contractAddress}`)
  console.log(`\n📋 Add to .env.local:\nTRADE_LOG_CONTRACT=${contractAddress}`)
  
  // Save deployment info
  const deploymentsDir = path.join(__dirname, '../deployments')
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true })
  
  fs.writeFileSync(
    path.join(deploymentsDir, 'trade-log-base.json'),
    JSON.stringify({
      address: contractAddress,
      deployer: wallet.address,
      chainId: network.chainId.toString(),
      tx: contract.deploymentTransaction()?.hash,
      deployedAt: new Date().toISOString(),
    }, null, 2)
  )
  console.log(`💾 Saved to deployments/trade-log-base.json`)
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error.message || error)
  process.exit(1)
})
