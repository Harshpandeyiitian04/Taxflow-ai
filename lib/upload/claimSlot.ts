export interface ClaimedUploadSlot {
  client_id: string
  ca_firm_id: string
}

/**
 * Claim a one-time upload token slot via RPC.
 * Extracted for unit testing with a mocked admin client.
 */
export async function claimUploadSlot(
  admin: {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
  },
  token: string,
  maxUses: number
): Promise<
  | { ok: true; slot: ClaimedUploadSlot }
  | { ok: false; status: number; error: string }
> {
  const { data: claimed, error } = await admin.rpc('claim_upload_slot', {
    p_token: token,
    p_max: maxUses,
  })

  if (error) {
    return { ok: false, status: 503, error: 'Could not validate upload link' }
  }

  const slot = Array.isArray(claimed) ? claimed[0] : claimed
  if (
    !slot ||
    typeof slot !== 'object' ||
    typeof (slot as ClaimedUploadSlot).client_id !== 'string' ||
    typeof (slot as ClaimedUploadSlot).ca_firm_id !== 'string'
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid, expired, or upload limit reached for this link',
    }
  }

  return {
    ok: true,
    slot: {
      client_id: (slot as ClaimedUploadSlot).client_id,
      ca_firm_id: (slot as ClaimedUploadSlot).ca_firm_id,
    },
  }
}
