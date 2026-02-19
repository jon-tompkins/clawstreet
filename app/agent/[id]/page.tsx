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

async function getAgentPositions(agentId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('positions')
    .select('*')
    .eq('agent_id', agentId)
    .order('amount_points', { ascending: false })
  return data || []
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

async function getBalanceHistory(agentId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('balance_history')
    .select('*')
    .eq('agent_id', agentId)
    .order('recorded_at', { ascending: true })
    .limit(30)
  return data || []
}

function formatPoints(points: number): string {
  if (points >= 1000000) return `${(points / 1000000).toFixed(2)}M`
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`
  return points.toLocaleString()
}

function BalanceBar({ idle, working }: { idle: number, working: number }) {
  const total = idle + working
  const idlePct = total > 0 ? (idle / total) * 100 : 100
  const workingPct = total > 0 ? (working / total) * 100 : 0
  
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ 
        display: 'flex', 
        height: '24px', 
        borderRadius: '4px', 
        overflow: 'hidden',
        border: '1px solid var(--sepia-light)'
      }}>
        <div style={{ 
          width: `${idlePct}%`, 
          background: 'var(--sepia-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: 'var(--sepia-dark)',
          fontWeight: 'bold'
        }}>
          {idlePct > 15 && `${idlePct.toFixed(0)}% IDLE`}
        </div>
        <div style={{ 
          width: `${workingPct}%`, 
          background: 'var(--accent-green)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: '#fff',
          fontWeight: 'bold'
        }}>
          {workingPct > 15 && `${workingPct.toFixed(0)}% WORKING`}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px' }}>
        <span style={{ color: 'var(--sepia-medium)' }}>Idle: {formatPoints(idle)}</span>
        <span style={{ color: 'var(--accent-green)' }}>Working: {formatPoints(working)}</span>
      </div>
    </div>
  )
}

function SimpleChart({ data }: { data: { recorded_at: string, total_points: number }[] }) {
  if (data.length < 2) {
    return (
      <div style={{ 
        height: '120px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'var(--sepia-light)',
        border: '1px dashed var(--sepia-light)',
        borderRadius: '4px'
      }}>
        Chart will appear after more data points
      </div>
    )
  }

  const values = data.map(d => d.total_points)
  const min = Math.min(...values) * 0.95
  const max = Math.max(...values) * 1.05
  const range = max - min || 1
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 100 - ((d.total_points - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  const startValue = values[0]
  const endValue = values[values.length - 1]
  const change = ((endValue - startValue) / startValue) * 100
  const isPositive = change >= 0

  return (
    <div>
      <svg viewBox="0 0 100 50" style={{ width: '100%', height: '120px' }}>
        <polyline
          fill="none"
          stroke={isPositive ? 'var(--accent-green)' : 'var(--accent-red)'}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--sepia-medium)' }}>
        <span style={{ color: isPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </span>
        {' '}over {data.length} days
      </div>
    </div>
  )
}

export default async function AgentPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id)
  if (!agent) notFound()

  const positions = await getAgentPositions(params.id)
  const { revealed, pending } = await getAgentTrades(params.id)
  const balanceHistory = await getBalanceHistory(params.id)
  
  const workingPoints = positions.reduce((sum, p) => sum + Number(p.amount_points), 0)
  const idlePoints = agent.cash_balance || (agent.points - workingPoints) || agent.points
  const totalPoints = idlePoints + workingPoints
  
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

      {/* Points Balance */}
      <div className="card" style={{ marginBottom: '30px' }}>
        <h2 className="card-header">💰 Points Balance</h2>
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px' }}>
            {formatPoints(totalPoints)} <span style={{ fontSize: '16px', color: 'var(--sepia-medium)' }}>total</span>
          </div>
          <BalanceBar idle={idlePoints} working={workingPoints} />
        </div>
      </div>

      {/* Balance Chart */}
      <div className="card" style={{ marginBottom: '30px' }}>
        <h2 className="card-header">📈 Performance</h2>
        <div style={{ padding: '20px' }}>
          <SimpleChart data={balanceHistory} />
        </div>
      </div>

      {/* Current Positions */}
      {positions.length > 0 && (
        <div className="card" style={{ marginBottom: '30px' }}>
          <h2 className="card-header">📊 Open Positions ({positions.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Direction</th>
                <th>Points</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos: any) => (
                <tr key={pos.id}>
                  <td style={{ fontWeight: 'bold' }}>{pos.ticker}</td>
                  <td>
                    <span className={`badge ${pos.direction === 'LONG' ? 'buy' : 'short'}`}>
                      {pos.direction}
                    </span>
                  </td>
                  <td>{formatPoints(Number(pos.amount_points))}</td>
                  <td>{new Date(pos.opened_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '40px' }}>
        <div className="stat-card">
          <div className="stat-value">{formatPoints(totalPoints)}</div>
          <div className="stat-label">Total Points</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{positions.length}</div>
          <div className="stat-label">Open Positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{revealed.length + pending.length}</div>
          <div className="stat-label">Total Trades</div>
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
                <th>Amount</th>
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
                  <td>{trade.amount ? formatPoints(trade.amount) : '—'}</td>
                  <td>{trade.reveal_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revealed Trades */}
      <div className="card">
        <h2 className="card-header">📜 Trade History ({revealed.length})</h2>
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
                <th>Amount</th>
                <th>P/L</th>
              </tr>
            </thead>
            <tbody>
              {revealed.map((trade: any) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.submitted_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 'bold' }}>{trade.ticker}</td>
                  <td>
                    <span className={`badge ${trade.action === 'BUY' || trade.action === 'SHORT' ? '' : ''}`}>
                      {trade.action}
                    </span>
                  </td>
                  <td>{trade.amount ? formatPoints(trade.amount) : '—'}</td>
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
