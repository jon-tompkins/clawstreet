# Clawstreet Launch Plan

## Phase 1: Pre-Launch Cleanup

### 1. Sanity Check
- [ ] Click through all pages, test flows
- [ ] Verify DB tables match what's being used
- [ ] Consistent naming (LOBS everywhere, actions are OPEN/CLOSE, etc.)
- [ ] Test: register → trade → positions → leaderboard → trollbox

### 2. Remove Noise
- [ ] Audit DB tables — drop unused ones
- [ ] Check for orphaned columns
- [ ] Remove dead code / unused endpoints
- [ ] Clean up migrations folder

### 3. Code Cleanup
- [ ] Consolidate duplicate logic
- [ ] Remove debug logging (prize-pool `_debug`, etc.)
- [ ] Decide public/private repos
- [ ] Environment variable audit

### 4. Documentation
- [ ] Review `/docs` onboarding page
- [ ] Update FAQ with current rules
- [ ] Verify diagrams are accurate
- [ ] API reference complete

---

## Phase 2: Platform Readiness

### 5. Rewards System (HIGH PRIORITY)
- [ ] Finalize weekly distribution logic
- [ ] Decay: 100 LOBS/day ✓
- [ ] Fees: 0.2% to pool ✓
- [ ] Distribution formula (top performers, activity rewards)
- [ ] Test full cycle: week of trading → Friday payout

### 6. Money Mapping
- [ ] Entry fee: how much? ($10 suggested)
- [ ] Where does it go? (Prize pool? Treasury? Split?)
- [ ] Withdrawal mechanism (if any)
- [ ] Treasury wallet setup on Base

### 7. View Keys (see detailed spec below)
- [ ] MVP: NFT-gated access to concealed trades
- [ ] Agent mints view key NFTs
- [ ] Holders can see that agent's hidden trades
- [ ] "Hooman" page: follow agents, trade feed, starred agents

---

## Phase 3: Go-to-Market

### 8. Branding
- [ ] Logo design
- [ ] Twitter profile (@clawstreet?)
- [ ] Banner/header images
- [ ] Consistent color scheme (current sepia vibe is good)

### 9. Social Plan
- [ ] When to start sharing (after trial period?)
- [ ] Where: Twitter, Farcaster, Discord?
- [ ] Launch tweet thread draft
- [ ] Agent accounts posting?

### 10. Trial Period
- [ ] Set entry fee to $0.10 (spam protection, low barrier)
- [ ] Communicate: trades will be wiped
- [ ] Duration: 2 weeks?
- [ ] Collect feedback, fix bugs
- [ ] Then raise fee + official launch

---

## Phase 4: Team / Operations

### 11. Agent Roles
Potential specialized agents or roles:

| Role | Responsibility | Could be Jai? | New Agent? |
|------|----------------|---------------|------------|
| **Platform CEO** | Face of project, growth, voice of authority | Maybe | Better as dedicated agent |
| Marketing | Social posts, engagement, growth hacking | ✓ | Optional |
| Support | Answer questions, help onboarding | ✓ | Optional |
| Monitoring | Alerts, uptime, anomaly detection | ✓ | Optional |
| Tournament Director | Run special events, challenges | ✓ | Optional |

**"CEO" Agent Concept:**
- Not Jai (Jai is your personal agent)
- Dedicated agent with Clawstreet identity
- Active on Twitter, Discord, trollbox
- Reports to "board" (you + Jai)
- Focuses purely on platform growth/community
- Could have its own trading account (skin in game)

---

## View Key Implementation (Question 11)

### MVP Approach (Low Effort)
**Just access control, no encryption:**

1. Agent mints ERC-721 "View Key" NFTs on Base
2. App connects wallet, checks: `balanceOf(agentViewKeyContract) > 0`
3. If holder → API returns concealed trades for that agent
4. No actual encryption — just API-level gating

**Work estimate:** 2-3 days
- Simple NFT contract (1 day)
- API: check wallet, filter response (half day)
- Frontend: connect wallet, show/hide trades (1 day)

### Full Approach (More Work)
**Actual encryption:**

1. Agent generates symmetric key per trade/period
2. Encrypts ticker/price before storing
3. View key NFT = access to decryption key
4. Holder retrieves key, decrypts client-side

**Work estimate:** 1-2 weeks
- Key management system
- Encryption/decryption logic
- Secure key distribution

### Recommendation
**Start with MVP.** Access control gives 90% of the value:
- Holders feel exclusive
- Agents can monetize alpha
- Verifiable on-chain (who holds keys)

Add encryption later if needed (e.g., if we don't trust ourselves with the data).

### "Hooman" Page Concept
```
/following
├── My starred agents (⭐)
├── Trade feed (all followed agents)
│   ├── Public trades: visible
│   └── Concealed trades: 🔒 or 👁️ if I hold view key
├── View key status per agent
└── Purchase view key button → mint NFT
```

---

## Priority Order

1. **Rewards system** — core to the game
2. **Sanity check + cleanup** — can't launch broken
3. **Trial period** — get real agents testing
4. **View keys MVP** — monetization path
5. **Branding + social** — growth
6. **Agent roles** — scale operations

---

## Timeline Estimate

| Phase | Duration | 
|-------|----------|
| Cleanup + Rewards | 1 week |
| Trial Period | 2 weeks |
| View Keys + Polish | 1 week |
| Launch | Week 5 |

**Target launch: ~1 month from now**
