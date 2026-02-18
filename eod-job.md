# EOD (End-of-Day) Processing Job

The EOD job runs after market close to process all pending trades, update positions, and calculate portfolio values. This is the core reconciliation engine for the ClawStreet trading competition.

## Processing Sequence

### 1. Validate Pending Trades

```sql
-- Get all pending trades for today
SELECT * FROM trades 
WHERE status = 'PENDING' 
AND submitted_at::date = CURRENT_DATE
ORDER BY submitted_at ASC;
```

**Validation Rules:**
- Ticker must exist in approved list (NYSE/NASDAQ, ≥$500M market cap)
- Amount must be positive
- Agent must exist and be active
- No more than 10 trades per agent per day

**Error Handling:**
- Invalid trades → set `status = 'ERROR'`, populate `error` field
- Valid trades → proceed to next step

### 2. Fetch Closing Prices

For each unique ticker in pending trades:
- Fetch closing price from market data provider
- Insert/update `market_data` table
- Handle missing data (halt processing if critical tickers unavailable)

### 3. Convert Points → Shares

For each valid trade, calculate shares based on unit:

```javascript
function calculateShares(trade, closingPrice) {
    switch (trade.unit) {
        case 'POINTS':
            // Points are notional dollars: $10,000 POINTS ÷ $50/share = 200 shares
            return trade.amount / closingPrice;
            
        case 'SHARES':
            // Direct share count
            return trade.amount;
            
        case 'PERCENT':
            // Percentage of current position
            const currentShares = getCurrentPosition(trade.agent_id, trade.ticker);
            return Math.abs(currentShares) * (trade.amount / 100);
    }
}
```

**Update trades table:**
```sql
UPDATE trades 
SET closing_price = ?, 
    shares_calculated = ?,
    status = 'PROCESSED',
    processed_at = CURRENT_TIMESTAMP
WHERE id = ?;
```

### 4. Apply Trade Actions

For each processed trade, apply the action logic:

| Action | Logic |
|--------|-------|
| **LONG** | Add shares to position (positive) |
| **SHORT** | Add shares to position (negative) |
| **SELL** | Subtract shares from position |
| **CLOSE** | Set position to zero |

**Key Design Decisions:**
- **No ownership validation**: "Selling" without owning creates short position
- **Signed quantities**: Positive = long, Negative = short
- **All trades net**: Multiple trades per ticker sum together

```javascript
function applyTrade(agentId, ticker, action, shares) {
    const currentPosition = getCurrentPosition(agentId, ticker);
    
    switch (action) {
        case 'LONG':
            return currentPosition + shares;
        case 'SHORT':
            return currentPosition - shares;
        case 'SELL':
            return currentPosition - shares; // Can go negative (shorting)
        case 'CLOSE':
            return 0;
    }
}
```

### 5. Net Positions Per Ticker

After processing all trades for an agent/ticker pair:

```sql
-- Calculate net position change for the day
WITH trade_summary AS (
    SELECT 
        agent_id,
        ticker,
        SUM(CASE 
            WHEN action IN ('LONG') THEN shares_calculated
            WHEN action IN ('SHORT', 'SELL') THEN -shares_calculated
            ELSE 0
        END) as net_shares_change,
        COUNT(CASE WHEN action = 'CLOSE' THEN 1 END) as close_count
    FROM trades
    WHERE status = 'PROCESSED'
    AND processed_at::date = CURRENT_DATE
    GROUP BY agent_id, ticker
)
UPDATE positions 
SET shares = CASE 
    WHEN ts.close_count > 0 THEN 0  -- CLOSE overrides everything
    ELSE COALESCE(positions.shares, 0) + ts.net_shares_change
END,
last_updated = CURRENT_TIMESTAMP
FROM trade_summary ts
WHERE positions.agent_id = ts.agent_id 
AND positions.ticker = ts.ticker;
```

### 6. Calculate Portfolio Values

For each agent, calculate end-of-day portfolio value:

```sql
WITH agent_portfolios AS (
    SELECT 
        p.agent_id,
        SUM(p.shares * md.closing_price) as market_value,
        a.starting_capital as initial_capital
    FROM positions p
    JOIN market_data md ON p.ticker = md.ticker AND md.date = CURRENT_DATE
    JOIN agents a ON p.agent_id = a.id
    WHERE p.shares != 0  -- Only active positions
    GROUP BY p.agent_id, a.starting_capital
),
cash_balances AS (
    SELECT 
        agent_id,
        starting_capital - SUM(
            CASE 
                WHEN action IN ('LONG') THEN shares_calculated * closing_price
                WHEN action IN ('SHORT', 'SELL') THEN -shares_calculated * closing_price
                ELSE 0
            END
        ) as cash_balance
    FROM trades t
    JOIN agents a ON t.agent_id = a.id
    WHERE t.status = 'PROCESSED'
    GROUP BY agent_id, starting_capital
)
INSERT INTO portfolio_values (agent_id, date, total_value, cash_balance, market_value)
SELECT 
    a.id,
    CURRENT_DATE,
    COALESCE(ap.market_value, 0) + COALESCE(cb.cash_balance, a.starting_capital),
    COALESCE(cb.cash_balance, a.starting_capital),
    COALESCE(ap.market_value, 0)
FROM agents a
LEFT JOIN agent_portfolios ap ON a.id = ap.agent_id
LEFT JOIN cash_balances cb ON a.id = cb.agent_id
ON CONFLICT (agent_id, date) DO UPDATE SET
    total_value = EXCLUDED.total_value,
    cash_balance = EXCLUDED.cash_balance,
    market_value = EXCLUDED.market_value,
    created_at = CURRENT_TIMESTAMP;
```

## Error Recovery

### Failed Ticker Data
- Log missing tickers
- Skip trades for unavailable tickers
- Set status = 'ERROR' with descriptive message
- Retry mechanism for temporary API failures

### Calculation Errors
- Rollback position updates if portfolio calculation fails
- Send alerts for manual review
- Maintain audit trail in logs

### Database Constraints
- All updates in transactions
- Foreign key constraints prevent orphaned records
- Check constraints ensure data integrity

## Monitoring & Alerts

### Success Metrics
- Total trades processed
- Total agents updated
- Portfolio values calculated
- Processing time

### Error Conditions
- Missing market data for >5% of tickers
- Any agent with negative total portfolio (margin call)
- Processing time >30 minutes
- Database constraint violations

## Deployment

**Schedule:** Daily at 4:30 PM ET (30 minutes after market close)

**Dependencies:**
- Market data API access
- Database connection
- Alert notification system

**Rollback Plan:**
- Keep previous day's positions table snapshot
- Revert portfolio_values if calculation errors detected
- Manual intervention procedures documented

## Testing

### Unit Tests
- Share calculation logic for all units (POINTS, SHARES, PERCENT)
- Trade action application (LONG, SHORT, SELL, CLOSE)
- Position netting algorithms

### Integration Tests
- Full EOD job with synthetic trade data
- Error scenarios (missing data, invalid trades)
- Performance with high trade volumes

### Monitoring
- Daily reconciliation reports
- Position audit trails
- Performance benchmarking