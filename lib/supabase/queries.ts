import { randomBytes } from 'node:crypto'
import { createClient } from './server'
import { createAdminClient } from './admin'
import type { CAFirm, Client, Document } from '@/types'

// ─── Firm helpers ────────────────────────────────────────────

export async function getCurrentFirm(): Promise<CAFirm | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('ca_firms')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('getCurrentFirm error:', error.message)
    return null
  }
  return data as CAFirm
}

export async function updateFirm(
  firmId: string,
  updates: Partial<Pick<CAFirm, 'firm_name' | 'owner_name' | 'phone' | 'city'>>
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ca_firms')
    .update(updates)
    .eq('id', firmId)

  if (error) {
    console.error('updateFirm error:', error.message)
    return false
  }
  return true
}

// ─── Trial / extraction limits ───────────────────────────────

export async function canExtract(
  firmId: string
): Promise<{ allowed: boolean; remaining: number | null }> {
  const supabase = await createClient()
  const { data: firm } = await supabase
    .from('ca_firms')
    .select('id')
    .eq('id', firmId)
    .single()

  if (!firm) return { allowed: false, remaining: 0 }
  return { allowed: true, remaining: null }
}

// Uses admin client to bypass RLS — call from API routes only
export async function incrementExtractionCount(firmId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: firm } = await admin
    .from('ca_firms')
    .select('extractions_used')
    .eq('id', firmId)
    .single()

  if (firm) {
    await admin
      .from('ca_firms')
      .update({ extractions_used: (firm.extractions_used ?? 0) + 1 })
      .eq('id', firmId)
  }
}

// ─── Client helpers ──────────────────────────────────────────

export async function getClients(firmId: string): Promise<Client[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('ca_firm_id', firmId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getClients error:', error.message)
    return []
  }
  return (data ?? []) as Client[]
}

export async function createClient_(
  firmId: string,
  payload: Pick<Client, 'name' | 'pan' | 'phone' | 'email' | 'assessment_year'>
): Promise<Client | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...payload, ca_firm_id: firmId })
    .select()
    .single()

  if (error) {
    console.error('createClient error:', error.message)
    return null
  }
  return data as Client
}

export async function updateClientStatus(
  clientId: string,
  status: Client['status']
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('clients')
    .update({ status })
    .eq('id', clientId)

  return !error
}

// ─── Document helpers ────────────────────────────────────────

export async function getClientDocuments(clientId: string): Promise<Document[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as Document[]
}

// ─── Upload token helpers (admin — use in API routes) ────────

export async function validateUploadToken(token: string): Promise<{
  valid: boolean
  clientId?: string
  caFirmId?: string
  error?: string
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('upload_tokens')
    .select('id, client_id, ca_firm_id, expires_at, used')
    .eq('token', token)
    .single()

  if (error || !data) return { valid: false, error: 'Token not found' }
  if (new Date(data.expires_at) < new Date()) return { valid: false, error: 'Token expired' }

  return { valid: true, clientId: data.client_id, caFirmId: data.ca_firm_id }
}
// Add these two functions to the BOTTOM of lib/supabase/queries.ts

// Get a single client with all their documents
export async function getClientWithDocuments(clientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      documents (
        id, type, original_filename, extraction_status,
        extracted_data, extraction_error, file_size_bytes,
        created_at
      )
    `)
    .eq('id', clientId)
    .single()

  if (error) return null
  return data
}

// Get the active upload token for a client (or create a new one)
export async function getOrCreateUploadToken(
  clientId: string,
  caFirmId: string
): Promise<string | null> {
  const admin = createAdminClient()

  // Check for existing valid token
  const { data: existing } = await admin
    .from('upload_tokens')
    .select('token, expires_at')
    .eq('client_id', clientId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing.token

  // Create fresh token
  const { data: newToken } = await admin
    .from('upload_tokens')
    .insert({ client_id: clientId, ca_firm_id: caFirmId, token: randomBytes(32).toString('hex') })
    .select('token')
    .single()

  return newToken?.token ?? null
}