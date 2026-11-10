import { describe, expect, it } from 'vitest'
import { sanitizeNextPath } from '@/lib/auth/sanitizeNextPath'

describe('sanitizeNextPath', () => {
  const origin = 'https://taxflowai.in'

  it('allows same-origin relative paths', () => {
    expect(sanitizeNextPath('/dashboard', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/dashboard/clients/1?x=1', origin)).toBe('/dashboard/clients/1?x=1')
  })

  it('rejects open redirects', () => {
    expect(sanitizeNextPath('//evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/\\evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('https://evil.com', origin)).toBe('/dashboard')
    expect(sanitizeNextPath('/%2f%2fevil.com', origin)).toBe('/dashboard')
  })
})
