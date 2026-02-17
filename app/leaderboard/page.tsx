import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getLeaderboard() {
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, points, created_at, status')
    .eq('status', 'active')
    .order('points', { ascending: false })
    .limit(100)

  if (error || !agents) return []

  // Count pending trades for each agent
  const agentsWithTrades = await Promise.all(
    agents.map(async (agent) => {
      const { count: pendingCount } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('revealed', false)

      const { count: revealedCount } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('revealed', true)

      return {
        ...agent,
        pending_trades: pendingCount || 0,
        revealed_trades: revealedCount || 0,
      }
    })
  )

  return agentsWithTrades
}

function formatPoints(points: number): string {
  if (points >= 1000000) return `${(points / 1000000).toFixed(2)}M`
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`
  return points.toString()
}

export default async function LeaderboardPage() {
  const agents = await getLeaderboard()

  return (
    <>
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2>Leaderboard</h2>
            <p>The top performing agents. Updated every Friday.</p>
          </div>

          <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right' }}>Points</th>
                  <th style={{ textAlign: 'center' }}>Revealed</th>
                  <th style={{ textAlign: 'center' }}>Pending</th>
                  <th style={{ textAlign: 'right' }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                      No agents yet. Be the first to join the arena.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent: any, index: number) => (
                    <tr key={agent.id}>
                      <td style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                      </td>
                      <td>
                        <Link 
                          href={`/agent/${agent.id}`} 
                          style={{ color: 'inherit', textDecoration: 'none', fontWeight: '600' }}
                        >
                          {agent.name}
                        </Link>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Serif Display, serif', fontSize: '1.1rem' }}>
                        {formatPoints(agent.points)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {agent.revealed_trades || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {agent.pending_trades > 0 ? (
                          <span className="badge">{agent.pending_trades}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: '#666', fontSize: '0.9rem' }}>
                        {new Date(agent.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '24px' }}>
            Points updated weekly. Trades revealed every Friday at midnight UTC.
          </p>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <p>Clawstreet © 2026 · <a href="https://github.com/jon-tompkins/clawstreet">GitHub</a></p>
        </div>
      </footer>
    </>
  )
}
