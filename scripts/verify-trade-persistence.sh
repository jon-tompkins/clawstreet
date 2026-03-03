#!/bin/bash
# Quai Trade Persistence Verification Script
# Tests that trades actually persist to the database

set -e

API_KEY="${1:-$CLAWSTREET_API_KEY}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcmRndnNvcmhrbGJxcndteHd2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0OTk1MywiZXhwIjoyMDg2OTI1OTUzfQ.ySsGI9Nndp4D1KaxWf1uerCW6VdZoTfpFiVmkIVM9-w}"
SUPABASE_URL="https://jmrdgvsorhklbqrwmxwv.supabase.co"

echo "🧪 Quai Trade Persistence Test"
echo "=============================="

# Get initial trade count
INITIAL_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/trades" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Range: 0-0" \
  -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | sed 's/.*\///' | tr -d '\r')

echo "📊 Initial trade count: $INITIAL_COUNT"

# Make a test trade via API
echo "📤 Submitting test trade..."
TRADE_RESULT=$(curl -s -X POST "https://clawstreet.club/api/trade" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "LINK-USD", "action": "OPEN", "direction": "LONG", "amount": 1000}')

TRADE_ID=$(echo "$TRADE_RESULT" | jq -r '.trade.id // "FAILED"')
SUCCESS=$(echo "$TRADE_RESULT" | jq -r '.success // false')

echo "   API Response: success=$SUCCESS, trade_id=$TRADE_ID"

if [ "$TRADE_ID" = "FAILED" ] || [ "$TRADE_ID" = "null" ]; then
  echo "❌ FAIL: Trade API returned error"
  echo "$TRADE_RESULT" | jq '.error'
  exit 1
fi

# Wait a moment for any async processing
sleep 2

# Verify trade exists in DB
echo "🔍 Verifying trade in database..."
DB_TRADE=$(curl -s "$SUPABASE_URL/rest/v1/trades?id=eq.$TRADE_ID" \
  -H "apikey: $SUPABASE_KEY")

DB_COUNT=$(echo "$DB_TRADE" | jq 'length')

if [ "$DB_COUNT" = "0" ]; then
  echo "❌ CRITICAL FAIL: Trade ID $TRADE_ID not found in trades table!"
  echo "   API returned success but trade did not persist."
  
  # Check if position was created
  POSITION=$(curl -s "$SUPABASE_URL/rest/v1/positions?ticker=eq.LINK-USD&order=opened_at.desc&limit=1" \
    -H "apikey: $SUPABASE_KEY" | jq '.[0].opened_at // "none"')
  echo "   Latest LINK-USD position: $POSITION"
  
  exit 1
else
  echo "✅ PASS: Trade found in database"
  echo "$DB_TRADE" | jq '.[0] | {id, ticker, action, submitted_at}'
fi

# Verify count incremented
FINAL_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/trades" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Range: 0-0" \
  -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | sed 's/.*\///' | tr -d '\r')

echo "📊 Final trade count: $FINAL_COUNT (was $INITIAL_COUNT)"

if [ "$FINAL_COUNT" -gt "$INITIAL_COUNT" ]; then
  echo "✅ PASS: Trade count incremented"
else
  echo "❌ FAIL: Trade count did not increment"
  exit 1
fi

echo ""
echo "=============================="
echo "✅ All persistence tests passed"
