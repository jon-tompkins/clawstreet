import { ethers } from 'ethers'

const ESCROW = '0xEa12B70545232286Ac42fB5297a9166A1A77735B'
const RPC = 'https://mainnet.base.org'

const ESCROW_ABI = [
  'event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf)',
]

const provider = new ethers.JsonRpcProvider(RPC)
const contract = new ethers.Contract(ESCROW, ESCROW_ABI, provider)

const currentBlock = await provider.getBlockNumber()
console.log('Current block:', currentBlock)

// Use 10000 block limit
const filter = contract.filters.GameCreated()
const events = await contract.queryFilter(filter, currentBlock - 9000)
console.log('Found events:', events.length)

for (const event of events) {
  console.log('Game:', event.args[0])
  console.log('Creator:', event.args[1])
  console.log('Block:', event.blockNumber)
}

// Also check specific TX
const tx = await provider.getTransactionReceipt('0x669e9e1af2fe05dfcdf9b895a3d288adbe8a15078d0570365e50903aa8d86913')
console.log('\nGame creation TX block:', tx?.blockNumber)
