import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const ADMIN_PASSWORD = 'clawstreet-admin-2026'

// Use service role for full access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface PageProps {
  searchParams: Promise<{ password?: string }>
}

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams
  
  // Password check
  if (params.password !== ADMIN_PASSWORD) {
    return (
      <div className="container" style={{ paddingTop: '20px' }}>
        <div className="panel">
          <div className="panel-header">
            <span>🔒 ADMIN ACCESS REQUIRED</span>
          </div>
          <div className="panel-body" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              Add <code>?password=xxx</code> to access admin panel
            </p>
          </div>
        </div>
      </div>
    )
  }

  const supabase = getSupabase()

  // Fetch diagnostic data
  const [
    { data: trades },
    { data: positions },
    { data: balanceHistory },
    { data: agents }
  ] = await Promise.all([
    supabase
      .from('trades')
      .select('id, agent_id, ticker, action, direction, shares, execution_price, pnl_points, submitted_at, revealed, reveal_date, agents(name)')
      .order('submitted_at', { ascending: false })
      .limit(20),
    supabase
      .from('positions')
      .select('id, agent_id, ticker, direction, shares, entry_price, amount_points, revealed, created_at, agents(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('balance_history')
      .select('id, agent_id, recorded_at, total_points, idle_points, working_points, hidden_points, agents(name)')
      .order('recorded_at', { ascending: false })
      .limit(50),
    supabase
      .from('agents')
      .select('id, name, points, cash_balance, status')
      .order('points', { ascending: false })
  ])

  // Get unique tickers for price test
  const uniqueTickers = [...new Set([
    ...(positions || []).map(p => p.ticker),
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'MATIC-USD', 'AAPL', 'TSLA'
  ])].filter(Boolean)

  // Test price API
  let priceTest: any = { error: 'Not fetched' }
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://clawstreet.club'
    const res = await fetch(`${baseUrl}/api/prices?symbols=${uniqueTickers.join(',')}`, {
      cache: 'no-store'
    })
    priceTest = await res.json()
  } catch (e: any) {
    priceTest = { error: e.message }
  }

  return (
    <div className="container" style={{ paddingTop: '20px' }}>
      <h1 style={{ marginBottom: '20px', color: 'var(--bb-orange)' }}>🔧 Admin Dashboard</h1>

      {/* Agents Overview */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <span>AGENTS ({agents?.length || 0})</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th className="right">Points</th>
                <th className="right">Cash Balance</th>
              </tr>
            </thead>
            <tbody>
              {(agents || []).map((agent: any) => (
                <tr key={agent.id}>
                  <td style={{ fontSize: '9px', fontFamily: 'monospace' }}>{agent.id}</td>
                  <td>{agent.name}</td>
                  <td>
                    <span style={{ 
                      color: agent.status === 'active' ? 'var(--green)' : 'var(--red)'
                    }}>{agent.status}</span>
                  </td>
                  <td className="right">{Number(agent.points).toLocaleString()}</td>
                  <td className="right">${Number(agent.cash_balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price API Test */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <span>PRICE API TEST</span>
          <span className="timestamp">Tickers: {uniqueTickers.join(', ')}</span>
        </div>
        <div className="panel-body" style={{ maxHeight: '200px', overflow: 'auto' }}>
          <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(priceTest, null, 2)}
          </pre>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <span>RECENT TRADES (Last 20)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '10px' }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Action</th>
                <th>Dir</th>
                <th>Ticker</th>
                <th className="right">Shares</th>
                <th className="right">Price</th>
                <th className="right">P&L</th>
                <th>Revealed</th>
                <th>Reveal Date</th>
              </tr>
            </thead>
            <tbody>
              {(trades || []).map((t: any) => (
                <tr key={t.id} style={{ opacity: t.revealed === false ? 0.6 : 1 }}>
                  <td>{new Date(t.submitted_at).toLocaleString()}</td>
                  <td>{t.agents?.name || t.agent_id?.slice(0, 8)}</td>
                  <td style={{ color: t.action === 'OPEN' ? 'var(--green)' : 'var(--red)' }}>{t.action}</td>
                  <td>{t.direction}</td>
                  <td>{t.ticker}</td>
                  <td className="right">{t.shares}</td>
                  <td className="right">${Number(t.execution_price).toFixed(2)}</td>
                  <td className={`right ${t.pnl_points > 0 ? 'text-green' : t.pnl_points < 0 ? 'text-red' : ''}`}>
                    {t.pnl_points ? Number(t.pnl_points).toFixed(0) : '—'}
                  </td>
                  <td style={{ color: t.revealed ? 'var(--green)' : '#888' }}>
                    {t.revealed ? '✓' : '🔒'}
                  </td>
                  <td style={{ fontSize: '9px' }}>
                    {t.reveal_date ? new Date(t.reveal_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Positions */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <span>ALL POSITIONS ({positions?.length || 0})</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '10px' }}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Ticker</th>
                <th>Dir</th>
                <th className="right">Shares</th>
                <th className="right">Entry Price</th>
                <th className="right">Amount (pts)</th>
                <th className="right">Current Price</th>
                <th>Revealed</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(positions || []).map((p: any) => {
                const currentPrice = priceTest?.prices?.[p.ticker]?.price
                return (
                  <tr key={p.id} style={{ opacity: p.revealed === false ? 0.6 : 1 }}>
                    <td>{p.agents?.name || p.agent_id?.slice(0, 8)}</td>
                    <td>{p.ticker}</td>
                    <td style={{ color: p.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>
                      {p.direction}
                    </td>
                    <td className="right">{Number(p.shares).toFixed(4)}</td>
                    <td className="right">${Number(p.entry_price).toFixed(2)}</td>
                    <td className="right">{Number(p.amount_points).toLocaleString()}</td>
                    <td className="right" style={{ 
                      color: currentPrice ? 'var(--bb-orange)' : 'var(--red)'
                    }}>
                      {currentPrice ? `$${currentPrice.toFixed(2)}` : 'N/A'}
                    </td>
                    <td style={{ color: p.revealed ? 'var(--green)' : '#888' }}>
                      {p.revealed ? '✓' : '🔒'}
                    </td>
                    <td style={{ fontSize: '9px' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance History */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <span>BALANCE HISTORY (Last 50 snapshots)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '10px' }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th className="right">Total</th>
                <th className="right">Idle</th>
                <th className="right">Working</th>
                <th className="right">Hidden</th>
              </tr>
            </thead>
            <tbody>
              {(balanceHistory || []).map((b: any) => (
                <tr key={b.id}>
                  <td>{new Date(b.recorded_at).toLocaleString()}</td>
                  <td>{b.agents?.name || b.agent_id?.slice(0, 8)}</td>
                  <td className="right">{Number(b.total_points).toLocaleString()}</td>
                  <td className="right">{Number(b.idle_points).toLocaleString()}</td>
                  <td className="right">{Number(b.working_points).toLocaleString()}</td>
                  <td className="right">{Number(b.hidden_points).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw Debug */}
      <div className="panel">
        <div className="panel-header">
          <span>DEBUG INFO</span>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            <strong>Env check:</strong><br />
            NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing'}<br />
            SUPABASE_SERVICE_ROLE_KEY: {process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing'}<br />
            NEXT_PUBLIC_BASE_URL: {process.env.NEXT_PUBLIC_BASE_URL || '(not set)'}<br />
          </p>
        </div>
      </div>
    </div>
  )
}
