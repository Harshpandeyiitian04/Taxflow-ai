// Tests JWT claim shape and storage key rules for multi-tenant files.
import { describe, expect, it } from 'vitest'
import {
  assertClientStorageKey,
  assertFirmStorageKey,
  jwtClaimsForUser,
} from '@/lib/db/identity'

// What goes into request JWT claims for a user id.
describe('jwtClaimsForUser', () => {
  // Should include sub and authenticated role.
  it('embeds verified sub and authenticated role', () => {
    const raw = jwtClaimsForUser('11111111-1111-1111-1111-111111111111')
    const claims = JSON.parse(raw) as { sub: string; role: string }
    expect(claims.sub).toBe('11111111-1111-1111-1111-111111111111')
    expect(claims.role).toBe('authenticated')
  })

  // Blank user id should not be allowed.
  it('rejects empty identity', () => {
    expect(() => jwtClaimsForUser('')).toThrow(/verified user id/)
  })
})

// Object storage keys must stay under firm and client folders.
describe('storage key isolation', () => {
  const firmA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const firmB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const clientA = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

  // Keys under firmA/clientA should be accepted.
  it('allows keys under the firm prefix', () => {
    expect(() =>
      assertFirmStorageKey(firmA, `${firmA}/${clientA}/form16.pdf`)
    ).not.toThrow()
  })

  // Another firm's prefix in the path should be rejected.
  it('blocks cross-firm key access', () => {
    expect(() =>
      assertFirmStorageKey(firmA, `${firmB}/${clientA}/form16.pdf`)
    ).toThrow(/firm prefix/)
  })

  // ../ style paths should not escape the firm folder.
  it('blocks path traversal', () => {
    expect(() =>
      assertFirmStorageKey(firmA, `${firmA}/../${firmB}/x.pdf`)
    ).toThrow(/Invalid storage key/)
  })

  // Client documents must live under the right client id segment.
  it('enforces client prefix', () => {
    expect(() =>
      assertClientStorageKey(firmA, clientA, `${firmA}/other-client/x.pdf`)
    ).toThrow(/client prefix/)
  })
})