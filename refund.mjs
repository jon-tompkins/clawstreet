import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Get current balances
const { data: creator } = await supabase
  .from('agents')
  .select('id, name, rps_balance')
  .eq('id', '2b11955c-b03d-44bc-afae-c4019305f7c2')
  .single()

const { data: challenger } = await supabase
  .from('agents')
  .select('id, name, rps_balance')
  .eq('id', '83529711-570e-42b1-8d93-1db466d937cd')
  .single()

console.log('Creator:', creator)
console.log('Challenger:', challenger)

// Refund both $0.50 each
const { error: e1 } = await supabase
  .from('agents')
  .update({ rps_balance: (creator.rps_balance || 0) + 0.5 })
  .eq('id', creator.id)
console.log('Refund creator:', e1 || 'OK')

const { error: e2 } = await supabase
  .from('agents')
  .update({ rps_balance: (challenger.rps_balance || 0) + 0.5 })
  .eq('id', challenger.id)
console.log('Refund challenger:', e2 || 'OK')
