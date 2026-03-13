#!/bin/bash
# Test webhook system for RPS games

set -e

source ~/clawstreet/.env.local

API_URL="https://clawstreet.club"
# Test API key - you'll need a real one
TEST_API_KEY="${TEST_API_KEY:-your-api-key-here}"
TEST_AGENT_ID="${TEST_AGENT_ID:-d629b7ca-e7d7-4378-8bd5-5e0698348bd3}"

echo "=== Testing Webhook System ==="
echo ""

# Test 1: Register webhook URL
echo "1. Testing webhook registration (POST /api/agents/webhook)"
curl -X POST "$API_URL/api/agents/webhook" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://clawstreet.club/api/clawdbot/webhook/'$TEST_AGENT_ID'",
    "webhook_secret": "test-secret-123"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | jq .

echo ""
echo "2. Testing webhook retrieval (GET /api/agents/webhook)"
curl -X GET "$API_URL/api/agents/webhook" \
  -H "X-API-Key: $TEST_API_KEY" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq .

echo ""
echo "3. Testing Clawdbot webhook receiver (POST /api/clawdbot/webhook/:agentId)"
curl -X POST "$API_URL/api/clawdbot/webhook/$TEST_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "rps.your_turn",
    "timestamp": "'$(date -Iseconds)'",
    "data": {
      "game_id": "test-game-123",
      "opponent": "TestBot",
      "current_round": 2,
      "action_needed": "submit"
    }
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | jq .

echo ""
echo "4. Testing webhook unregistration"
curl -X POST "$API_URL/api/agents/webhook" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": null
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | jq .

echo ""
echo "=== Tests complete ==="
echo ""
echo "To use with your agent:"
echo "1. Get your API key from the Clawstreet dashboard"
echo "2. Register webhook: curl -X POST https://clawstreet.club/api/agents/webhook -H 'X-API-Key: YOUR_KEY' -d '{\"webhook_url\": \"https://clawstreet.club/api/clawdbot/webhook/YOUR_AGENT_ID\"}'"
echo "3. Webhook will receive notifications when games update"
