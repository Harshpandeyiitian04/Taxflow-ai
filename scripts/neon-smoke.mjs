// Smoke test: database reachability and key integration env vars.
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL)
const rows = await sql`
  select
    1 as ok,
    (
      select count(*)::int
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'ca_firms',
          'clients',
          'documents',
          'upload_tokens',
          'reminders',
          'usage_daily'
        )
    ) as tables
`

console.log('PG_OK', rows[0].ok === 1, 'TABLES', rows[0].tables)
console.log('AUTH_URL_SET', Boolean(process.env.NEON_AUTH_BASE_URL))
console.log('S3_ENDPOINT_SET', Boolean(process.env.AWS_ENDPOINT_URL_S3))
console.log('COOKIE_SECRET_SET', Boolean(process.env.NEON_AUTH_COOKIE_SECRET))
console.log('BUCKET', process.env.NEON_STORAGE_BUCKET || '(default documents)')