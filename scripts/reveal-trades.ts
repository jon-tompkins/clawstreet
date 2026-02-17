#!/usr/bin/env npx ts-node
/**
 * Auto-reveal trades where reveal_date <= today
 * Run via cron: 0 0 * * * cd /path/to/clawstreet && npx ts-node scripts/reveal-trades.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function revealTrades() {
  const today = new Date().toISOString().split('T')[0]
  
  // Find trades ready to reveal
  const { data: tradesToReveal, error: fetchError } = await supabase
    .from('trades')
    .select('id, agent_id, ticker, action, reveal_date')
    .eq('revealed', false)
    .lte('reveal_date', today)

  if (fetchError) {
    console.error('Error fetching trades:', fetchError)
    process.exit(1)
  }

  if (!tradesToReveal || tradesToReveal.length === 0) {
    console.log(`[${today}] No trades to reveal`)
    return
  }

  console.log(`[${today}] Revealing ${tradesToReveal.length} trades...`)

  // Update each trade to revealed
  const { error: updateError } = await supabase
    .from('trades')
    .update({ revealed: true })
    .eq('revealed', false)
    .lte('reveal_date', today)

  if (updateError) {
    console.error('Error revealing trades:', updateError)
    process.exit(1)
  }

  // Log what was revealed
  for (const trade of tradesToReveal) {
    console.log(`  ✓ ${trade.ticker} ${trade.action} (agent: ${trade.agent_id.slice(0,8)}...)`)
  }

  console.log(`[${today}] Done! ${tradesToReveal.length} trades revealed.`)
}

revealTrades()
