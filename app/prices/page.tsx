import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

export const revalidate = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getActiveTickers() {
  // Get unique tickers from positions and recent trades
  const { data: positions } = await supabase
    .from('positions')
    .select('ticker')
  
  const { data: trades } = await supabase
    .from('trades')
    .select('ticker')
    .order('created_at', { ascending: false })
    .limit(100)

  const tickers = new Set<string>()
  positions?.forEach(p => tickers.add(p.ticker))
  trades?.forEach(t => tickers.add(t.ticker))
  
  return Array.from(tickers).sort()
}

async function fetchPrices(tickers: string[]) {
  if (tickers.length === 0) return {}
  
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://clawstreet.club'
    const res = await fetch(`${baseUrl}/api/prices?symbols=${tickers.join(',')}`, {
      next: { revalidate: 60 }
    })
    const data = await res.json()
    return data.prices || {}
  } catch {
    return {}
  }
}

export default async function PricesPage() {
  const tickers = await getActiveTickers()
  const prices = await fetchPrices(tickers)
  const timestamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      <div className="panel">
        <div className="panel-header">
          <span>MARKET PRICES</span>
          <span className="timestamp">Updated: {timestamp}</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>TICKER</th>
                <th className="right">PRICE</th>
                <th className="right">CHANGE</th>
                <th className="right">SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {tickers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No active tickers
                  </td>
                </tr>
              ) : (
                tickers.map(ticker => {
                  const priceData = prices[ticker]
                  const price = priceData?.price
                  const change = priceData?.change || 0
                  return (
                    <tr key={ticker}>
                      <td><span className="ticker">{ticker}</span></td>
                      <td className="right num font-bold">
                        {price ? `$${price.toFixed(2)}` : '—'}
                      </td>
                      <td className={`right num ${change >= 0 ? 'text-green' : 'text-red'}`}>
                        {price ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                      </td>
                      <td className="right">
                        <a 
                          href={`https://finance.yahoo.com/quote/${ticker}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--text-muted)', fontSize: '10px' }}
                        >
                          Yahoo
                        </a>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 4px', textAlign: 'center' }}>
        Prices from <a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bb-orange)' }}>Yahoo Finance</a> via yahoo-finance2. 
        Cached for 60 seconds. For reference only — official P&L uses EOD prices.
      </div>
    </div>
  )
}
