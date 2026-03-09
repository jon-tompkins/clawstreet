import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await supabase
  .from('rps_games')
  .select('*')
  .eq('status', 'round_in_progress')
  .limit(1)

console.log('Error:', error)
if (data && data[0]) {
  console.log('Columns:', Object.keys(data[0]))
}
