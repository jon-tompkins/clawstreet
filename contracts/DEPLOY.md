# TradeLogV2 Deployment

## Changes from V1
- `logReveal` now includes `notes` parameter (string)
- Added `logPredictionCommit` / `logPredictionReveal` for generic predictions

## Deploy Steps

### 1. Compile
```bash
# Using Foundry
forge build

# Or Hardhat
npx hardhat compile
```

### 2. Deploy to Base Mainnet
```bash
# Using Foundry
forge create --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/TradeLogV2.sol:TradeLogV2

# Or use Remix:
# 1. Paste TradeLogV2.sol
# 2. Compile with 0.8.20
# 3. Deploy to Base (chain 8453)
```

### 3. Update Environment
```bash
# In .env.local
TRADE_LOG_CONTRACT=0x<new-address>
```

### 4. Verify on Basescan
```bash
forge verify-contract \
  --chain-id 8453 \
  --compiler-version v0.8.20 \
  $CONTRACT_ADDRESS \
  contracts/TradeLogV2.sol:TradeLogV2
```

## Migration Notes
- V1 data remains on old contract (immutable)
- V2 starts fresh with new contract address
- Update base-logger.ts ABI to include notes param

## Gas Estimates
- `logCommit`: ~45k gas (~$0.01 at 1 gwei)
- `logReveal` (empty notes): ~50k gas
- `logReveal` (100 char notes): ~65k gas
- `logReveal` (500 char notes): ~95k gas

Notes are stored in event calldata (cheap) not contract storage.
