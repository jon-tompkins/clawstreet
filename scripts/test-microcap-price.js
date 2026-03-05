#!/usr/bin/env node
/**
 * Test script for microcap price handling
 * Validates that small prices (like PEPE $0.00000353) store correctly
 * 
 * Run after applying migrations 020 and 021
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testMicrocapPrices() {
  console.log('🧪 Testing microcap price storage...\n')
  
  // Test values - realistic PEPE and BONK prices
  const testPrices = [
    { ticker: 'PEPE-USD', price: 0.00000353, expectedDecimalPlaces: 8 },
    { ticker: 'BONK-USD', price: 0.00000619, expectedDecimalPlaces: 8 },
    { ticker: 'SHIB-USD', price: 0.00000845, expectedDecimalPlaces: 8 },
    { ticker: 'BTC-USD', price: 85130.00, expectedDecimalPlaces: 2 }, // sanity check
  ]
  
  console.log('📊 Test prices to verify:')
  for (const { ticker, price } of testPrices) {
    console.log(`   ${ticker}: $${price}`)
  }
  console.log('')
  
  // Test 1: Direct INSERT with small prices
  console.log('Test 1: Direct INSERT of small prices into trades table...')
  
  const testTradeId = `test-${Date.now()}`
  const testAgentId = 'd629b7ca-e7d7-4378-8bd5-5e0698348bd3' // Jai-Alpha
  
  for (const { ticker, price } of testPrices) {
    try {
      // Insert test trade
      const { data, error } = await supabase
        .from('trades')
        .insert({
          agent_id: testAgentId,
          ticker: ticker,
          action: 'OPEN',
          direction: 'LONG',
          amount: 1000,
          shares: 1000 / price,
          execution_price: price,
          week_id: '2026-01-01', // test week
          reveal_date: '2026-01-01',
          revealed: true,
          fee_lobs: 0,
          notes: 'TEST: microcap price validation'
        })
        .select('id, ticker, execution_price, shares')
        .single()
      
      if (error) {
        console.log(`   ❌ ${ticker}: INSERT failed - ${error.message}`)
        continue
      }
      
      // Verify the price was stored correctly
      const storedPrice = parseFloat(data.execution_price)
      const tolerance = price * 0.0001 // 0.01% tolerance
      
      if (Math.abs(storedPrice - price) < tolerance) {
        console.log(`   ✅ ${ticker}: Stored $${storedPrice} (expected $${price})`)
      } else {
        console.log(`   ❌ ${ticker}: Stored $${storedPrice} != expected $${price}`)
        console.log(`      Loss of precision: ${((1 - storedPrice/price) * 100).toFixed(4)}%`)
      }
      
      // Clean up test record
      await supabase.from('trades').delete().eq('id', data.id)
      
    } catch (e) {
      console.log(`   ❌ ${ticker}: Exception - ${e.message}`)
    }
  }
  
  console.log('')
  
  // Test 2: Check existing PEPE/BONK data
  console.log('Test 2: Checking existing PEPE/BONK trades...')
  
  const { data: existingTrades } = await supabase
    .from('trades')
    .select('id, ticker, execution_price, amount, shares')
    .in('ticker', ['PEPE-USD', 'BONK-USD'])
    .order('submitted_at', { ascending: false })
    .limit(5)
  
  if (existingTrades?.length) {
    for (const t of existingTrades) {
      const expectedPrice = t.amount / Math.abs(t.shares)
      const storedPrice = parseFloat(t.execution_price)
      const isCorrect = Math.abs(storedPrice - expectedPrice) < expectedPrice * 0.0001
      
      console.log(`   ${isCorrect ? '✅' : '❌'} ${t.ticker}: stored=$${storedPrice}, calculated=$${expectedPrice.toFixed(12)}`)
    }
  } else {
    console.log('   No PEPE/BONK trades found')
  }
  
  console.log('')
  
  // Test 3: Check positions
  console.log('Test 3: Checking PEPE/BONK positions...')
  
  const { data: positions } = await supabase
    .from('positions')
    .select('id, ticker, entry_price, amount_points, shares')
    .in('ticker', ['PEPE-USD', 'BONK-USD'])
  
  if (positions?.length) {
    for (const p of positions) {
      const expectedPrice = p.amount_points / Math.abs(p.shares)
      const storedPrice = parseFloat(p.entry_price)
      const isCorrect = storedPrice > 0 && Math.abs(storedPrice - expectedPrice) < expectedPrice * 0.01
      
      console.log(`   ${isCorrect ? '✅' : '❌'} ${p.ticker}: stored=$${storedPrice}, expected=$${expectedPrice.toFixed(12)}`)
    }
  } else {
    console.log('   No PEPE/BONK positions found')
  }
  
  console.log('\n✨ Test complete!')
}

testMicrocapPrices().catch(console.error)
