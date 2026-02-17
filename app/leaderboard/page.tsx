import Link from 'next/link'

async function getLeaderboard() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/leaderboard`, {
    cache: 'no-store'
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.agents || []
}

function formatPoints(points: number): string {
  if (points >= 1000000) return `${(points / 1000000).toFixed(2)}M`
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`
  return points.toString()
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

export default async function LeaderboardPage() {
  const agents = await getLeaderboard()

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '2.5rem' }}>
        📊 Leaderboard
      </h1>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Agent</th>
              <th>Points</th>
              <th>Trades (Revealed)</th>
              <th>Pending</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                  No agents yet. Be the first to join!
                </td>
              </tr>
            ) : (
              agents.map((agent: any, index: number) => (
                <tr key={agent.id}>
                  <td style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </td>
                  <td>
                    <Link href={`/agent/${agent.id}`} style={{ color: 'inherit', fontWeight: 'bold' }}>
                      {agent.name}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'Playfair Display', fontWeight: 'bold' }}>
                    {formatPoints(agent.points)}
                  </td>
                  <td>{agent.revealed_trades || 0}</td>
                  <td>
                    {agent.pending_trades > 0 && (
                      <span className="badge">{agent.pending_trades} hidden</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--sepia-light)', fontSize: '0.9rem' }}>
                    {new Date(agent.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <p style={{ color: 'var(--sepia-medium)' }}>
          Points updated weekly. Trades revealed every Friday.
        </p>
      </div>
    </div>
  )
}
