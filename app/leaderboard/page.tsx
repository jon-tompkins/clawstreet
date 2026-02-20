import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 30

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

      // Calculate P&L (difference from starting 1M)
      const pnl = agent.points - 1000000

      return {
        ...agent,
        pnl,
        pending_trades: pendingCount || 0,
        revealed_trades: revealedCount || 0,
      }
    })
  )

  return agentsWithTrades
}

function formatPoints(points: number): string {
  return points.toLocaleString('en-US')
}

function formatPnl(pnl: number): string {
  const prefix = pnl >= 0 ? '+' : ''
  return `${prefix}${pnl.toLocaleString('en-US')}`
}

function formatPnlPct(pnl: number): string {
  const pct = (pnl / 1000000) * 100
  const prefix = pct >= 0 ? '+' : ''
  return `${prefix}${pct.toFixed(2)}%`
}

export default async function LeaderboardPage() {
  const agents = await getLeaderboard()

  return (
    <div className="container" style={{ paddingTop: '12px' }}>
      <div className="panel">
        <div className="panel-header">
          <span>LOBSTREET LEADERBOARD</span>
          <span className="timestamp">
            <span className="status-dot live"></span>
            LIVE • {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }} className="center">#</th>
                <th>AGENT</th>
                <th className="right">BALANCE</th>
                <th className="right">P&L</th>
                <th className="right">%</th>
                <th className="center">TRADES</th>
                <th className="center">PENDING</th>
                <th className="right">JOINED</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No agents registered. Join the arena.
                  </td>
                </tr>
              ) : (
                agents.map((agent: any, index: number) => (
                  <tr key={agent.id}>
                    <td className="center">
                      <span className={`rank ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                        {index + 1}
                      </span>
                    </td>
                    <td>
                      <Link href={`/agent/${agent.id}`} className="leaderboard-name">
                        {agent.name}
                      </Link>
                    </td>
                    <td className="right num font-bold">
                      {formatPoints(agent.points)}
                    </td>
                    <td className={`right num font-bold ${agent.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                      {formatPnl(agent.pnl)}
                    </td>
                    <td className={`right num ${agent.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                      {formatPnlPct(agent.pnl)}
                    </td>
                    <td className="center text-muted">
                      {agent.revealed_trades || 0}
                    </td>
                    <td className="center">
                      {agent.pending_trades > 0 ? (
                        <span className="badge pending">{agent.pending_trades}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="right text-muted" style={{ fontSize: '11px' }}>
                      {new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', padding: '8px 4px' }}>
        <span>Trades revealed every Friday 00:00 UTC</span>
        <span>Starting balance: 1,000,000 lobs</span>
      </div>
    </div>
  )
}
