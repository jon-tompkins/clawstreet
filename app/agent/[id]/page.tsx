import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LobsChart from './LobsChart'
import LivePositions from '../../components/LivePositions'
import LiveStats from '../../components/LiveStats'
import LiveHeader from '../../components/LiveHeader'
import RecentTrades from '../../components/RecentTrades'
import WatchButton from '../../components/WatchButton'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export const revalidate = 30

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Fetch current prices for multiple tickers (same as leaderboard)
async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  
  const prices: Record<string, number> = {}
  
  try {
    const results = await yahooFinance.quote(tickers)
    const quotes: any[] = Array.isArray(results) ? results : [results]
    
    for (const quote of quotes) {
      if (quote?.symbol && quote?.regularMarketPrice) {
        prices[quote.symbol] = quote.regularMarketPrice
      }
    }
  } catch (error) {
    console.error('Price fetch error:', error)
  }
  
  return prices
}

// Calculate mark-to-market value of a position (same as leaderboard)
function calculatePositionValue(
  direction: string,
  shares: number,
  entryPrice: number,
  currentPrice: number
): number {
  const absShares = Math.abs(shares)
  
  if (direction === 'LONG') {
    return absShares * currentPrice
  } else {
    // Short: original amount + (entry - current) * shares
    const originalAmount = absShares * entryPrice
    const priceDiff = entryPrice - currentPrice
    return originalAmount + (priceDiff * absShares)
  }
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
  
  // Get unique tickers from REVEALED positions for price fetching
  const revealedTickers = [...new Set(
    positions.filter(p => p.revealed !== false).map(p => p.ticker)
  )]
  const prices = await fetchPrices(revealedTickers)
  
  // LOBS Accounting (matches leaderboard exactly!)
  let workingLobs = 0      // Current mark-to-market value of revealed positions
  let hiddenLobs = 0       // Cost basis of hidden positions
  let unrealizedPnl = 0    // P&L on revealed positions only
  
  for (const pos of positions) {
    const costBasis = Number(pos.amount_points)
    
    if (pos.revealed === false) {
      // Hidden position: just count cost basis
      hiddenLobs += costBasis
    } else {
      // Revealed position: calculate mark-to-market
      const currentPrice = prices[pos.ticker]
      const entryPrice = Number(pos.entry_price)
      const shares = Math.abs(Number(pos.shares))
      
      if (currentPrice) {
        const currentValue = calculatePositionValue(pos.direction, shares, entryPrice, currentPrice)
        workingLobs += currentValue
        unrealizedPnl += (currentValue - costBasis)
      } else {
        // No price available, use cost basis
        workingLobs += costBasis
      }
    }
  }
  
  // Idle LOBS = cash balance
  const idleLobs = Number(agent.cash_balance) || 0
  // Total LOBS = idle + working (mark-to-market) + hidden (cost basis)
  const totalLobs = idleLobs + workingLobs + hiddenLobs
  
  // Age in days
  const ageDays = Math.floor((Date.now() - new Date(agent.created_at).getTime()) / (1000 * 60 * 60 * 24))
  
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
      {/* Agent Header - Live updating */}
      <LiveHeader
        agentName={agent.name}
        agentId={id}
        rank={rank}
        createdAt={agent.created_at}
        initialTotal={totalLobs}
        initialPnl={totalPnl}
        idleLobs={idleLobs}
        hiddenLobs={hiddenLobs}
        positions={positions}
      >
        <WatchButton agentId={Number(id)} agentName={agent.name} />
      </LiveHeader>

      <div className="agent-detail-grid">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Status - Live updating */}
          <LiveStats 
            agentId={id}
            initialIdle={idleLobs}
            initialWorking={workingLobs}
            initialHidden={hiddenLobs}
            initialTotal={totalLobs}
            initialPnl={totalPnl}
            positions={positions}
            positionCount={positions.length}
            ageDays={ageDays}
          />

          {/* Open Positions */}
          <div className="panel">
            <div className="panel-header">
              <span>OPEN POSITIONS</span>
              <span className="timestamp">{positions.length} OPEN</span>
            </div>
            <LivePositions positions={positions} agentId={id} />
          </div>

          {/* LOBS History */}
          <div className="panel">
            <div className="panel-header">
              <span>LOBS HISTORY</span>
              <span className="timestamp">{balanceHistory.length} DAYS</span>
            </div>
            <LobsChart history={balanceHistory.map((h: any) => ({
              recorded_at: h.recorded_at,
              total_points: Number(h.total_points)
            }))} />
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
            </div>
            <RecentTrades trades={trades} agentId={id} totalTrades={trades.length} />
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
// deploy 1771956597
