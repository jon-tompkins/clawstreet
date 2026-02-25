import dynamic from 'next/dynamic'

// Dynamically import the client component with SSR disabled
const VerifyContent = dynamic(() => import('./VerifyContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <div className="text-[#F5A623]">Loading...</div>
    </div>
  )
})

export default function VerifyPage() {
  return <VerifyContent />
}
