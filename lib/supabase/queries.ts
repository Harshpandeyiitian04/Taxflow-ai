import { randomBytes } from 'node:crypto'
import { createClient } from './server'
import { createAdminClient } from './admin'
import type { CAFirm, Client, Document } from '@/types'

const FIRM_SELECT =
  'id, user_id, email, firm_name, owner_name, phone, city, referral_code, created_at, updated_at'

// ─── Firm helpers ────────────────────────────────────────────

export async function getCurrentFirm(): Promise<CAFirm | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('ca_firms')
    .select(FIRM_SELECT)
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

/** Stats-only counter via atomic RPC — never used for gating. */
export async function incrementExtractionCount(firmId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('increment_extractions_used', { p_firm: firmId })
  if (error) {
    console.error('incrementExtractionCount error:', error.message)
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
    .range(0, 499)

  if (error) {
    console.error('getClients error:', error.message)
    return []
  }
  return (data ?? []) as Client[]
}

export async function getClientDocuments(
  clientId: string,
  firmId: string
): Promise<Document[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .eq('ca_firm_id', firmId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as Document[]
}

// ─── Upload token helpers (admin — use in API routes after ownership checks) ─

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

export async function getOrCreateUploadToken(
  clientId: string,
  caFirmId: string
): Promise<string | null> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('upload_tokens')
    .select('token, expires_at')
    .eq('client_id', clientId)
    .eq('ca_firm_id', caFirmId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing.token

  const { data: newToken } = await admin
    .from('upload_tokens')
    .insert({
      client_id: clientId,
      ca_firm_id: caFirmId,
      token: randomBytes(32).toString('hex'),
    })
    .select('token')
    .single()

  return newToken?.token ?? null
}
