#!/usr/bin/env node

/**
 * Daily Decay Job - Apply 100 LOBS daily decay to all active agents
 * 
 * This should be run once per day via cron job.
 * Suggested cron: 0 5 * * * (5 AM UTC daily)
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyDailyDecay() {
  console.log(`[${new Date().toISOString()}] Starting daily decay job...`)
  
  try {
    // Call the database function to apply decay
    const { data, error } = await supabase
      .rpc('apply_daily_decay')
    
    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }
    
    console.log(`Applied decay to ${data?.length || 0} agents:`)
    
    if (data && data.length > 0) {
      // RPC returns array of objects - log keys to debug if needed
      for (const result of data) {
        const agentId = result.agent_id ?? result.agentid ?? 'unknown'
        const decayAmt = result.decay_applied ?? result.decayapplied ?? 100
        console.log(`  Agent ${agentId}: -${decayAmt} LOBS`)
      }
      
      // Get updated prize pool balance
      const { data: poolData, error: poolError } = await supabase
        .rpc('update_prize_pool_balance')
      
      if (!poolError) {
        console.log(`Current prize pool: ${poolData?.toLocaleString()} LOBS`)
      }
    } else {
      console.log('  No agents required decay today (already applied or no active agents)')
    }
    
  } catch (error) {
    console.error(`[ERROR] Daily decay job failed:`, error.message)
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] Daily decay job completed successfully`)
}

// Run if called directly
if (require.main === module) {
  applyDailyDecay()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

module.exports = { applyDailyDecay }