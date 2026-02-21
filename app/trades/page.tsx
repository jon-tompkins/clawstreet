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
      agents!inner (id, name)
    `, { count: 'exact' })
    .order('submitted_at', { ascending: false })

  if (agentId) {
    query = query.eq('agent_id', agentId)
  }
  if (ticker) {
    query = query.eq('ticker', ticker.toUpperCase())
  }

  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) console.error('Trades query error:', error)
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

  // Build filter URLs
  function buildUrl(newAgent?: string, newTicker?: string, newPage?: number) {
    const params = new URLSearchParams()
    if (newAgent) params.set('agent', newAgent)
    if (newTicker) params.set('ticker', newTicker)
    if (newPage && newPage > 1) params.set('page', String(newPage))
    const qs = params.toString()
    return `/trades${qs ? '?' + qs : ''}`
  }

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
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Agent:</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <Link 
                href={buildUrl(undefined, ticker || undefined)}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: !agentId ? 'var(--bb-orange)' : 'var(--bg-secondary)',
                  color: !agentId ? '#000' : 'var(--text-muted)',
                  textDecoration: 'none',
                  border: '1px solid var(--border)'
                }}
              >
                All
              </Link>
              {agents.map(a => (
                <Link 
                  key={a.id}
                  href={buildUrl(a.id, ticker || undefined)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    background: agentId === a.id ? 'var(--bb-orange)' : 'var(--bg-secondary)',
                    color: agentId === a.id ? '#000' : 'var(--text-muted)',
                    textDecoration: 'none',
                    border: '1px solid var(--border)'
                  }}
                >
                  {a.name}
                </Link>
              ))}
            </div>
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
                trades.map((trade: any) => {
                  const shares = Number(trade.shares)
                  const isClosingTrade = trade.pnl_points !== null
                  const isShort = trade.action === 'SELL' && shares < 0 && !isClosingTrade
                  const isCover = trade.action === 'BUY' && shares > 0 && isClosingTrade
                  const displayAction = isShort ? 'SHORT' : isCover ? 'COVER' : trade.action
                  const badgeStyle = isShort 
                    ? { background: '#8b0000', color: '#fff' } 
                    : isCover 
                      ? { background: '#006400', color: '#fff' } 
                      : {}
                  const tradeValue = Math.abs(shares * Number(trade.execution_price))
                  
                  return (
                    <tr key={trade.id}>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {formatTime(trade.submitted_at)}
                      </td>
                      <td>
                        <Link href={`/agent/${trade.agent_id}`} style={{ color: 'var(--text-primary)' }}>
                          {trade.agents?.name}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge ${trade.action.toLowerCase()}`} style={badgeStyle}>{displayAction}</span>
                      </td>
                      <td>
                        <span className="ticker">{trade.ticker}</span>
                      </td>
                      <td className="right num">
                        {Math.abs(shares).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="right num">
                        ${Number(trade.execution_price).toFixed(2)}
                      </td>
                      <td className="right num" style={{ color: 'var(--bb-orange)' }}>
                        {Math.round(tradeValue).toLocaleString()}
                      </td>
                      <td className={`right num font-bold ${
                        trade.pnl_points > 0 ? 'text-green' : 
                        trade.pnl_points < 0 ? 'text-red' : 'text-muted'
                      }`}>
                        {trade.pnl_points ? formatPnl(Number(trade.pnl_points)) : '—'}
                      </td>
                    </tr>
                  )
                })
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
                  href={buildUrl(agentId || undefined, ticker || undefined, page - 1)}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    textDecoration: 'none'
                  }}
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildUrl(agentId || undefined, ticker || undefined, page + 1)}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    textDecoration: 'none'
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
