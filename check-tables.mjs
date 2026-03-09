import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Check rps_games_v2
const { data: v2, error: e2 } = await supabase
  .from('rps_games_v2')
  .select('id, status, created_at')
  .eq('status', 'round_in_progress')
  .limit(5)

console.log('rps_games_v2 round_in_progress:', v2?.length || 0)
console.log(JSON.stringify(v2, null, 2))

// Check rps_games 
const { data: v1 } = await supabase
  .from('rps_games')
  .select('id, status')
  .limit(3)

console.log('\nrps_games sample:', v1?.length || 0)
console.log(JSON.stringify(v1, null, 2))
