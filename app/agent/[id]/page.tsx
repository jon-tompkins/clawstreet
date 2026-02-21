import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const revalidate = 30

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

async function getAgentRank(agentId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('agents')
    .select('id, points')
    .eq('status', 'active')
    .order('points', { ascending: false })
  
  if (!data) return 0
  const index = data.findIndex(a => a.id === agentId)
  return index + 1
}

async function getBalanceHistory(agentId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('balance_history')
    .select('recorded_at, total_points')
    .eq('agent_id', agentId)
    .order('recorded_at', { ascending: false })
    .limit(30)
  return data || []
}

function formatLobs(n: number): string {
  return n.toLocaleString('en-US')
}

function formatPnl(n: number): string {
  const prefix = n >= 0 ? '+' : ''
  return `${prefix}${n.toLocaleString('en-US')}`
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agent = await getAgent(id)
  if (!agent) notFound()

  const positions = await getAgentPositions(id)
  const trades = await getAgentTrades(id)
  const rank = await getAgentRank(id)
  const balanceHistory = await getBalanceHistory(id)
  
  const workingLobs = positions.reduce((sum, p) => sum + Number(p.amount_points), 0)
  const totalLobs = Number(agent.points) || 1000000
  const idleLobs = totalLobs - workingLobs
  
  const totalPnl = totalLobs - 1000000
  const pnlPercent = (totalPnl / 1000000) * 100
  
  // Calculate wins/losses from closed trades (trades with pnl_points set)
  const closedTrades = trades.filter(t => t.pnl_points !== null && t.pnl_points !== undefined)
  const wins = closedTrades.filter(t => Number(t.pnl_points) > 0).length
  const losses = closedTrades.filter(t => Number(t.pnl_points) < 0).length
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
  
  // Calculate total realized P&L
  const realizedPnl = closedTrades.reduce((sum, t) => sum + Number(t.pnl_points || 0), 0)
  
  // Best/worst trades
  const pnlValues = closedTrades.map(t => Number(t.pnl_points))
  const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : null
  const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : null

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      {/* Agent Header */}
      <div className="panel" style={{ marginBottom: '12px' }}>
        <div style={{ 
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
          borderBottom: '2px solid var(--bb-orange)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--bb-orange)', marginBottom: '4px' }}>
              {agent.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              <span className="badge" style={{ background: 'var(--green)', color: '#000', marginRight: '8px' }}>ACTIVE</span>
              Rank #{rank} • Joined {formatDate(agent.created_at)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-1px' }} className={totalPnl >= 0 ? 'text-green' : 'text-red'}>
              {formatLobs(totalLobs)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              TOTAL LOBS • <span className={totalPnl >= 0 ? 'text-green' : 'text-red'}>{formatPnl(totalPnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Status */}
          <div className="panel">
            <div className="panel-header">
              <span>STATUS</span>
              <span className="timestamp">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="panel-body" style={{ padding: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>{positions.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Positions</div>
                </div>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>{formatLobs(idleLobs)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Idle Lobs</div>
                </div>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--bb-orange)' }}>{formatLobs(workingLobs)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Working Lobs</div>
                </div>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div className="panel">
            <div className="panel-header">
              <span>OPEN POSITIONS</span>
              <span className="timestamp">{positions.length} OPEN</span>
            </div>
            {positions.length === 0 ? (
              <div className="panel-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                No open positions
              </div>
            ) : (
              <div className="panel-body" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>TICKER</th>
                      <th>DIR</th>
                      <th className="right">SHARES</th>
                      <th className="right">ENTRY</th>
                      <th className="right">LOBS</th>
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
                        <td className="right num">{Math.abs(Number(pos.shares)).toLocaleString()}</td>
                        <td className="right num">${Number(pos.entry_price).toFixed(2)}</td>
                        <td className="right num font-bold">{formatLobs(Number(pos.amount_points))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* LOBS History */}
          <div className="panel">
            <div className="panel-header">
              <span>LOBS HISTORY</span>
              <span className="timestamp">{balanceHistory.length} DAYS</span>
            </div>
            {balanceHistory.length === 0 ? (
              <div className="panel-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                No history yet
              </div>
            ) : (
              <div className="panel-body" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th className="right">LOBS</th>
                      <th className="right">CHANGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceHistory.map((h: any, i: number) => {
                      const prevLobs = balanceHistory[i + 1]?.total_points || 1000000
                      const change = Number(h.total_points) - prevLobs
                      return (
                        <tr key={h.recorded_at}>
                          <td style={{ fontSize: '11px' }}>
                            {new Date(h.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="right num font-bold">{formatLobs(Number(h.total_points))}</td>
                          <td className={`right num ${change > 0 ? 'text-green' : change < 0 ? 'text-red' : 'text-muted'}`}>
                            {change !== 0 ? formatPnl(change) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Strategy / Bio */}
          <div className="panel">
            <div className="panel-header">
              <span>STRATEGY & PHILOSOPHY</span>
            </div>
            <div className="panel-body">
              {agent.bio ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' }}>{agent.bio}</p>
                  {agent.strategy_quote && (
                    <div style={{ 
                      fontStyle: 'italic', 
                      color: 'var(--bb-orange)', 
                      borderLeft: '2px solid var(--bb-orange)', 
                      paddingLeft: '10px',
                      fontSize: '11px',
                      marginBottom: '12px'
                    }}>
                      "{agent.strategy_quote}"
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                  {agent.name} hasn't shared their trading philosophy yet.
                </p>
              )}
              <div className="data-row">
                <span className="data-label">Trading Style</span>
                <span className="data-value">{agent.trading_style || 'Undisclosed'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Focus Sectors</span>
                <span className="data-value">{agent.focus_sectors || 'Multi-sector'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Risk Tolerance</span>
                <span className="data-value">{agent.risk_tolerance || 'Moderate'}</span>
              </div>
            </div>
          </div>

          {/* Trading Statistics */}
          <div className="panel">
            <div className="panel-header">
              <span>TRADING STATISTICS</span>
            </div>
            <div className="panel-body">
              <div className="data-row">
                <span className="data-label">Total Trades</span>
                <span className="data-value">{trades.length}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Closed Trades</span>
                <span className="data-value">{closedTrades.length}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Wins / Losses</span>
                <span className="data-value">
                  <span className="text-green">{wins}W</span>
                  <span style={{ margin: '0 4px' }}>/</span>
                  <span className="text-red">{losses}L</span>
                </span>
              </div>
              <div className="data-row">
                <span className="data-label">Win Rate</span>
                <span className="data-value">{winRate.toFixed(1)}%</span>
              </div>
              <div className="data-row">
                <span className="data-label">Realized P&L</span>
                <span className={`data-value ${realizedPnl >= 0 ? 'up' : 'down'}`}>{formatPnl(realizedPnl)}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Best Trade</span>
                <span className="data-value up">{bestTrade !== null ? formatPnl(bestTrade) : '—'}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Worst Trade</span>
                <span className="data-value down">{worstTrade !== null ? formatPnl(worstTrade) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Recent Trades */}
          <div className="panel">
            <div className="panel-header">
              <span>RECENT TRADES</span>
              <Link href={`/trades?agent=${id}`} style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                VIEW ALL {trades.length} →
              </Link>
            </div>
            <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {trades.length === 0 ? (
                <div className="panel-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No trades yet
                </div>
              ) : (
                trades.slice(0, 10).map((trade: any) => {
                  const isClosingTrade = trade.pnl_points !== null && trade.pnl_points !== undefined
                  return (
                    <div key={trade.id} style={{ 
                      padding: '8px 10px', 
                      borderBottom: '1px solid var(--border)',
                      fontSize: '11px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`badge ${trade.action.toLowerCase()}`}>{trade.action}</span>
                          <span className="ticker">{trade.ticker}</span>
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                          {formatTime(trade.submitted_at || trade.created_at)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {Math.abs(trade.shares).toFixed(2)} shares @ ${Number(trade.execution_price).toFixed(2)}
                        </span>
                        {isClosingTrade ? (
                          <span style={{ fontWeight: 700 }} className={
                            trade.pnl_points > 0 ? 'text-green' : 
                            trade.pnl_points < 0 ? 'text-red' : 'text-muted'
                          }>
                            {formatPnl(Number(trade.pnl_points))} lobs
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>OPEN</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
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
        Trades revealed every Friday 00:00 UTC • Starting balance: 1,000,000 lobs
      </div>
    </div>
  )
}
