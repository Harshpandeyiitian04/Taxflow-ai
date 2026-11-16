import 'server-only'

import { neon, neonConfig, Pool } from '@neondatabase/serverless'
import ws from 'ws'
import { jwtClaimsForUser } from '@/lib/db/identity'

// Database connections and transactions for the app and admin tools.

neonConfig.webSocketConstructor = ws

// Picks the app database URL from environment settings.
function appDatabaseUrl(): string {
  const appUrl = process.env.DATABASE_URL_APP
  if (appUrl) return appUrl

  if (process.env.TAXFLOW_RLS_ENFORCED === '1') {
    throw new Error(
      'TAXFLOW_RLS_ENFORCED=1 requires DATABASE_URL_APP (taxflow_app role)'
    )
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }
  return url
}

// Picks the admin database URL from environment settings.
function adminDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL_ADMIN ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL
  if (!url) {
    throw new Error('No admin database URL configured')
  }
  return url
}

// Returns the pooled SQL client used by normal app requests.
export function sql() {
  return neon(appDatabaseUrl(), { fullResults: false })
}

// Returns the SQL client reserved for migrations and admin tasks.
export function adminSql() {
  return neon(adminDatabaseUrl(), { fullResults: false })
}

export type SqlQuery = ReturnType<typeof sql>
export type SqlRow = Record<string, unknown>

// Runs database work as a specific logged-in user for row-level security.
export async function withUser(
  userId: string,
  build: (query: SqlQuery) => ReturnType<SqlQuery>[]
): Promise<SqlRow[][]> {
  const claims = jwtClaimsForUser(userId)
  const query = sql()
  const results = await query.transaction((txn) => [
    txn`select set_config('request.jwt.claims', ${claims}, true)`,
    txn`select set_config('request.jwt.claim.sub', ${userId}, true)`,
    ...build(txn as unknown as SqlQuery),
  ])
  return (results as unknown as SqlRow[][]).slice(2)
}

// Runs privileged database work that bypasses normal tenant restrictions.
export async function withAdmin(
  build: (query: SqlQuery) => ReturnType<SqlQuery>[]
): Promise<SqlRow[][]> {
  const query = adminSql()
  const results = await query.transaction((txn) => [
    txn`select set_config('app.admin', '1', true)`,
    ...build(txn as unknown as SqlQuery),
  ])
  return (results as unknown as SqlRow[][]).slice(1)
}

// Calls the database function that consumes one AI extraction quota.
export async function queryRpcBoolean(
  query: SqlQuery,
  fnName: 'consume_extraction',
  args: { p_firm: string; p_limit: number }
): Promise<boolean> {
  void fnName
  const rows = await query`
    select public.consume_extraction(${args.p_firm}::uuid, ${args.p_limit}::int) as ok
  `
  return Boolean((rows[0] as { ok?: boolean } | undefined)?.ok)
}

// Claims an upload link slot and returns the client and firm ids.
export async function queryClaimUploadSlot(
  query: SqlQuery,
  token: string,
  maxUses: number
): Promise<{ client_id: string; ca_firm_id: string } | null> {
  const rows = await query`
    select client_id::text, ca_firm_id::text
    from public.claim_upload_slot(${token}, ${maxUses}::int)
  `
  const row = rows[0] as { client_id?: string; ca_firm_id?: string } | undefined
  if (!row?.client_id || !row?.ca_firm_id) return null
  return { client_id: row.client_id, ca_firm_id: row.ca_firm_id }
}

export type UploadSlot = { client_id: string; ca_firm_id: string }

type PgClient = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

// Runs work inside a transaction after a valid client upload token is claimed.
export async function withUploadTokenSession<T>(
  token: string,
  maxUses: number,
  work: (client: PgClient, slot: UploadSlot) => Promise<T>
): Promise<
  | { ok: true; slot: UploadSlot; value: T }
  | { ok: false; reason: 'invalid' | 'error'; message?: string }
> {
  const pool = new Pool({ connectionString: appDatabaseUrl() })
  const client = await pool.connect()
  try {
    await client.query('begin')
    const claimed = await client.query(
      `select client_id::text as client_id, ca_firm_id::text as ca_firm_id
         from public.claim_upload_slot($1, $2)`,
      [token, maxUses]
    )
    const row = claimed.rows[0] as
      | { client_id?: string; ca_firm_id?: string }
      | undefined
    if (!row?.client_id || !row?.ca_firm_id) {
      await client.query('rollback')
      return { ok: false, reason: 'invalid' }
    }
    const slot = { client_id: row.client_id, ca_firm_id: row.ca_firm_id }
    const value = await work(client, slot)
    await client.query('commit')
    return { ok: true, slot, value }
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
    }
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'unknown',
    }
  } finally {
    client.release()
    await pool.end()
  }
}