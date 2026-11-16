import 'server-only'

import { randomBytes } from 'node:crypto'
import { auth } from '@/lib/auth/server'
import { sql } from '@/lib/db/sql'
import type { CAFirm, Client, Document } from '@/types'

const FIRM_COLUMNS =
  'id, user_id, email, firm_name, owner_name, phone, city, referral_code, created_at, updated_at'

// Rows are read as JSON (`to_jsonb`) so timestamps come back as ISO strings and
// numeric/bigint columns as numbers — the same shapes the UI already expects.
type JsonRow<T> = { row: T }
type JsonRowWithTotal<T> = JsonRow<T> & { total: number | string }

function unwrap<T>(rows: unknown[]): T[] {
  return (rows as JsonRow<T>[]).map(r => r.row)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Guard for route params before they hit a `::uuid` cast (which would throw). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown'
}

// ─── Firm helpers ────────────────────────────────────────────

/** Resolve the CA firm for the signed-in user (or for an already-known user id). */
export async function getCurrentFirm(userId?: string): Promise<CAFirm | null> {
  try {
    let id = userId
    if (!id) {
      const { data: session } = await auth.getSession()
      id = session?.user?.id
    }
    if (!id) return null

    const rows = await sql().query(
      `select to_jsonb(f) as row
         from (select ${FIRM_COLUMNS} from public.ca_firms where user_id = $1::uuid) as f`,
      [id]
    )
    return unwrap<CAFirm>(rows)[0] ?? null
  } catch (err) {
    console.error('getCurrentFirm error:', errorMessage(err))
    return null
  }
}

export async function updateFirm(
  firmId: string,
  userId: string,
  updates: Partial<Pick<CAFirm, 'firm_name' | 'owner_name' | 'phone' | 'city'>>
): Promise<boolean> {
  const allowed = ['firm_name', 'owner_name', 'phone', 'city'] as const
  const sets: string[] = []
  const values: unknown[] = []
  for (const key of allowed) {
    if (key in updates) {
      values.push(updates[key] ?? null)
      sets.push(`${key} = $${values.length}`)
    }
  }
  if (sets.length === 0) return true

  try {
    values.push(firmId, userId)
    await sql().query(
      `update public.ca_firms
          set ${sets.join(', ')}
        where id = $${values.length - 1}::uuid
          and user_id = $${values.length}::uuid`,
      values
    )
    return true
  } catch (err) {
    console.error('updateFirm error:', errorMessage(err))
    return false
  }
}

/** Update profile fields and return the refreshed firm row (null if not found). */
export async function updateFirmProfile(
  firmId: string,
  userId: string,
  profile: {
    firm_name: string | null
    owner_name: string | null
    phone: string | null
    city: string | null
  }
): Promise<CAFirm | null> {
  const rows = await sql().query(
    `with updated as (
       update public.ca_firms
          set firm_name = $1, owner_name = $2, phone = $3, city = $4
        where id = $5::uuid
          and user_id = $6::uuid
      returning ${FIRM_COLUMNS}
     )
     select to_jsonb(updated) as row from updated`,
    [
      profile.firm_name,
      profile.owner_name,
      profile.phone,
      profile.city,
      firmId,
      userId,
    ]
  )
  return unwrap<CAFirm>(rows)[0] ?? null
}

/** Stats-only counter via atomic RPC — never used for gating. */
export async function incrementExtractionCount(firmId: string): Promise<void> {
  try {
    await sql()`select public.increment_extractions_used(${firmId}::uuid)`
  } catch (err) {
    console.error('incrementExtractionCount error:', errorMessage(err))
  }
}

// ─── Client helpers ──────────────────────────────────────────

export async function getClients(firmId: string): Promise<Client[]> {
  try {
    const rows = await sql()`
      select to_jsonb(c) as row
        from public.clients c
       where c.ca_firm_id = ${firmId}::uuid
       order by c.created_at desc
       limit 500
    `
    return unwrap<Client>(rows)
  } catch (err) {
    console.error('getClients error:', errorMessage(err))
    return []
  }
}

export type ClientListDocument = {
  id: string
  type: string
  extraction_status: string
  created_at: string
}

export type ClientWithListDocuments = Client & { documents: ClientListDocument[] }

/** Dashboard list: clients plus light document summaries (no extracted_data). */
export async function getClientsWithDocuments(
  firmId: string,
  limit = 500
): Promise<{ clients: ClientWithListDocuments[]; total: number }> {
  const rows = await sql()`
    select
      to_jsonb(c) || jsonb_build_object(
        'documents',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', d.id,
              'type', d.type,
              'extraction_status', d.extraction_status,
              'created_at', d.created_at
            )
            order by d.created_at desc
          )
          from public.documents d
          where d.client_id = c.id
        ), '[]'::jsonb)
      ) as row,
      count(*) over()::int as total
    from public.clients c
    where c.ca_firm_id = ${firmId}::uuid
    order by c.created_at desc
    limit ${limit}::int
  `
  const typed = rows as JsonRowWithTotal<ClientWithListDocuments>[]
  return {
    clients: typed.map(r => r.row),
    total: typed.length ? Number(typed[0].total) : 0,
  }
}

export type ClientDocumentDetail = Pick<
  Document,
  | 'id'
  | 'type'
  | 'original_filename'
  | 'extraction_status'
  | 'extracted_data'
  | 'extraction_error'
  | 'file_size_bytes'
  | 'created_at'
>

export type ClientWithDocumentDetails = Client & { documents: ClientDocumentDetail[] }

/** Single client (scoped to the firm) with full document details. */
export async function getClientWithDocuments(
  clientId: string,
  firmId: string
): Promise<ClientWithDocumentDetails | null> {
  const rows = await sql()`
    select
      to_jsonb(c) || jsonb_build_object(
        'documents',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', d.id,
              'type', d.type,
              'original_filename', d.original_filename,
              'extraction_status', d.extraction_status,
              'extracted_data', d.extracted_data,
              'extraction_error', d.extraction_error,
              'file_size_bytes', d.file_size_bytes,
              'created_at', d.created_at
            )
            order by d.created_at desc
          )
          from public.documents d
          where d.client_id = c.id
        ), '[]'::jsonb)
      ) as row
    from public.clients c
    where c.id = ${clientId}::uuid
      and c.ca_firm_id = ${firmId}::uuid
  `
  return unwrap<ClientWithDocumentDetails>(rows)[0] ?? null
}

export async function getClientDocuments(
  clientId: string,
  firmId: string
): Promise<Document[]> {
  try {
    const rows = await sql()`
      select to_jsonb(d) as row
        from public.documents d
       where d.client_id = ${clientId}::uuid
         and d.ca_firm_id = ${firmId}::uuid
       order by d.created_at desc
    `
    return unwrap<Document>(rows)
  } catch {
    return []
  }
}

export async function clientBelongsToFirm(
  clientId: string,
  firmId: string
): Promise<boolean> {
  const rows = await sql()`
    select 1 as ok
      from public.clients
     where id = ${clientId}::uuid
       and ca_firm_id = ${firmId}::uuid
     limit 1
  `
  return rows.length > 0
}

export async function countClients(firmId: string): Promise<number> {
  const rows = await sql()`
    select count(*)::int as count
      from public.clients
     where ca_firm_id = ${firmId}::uuid
  `
  return Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
}

export async function insertClient(
  firmId: string,
  input: {
    name: string
    pan: string | null
    phone: string | null
    email: string | null
    assessment_year: string
  }
): Promise<Client> {
  const rows = await sql()`
    with inserted as (
      insert into public.clients
        (ca_firm_id, name, pan, phone, email, assessment_year, status)
      values
        (${firmId}::uuid, ${input.name}, ${input.pan}, ${input.phone},
         ${input.email}, ${input.assessment_year}, 'pending')
      returning *
    )
    select to_jsonb(inserted) as row from inserted
  `
  return unwrap<Client>(rows)[0]
}

const CLIENT_UPDATE_COLUMNS = [
  'status',
  'pan',
  'phone',
  'email',
  'tags',
  'notes',
  'fee_amount',
  'fee_paid',
  'gstin',
  'gst_scheme',
] as const

const CLIENT_UPDATE_CASTS: Partial<Record<(typeof CLIENT_UPDATE_COLUMNS)[number], string>> = {
  tags: '::text[]',
  fee_amount: '::numeric',
  fee_paid: '::boolean',
}

/** Update whitelisted client columns, always scoped to the owning firm. */
export async function updateClientForFirm(
  clientId: string,
  firmId: string,
  updates: Record<string, unknown>
): Promise<Client | null> {
  const sets: string[] = []
  const values: unknown[] = []
  for (const column of CLIENT_UPDATE_COLUMNS) {
    if (!(column in updates)) continue
    values.push(updates[column] ?? null)
    sets.push(`${column} = $${values.length}${CLIENT_UPDATE_CASTS[column] ?? ''}`)
  }

  if (sets.length === 0) {
    const rows = await sql()`
      select to_jsonb(c) as row
        from public.clients c
       where c.id = ${clientId}::uuid and c.ca_firm_id = ${firmId}::uuid
    `
    return unwrap<Client>(rows)[0] ?? null
  }

  values.push(clientId, firmId)
  const idParam = values.length - 1
  const firmParam = values.length
  const rows = await sql().query(
    `with updated as (
       update public.clients
          set ${sets.join(', ')}
        where id = $${idParam}::uuid and ca_firm_id = $${firmParam}::uuid
      returning *
     )
     select to_jsonb(updated) as row from updated`,
    values
  )
  return unwrap<Client>(rows)[0] ?? null
}

/** Storage keys recorded for a client's documents (firm-scoped). */
export async function getClientStoragePaths(
  clientId: string,
  firmId: string
): Promise<string[]> {
  const rows = await sql()`
    select storage_path
      from public.documents
     where client_id = ${clientId}::uuid
       and ca_firm_id = ${firmId}::uuid
       and storage_path is not null
  `
  return (rows as { storage_path: string }[])
    .map(r => r.storage_path)
    .filter(p => typeof p === 'string' && p.length > 0)
}

/** Storage keys recorded across all of a firm's documents. */
export async function getFirmStoragePaths(firmId: string): Promise<string[]> {
  const rows = await sql()`
    select storage_path
      from public.documents
     where ca_firm_id = ${firmId}::uuid
       and storage_path is not null
  `
  return (rows as { storage_path: string }[])
    .map(r => r.storage_path)
    .filter(p => typeof p === 'string' && p.length > 0)
}

export async function deleteClientForFirm(
  clientId: string,
  firmId: string
): Promise<void> {
  await sql()`
    delete from public.clients
     where id = ${clientId}::uuid
       and ca_firm_id = ${firmId}::uuid
  `
}

// ─── Document helpers ────────────────────────────────────────

/** Insert a document row in `processing` state and return its id. */
export async function insertProcessingDocument(input: {
  clientId: string
  firmId: string
  type: string
  originalFilename: string
  fileSizeBytes: number
}): Promise<string> {
  const rows = await sql()`
    insert into public.documents
      (client_id, ca_firm_id, type, storage_path, original_filename,
       file_size_bytes, extracted_data, extraction_status)
    values
      (${input.clientId}::uuid, ${input.firmId}::uuid, ${input.type}, null,
       ${input.originalFilename}, ${input.fileSizeBytes}::bigint, null, 'processing')
    returning id::text as id
  `
  const id = (rows[0] as { id?: string } | undefined)?.id
  if (!id) throw new Error('Document insert returned no row')
  return id
}

export async function documentTypeExistsForClient(
  clientId: string,
  type: string
): Promise<boolean> {
  const rows = await sql()`
    select 1 as ok
      from public.documents
     where client_id = ${clientId}::uuid and type = ${type}
     limit 1
  `
  return rows.length > 0
}

export async function setDocumentStoragePath(
  documentId: string,
  storagePath: string
): Promise<void> {
  await sql()`
    update public.documents
       set storage_path = ${storagePath}
     where id = ${documentId}::uuid
  `
}

export async function markDocumentFailed(
  documentId: string,
  extractionError: string
): Promise<void> {
  await sql()`
    update public.documents
       set extraction_status = 'failed', extraction_error = ${extractionError}
     where id = ${documentId}::uuid
  `
}

export async function finishDocumentExtraction(
  documentId: string,
  result: {
    extractedData: Record<string, unknown> | null
    status: 'completed' | 'failed'
    error: string | null
  }
): Promise<void> {
  await sql()`
    update public.documents
       set extracted_data = ${
         result.extractedData === null ? null : JSON.stringify(result.extractedData)
       }::jsonb,
           extraction_status = ${result.status},
           extraction_error = ${result.error}
     where id = ${documentId}::uuid
  `
}

export async function markClientReceived(
  clientId: string,
  firmId: string
): Promise<void> {
  await sql()`
    update public.clients
       set status = 'received'
     where id = ${clientId}::uuid and ca_firm_id = ${firmId}::uuid
  `
}

// ─── GST / analytics helpers ─────────────────────────────────

export type GstClientRow = {
  id: string
  name: string
  gstin: string | null
  gst_scheme: string | null
  phone: string | null
}

export async function getGstClients(firmId: string): Promise<GstClientRow[]> {
  const rows = await sql()`
    select to_jsonb(g) as row
      from (
        select id, name, gstin, gst_scheme, phone
          from public.clients
         where ca_firm_id = ${firmId}::uuid
           and gstin is not null
      ) as g
  `
  return unwrap<GstClientRow>(rows)
}

export async function getClientsWithoutGst(
  firmId: string
): Promise<{ id: string; name: string }[]> {
  const rows = await sql()`
    select to_jsonb(g) as row
      from (
        select id, name
          from public.clients
         where ca_firm_id = ${firmId}::uuid
           and gstin is null
      ) as g
  `
  return unwrap<{ id: string; name: string }>(rows)
}

export type AnalyticsStats = {
  ca_firm_id: string
  total_clients: number
  filed_count: number
  done_count: number
  processing_count: number
  received_count: number
  pending_count: number
  filed_pct: number
  revenue_total: number
  revenue_collected: number
  paid_clients: number
}

export async function getAnalyticsStats(firmId: string): Promise<AnalyticsStats | null> {
  const rows = await sql()`
    select to_jsonb(a) as row
      from public.ca_analytics a
     where a.ca_firm_id = ${firmId}::uuid
  `
  return unwrap<AnalyticsStats>(rows)[0] ?? null
}

export async function getRecentFiledClients(
  firmId: string,
  since: Date
): Promise<{ updated_at: string }[]> {
  const rows = await sql()`
    select to_jsonb(r) as row
      from (
        select updated_at
          from public.clients
         where ca_firm_id = ${firmId}::uuid
           and status = 'filed'
           and updated_at >= ${since.toISOString()}::timestamptz
         order by updated_at desc
      ) as r
  `
  return unwrap<{ updated_at: string }>(rows)
}

export type StaleClientRow = {
  id: string
  name: string
  pan: string | null
  status: string
  updated_at: string
}

export async function getStaleClients(
  firmId: string,
  olderThan: Date,
  limit = 10
): Promise<StaleClientRow[]> {
  const rows = await sql()`
    select to_jsonb(s) as row
      from (
        select id, name, pan, status, updated_at
          from public.clients
         where ca_firm_id = ${firmId}::uuid
           and status in ('pending', 'received')
           and updated_at <= ${olderThan.toISOString()}::timestamptz
         order by updated_at asc
         limit ${limit}::int
      ) as s
  `
  return unwrap<StaleClientRow>(rows)
}

// ─── Upload token helpers (use in API routes after ownership checks) ─

export async function validateUploadToken(token: string): Promise<{
  valid: boolean
  clientId?: string
  caFirmId?: string
  error?: string
}> {
  const rows = await sql()`
    select client_id::text as client_id,
           ca_firm_id::text as ca_firm_id,
           expires_at
      from public.upload_tokens
     where token = ${token}
     limit 1
  `
  const row = rows[0] as
    | { client_id: string; ca_firm_id: string; expires_at: Date | string }
    | undefined

  if (!row) return { valid: false, error: 'Token not found' }
  if (new Date(row.expires_at) < new Date()) return { valid: false, error: 'Token expired' }

  return { valid: true, clientId: row.client_id, caFirmId: row.ca_firm_id }
}

export async function getOrCreateUploadToken(
  clientId: string,
  caFirmId: string
): Promise<string | null> {
  const query = sql()

  try {
    const existing = await query`
      select token
        from public.upload_tokens
       where client_id = ${clientId}::uuid
         and ca_firm_id = ${caFirmId}::uuid
         and used = false
         and expires_at > now()
       order by created_at desc
       limit 1
    `
    const existingToken = (existing[0] as { token?: string } | undefined)?.token
    if (existingToken) return existingToken

    const inserted = await query`
      insert into public.upload_tokens (client_id, ca_firm_id, token)
      values (${clientId}::uuid, ${caFirmId}::uuid, ${randomBytes(32).toString('hex')})
      returning token
    `
    return (inserted[0] as { token?: string } | undefined)?.token ?? null
  } catch (err) {
    console.error('getOrCreateUploadToken error:', errorMessage(err))
    return null
  }
}

/** Replace unused tokens for a client with a fresh one (caller verifies ownership). */
export async function regenerateUploadToken(
  clientId: string,
  caFirmId: string
): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const results = await sql().transaction(txn => [
    txn`
      delete from public.upload_tokens
       where client_id = ${clientId}::uuid
         and ca_firm_id = ${caFirmId}::uuid
         and used = false
    `,
    txn`
      insert into public.upload_tokens (client_id, ca_firm_id, token)
      values (${clientId}::uuid, ${caFirmId}::uuid, ${token})
      returning token
    `,
  ])
  const inserted = results[1] as unknown as { token: string }[]
  return inserted[0].token
}
