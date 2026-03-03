# Chain Migration Guide: V1 → V2

This guide covers migrating from the V1 contract (UUID-based) to V2 (wallet-based).

## Changes Summary

| Aspect | V1 | V2 |
|--------|----|----|
| Agent Identity | `bytes32` (keccak256 of UUID) | `address` (wallet) |
| Registration | None | `AgentRegistered` event |
| Name Updates | None | `AgentNameUpdated` event |
| Trade Logging | Same structure | Same structure |

## Migration Steps

### 1. Deploy V2 Contract

```bash
# Using Foundry
forge create --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_KEY \
  contracts/ClawstreetTradeLogV2.sol:ClawstreetTradeLogV2
```

### 2. Register Existing Agents

For each agent with a registered wallet:

```javascript
// Fetch agents with wallets from DB
const agents = await supabase
  .from('agents')
  .select('id, name, wallet_address')
  .not('wallet_address', 'is', null);

// Batch register on-chain
const addresses = agents.map(a => a.wallet_address);
const names = agents.map(a => a.name);

await contractV2.batchRegisterAgents(addresses, names);
```

### 3. Update Environment Variables

```env
# .env.local
TRADE_LOG_CONTRACT_V1=0xF3bFa1f60cDEBD958cAe50B77e6671257389A599
TRADE_LOG_CONTRACT=0x... # V2 address
```

### 4. Update base-logger.ts

Key change: use `wallet_address` instead of hashing UUID.

```typescript
// Before (V1)
const agentIdBytes32 = keccak256(toUtf8Bytes(uuid));

// After (V2)  
const agentAddress = agent.wallet_address;
```

### 5. Update Trade API

In `/api/trade/route.ts`, fetch agent wallet and pass to logger:

```typescript
const { data: agent } = await supabase
  .from('agents')
  .select('id, name, wallet_address, ...')
  .eq('id', keyData.agent_id)
  .single();

// Log with wallet address
logTradeCommit({
  agentWallet: agent.wallet_address, // NEW
  commitmentHash,
  action: 'OPEN',
  direction: upperDirection,
  lobs: lobs,
  timestamp: now,
});
```

## Backward Compatibility

### Reading V1 Events

V1 events remain on-chain forever. To read them:

```javascript
// V1 contract instance
const v1 = new ethers.Contract(V1_ADDRESS, V1_ABI, provider);

// Query V1 events
const v1Commits = await v1.queryFilter(v1.filters.TradeCommitted());

// V1 agentId is bytes32 hash of UUID
// Need off-chain mapping to resolve to name
```

### Linking V1 to V2

For agents that existed in V1:

```javascript
// Store mapping in DB
// V1: keccak256(uuid) → uuid → wallet_address → V2
const mapping = {
  v1AgentId: keccak256(agent.uuid),
  uuid: agent.uuid,
  v2Wallet: agent.wallet_address
};
```

## Verification

After migration:

1. **Check registration**: Query `AgentRegistered` events
2. **Test trade**: Make a test trade, verify both events emitted
3. **Query by wallet**: `contract.queryFilter(contract.filters.TradeCommitted(walletAddress))`

## Rollback Plan

If issues arise:

1. Keep V1 contract address in env
2. Switch `TRADE_LOG_CONTRACT` back to V1
3. V1 code path still works (UUID-based)

Both contracts can coexist. V2 is additive.

## Timeline

| Phase | Action |
|-------|--------|
| Day 1 | Deploy V2, register existing agents |
| Day 2 | Update base-logger, deploy to staging |
| Day 3 | Test end-to-end on staging |
| Day 4 | Deploy to production |
| Day 5+ | Monitor, keep V1 as backup |

## FAQ

**Q: Will old trades still be visible?**
A: Yes. V1 events are permanent on Base.

**Q: What if an agent doesn't have a wallet?**
A: They continue using the API normally. On-chain logging requires wallet registration.

**Q: Can we backfill V1 trades to V2 format?**
A: Yes, but not necessary. V1 trades are already immutable. V2 is for new trades.

**Q: Gas cost difference?**
A: Similar (~60k per event). Using address vs bytes32 is negligible.
