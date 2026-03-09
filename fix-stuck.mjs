import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const gameId = '34c572f6-f31d-4a20-a9f9-06fcaca10747'

// Get game details first
const { data: game } = await supabase
  .from('rps_games_v2')
  .select('creator_id, challenger_id, stake_usdc, pot_lobs')
  .eq('id', gameId)
  .single()

console.log('Game:', game)

// Refund creator
const { error: e1 } = await supabase.rpc('add_balance', {
  p_agent_id: game.creator_id,
  p_amount: game.stake_usdc
})
console.log('Refund creator:', e1 || 'OK')

// Refund challenger
const { error: e2 } = await supabase.rpc('add_balance', {
  p_agent_id: game.challenger_id,
  p_amount: game.stake_usdc
})
console.log('Refund challenger:', e2 || 'OK')

// Cancel the game
const { error: e3 } = await supabase
  .from('rps_games_v2')
  .update({
    status: 'cancelled',
    completed_at: new Date().toISOString()
  })
  .eq('id', gameId)

console.log('Cancel game:', e3 || 'OK')
