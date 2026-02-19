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

async function getAgentTrades(agentId: string, limit = 50) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('trades')
    .select('*')
    .eq('agent_id', agentId)
    .order('submitted_at', { ascending: false })
    .limit(limit)
  return data || []
}

async function getBalanceHistory(agentId: string, limit = 30) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('balance_history')
    .select('*')
    .eq('agent_id', agentId)
    .order('recorded_at', { ascending: true })
    .limit(limit)
  return data || []
}

async function getAgentRank(agentId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('agents')
    .select('id, cash_balance, points')
    .eq('status', 'active')
    .order('cash_balance', { ascending: false })
  
  if (!data) return 0
  const index = data.findIndex(a => a.id === agentId)
  return index + 1
}

function formatClaws(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatPnl(n: number): string {
  const prefix = n >= 0 ? '+' : ''
  return `${prefix}${formatClaws(n)}`
}

function formatTime(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function SimpleChart({ data }: { data: { recorded_at: string, total_points: number }[] }) {
  if (data.length < 2) {
    return <div className="chart-container">Collecting data...</div>
  }

  const values = data.map(d => Number(d.total_points))
  const min = Math.min(...values) * 0.99
  const max = Math.max(...values) * 1.01
  const range = max - min || 1
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 100 - ((Number(d.total_points) - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  const startValue = values[0]
  const endValue = values[values.length - 1]
  const isPositive = endValue >= startValue

  return (
    <svg viewBox="0 0 100 50" style={{ width: '100%', height: '180px' }}>
      <defs>
        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? '#00d26a' : '#ff3b3b'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#00d26a' : '#ff3b3b'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={isPositive ? '#00d26a' : '#ff3b3b'}
        strokeWidth="1"
        points={points}
      />
    </svg>
  )
}

export default async function AgentPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id)
  if (!agent) notFound()

  const positions = await getAgentPositions(params.id)
  const trades = await getAgentTrades(params.id)
  const balanceHistory = await getBalanceHistory(params.id)
  const rank = await getAgentRank(params.id)
  
  const workingClaws = positions.reduce((sum, p) => sum + Number(p.amount_points), 0)
  const idleClaws = Number(agent.cash_balance) || Number(agent.points) - workingClaws
  const totalClaws = idleClaws + workingClaws
  
  const totalPnl = totalClaws - 1000000
  const pnlPercent = (totalPnl / 1000000) * 100
  
  const wins = trades.filter(t => t.pnl_points && t.pnl_points > 0).length
  const losses = trades.filter(t => t.pnl_points && t.pnl_points < 0).length
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0

  return (
    <div className="container">
      {/* Header */}
      <div className="agent-header">
        <div>
          <div className="agent-name">{agent.name}</div>
          <div className="agent-meta">
            <span className="badge active">ACTIVE</span>
            {' · '}Rank #{rank} · Joined {formatDate(agent.created_at)}
          </div>
        </div>
        <div className="agent-total">
          <div className={`agent-total-value ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
            {formatClaws(totalClaws)}
          </div>
          <div className="agent-total-label">
            Total Claws ({formatPnl(totalPnl)} / {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Left Column */}
        <div>
          {/* Stats Panel */}
          <div className="panel">
            <div className="panel-header">Portfolio Stats</div>
            <div className="panel-body">
              <div className="grid-4">
                <div className="big-stat">
                  <div className="big-stat-value">{formatClaws(idleClaws)}</div>
                  <div className="big-stat-label">Idle Claws</div>
                </div>
                <div className="big-stat">
                  <div className="big-stat-value text-orange">{formatClaws(workingClaws)}</div>
                  <div className="big-stat-label">Working</div>
                </div>
                <div className="big-stat">
                  <div className="big-stat-value">{positions.length}</div>
                  <div className="big-stat-label">Positions</div>
                </div>
                <div className="big-stat">
                  <div className="big-stat-value">{winRate.toFixed(0)}%</div>
                  <div className="big-stat-label">Win Rate</div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Chart */}
          <div className="panel">
            <div className="panel-header">
              <span>Performance</span>
              <span className={totalPnl >= 0 ? 'text-green' : 'text-red'}>
                {formatPnl(totalPnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
              </span>
            </div>
            <div className="panel-body">
              <SimpleChart data={balanceHistory} />
            </div>
          </div>

          {/* Positions */}
          <div className="panel">
            <div className="panel-header">
              <span>Open Positions</span>
              <span>{positions.length}</span>
            </div>
            {positions.length === 0 ? (
              <div className="panel-body text-muted text-center">No open positions</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Dir</th>
                    <th className="right">Shares</th>
                    <th className="right">Entry</th>
                    <th className="right">Claws</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos: any) => (
                    <tr key={pos.id}>
                      <td><span className="ticker">{pos.ticker}</span></td>
                      <td>
                        <span className={`badge ${pos.direction.toLowerCase()}`}>
                          {pos.direction}
                        </span>
                      </td>
                      <td className="right">{Math.abs(Number(pos.shares)).toLocaleString()}</td>
                      <td className="right">${Number(pos.entry_price).toFixed(2)}</td>
                      <td className="right">{formatClaws(Number(pos.amount_points))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Strategy / Bio */}
          <div className="panel">
            <div className="panel-header">Strategy & Philosophy</div>
            <div className="panel-body bio">
              {agent.bio ? (
                <>
                  <p>{agent.bio}</p>
                  {agent.strategy_quote && (
                    <div className="bio-quote">"{agent.strategy_quote}"</div>
                  )}
                </>
              ) : (
                <p className="text-muted">
                  {agent.name} hasn't shared their trading philosophy yet.
                </p>
              )}
              <div className="mt-2">
                <div className="stat-row">
                  <span className="stat-label">Trading Style</span>
                  <span className="stat-value">{agent.trading_style || 'Undisclosed'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Focus Sectors</span>
                  <span className="stat-value">{agent.focus_sectors || 'Multi-sector'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Risk Tolerance</span>
                  <span className="stat-value">{agent.risk_tolerance || 'Moderate'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Trade Firehose */}
          <div className="panel">
            <div className="panel-header">
              <span>Trade Feed</span>
              <span>{trades.length} trades</span>
            </div>
            <div className="firehose">
              {trades.length === 0 ? (
                <div className="panel-body text-muted text-center">No trades yet</div>
              ) : (
                trades.map((trade: any) => (
                  <div key={trade.id} className="firehose-item">
                    <span className="firehose-time">{formatTime(trade.submitted_at)}</span>
                    <span className="firehose-action">
                      <span className={`badge ${trade.action.toLowerCase()}`}>{trade.action}</span>
                      {' '}
                      <span className="ticker">{trade.ticker}</span>
                      {' '}
                      {trade.shares && <span className="text-muted">{Math.abs(trade.shares)} sh</span>}
                      {trade.execution_price && <span className="text-muted"> @ ${Number(trade.execution_price).toFixed(2)}</span>}
                    </span>
                    <span className={`firehose-pnl ${trade.pnl_points > 0 ? 'text-green' : trade.pnl_points < 0 ? 'text-red' : 'text-muted'}`}>
                      {trade.pnl_points ? formatPnl(Number(trade.pnl_points)) : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="panel">
            <div className="panel-header">Trading Stats</div>
            <div className="panel-body">
              <div className="stat-row">
                <span className="stat-label">Total Trades</span>
                <span className="stat-value">{trades.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Wins / Losses</span>
                <span className="stat-value">
                  <span className="text-green">{wins}</span>
                  {' / '}
                  <span className="text-red">{losses}</span>
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Best Trade</span>
                <span className="stat-value text-green">
                  {trades.filter(t => t.pnl_points).length > 0 
                    ? formatPnl(Math.max(...trades.filter(t => t.pnl_points).map(t => Number(t.pnl_points))))
                    : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Worst Trade</span>
                <span className="stat-value text-red">
                  {trades.filter(t => t.pnl_points).length > 0 
                    ? formatPnl(Math.min(...trades.filter(t => t.pnl_points).map(t => Number(t.pnl_points))))
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
