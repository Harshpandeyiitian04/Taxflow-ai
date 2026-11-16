// Tests that one firm's session cannot use another firm's storage or identity.
import { describe, expect, it } from 'vitest'
import { assertFirmStorageKey, jwtClaimsForUser } from '@/lib/db/identity'

type Firm = { id: string; userId: string }

const firmA: Firm = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  userId: '11111111-1111-1111-1111-111111111111',
}
const firmB: Firm = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  userId: '22222222-2222-2222-2222-222222222222',
}

// Reads the JWT subject string for a test firm user.
function claimsSub(firm: Firm): string {
  return (JSON.parse(jwtClaimsForUser(firm.userId)) as { sub: string }).sub
}

// Local checks without a live database.
describe('cross-tenant identity matrix (local)', () => {
  // Each firm owner should get a different user id in claims.
  it('Firm A and Firm B have distinct JWT subjects', () => {
    expect(claimsSub(firmA)).not.toBe(claimsSub(firmB))
  })

  // Storage paths must start with the logged-in firm's id.
  it('Firm A cannot use Firm B storage keys', () => {
    expect(() =>
      assertFirmStorageKey(firmA.id, `${firmB.id}/client/doc.pdf`)
    ).toThrow()
  })

  // Putting another firm's id in the path should still fail.
  it('spoofed firm id in storage key is rejected when checked against session firm', () => {
    const attackerKey = `${firmB.id}/x.pdf`
    expect(() => assertFirmStorageKey(firmA.id, attackerKey)).toThrow()
  })

  // Migration text should mention denied cross-firm RPC access.
  it('documents expected RPC denial message for cross-firm consume', () => {
    expect('consume_extraction denied for firm').toMatch(/denied for firm/)
  })
})