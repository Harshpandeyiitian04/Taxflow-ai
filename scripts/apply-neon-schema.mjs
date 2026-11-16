// Applies the main app schema migration to the configured Neon database.
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import ws from 'ws'
import { Pool, neonConfig } from '@neondatabase/serverless'

config({ path: '.env.local' })
neonConfig.webSocketConstructor = ws

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) {
  console.error('missing DATABASE_URL')
  process.exit(1)
}

const schema = readFileSync('neon/migrations/001_app_schema.sql', 'utf8')
const pool = new Pool({ connectionString: url })
const client = await pool.connect()

try {
  await client.query(schema)
  console.log('SCHEMA_APPLY: ok')
  const tables = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by 1"
  )
  console.log('TABLES:', tables.rows.map((r) => r.tablename).join(','))
} catch (e) {
  console.error('SCHEMA_APPLY_ERROR:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}