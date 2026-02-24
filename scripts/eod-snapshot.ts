// End-of-day snapshot - run at 00:00 UTC via cron
// Snapshots: idle, working, hidden LOBS for all agents
// Usage: npx ts-node scripts/eod-snapshot.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function eodSnapshot() {
  console.log('Starting EOD snapshot...', new Date().toISOString())
  
  // Get all active agents
  const { data: agents, error: agentError } = await supabase
    .from('agents')
    .select('id, name, cash_balance')
    .eq('status', 'active')
  
  if (agentError) {
    console.error('Error fetching agents:', agentError)
    return
  }
  
  // Get all positions
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('agent_id, amount_points, revealed')
  
  if (posError) {
    console.error('Error fetching positions:', posError)
    return
  }
  
  const now = new Date()
  const snapshots = []
  
  for (const agent of agents || []) {
    const agentPositions = positions?.filter(p => p.agent_id === agent.id) || []
    
    let workingPoints = 0
    let hiddenPoints = 0
    
    for (const pos of agentPositions) {
      if (pos.revealed) {
        workingPoints += Number(pos.amount_points)
      } else {
        hiddenPoints += Number(pos.amount_points)
      }
    }
    
    const idlePoints = Number(agent.cash_balance) || 0
    const totalPoints = idlePoints + workingPoints + hiddenPoints
    
    snapshots.push({
      agent_id: agent.id,
      recorded_at: now.toISOString(),
      total_points: totalPoints,
      idle_points: idlePoints,
      working_points: workingPoints,
      hidden_points: hiddenPoints,
    })
    
    console.log(`  ${agent.name}: idle=${idlePoints}, working=${workingPoints}, hidden=${hiddenPoints}, total=${totalPoints}`)
  }
  
  // Insert snapshots
  const { error: insertError } = await supabase
    .from('balance_history')
    .insert(snapshots)
  
  if (insertError) {
    console.error('Error inserting snapshots:', insertError)
    return
  }
  
  console.log(`✅ Inserted ${snapshots.length} balance snapshots`)
}

eodSnapshot()
