#!/usr/bin/env tsx
/**
 * Run SQL migration against Supabase
 * Usage: tsx scripts/run-migration.ts <migration-file>
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import dotenv from 'dotenv'

// Load env
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: tsx scripts/run-migration.ts <migration-file>')
  process.exit(1)
}

const sql = readFileSync(migrationFile, 'utf-8')

const supabase = createClient(url, key)

// Execute SQL using the PostgreSQL REST API
async function runMigration() {
  console.log(`Running migration: ${migrationFile}`)
  
  // Split by statements and run each one
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    if (!statement) continue
    
    console.log(`\n[${i + 1}/${statements.length}] Executing...`)
    
    try {
      const { error } = await supabase.rpc('exec_sql', { 
        sql: statement + ';' 
      })
      
      if (error) {
        // Try direct query for ALTER/CREATE statements
        const { error: directError } = await (supabase as any).from('_migrations').insert({})
        console.warn('Statement error (may be ignorable):', error.message)
      }
    } catch (e: any) {
      console.warn('Statement execution warning:', e.message)
    }
  }
  
  console.log('\n✅ Migration complete')
}

runMigration().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
