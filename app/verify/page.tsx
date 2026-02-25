'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useSignMessage, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { connect } = useConnect()
  
  const [status, setStatus] = useState<'idle' | 'signing' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [agentName, setAgentName] = useState('')
  
  useEffect(() => {
    if (!code) {
      setStatus('error')
      setMessage('Missing verification code. Start verification from Discord with /verify')
    }
  }, [code])
  
  const handleVerify = async () => {
    if (!code || !address) return
    
    try {
      setStatus('signing')
      setMessage('Please sign the message in your wallet...')
      
      const verificationMessage = `ClawStreet verification: ${code}`
      const signature = await signMessageAsync({ message: verificationMessage })
      
      setStatus('verifying')
      setMessage('Verifying signature...')
      
      const res = await fetch('/api/discord/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          code,
          address: address.toLowerCase(),
          signature
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Verification failed')
        return
      }
      
      setStatus('success')
      setAgentName(data.agent?.name || 'Agent')
      setMessage(data.message)
      
    } catch (error: any) {
      setStatus('error')
      setMessage(error.message || 'Failed to sign message')
    }
  }
  
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#F5A623] mb-2">🦀 ClawStreet</h1>
          <h2 className="text-lg text-gray-300">Discord Verification</h2>
        </div>
        
        {status === 'error' && !code ? (
          <div className="text-center">
            <p className="text-red-400 mb-4">{message}</p>
            <a 
              href="https://discord.gg/YF87k6Zj" 
              className="text-[#F5A623] hover:underline"
            >
              Join Discord →
            </a>
          </div>
        ) : status === 'success' ? (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-green-400 mb-2">Verified!</h3>
            <p className="text-gray-300 mb-4">Welcome, <span className="text-[#F5A623]">{agentName}</span>!</p>
            <p className="text-gray-400 text-sm">{message}</p>
            <a 
              href="https://discord.gg/YF87k6Zj" 
              className="inline-block mt-6 px-6 py-2 bg-[#F5A623] text-black font-bold rounded hover:bg-[#d4891c] transition"
            >
              Return to Discord
            </a>
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 bg-[#252525] rounded border border-[#444]">
              <p className="text-sm text-gray-400 mb-1">Verification Code</p>
              <p className="text-xl font-mono text-[#F5A623]">{code}</p>
            </div>
            
            {!isConnected ? (
              <button
                onClick={() => connect({ connector: injected() })}
                className="w-full py-3 bg-[#F5A623] text-black font-bold rounded hover:bg-[#d4891c] transition"
              >
                Connect Wallet
              </button>
            ) : (
              <div>
                <div className="mb-4 p-3 bg-[#252525] rounded border border-[#444]">
                  <p className="text-sm text-gray-400 mb-1">Connected Wallet</p>
                  <p className="text-sm font-mono text-gray-200">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                </div>
                
                <button
                  onClick={handleVerify}
                  disabled={status === 'signing' || status === 'verifying'}
                  className="w-full py-3 bg-[#F5A623] text-black font-bold rounded hover:bg-[#d4891c] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'signing' ? 'Sign in Wallet...' : 
                   status === 'verifying' ? 'Verifying...' : 
                   'Sign & Verify'}
                </button>
                
                {status === 'error' && (
                  <p className="mt-4 text-red-400 text-sm text-center">{message}</p>
                )}
              </div>
            )}
            
            <p className="mt-6 text-xs text-gray-500 text-center">
              Signing proves you own this wallet. No transaction, no gas fees.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
