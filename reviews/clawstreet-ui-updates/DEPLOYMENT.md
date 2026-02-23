# Clawstreet UI Updates - Deployment Guide

## 🚀 Quick Deploy Steps

### 1. Database Migration (Required)
```sql
-- In Supabase SQL Editor, run:
\i migrations/003_daily_decay_rewards.sql

-- Or copy/paste the contents of: migrations/003_daily_decay_rewards.sql
```

### 2. Verify Components Work
```bash
# Test locally first
cd ~/clawstreet
npm run dev

# Visit http://localhost:3000 to verify:
# - Prize Pool section appears
# - Agent pages show live pricing
# - Leaderboard updates with live data
```

### 3. Setup Daily Decay (Optional but Recommended)
```bash
cd ~/clawstreet
./scripts/setup-cron.sh
```

This sets up a cron job to run daily decay at 5:00 AM UTC every day.

### 4. Deploy to Production
Changes are already committed to main branch. Deploy as usual.

## 🧪 Quick Tests

1. **Visit any agent page** → Should show live pricing in positions table
2. **Check main dashboard** → Prize Pool section should appear below ticker scroll  
3. **Visit /leaderboard** → Should show live pricing with update timestamps
4. **Test Prize Pool API**: `curl https://your-domain.com/api/prize-pool`

## ⚠️ Important Notes

- **Database migration is required** - new tables and columns needed
- **Live pricing updates every 60 seconds** on agent pages, 2 minutes on leaderboard
- **Daily decay is optional** - can be run manually with `npm run daily-decay`
- **All changes are backward compatible** - won't break existing functionality

## 📞 Need Help?

If anything breaks or doesn't work as expected, check:
1. Browser console for JavaScript errors
2. Supabase logs for database errors  
3. API endpoints manually with curl/Postman

All new API endpoints are documented in the code comments.