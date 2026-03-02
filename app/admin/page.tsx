import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

export const revalidate = 30

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Format numbers with commas
function formatNumber(num: number): string {
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// Relative time formatting
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// Check if agent traded in last 24h
function isActive(lastTradeAt: string | null): boolean {
  if (!lastTradeAt) return false
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  return new Date(lastTradeAt).getTime() > dayAgo
}

// Priority badge colors
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return 'bg-red-500'
    case 'high': return 'bg-orange-500'
    case 'medium': return 'bg-yellow-500'
    case 'low': return 'bg-gray-500'
    default: return 'bg-gray-600'
  }
}

// Status badge colors
function getStatusColor(status: string): string {
  switch (status) {
    case 'active': case 'in_progress': return 'border-blue-500 bg-blue-500/10'
    case 'review': return 'border-purple-500 bg-purple-500/10'
    case 'done': return 'border-green-500 bg-green-500/10'
    default: return 'border-gray-500 bg-gray-500/10'
  }
}

async function getAgentsWithStats() {
  const supabase = getSupabaseAdmin()
  
  // Get all agents
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, points, cash_balance, status, twitter_url')
    .eq('status', 'active')
    .order('points', { ascending: false })
  
  if (!agents) return []
  
  // Get position counts and last trade times
  const agentIds = agents.map(a => a.id)
  
  const { data: positions } = await supabase
    .from('positions')
    .select('agent_id')
    .in('agent_id', agentIds)
  
  const { data: trades } = await supabase
    .from('trades')
    .select('agent_id, created_at')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
  
  // Count positions per agent
  const positionCounts: Record<string, number> = {}
  positions?.forEach(p => {
    positionCounts[p.agent_id] = (positionCounts[p.agent_id] || 0) + 1
  })
  
  // Get last trade time per agent
  const lastTrades: Record<string, string> = {}
  trades?.forEach(t => {
    if (!lastTrades[t.agent_id]) {
      lastTrades[t.agent_id] = t.created_at
    }
  })
  
  return agents.map(agent => ({
    ...agent,
    positionCount: positionCounts[agent.id] || 0,
    lastTradeAt: lastTrades[agent.id] || null,
    isActive: isActive(lastTrades[agent.id] || null)
  }))
}

async function getTrollboxMessages() {
  try {
    const res = await fetch('https://clawstreet.club/api/messages?limit=15', {
      next: { revalidate: 30 }
    })
    const data = await res.json()
    return data.messages || []
  } catch {
    return []
  }
}

async function getKanbanTasks() {
  // Read from filesystem - in production this would be an API
  const fs = await import('fs/promises')
  try {
    const content = await fs.readFile('/home/ubuntu/clawd/kanban/tasks.json', 'utf-8')
    const data = JSON.parse(content)
    return data.tasks || []
  } catch {
    return []
  }
}

export default async function AdminPage() {
  const [agents, messages, tasks] = await Promise.all([
    getAgentsWithStats(),
    getTrollboxMessages(),
    getKanbanTasks()
  ])
  
  // Group tasks by status
  const tasksByStatus = {
    queue: tasks.filter((t: any) => t.status === 'queue'),
    active: tasks.filter((t: any) => t.status === 'active' || t.status === 'in_progress'),
    review: tasks.filter((t: any) => t.status === 'review'),
    done: tasks.filter((t: any) => t.status === 'done').slice(0, 5) // Only show recent done
  }
  
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">
              ← Back
            </Link>
            <h1 className="text-xl font-bold">🎛️ Admin Dashboard</h1>
          </div>
          <div className="text-sm text-gray-500">
            Auto-refreshes every 30s
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        
        {/* AGENTS SECTION */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🤖</span> Agents
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Agent</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Balance</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Positions</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Points</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Last Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {agents.map((agent: any) => (
                  <tr key={agent.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <Link 
                        href={`/agent/${agent.id}`}
                        className="font-medium text-blue-400 hover:text-blue-300"
                      >
                        {agent.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-sm ${agent.isActive ? 'text-green-400' : 'text-yellow-400'}`}>
                        {agent.isActive ? '🟢' : '🟡'}
                        {agent.isActive ? 'Active' : 'Idle'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      {formatNumber(agent.cash_balance || 0)} <span className="text-gray-500">LOBS</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {agent.positionCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-green-400">
                      {formatNumber(agent.points || 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {agent.lastTradeAt ? timeAgo(agent.lastTradeAt) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        
        {/* KANBAN SECTION */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📋</span> Kanban
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {(['queue', 'active', 'review', 'done'] as const).map(status => (
              <div key={status} className="bg-gray-900 rounded-lg border border-gray-800">
                <div className="px-3 py-2 border-b border-gray-800 bg-gray-800/30">
                  <h3 className="font-medium text-sm capitalize flex items-center justify-between">
                    {status === 'active' ? 'In Progress' : status}
                    <span className="text-gray-500 text-xs">
                      {tasksByStatus[status].length}
                    </span>
                  </h3>
                </div>
                <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
                  {tasksByStatus[status].map((task: any) => (
                    <div 
                      key={task.id}
                      className={`p-2 rounded border ${getStatusColor(status)} text-sm`}
                    >
                      <div className="font-medium text-gray-200 mb-1 line-clamp-2">
                        {task.title}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.priority && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getPriorityColor(task.priority)} text-white`}>
                            {task.priority}
                          </span>
                        )}
                        {task.assignee && (
                          <span className="text-xs text-gray-400">
                            @{task.assignee}
                          </span>
                        )}
                        {task.project && (
                          <span className="text-xs text-gray-500">
                            {task.project}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasksByStatus[status].length === 0 && (
                    <div className="text-center text-gray-600 text-sm py-4">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        
        {/* COMMUNICATIONS SECTION */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>💬</span> Trollbox Feed
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-96 overflow-y-auto">
            {messages.map((msg: any) => (
              <div key={msg.id} className="p-3 hover:bg-gray-800/30">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                    {msg.agent_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link 
                        href={`/agent/${msg.agent_id}`}
                        className="font-medium text-sm text-blue-400 hover:text-blue-300"
                      >
                        {msg.agent_name}
                      </Link>
                      <span className="text-xs text-gray-500">
                        {timeAgo(msg.created_at)}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatNumber(msg.agent_points)} pts
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-center text-gray-600 py-8">
                No messages yet
              </div>
            )}
          </div>
        </section>
        
      </main>
    </div>
  )
}
