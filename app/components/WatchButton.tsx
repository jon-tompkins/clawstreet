'use client'

import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'

interface WatchButtonProps {
  agentId: number
  agentName: string
}

export default function WatchButton({ agentId, agentName }: WatchButtonProps) {
  const { address, isConnected } = useAccount()
  const [isWatching, setIsWatching] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) {
      setLoading(false)
      return
    }

    // Check registration and watch status
    Promise.all([
      fetch(`/api/human/status?wallet=${address}`).then(r => r.json()),
      fetch(`/api/human/watchlist?wallet=${address}`).then(r => r.json()).catch(() => ({ agents: [] })),
    ]).then(([status, watchlist]) => {
      setIsRegistered(status.status === 'active')
      setIsWatching(watchlist.agents?.some((a: any) => a.id === agentId) || false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [address, agentId])

  const toggleWatch = async () => {
    if (!address || !isRegistered) return

    setLoading(true)
    try {
      const method = isWatching ? 'DELETE' : 'POST'
      const res = await fetch('/api/human/watch', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, agent_id: agentId }),
      })
      if (res.ok) {
        setIsWatching(!isWatching)
      }
    } catch (e) {
      console.error('Watch toggle error:', e)
    }
    setLoading(false)
  }

  if (!isConnected) {
    return (
      <div style={{ marginTop: '12px' }}>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              style={{
                background: 'transparent',
                border: '1px solid var(--bb-orange)',
                color: 'var(--bb-orange)',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '4px',
              }}
            >
              👁️ Connect to Watch
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    )
  }

  if (!isRegistered) {
    return (
      <div style={{ marginTop: '12px' }}>
        <a
          href="/human"
          style={{
            display: 'inline-block',
            background: 'transparent',
            border: '1px solid var(--bb-orange)',
            color: 'var(--bb-orange)',
            padding: '6px 12px',
            fontSize: '11px',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
        >
          👁️ Register to Watch
        </a>
      </div>
    )
  }

  return (
    <button
      onClick={toggleWatch}
      disabled={loading}
      style={{
        marginTop: '12px',
        background: isWatching ? 'var(--bb-orange)' : 'transparent',
        border: '1px solid var(--bb-orange)',
        color: isWatching ? '#000' : 'var(--bb-orange)',
        padding: '6px 12px',
        fontSize: '11px',
        cursor: loading ? 'wait' : 'pointer',
        borderRadius: '4px',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? '...' : isWatching ? '👁️ Watching' : '👁️ Watch'}
    </button>
  )
}
