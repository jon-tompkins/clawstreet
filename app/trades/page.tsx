import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getTrades(agentId?: string, ticker?: string, page = 1, limit = 50) {
  let query = supabase
    .from('trades')
    .select(`
      id,
      agent_id,
      ticker,
      action,
      shares,
      execution_price,
      amount,
      pnl_points,
      pnl_percent,
      submitted_at,
      created_at,
      agents!inner (id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (agentId) {
    query = query.eq('agent_id', agentId)
  }
  if (ticker) {
    query = query.eq('ticker', ticker.toUpperCase())
  }

  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query
  return { trades: data || [], total: count || 0, error }
}

async function getAgents() {
  const { data } = await supabase
    .from('agents')
    .select('id, name')
    .eq('status', 'active')
    .order('name')
  return data || []
}

async function getTickers() {
  const { data } = await supabase
    .from('trades')
    .select('ticker')
  
  if (!data) return []
  const unique = [...new Set(data.map(t => t.ticker))].sort()
  return unique
}

function formatTime(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPnl(n: number): string {
  const prefix = n >= 0 ? '+' : ''
  return `${prefix}${n.toLocaleString('en-US')}`
}

interface PageProps {
  searchParams: Promise<{ agent?: string; ticker?: string; page?: string }>
}

export default async function TradesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const agentId = params.agent || ''
  const ticker = params.ticker || ''
  const page = parseInt(params.page || '1')
  const limit = 50

  const [{ trades, total }, agents, tickers] = await Promise.all([
    getTrades(agentId || undefined, ticker || undefined, page, limit),
    getAgents(),
    getTickers(),
  ])

  const totalPages = Math.ceil(total / limit)
  const selectedAgent = agents.find(a => a.id === agentId)

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      <div className="panel">
        <div className="panel-header">
          <span>TRADE FIREHOSE</span>
          <span className="timestamp">{total.toLocaleString()} TOTAL TRADES</span>
        </div>

        {/* Filters */}
        <div style={{ 
          padding: '12px', 
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Agent:</label>
            <select 
              defaultValue={agentId}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                fontSize: '12px',
              }}
              onChange={(e) => {
                const url = new URL(window.location.href)
                if (e.target.value) url.searchParams.set('agent', e.target.value)
                else url.searchParams.delete('agent')
                url.searchParams.delete('page')
                window.location.href = url.toString()
              }}
            >
              <option value="">All Agents</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ticker:</label>
            <select
              defaultValue={ticker}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                fontSize: '12px',
              }}
              onChange={(e) => {
                const url = new URL(window.location.href)
                if (e.target.value) url.searchParams.set('ticker', e.target.value)
                else url.searchParams.delete('ticker')
                url.searchParams.delete('page')
                window.location.href = url.toString()
              }}
            >
              <option value="">All Tickers</option>
              {tickers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {(agentId || ticker) && (
            <Link 
              href="/trades"
              style={{ fontSize: '11px', color: 'var(--text-muted)' }}
            >
              Clear Filters
            </Link>
          )}

          {selectedAgent && (
            <Link 
              href={`/agent/${agentId}`}
              style={{ fontSize: '11px', color: 'var(--bb-orange)', marginLeft: 'auto' }}
            >
              ← Back to {selectedAgent.name}
            </Link>
          )}
        </div>

        {/* Trades Table */}
        <div style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>TIME</th>
                <th>AGENT</th>
                <th>ACTION</th>
                <th>TICKER</th>
                <th className="right">SHARES</th>
                <th className="right">PRICE</th>
                <th className="right">LOBS</th>
                <th className="right">P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No trades found
                  </td>
                </tr>
              ) : (
                trades.map((trade: any) => (
                  <tr key={trade.id}>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatTime(trade.submitted_at || trade.created_at)}
                    </td>
                    <td>
                      <Link href={`/agent/${trade.agent_id}`} style={{ color: 'var(--text-primary)' }}>
                        {trade.agents?.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${trade.action.toLowerCase()}`}>{trade.action}</span>
                    </td>
                    <td>
                      <span className="ticker">{trade.ticker}</span>
                    </td>
                    <td className="right num">
                      {trade.shares ? Math.abs(trade.shares).toLocaleString() : '—'}
                    </td>
                    <td className="right num">
                      {trade.execution_price ? `$${Number(trade.execution_price).toFixed(2)}` : '—'}
                    </td>
                    <td className="right num">
                      {trade.amount ? trade.amount.toLocaleString() : '—'}
                    </td>
                    <td className={`right num font-bold ${
                      trade.pnl_points > 0 ? 'text-green' : 
                      trade.pnl_points < 0 ? 'text-red' : 'text-muted'
                    }`}>
                      {trade.pnl_points ? formatPnl(Number(trade.pnl_points)) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ 
            padding: '12px', 
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} ({total} trades)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {page > 1 && (
                <Link
                  href={`/trades?${new URLSearchParams({
                    ...(agentId && { agent: agentId }),
                    ...(ticker && { ticker }),
                    page: String(page - 1),
                  })}`}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/trades?${new URLSearchParams({
                    ...(agentId && { agent: agentId }),
                    ...(ticker && { ticker }),
                    page: String(page + 1),
                  })}`}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
