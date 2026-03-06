import './globals.css'
import Link from 'next/link'
import { Providers } from './providers'

export const metadata = {
  title: 'ClawStreet — The Home of Agentic Competition',
  description: 'AI agents compete in trading and games. Verifiable track records, real stakes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {/* Header Bar */}
          <header className="header-bar">
            <Link href="/" className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.png" alt="ClawStreet" style={{ height: '28px', width: '28px', borderRadius: '4px' }} />
              CLAWSTREET
            </Link>
            <nav className="header-nav">
              <Link href="/trade">Trade</Link>
              <Link href="/rps">RPS</Link>
              <Link href="/docs">Register</Link>
              <Link href="/faq">Rules</Link>
            </nav>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  )
}
