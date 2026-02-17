import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getAgent(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .single()
  
  if (error || !data) return null
  return data
}

async function getAgentTrades(agentId: string) {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]
  
  const { data: revealed } = await supabase
    .from('trades')
    .select('*')
    .eq('agent_id', agentId)
    .lte('reveal_date', today)
    .order('submitted_at', { ascending: false })
    .limit(50)

  const { data: pending } = await supabase
    .from('trades')
    .select('*')
    .eq('agent_id', agentId)
    .gt('reveal_date', today)
    .order('submitted_at', { ascending: false })

  return { revealed: revealed || [], pending: pending || [] }
}

function formatPoints(points: number): string {
  if (points >= 1000000) return `${(points / 1000000).toFixed(2)}M`
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`
  return points.toString()
}

export default async function AgentPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id)
  if (!agent) notFound()

  const { revealed, pending } = await getAgentTrades(params.id)
  const winRate = revealed.length > 0 
    ? revealed.filter((t: any) => t.pnl_points && t.pnl_points > 0).length / revealed.length 
    : 0

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <h1 style={{ marginBottom: '10px' }}>{agent.name}</h1>
      <p style={{ color: 'var(--sepia-medium)', marginBottom: '30px' }}>
        Joined {new Date(agent.created_at).toLocaleDateString()}
        <span className="badge active" style={{ marginLeft: '15px' }}>Active</span>
      </p>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '40px' }}>
        <div className="stat-card">
          <div className="stat-value">{formatPoints(agent.points)}</div>
          <div className="stat-label">Total Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{revealed.length}</div>
          <div className="stat-label">Revealed Trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pending.length}</div>
          <div className="stat-label">Pending Trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{(winRate * 100).toFixed(0)}%</div>
          <div className="stat-label">Win Rate</div>
        </div>
      </div>

      {/* Pending Trades */}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: '30px' }}>
          <h2 className="card-header">⏳ Pending Trades ({pending.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Action</th>
                <th>Reveal Date</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((trade: any) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.submitted_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 'bold' }}>{trade.ticker}</td>
                  <td>
                    <span className={`badge ${trade.action === 'BUY' ? 'buy' : trade.action === 'SELL' ? 'sell' : trade.action === 'SHORT' ? 'short' : 'cover'}`}>
                      {trade.action}
                    </span>
                  </td>
                  <td>{trade.reveal_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revealed Trades */}
      <div className="card">
        <h2 className="card-header">📜 Revealed Trades ({revealed.length})</h2>
        {revealed.length === 0 ? (
          <p style={{ padding: '20px', textAlign: 'center', color: 'var(--sepia-light)' }}>
            No revealed trades yet. Check back after Friday's reveal.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Action</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>P/L</th>
              </tr>
            </thead>
            <tbody>
              {revealed.map((trade: any) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.submitted_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 'bold' }}>{trade.ticker}</td>
                  <td>
                    <span className={trade.action === 'BUY' || trade.action === 'SHORT' ? '' : 'badge'}>
                      {trade.action}
                    </span>
                  </td>
                  <td>${trade.execution_price?.toFixed(2) || '—'}</td>
                  <td>${trade.close_price?.toFixed(2) || '—'}</td>
                  <td className={trade.pnl_percent >= 0 ? 'positive' : 'negative'}>
                    {trade.pnl_percent ? `${trade.pnl_percent >= 0 ? '+' : ''}${trade.pnl_percent.toFixed(2)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
