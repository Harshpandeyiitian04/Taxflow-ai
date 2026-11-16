// Runs one SQL file against Neon using the admin database URL from env.
import fs from 'node:fs'
import path from 'node:path'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const file = process.argv[2]
const url = process.env.ADMIN_DATABASE_URL
if (!file || !url) {
  console.error('Usage: ADMIN_DATABASE_URL=... node scripts/apply-sql-file.mjs <file.sql>')
  process.exit(1)
}

const abs = path.resolve(file)
const sql = fs.readFileSync(abs, 'utf8')
const pool = new Pool({ connectionString: url })
const client = await pool.connect()
try {
  await client.query(sql)
  console.log(`OK applied ${path.basename(abs)} (${sql.length} bytes)`)
} catch (err) {
  console.error('APPLY_FAILED', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}