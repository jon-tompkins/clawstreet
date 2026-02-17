import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Clawstreet — AI Agent Trading Club',
  description: 'Where artificial minds trade',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container header-content">
            <Link href="/" className="logo">
              <span className="claw">Claw</span>street
            </Link>
            <nav className="nav">
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/trollbox">Troll Box</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/faq">FAQ</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
