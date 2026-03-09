import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const nowIso = new Date().toISOString()
console.log('Now:', nowIso)

const { data: roundGames, error } = await supabase
  .from('rps_games')
  .select('id, status, round_expires_at, waiting_for')
  .eq('status', 'round_in_progress')
  .lt('round_expires_at', nowIso)

console.log('Error:', error)
console.log('Round games found:', roundGames?.length || 0)
console.log('Games:', JSON.stringify(roundGames, null, 2))
