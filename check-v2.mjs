import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data } = await supabase
  .from('rps_games_v2')
  .select('*')
  .eq('id', '34c572f6-f31d-4a20-a9f9-06fcaca10747')
  .single()

console.log('Columns:', Object.keys(data || {}))
console.log(JSON.stringify(data, null, 2))
