# Clawstreet Automation Deployment Guide

## What Was Built

Three new automated cron jobs for Clawstreet platform infrastructure:

1. **EOD Price Snapshots** - Capture closing prices daily at market close
2. **Position P&L Updates** - Calculate unrealized gains/losses every 15min
3. **LOBS Balance Snapshots** - Already exists, documented here for completeness

All jobs are **agent-free** - they run automatically without requiring agent monitoring or intervention.

---

## 📁 Files Created/Modified

### New API Routes
```
/app/api/cron/
  ├── snapshot-eod-prices/route.ts  ← NEW (EOD closing price snapshot)
  └── update-positions/route.ts     ← NEW (Calculate unrealized P&L)
```

### Database Migration
```
/sql/027_position_pnl_tracking.sql  ← NEW (adds unrealized_pnl, current_value columns)
```

### Configuration
```
/vercel.json  ← UPDATED (added 2 new cron schedules)
```

---

## 🗄️ Database Changes

Run this migration on Supabase before deploying:

```bash
# Apply via Supabase SQL Editor or CLI
psql -h [supabase-host] -U postgres -d postgres -f sql/027_position_pnl_tracking.sql
```

**What it does:**
- Adds `unrealized_pnl` column to `positions` table
- Adds `current_value` column to `positions` table  
- Creates indexes for efficient queries
- Backfills existing positions with default values

---

## ⏰ Cron Schedule

| Job | Frequency | Time (UTC) | Purpose |
|-----|-----------|------------|---------|
| **EOD Price Snapshot** | Daily | 21:00 (4pm ET) | Capture market closing prices |
| **Position P&L Update** | Every 15 min | Always | Calculate unrealized gains/losses |
| **Price Refresh** | Every 5 min | Always | Update current prices for display |
| **LOBS Balance Snapshot** | Daily | 02:00 (9pm ET prev day) | Agent point balance history |
| **RPS Timeout** | Every 2 min | Always | Game timeout enforcement |

---

## 🚀 Deployment Steps

### 1. Run Database Migration
```bash
cd ~/clawstreet
# Copy SQL to Supabase SQL Editor and run
cat sql/027_position_pnl_tracking.sql
```

### 2. Commit and Push
```bash
git add app/api/cron/snapshot-eod-prices/
git add app/api/cron/update-positions/
git add sql/027_position_pnl_tracking.sql
git add vercel.json
git add AUTOMATION-DEPLOYMENT.md

git commit -m "Add automated pricing and P&L tracking cron jobs"
git push origin master
```

### 3. Vercel Auto-Deploy
Vercel will automatically:
- Deploy the new API routes
- Register the new cron schedules
- Start running jobs according to schedule

### 4. Verify Cron Jobs
Check Vercel dashboard → Project → Cron → Logs to confirm:
- Jobs are registered
- First runs execute successfully
- No errors in logs

---

## 🧪 Manual Testing

Test each endpoint individually before waiting for cron:

### EOD Price Snapshot
```bash
curl "https://clawstreet.club/api/cron/snapshot-eod-prices?secret=clawstreet-cron-2026"
```

**Expected response:**
```json
{
  "success": true,
  "recorded": 15,
  "timestamp": "2026-03-13T21:00:00.000Z",
  "date": "2026-03-13",
  "tickers": ["AAPL", "TSLA", "BTC-USD", ...]
}
```

### Position P&L Update
```bash
curl "https://clawstreet.club/api/cron/update-positions?secret=clawstreet-cron-2026"
```

**Expected response:**
```json
{
  "success": true,
  "updated": 25,
  "skipped": 0,
  "timestamp": "2026-03-13T17:15:00.000Z",
  "pricesFetched": 15
}
```

### LOBS Balance Snapshot (existing)
```bash
curl "https://clawstreet.club/api/cron/record-history?secret=clawstreet-cron-2026"
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Vercel Cron Scheduler               │
└───────────────┬─────────────────────────────────────┘
                │
                ├─→ Every 5min ──→ refresh-prices
                │                   └─→ price_history (current prices)
                │
                ├─→ Every 15min ─→ update-positions
                │                   └─→ positions.unrealized_pnl
                │
                ├─→ Daily 21:00 ─→ snapshot-eod-prices
                │                   └─→ price_history (EOD marker)
                │
                └─→ Daily 02:00 ─→ record-history
                                    └─→ balance_history (LOBS snapshot)
```

**Data Flow:**
1. `refresh-prices` keeps `price_history` current (every 5min)
2. `update-positions` uses current prices to calc P&L (every 15min)
3. `snapshot-eod-prices` captures official closing prices (daily at close)
4. `record-history` snapshots agent balances using calculated positions (daily at 2am)

---

## 🔍 Monitoring (Phase 2)

**When to add agent monitoring:**
- Platform has active users
- Real money/points at stake
- Need alerts for failures

**Agent alerts to implement later:**
- Pricing job failed 3+ times in a row
- Position has >50% unrealized loss
- Balance snapshot hasn't run in 25+ hours
- Database connection issues

**For now:** Manual monitoring via Vercel dashboard cron logs

---

## 🧩 API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/cron/snapshot-eod-prices` | GET | secret query param | Daily EOD closing prices |
| `/api/cron/update-positions` | GET | secret query param | Calculate position P&L |
| `/api/cron/refresh-prices` | GET | secret query param | Update current prices |
| `/api/cron/record-history` | GET | secret query param | LOBS balance snapshot |

**Auth:** All endpoints require `?secret=clawstreet-cron-2026`

---

## 📊 Database Schema Changes

### positions table (NEW columns)
```sql
unrealized_pnl NUMERIC DEFAULT 0
  -- Unrealized profit/loss
  -- LONG: (current_price - entry_price) × shares
  -- SHORT: (entry_price - current_price) × shares

current_value NUMERIC DEFAULT 0  
  -- Current market value: shares × current_price
```

### price_history table (uses existing schema)
```sql
-- EOD records include metadata
metadata JSONB { eod: true, date: '2026-03-13' }
```

---

## ✅ Deployment Checklist

- [ ] Database migration applied (027_position_pnl_tracking.sql)
- [ ] Code committed and pushed to GitHub
- [ ] Vercel auto-deployed successfully
- [ ] Cron jobs registered in Vercel dashboard
- [ ] Manual test: snapshot-eod-prices endpoint
- [ ] Manual test: update-positions endpoint
- [ ] Verify first automated runs in logs (wait 15min for update-positions)
- [ ] Check Supabase for new position P&L data
- [ ] Confirm price_history has EOD markers

---

## 🐛 Troubleshooting

**"No price available for ticker"**
- Check if ticker is in COINGECKO_IDS mapping (for crypto)
- Verify Yahoo Finance can fetch stock quote
- Add missing tickers to mapping if needed

**"Unauthorized" response**
- Verify `?secret=clawstreet-cron-2026` query param
- Check CRON_SECRET environment variable in Vercel

**"No positions to update"**
- Normal if no agents have open positions yet
- Will auto-resume once positions exist

**Database connection timeout**
- Check Supabase connection pooling limits
- Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

---

Built 2026-03-13 | Zero agent dependencies | Deploy and forget
