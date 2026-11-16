// Tests that claiming an upload slot returns success or the right error codes.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryClaimUploadSlot = vi.fn()

vi.mock('@/lib/db/sql', () => ({
  queryClaimUploadSlot: (...args: unknown[]) => queryClaimUploadSlot(...args),
}))

import { claimUploadSlot } from '@/lib/upload/claimSlot'
import type { SqlQuery } from '@/lib/db/sql'

const query = {} as SqlQuery

// Covers happy path and failure cases for upload slot claims.
describe('claimUploadSlot', () => {
  // Clears mock call history before each example.
  beforeEach(() => {
    queryClaimUploadSlot.mockReset()
  })

  // Expects a claimed slot when the database returns client and firm ids.
  it('returns slot on successful claim', async () => {
    queryClaimUploadSlot.mockResolvedValue({ client_id: 'c1', ca_firm_id: 'f1' })
    const result = await claimUploadSlot(query, 'tok', 5)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.slot.client_id).toBe('c1')
      expect(result.slot.ca_firm_id).toBe('f1')
    }
    expect(queryClaimUploadSlot).toHaveBeenCalledWith(query, 'tok', 5)
  })

  // Expects HTTP 400 when no slot exists for the token.
  it('returns 400 when slot missing', async () => {
    queryClaimUploadSlot.mockResolvedValue(null)
    const result = await claimUploadSlot(query, 'tok', 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  // Expects HTTP 503 when the database throws.
  it('returns 503 on database error', async () => {
    queryClaimUploadSlot.mockRejectedValue(new Error('db'))
    const result = await claimUploadSlot(query, 'tok', 5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(503)
  })
})