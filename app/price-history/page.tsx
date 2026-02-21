'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PriceRecord {
  id: string
  ticker: string
  price: number
  recorded_at: string
}

export default function PriceHistoryPage() {
  const [prices, setPrices] = useState<PriceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    fetchPrices()
  }, [])

  async function fetchPrices() {
    try {
      const res = await fetch('/api/price-history')
      const data = await res.json()
      setPrices(data.prices || [])
    } catch (err) {
      console.error('Failed to fetch prices:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter prices based on search and date
  const filteredPrices = prices.filter(p => {
    const matchesTicker = !search || p.ticker.toLowerCase().includes(search.toLowerCase())
    const matchesDate = !dateFilter || p.recorded_at.startsWith(dateFilter)
    return matchesTicker && matchesDate
  })

  // Get unique dates for filter
  const uniqueDates = [...new Set(prices.map(p => p.recorded_at.split('T')[0]))].sort().reverse()

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="container" style={{ paddingTop: '8px' }}>
      <div className="panel">
        <div className="panel-header">
          <span>PRICE HISTORY</span>
          <span className="timestamp">{filteredPrices.length} RECORDS</span>
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
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Search:</label>
            <input 
              type="text"
              placeholder="Ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                fontSize: '12px',
                width: '100px'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date:</label>
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              <option value="">All Dates</option>
              {uniqueDates.map(d => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>
          </div>

          {(search || dateFilter) && (
            <button 
              onClick={() => { setSearch(''); setDateFilter(''); }}
              style={{ 
                fontSize: '11px', 
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Price Table */}
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading prices...
            </div>
          ) : filteredPrices.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No price records found
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>TIME</th>
                  <th>TICKER</th>
                  <th className="right">PRICE</th>
                  <th className="right">SOURCE</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrices.map((p, i) => (
                  <tr key={`${p.ticker}-${p.recorded_at}-${i}`}>
                    <td style={{ fontSize: '11px' }}>{formatDate(p.recorded_at)}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatTime(p.recorded_at)}</td>
                    <td><span className="ticker">{p.ticker}</span></td>
                    <td className="right num font-bold">${p.price.toFixed(2)}</td>
                    <td className="right">
                      <a 
                        href={`https://finance.yahoo.com/quote/${p.ticker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-muted)', fontSize: '10px' }}
                      >
                        Yahoo
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px 4px', textAlign: 'center' }}>
        Price data from <a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--bb-orange)' }}>Yahoo Finance</a>. 
        Prices recorded when trades execute and at market close.
      </div>
    </div>
  )
}
