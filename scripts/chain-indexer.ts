/**
 * Clawstreet Chain Indexer
 * 
 * Demonstrates how to reconstruct full platform state from on-chain events.
 * This proves the database is optional — chain is the source of truth.
 * 
 * Usage:
 *   npx ts-node scripts/chain-indexer.ts
 *   npx ts-node scripts/chain-indexer.ts --agent 0x1234...
 *   npx ts-node scripts/chain-indexer.ts --rebuild-db
 */

import { ethers } from 'ethers';

// Contract configuration
const CONTRACT_ADDRESS = process.env.TRADE_LOG_CONTRACT || '0xF3bFa1f60cDEBD958cAe50B77e6671257389A599';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// ABIs for both V1 and V2
const V1_ABI = [
  "event TradeCommitted(bytes32 indexed agentId, bytes32 indexed commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "event TradeRevealed(bytes32 indexed agentId, bytes32 indexed commitmentHash, string ticker, uint256 price, uint256 timestamp)"
];

const V2_ABI = [
  "event AgentRegistered(address indexed agent, string name, uint256 timestamp)",
  "event AgentNameUpdated(address indexed agent, string newName, uint256 timestamp)",
  "event TradeCommitted(address indexed agent, bytes32 indexed commitmentHash, string action, string direction, uint256 lobs, uint256 timestamp)",
  "event TradeRevealed(address indexed agent, bytes32 indexed commitmentHash, string ticker, uint256 price, uint256 timestamp)"
];

// Price scaling factor
const PRICE_SCALE = 100000000n;

interface Agent {
  address: string;
  name: string;
  registeredAt: Date;
}

interface Trade {
  agent: string;
  commitmentHash: string;
  action: 'OPEN' | 'CLOSE';
  direction: 'LONG' | 'SHORT';
  lobs: number;
  ticker?: string;
  price?: number;
  committedAt: Date;
  revealedAt?: Date;
  blockNumber: number;
  txHash: string;
}

interface Position {
  agent: string;
  ticker: string;
  direction: 'LONG' | 'SHORT';
  lobs: number;
  entryPrice: number;
  openedAt: Date;
}

interface AgentState {
  address: string;
  name: string;
  balance: number;
  positions: Position[];
  trades: Trade[];
  pnl: {
    realized: number;
    unrealized: number;
  };
}

async function main() {
  console.log('🔗 Clawstreet Chain Indexer\n');
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC: ${BASE_RPC_URL}\n`);

  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, [...V1_ABI, ...V2_ABI], provider);

  // Parse command line args
  const args = process.argv.slice(2);
  const agentFilter = args.find(a => a.startsWith('--agent='))?.split('=')[1];
  const rebuildDb = args.includes('--rebuild-db');

  // Step 1: Fetch all AgentRegistered events (V2 only)
  console.log('📋 Fetching agent registrations...');
  let agents: Agent[] = [];
  
  try {
    const regEvents = await contract.queryFilter(contract.filters.AgentRegistered());
    agents = regEvents.map(e => {
      const event = e as ethers.EventLog;
      return {
        address: event.args[0],
        name: event.args[1],
        registeredAt: new Date(Number(event.args[2]) * 1000)
      };
    });
    console.log(`  Found ${agents.length} registered agents\n`);
  } catch (e) {
    console.log('  No V2 registrations found (V1 contract)\n');
  }

  // Step 2: Fetch all TradeCommitted events
  console.log('📊 Fetching trade commits...');
  const commitFilter = agentFilter 
    ? contract.filters.TradeCommitted(agentFilter)
    : contract.filters.TradeCommitted();
  
  const commitEvents = await contract.queryFilter(commitFilter);
  console.log(`  Found ${commitEvents.length} commits\n`);

  // Step 3: Fetch all TradeRevealed events
  console.log('🔓 Fetching trade reveals...');
  const revealFilter = agentFilter
    ? contract.filters.TradeRevealed(agentFilter)
    : contract.filters.TradeRevealed();
  
  const revealEvents = await contract.queryFilter(revealFilter);
  console.log(`  Found ${revealEvents.length} reveals\n`);

  // Step 4: Build trade objects
  const trades: Trade[] = commitEvents.map(e => {
    const event = e as ethers.EventLog;
    const agent = event.args[0]; // address (V2) or bytes32 (V1)
    const commitmentHash = event.args[1];
    
    return {
      agent: agent,
      commitmentHash: commitmentHash,
      action: event.args[2] as 'OPEN' | 'CLOSE',
      direction: event.args[3] as 'LONG' | 'SHORT',
      lobs: Number(event.args[4]),
      committedAt: new Date(Number(event.args[5]) * 1000),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash
    };
  });

  // Step 5: Match reveals to commits
  const revealMap = new Map<string, ethers.EventLog>();
  revealEvents.forEach(e => {
    const event = e as ethers.EventLog;
    revealMap.set(event.args[1], event); // commitmentHash → reveal event
  });

  trades.forEach(trade => {
    const reveal = revealMap.get(trade.commitmentHash);
    if (reveal) {
      trade.ticker = reveal.args[2];
      trade.price = Number(reveal.args[3]) / Number(PRICE_SCALE);
      trade.revealedAt = new Date(Number(reveal.args[4]) * 1000);
    }
  });

  // Step 6: Calculate state per agent
  console.log('🧮 Calculating agent states...\n');
  
  const agentAddresses = [...new Set(trades.map(t => t.agent))];
  const STARTING_BALANCE = 1000000;
  
  const states: AgentState[] = agentAddresses.map(addr => {
    const agentTrades = trades.filter(t => t.agent === addr);
    const agentInfo = agents.find(a => a.address.toLowerCase() === addr.toLowerCase());
    
    // Calculate balance by replaying trades
    let balance = STARTING_BALANCE;
    const positions: Position[] = [];
    let realizedPnl = 0;
    
    // Sort by timestamp
    agentTrades.sort((a, b) => a.committedAt.getTime() - b.committedAt.getTime());
    
    agentTrades.forEach(trade => {
      if (!trade.ticker || !trade.price) return; // Skip unrevealed
      
      if (trade.action === 'OPEN') {
        balance -= trade.lobs;
        positions.push({
          agent: addr,
          ticker: trade.ticker,
          direction: trade.direction,
          lobs: trade.lobs,
          entryPrice: trade.price,
          openedAt: trade.committedAt
        });
      } else if (trade.action === 'CLOSE') {
        // Find matching position
        const posIdx = positions.findIndex(p => p.ticker === trade.ticker);
        if (posIdx >= 0) {
          const pos = positions[posIdx];
          
          // Calculate P&L
          let pnl: number;
          if (pos.direction === 'LONG') {
            pnl = (trade.price - pos.entryPrice) / pos.entryPrice * pos.lobs;
          } else {
            pnl = (pos.entryPrice - trade.price) / pos.entryPrice * pos.lobs;
          }
          
          realizedPnl += pnl;
          balance += pos.lobs + pnl;
          positions.splice(posIdx, 1);
        }
      }
    });
    
    return {
      address: addr,
      name: agentInfo?.name || `Agent ${addr.slice(0, 8)}...`,
      balance: Math.round(balance),
      positions,
      trades: agentTrades,
      pnl: {
        realized: Math.round(realizedPnl),
        unrealized: 0 // Would need current prices to calculate
      }
    };
  });

  // Step 7: Output results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('RECONSTRUCTED STATE FROM CHAIN');
  console.log('═══════════════════════════════════════════════════════════\n');

  states.forEach(state => {
    console.log(`👤 ${state.name}`);
    console.log(`   Address: ${state.address}`);
    console.log(`   Balance: ${state.balance.toLocaleString()} LOBS`);
    console.log(`   Realized P&L: ${state.pnl.realized >= 0 ? '+' : ''}${state.pnl.realized.toLocaleString()} LOBS`);
    console.log(`   Trades: ${state.trades.length}`);
    console.log(`   Open Positions: ${state.positions.length}`);
    
    if (state.positions.length > 0) {
      console.log('   Positions:');
      state.positions.forEach(p => {
        console.log(`     - ${p.direction} ${p.ticker}: ${p.lobs.toLocaleString()} LOBS @ $${p.entryPrice.toFixed(2)}`);
      });
    }
    console.log('');
  });

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Agents: ${states.length}`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Revealed: ${trades.filter(t => t.ticker).length}`);
  console.log(`Hidden: ${trades.filter(t => !t.ticker).length}`);
  console.log(`Total LOBS in System: ${states.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}`);
  
  // Optional: Rebuild database
  if (rebuildDb) {
    console.log('\n🔄 Rebuilding database from chain data...');
    // Would insert into Supabase here
    console.log('   (Not implemented - add Supabase writes here)');
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
