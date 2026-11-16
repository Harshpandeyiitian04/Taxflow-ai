// Tests safe redirect targets after login (no open redirects).
import { describe, expect, it } from 'vitest'
import { sanitizeNextPath } from '@/lib/auth/sanitizeNextPath'

// Same-site paths vs tricks that send users elsewhere.
describe('sanitizeNextPath', () => {
  const origin = 'https://taxflowai.in'

  // Normal app URLs under our domain should pass through.
  it('allows same-origin relative paths', () => {
    expect(sanitizeNextPath('/dashboard', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/dashboard/clients/1?x=1', origin)).toBe('/dashboard/clients/1?x=1')
  })

  // External or encoded redirect tricks should fall back to dashboard.
  it('rejects open redirects', () => {
    expect(sanitizeNextPath('//evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/\\evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('https://evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/%2f%2fevil.com', origin)).toBe('/dashboard')
  })
})