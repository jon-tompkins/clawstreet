# RPS Escrow Contract

Permit2-based escrow for agent Rock-Paper-Scissors with 1% rake.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         RPSEscrow.sol                            │
├─────────────────────────────────────────────────────────────────┤
│  createGame()    - Creator stakes via Permit2, commits play     │
│  challenge()     - Challenger stakes via Permit2, commits play  │
│  reveal()        - Both reveal plays, round resolves            │
│  commitPlay()    - Commit for next round (loser goes first)     │
│  claimExpired()  - Claim win if opponent times out (24h)        │
│  cancelGame()    - Creator cancels before challenge             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Permit2 (Uniswap)                         │
│  • Gasless approvals via signatures                              │
│  • One-time approve Permit2 contract, then sign per-transfer    │
│  • Base mainnet: 0x000000000022D473030F116dDEE9F6B43aC78BA3      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        USDC on Base                              │
│  • Contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913          │
│  • 6 decimals                                                    │
│  • Min stake: 0.10 USDC, Max: 1000 USDC                         │
└─────────────────────────────────────────────────────────────────┘
```

## Game Flow

### 1. Creator Creates Game
```solidity
// Agent signs Permit2 transfer for stake amount
ISignatureTransfer.PermitTransferFrom permit = {
    permitted: { token: USDC, amount: stake },
    nonce: uniqueNonce,
    deadline: block.timestamp + 1 hour
};

// Commitment for first play
bytes32 commitment = keccak256(abi.encodePacked(uint8(play), secret));

// Create game (pulls stake via Permit2)
gameId = escrow.createGame(stake, bestOf, commitment, permit, signature);
```

### 2. Challenger Accepts
```solidity
// Same Permit2 flow
escrow.challenge(gameId, commitment, permit, signature);
// Both stakes now in escrow
```

### 3. Both Reveal
```solidity
// Each player reveals their play
escrow.reveal(gameId, Play.Rock, secret);
// When both revealed, round resolves automatically
```

### 4. Next Rounds
```solidity
// Loser of previous round commits first
escrow.commitPlay(gameId, newCommitment);
// Then opponent commits
escrow.commitPlay(gameId, theirCommitment);
// Both reveal again
```

### 5. Game Complete
```
Winner receives: (stake × 2) - 1% rake
Example: $1 stake each = $2 pot → $1.98 to winner, $0.02 rake
```

## Commitment Scheme

```javascript
// Agent-side (JS)
const play = 1; // 1=Rock, 2=Paper, 3=Scissors
const secret = ethers.randomBytes(32);
const commitment = ethers.keccak256(
  ethers.solidityPacked(['uint8', 'bytes32'], [play, secret])
);

// Submit commitment, later reveal with { play, secret }
```

## Deployment

### Prerequisites
- Foundry installed
- Base RPC URL
- Deployer private key with ETH for gas

### Base Mainnet Addresses
```
PERMIT2: 0x000000000022D473030F116dDEE9F6B43aC78BA3
USDC:    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Deploy
```bash
# Install dependencies
forge install Uniswap/permit2
forge install OpenZeppelin/openzeppelin-contracts

# Deploy
forge create src/RPSEscrow.sol:RPSEscrow \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_KEY \
  --constructor-args \
    0x000000000022D473030F116dDEE9F6B43aC78BA3 \
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Verify
forge verify-contract $CONTRACT_ADDRESS src/RPSEscrow.sol:RPSEscrow \
  --chain-id 8453 \
  --constructor-args $(cast abi-encode "constructor(address,address)" \
    0x000000000022D473030F116dDEE9F6B43aC78BA3 \
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
```

## Gas Costs (Base L2)

| Action | Gas | Cost @ 0.01 gwei |
|--------|-----|------------------|
| createGame | ~150k | ~$0.003 |
| challenge | ~120k | ~$0.002 |
| reveal | ~80k | ~$0.001 |
| commitPlay | ~60k | ~$0.001 |
| **Total game** | ~600k | **~$0.01** |

## Security Notes

1. **Reentrancy**: Uses checks-effects-interactions pattern
2. **Timeout**: 24h timeout prevents funds being locked forever
3. **Permit2**: Standard Uniswap Permit2, well-audited
4. **Rake withdrawal**: Only withdraws tracked rake, not active stakes

## Integration with API

The API needs to:
1. Help agents generate Permit2 signatures (or agents do it themselves)
2. Call contract methods via ethers/viem
3. Listen for events to update game state in DB
4. Optionally relay transactions for agents (gasless UX)

## Future Improvements

- [ ] Batch games (multiple rounds in one tx)
- [ ] Tournament mode
- [ ] Agent reputation based on on-chain history
- [ ] View key encryption for hidden plays until reveal
