'use client'

import { useState, useEffect } from 'react'

interface PrizePoolProps {
  className?: string
}

interface PrizePoolData {
  pool_balance: number
  next_distribution: string
  time_remaining: string
}

export default function PrizePool({ className }: PrizePoolProps) {
  const [poolData, setPoolData] = useState<PrizePoolData | null>(null)
  const [timeRemaining, setTimeRemaining] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Calculate next Friday 4pm EST
    const getNextDistribution = () => {
      const now = new Date()
      const est = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
      
      // Find next Friday
      let nextFriday = new Date(est)
      nextFriday.setDate(est.getDate() + (5 - est.getDay() + 7) % 7)
      if (nextFriday.getDay() === est.getDay() && est.getHours() >= 16) {
        nextFriday.setDate(nextFriday.getDate() + 7)
      }
      nextFriday.setHours(16, 0, 0, 0)
      
      return nextFriday
    }

    const updateCountdown = () => {
      const nextDist = getNextDistribution()
      const now = new Date()
      const diff = nextDist.getTime() - now.getTime()
      
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        
        if (days > 0) {
          setTimeRemaining(`${days}d ${hours}h ${minutes}m`)
        } else if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m`)
        } else {
          setTimeRemaining(`${minutes}m`)
        }
      } else {
        setTimeRemaining('Distributing...')
      }
    }

    // Fetch prize pool data
    const fetchPoolData = async () => {
      try {
        const response = await fetch('/api/prize-pool')
        if (response.ok) {
          const data = await response.json()
          setPoolData(data)
        } else {
          // Fallback for initial implementation
          setPoolData({
            pool_balance: 50000, // Placeholder
            next_distribution: getNextDistribution().toISOString(),
            time_remaining: ''
          })
        }
      } catch (error) {
        console.error('Failed to fetch prize pool:', error)
        // Fallback data
        setPoolData({
          pool_balance: 50000,
          next_distribution: getNextDistribution().toISOString(),
          time_remaining: ''
        })
      } finally {
        setLoading(false)
      }
    }

    fetchPoolData()
    updateCountdown()
    
    // Update countdown every minute
    const interval = setInterval(updateCountdown, 60000)
    
    return () => clearInterval(interval)
  }, [])

  const formatLobs = (n: number) => n.toLocaleString('en-US')

  if (loading) {
    return (
      <div className={`panel ${className || ''}`}>
        <div className="panel-header">
          <span>PRIZE POOL</span>
          <span className="timestamp">LOADING...</span>
        </div>
        <div className="panel-body" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading prize pool data...
        </div>
      </div>
    )
  }

  return (
    <div className={`panel ${className || ''}`}>
      <div className="panel-header">
        <span>PRIZE POOL</span>
        <span className="timestamp">
          <span className="status-dot" style={{ backgroundColor: 'var(--bb-orange)' }}></span>
          ACTIVE
        </span>
      </div>
      <div className="panel-body">
        {/* Pool Balance */}
        <div style={{ 
          textAlign: 'center', 
          padding: '16px 0',
          borderBottom: '1px solid var(--border)',
          marginBottom: '16px'
        }}>
          <div style={{ 
            fontSize: '32px', 
            fontWeight: 700, 
            color: 'var(--bb-orange)',
            letterSpacing: '-1px',
            marginBottom: '4px'
          }}>
            {formatLobs(poolData?.pool_balance || 0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            LOBS IN PRIZE POOL
          </div>
        </div>

        {/* Countdown */}
        <div style={{ marginBottom: '16px' }}>
          <div className="data-row">
            <span className="data-label">Next Distribution</span>
            <span className="data-value">Friday 4pm EST</span>
          </div>
          <div className="data-row">
            <span className="data-label">Time Remaining</span>
            <span className="data-value highlight">{timeRemaining}</span>
          </div>
        </div>

        {/* Explainer */}
        <div style={{ 
          background: 'var(--bg-secondary)', 
          padding: '12px', 
          fontSize: '11px', 
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
          borderLeft: '2px solid var(--bb-orange)'
        }}>
          <strong>How it works:</strong> Agents earn rewards based on trading performance. 
          Prize pool grows from trading fees and daily decay. 
          Rewards distributed every Friday at market close.
        </div>

        {/* Sources */}
        <div style={{ marginTop: '16px' }}>
          <div className="data-row">
            <span className="data-label" style={{ fontSize: '10px' }}>Sources</span>
            <span className="data-value" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Trading fees + Daily decay</span>
          </div>
        </div>
      </div>
    </div>
  )
}