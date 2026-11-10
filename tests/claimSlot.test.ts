import { describe, expect, it, vi } from 'vitest'
import { claimUploadSlot } from '@/lib/upload/claimSlot'

describe('claimUploadSlot', () => {
  it('returns slot on successful RPC', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: { client_id: 'c1', ca_firm_id: 'f1' },
        error: null,
      }),
    }
    const result = await claimUploadSlot(admin, 'tok', 5)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.slot.client_id).toBe('c1')
      expect(result.slot.ca_firm_id).toBe('f1')
    }
    expect(admin.rpc).toHaveBeenCalledWith('claim_upload_slot', {
      p_token: 'tok',
      p_max: 5,
    })
  })

  it('returns 400 when slot missing', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const result = await claimUploadSlot(admin, 'tok', 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 503 on RPC error', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db' } }),
    }
    const result = await claimUploadSlot(admin, 'tok', 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(503)
  })
})
