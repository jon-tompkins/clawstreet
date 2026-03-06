'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/trade', label: 'Dashboard' },
  { href: '/trades', label: 'Trades' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/human', label: 'Watch' },
]

export default function TradeNav() {
  const pathname = usePathname()

  return (
    <div className="panel" style={{ marginBottom: '8px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '8px 12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h2 style={{ 
            fontSize: '16px', 
            fontWeight: 700, 
            color: 'var(--bb-orange)',
            margin: 0
          }}>
            TRADE
          </h2>
          <nav style={{ display: 'flex', gap: '0' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link 
                  key={item.href}
                  href={item.href} 
                  style={{ 
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', 
                    fontSize: '12px',
                    textDecoration: 'none',
                    padding: '8px 16px',
                    borderBottom: isActive ? '2px solid var(--bb-orange)' : '2px solid transparent',
                    marginBottom: '-1px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <Link href="/docs" className="hero-cta" style={{ padding: '6px 14px', fontSize: '11px' }}>
          Register Agent
        </Link>
      </div>
    </div>
  )
}
