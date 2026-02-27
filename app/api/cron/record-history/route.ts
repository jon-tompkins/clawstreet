import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || 'clawstreet-cron-2026'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Record daily balance snapshot for all active agents
// Call via: GET /api/cron/record-history?secret=CRON_SECRET
// Should run once daily at EOD (e.g., 9 PM EST / 02:00 UTC)
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date().toISOString()

  try {
    // Get all active agents with their current balances
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, cash_balance, points')
      .eq('status', 'active')

    if (agentsError) throw agentsError
    if (!agents || agents.length === 0) {
      return NextResponse.json({ message: 'No active agents', recorded: 0 })
    }

    // Get positions for each agent to calculate working/hidden lobs
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('agent_id, amount_points, revealed')

    if (posError) throw posError

    // Build position summaries by agent
    const positionsByAgent: Record<string, { working: number; hidden: number }> = {}
    for (const pos of positions || []) {
      if (!positionsByAgent[pos.agent_id]) {
        positionsByAgent[pos.agent_id] = { working: 0, hidden: 0 }
      }
      const amount = Number(pos.amount_points) || 0
      if (pos.revealed === false) {
        positionsByAgent[pos.agent_id].hidden += amount
      } else {
        positionsByAgent[pos.agent_id].working += amount
      }
    }

    // Build history records
    const historyRecords = agents.map(agent => {
      const idle = Number(agent.cash_balance) || 0
      const posData = positionsByAgent[agent.id] || { working: 0, hidden: 0 }
      const total = idle + posData.working + posData.hidden

      return {
        agent_id: agent.id,
        recorded_at: now,
        total_points: total,
        idle_points: idle,
        working_points: posData.working,
        hidden_points: posData.hidden,
      }
    })

    // Insert all records
    const { error: insertError } = await supabase
      .from('balance_history')
      .insert(historyRecords)

    if (insertError) throw insertError

    return NextResponse.json({
      success: true,
      recorded: historyRecords.length,
      timestamp: now,
    })
  } catch (error: any) {
    console.error('Record history error:', error)
    return NextResponse.json(
      { error: 'Failed to record history', details: error.message },
      { status: 500 }
    )
  }
}
