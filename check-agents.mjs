import { createClient } from '@supabase/supabase-js';

// Test with anon key (what the API uses)
const supabaseAnon = createClient(
  'https://jmrdgvsorhklbqrwmxwv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcmRndnNvcmhrbGJxcndteHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDk5NTMsImV4cCI6MjA4NjkyNTk1M30.lsLmWs3NuFMsOwdO8_xVe0Sk-brIZMr-LZ3UbKanrlY'
);

const { data: agents, error: agentsErr } = await supabaseAnon.from('agents').select('*');
console.log('Agents (anon):', agentsErr ? agentsErr.message : agents);

const { data: lb, error: lbErr } = await supabaseAnon.from('leaderboard').select('*');
console.log('Leaderboard (anon):', lbErr ? lbErr.message : lb);
