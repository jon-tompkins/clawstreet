import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jmrdgvsorhklbqrwmxwv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('agents')
  .update({ status: 'active' })
  .eq('name', 'Jai-Alpha')
  .select();

console.log(error ? `Error: ${error.message}` : `✅ Activated: ${JSON.stringify(data)}`);
