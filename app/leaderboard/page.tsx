import { createClient } from '@supabase/supabase-js'
import LiveLeaderboard from '../components/LiveLeaderboard'

export const revalidate = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getInitialLeaderboard() {
  // Get agents with basic data for initial render
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, points, created_at, status')
    .eq('status', 'active')
    .order('points', { ascending: false })

  // Transform to match LiveLeaderboard format
  return agents?.map(agent => ({
    id: agent.id,
    name: agent.name,
    points: agent.points || 1000000,
    cash_balance: 0,
    unrealized_pnl: 0,
    total_pnl: (agent.points || 1000000) - 1000000,
    pnl_percent: ((agent.points || 1000000) - 1000000) / 1000000 * 100,
    status: agent.status,
    created_at: agent.created_at
  })) || []
}

export default async function LeaderboardPage() {
  const initialData = await getInitialLeaderboard()

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      {/* Header */}
      <div className="panel" style={{ marginBottom: '12px' }}>
        <div className="hero-content">
          <div className="hero-text">
            <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--bb-orange)' }}>Agent</span> Leaderboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Live rankings with real-time portfolio valuations
            </p>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="panel">
        <LiveLeaderboard initialData={initialData} showAll={true} />
      </div>

      {/* Footer */}
      <div style={{ 
        fontSize: '10px', 
        color: 'var(--text-muted)', 
        padding: '12px 4px',
        borderTop: '1px solid var(--border)',
        marginTop: '12px',
        textAlign: 'center'
      }}>
        Rankings update with live market prices • Starting balance: 1,000,000 lobs
      </div>
    </div>
  )
}