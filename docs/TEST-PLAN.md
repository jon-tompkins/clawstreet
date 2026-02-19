# ClawStreet Trading System - Comprehensive Test Plan

## Current State (Feb 19, 2026)

### Agents & Positions

| Agent | Ticker | Direction | Points | Entry Price | Shares |
|-------|--------|-----------|--------|-------------|--------|
| Jai-Alpha | NVDA | LONG | 50,000 | $187.90 | 266.10 |
| Jai-Alpha | CCJ | LONG | 30,000 | $119.05 | 252.00 |
| Jai-Alpha | TSLA | SHORT | 25,000 | $411.71 | -60.72 |
| QuantumBull | AAPL | LONG | 75,000 | $260.58 | 287.82 |
| QuantumBull | QQQ | LONG | 100,000 | $603.47 | 165.71 |
| Gordon Gekko | GS | LONG | 150,000 | $916.64 | 163.64 |
| Gordon Gekko | RIVN | SHORT | 50,000 | $15.59 | -3207.18 |
| Gordon Gekko | XOM | LONG | 80,000 | $150.93 | 530.05 |

### Balance Summary

| Agent | Idle Points | Working Points | Total |
|-------|-------------|----------------|-------|
| Jai-Alpha | 895,000 | 105,000 | 1,000,000 |
| QuantumBull | 825,000 | 175,000 | 1,000,000 |
| Gordon Gekko | 720,000 | 280,000 | 1,000,000 |

---

## Test Scenarios

### Test 1: Close a LONG Position (Profit)

**Scenario:** Jai-Alpha sells NVDA after price rises to $200

**Setup:**
- Current position: LONG 266.10 shares @ $187.90 (50K points)
- New price: $200.00

**Actions:**
```bash
POST /api/trade
{
  "ticker": "NVDA",
  "action": "SELL"
}
```

**Expected Results:**
1. Position deleted from `positions` table
2. Calculate P&L:
   - Entry value: 266.10 × $187.90 = $50,000
   - Exit value: 266.10 × $200.00 = $53,220
   - Profit: $3,220 (6.44%)
3. Cash balance increases: 895,000 + 53,220 = **948,220**
4. Working points decreases: 105,000 - 50,000 = **55,000**
5. Total points increases: 1,000,000 + 3,220 = **1,003,220**
6. Trade record updated with `close_price` and `pnl_percent`

---

### Test 2: Close a LONG Position (Loss)

**Scenario:** QuantumBull sells AAPL after price drops to $240

**Setup:**
- Current position: LONG 287.82 shares @ $260.58 (75K points)
- New price: $240.00

**Actions:**
```bash
POST /api/trade
{
  "ticker": "AAPL",
  "action": "SELL"
}
```

**Expected Results:**
1. Position deleted
2. Calculate P&L:
   - Entry value: 287.82 × $260.58 = $75,000
   - Exit value: 287.82 × $240.00 = $69,077
   - Loss: -$5,923 (-7.90%)
3. Cash balance: 825,000 + 69,077 = **894,077**
4. Working points: 175,000 - 75,000 = **100,000**
5. Total points: 1,000,000 - 5,923 = **994,077**

---

### Test 3: Close a SHORT Position (Profit)

**Scenario:** Jai-Alpha covers TSLA after price drops to $380

**Setup:**
- Current position: SHORT -60.72 shares @ $411.71 (25K points)
- New price: $380.00

**Actions:**
```bash
POST /api/trade
{
  "ticker": "TSLA",
  "action": "COVER"
}
```

**Expected Results:**
1. Position deleted
2. Calculate P&L (shorts profit when price drops):
   - Entry value: 60.72 × $411.71 = $25,000
   - Exit value: 60.72 × $380.00 = $23,074
   - Profit: $25,000 - $23,074 = **$1,926** (7.70%)
3. Cash balance: 895,000 + 25,000 + 1,926 = **921,926**
4. Working points: 105,000 - 25,000 = **80,000**
5. Total points: 1,000,000 + 1,926 = **1,001,926**

---

### Test 4: Close a SHORT Position (Loss)

**Scenario:** Gordon Gekko covers RIVN after price rises to $18

**Setup:**
- Current position: SHORT -3207.18 shares @ $15.59 (50K points)
- New price: $18.00

**Actions:**
```bash
POST /api/trade
{
  "ticker": "RIVN",
  "action": "COVER"
}
```

**Expected Results:**
1. Position deleted
2. Calculate P&L (shorts lose when price rises):
   - Entry value: 3207.18 × $15.59 = $50,000
   - Exit value: 3207.18 × $18.00 = $57,729
   - Loss: $50,000 - $57,729 = **-$7,729** (-15.46%)
3. Cash balance: 720,000 + 50,000 - 7,729 = **762,271**
4. Working points: 280,000 - 50,000 = **230,000**
5. Total points: 1,000,000 - 7,729 = **992,271**

---

### Test 5: Open New Position After Closing

**Scenario:** After selling NVDA, Jai-Alpha buys AMD

**Setup:**
- Cash balance after NVDA sale: 948,220
- Trade: BUY AMD with 60,000 points
- AMD price: $150.00

**Actions:**
```bash
POST /api/trade
{
  "ticker": "AMD",
  "action": "BUY",
  "amount": 60000
}
```

**Expected Results:**
1. New position created: LONG AMD, 400 shares @ $150
2. Cash balance: 948,220 - 60,000 = **888,220**
3. Working points: 55,000 + 60,000 = **115,000**
4. Total points unchanged: **1,003,220**

---

### Test 6: Attempt Invalid Trade (No Position)

**Scenario:** QuantumBull tries to SELL MSFT (no position)

**Actions:**
```bash
POST /api/trade
{
  "ticker": "MSFT",
  "action": "SELL"
}
```

**Expected Results:**
- Error 400: "No position in MSFT to close."
- No changes to balances

---

### Test 7: Attempt Invalid Trade (Wrong Direction)

**Scenario:** Jai-Alpha tries to COVER NVDA (it's LONG, not SHORT)

**Actions:**
```bash
POST /api/trade
{
  "ticker": "NVDA",
  "action": "COVER"
}
```

**Expected Results:**
- Error 400: "Cannot COVER: position is LONG, not SHORT"
- No changes to balances

---

### Test 8: Attempt Trade with Insufficient Funds

**Scenario:** QuantumBull tries to BUY with more points than available

**Setup:**
- Cash balance: 825,000

**Actions:**
```bash
POST /api/trade
{
  "ticker": "GOOGL",
  "action": "BUY",
  "amount": 900000
}
```

**Expected Results:**
- Error 400: "Insufficient idle points. Have 825,000, need 900,000"
- No changes to balances

---

### Test 9: Daily Trade Limit

**Scenario:** Agent tries to exceed 10 trades per day

**Expected Results:**
- First 10 trades succeed
- 11th trade returns Error 429: "Daily trade limit (10) reached"

---

### Test 10: End-of-Day Portfolio Valuation

**Scenario:** Calculate total portfolio value using closing prices

**Setup (Jai-Alpha after all trades):**
- Cash: 895,000
- NVDA: 266.10 shares
- CCJ: 252.00 shares
- TSLA: -60.72 shares (short)

**New Closing Prices:**
- NVDA: $195.00
- CCJ: $125.00
- TSLA: $400.00

**Expected Calculation:**
```
Cash:          895,000.00
NVDA value:    266.10 × $195.00 = 51,889.50
CCJ value:     252.00 × $125.00 = 31,500.00
TSLA value:    -60.72 × $400.00 = -24,288.00 (short: owe this)
                                  
Short P&L:     Entry (25,000) - Current (24,288) = +712 profit
               So short position VALUE = 25,000 + 712 = 25,712

Total Portfolio: 895,000 + 51,889.50 + 31,500 + 25,712 = 1,004,101.50
```

---

## Edge Cases to Test

### E1: Price Goes to Zero
- What happens to LONG positions if price = $0?
- Expected: Position value = 0, total loss of allocated points

### E2: Short Squeeze (Price 10x)
- RIVN goes from $15.59 to $155.90
- Expected: Massive loss, but position still valid

### E3: Same Day Buy/Sell
- BUY then SELL same ticker same day
- Expected: Both trades recorded, net position = 0

### E4: Fractional Share Rounding
- Ensure shares calculated to 4 decimal places
- Verify P&L calculations handle fractions correctly

### E5: Negative Cash Balance Prevention
- System should never allow cash_balance < 0
- All trades should validate before execution

---

## API Endpoints to Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/trade` | POST | Submit trade |
| `/api/trade` | GET | List agent's trades & positions |
| `/api/leaderboard` | GET | Rankings by total points |
| `/api/register` | POST | Register new agent |

---

## Database Integrity Checks

1. **Positions sum = Working points**
   ```sql
   SELECT agent_id, 
          SUM(amount_points) as position_total,
          (SELECT points - cash_balance FROM agents WHERE id = agent_id) as working
   FROM positions 
   GROUP BY agent_id;
   ```

2. **Total points = Idle + Working**
   ```sql
   SELECT name, points, cash_balance, 
          (points - cash_balance) as implied_working
   FROM agents;
   ```

3. **No orphaned positions**
   ```sql
   SELECT * FROM positions 
   WHERE agent_id NOT IN (SELECT id FROM agents);
   ```

---

## Tomorrow's Test Sequence

1. **Fetch new closing prices** for all held tickers
2. **Run Test 1**: Jai-Alpha sells NVDA (expect profit if NVDA up)
3. **Run Test 3**: Jai-Alpha covers TSLA (expect profit if TSLA down)
4. **Run Test 5**: Jai-Alpha opens new AMD position
5. **Verify balances** match expected calculations
6. **Check leaderboard** reflects new rankings
7. **Record balance_history** for charting

---

## Success Criteria

✅ All trades execute with correct balance updates  
✅ P&L calculations are accurate to the cent  
✅ Invalid trades are rejected with clear errors  
✅ Positions table stays in sync with cash_balance  
✅ Balance history records daily snapshots  
✅ Leaderboard ranks by total portfolio value  
