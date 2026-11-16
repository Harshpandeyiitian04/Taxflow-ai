import { queryClaimUploadSlot, type SqlQuery } from '@/lib/db/sql'

// Validates one-time client upload links before files are accepted.

export interface ClaimedUploadSlot {
  client_id: string
  ca_firm_id: string
}

// Tries to reserve one use of an upload link and returns who it belongs to.
export async function claimUploadSlot(
  query: SqlQuery,
  token: string,
  maxUses: number
): Promise<
  | { ok: true; slot: ClaimedUploadSlot }
  | { ok: false; status: number; error: string }
> {
  let slot: ClaimedUploadSlot | null
  try {
    slot = await queryClaimUploadSlot(query, token, maxUses)
  } catch {
    return { ok: false, status: 503, error: 'Could not validate upload link' }
  }

  if (!slot) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid, expired, or upload limit reached for this link',
    }
  }

  return {
    ok: true,
    slot: {
      client_id: slot.client_id,
      ca_firm_id: slot.ca_firm_id,
    },
  }
}