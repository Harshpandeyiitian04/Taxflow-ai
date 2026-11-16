// Tests that scheduled API routes only run with the correct secret.
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { authorizeCron } from '@/lib/auth/cronAuth'

// Checks missing secret, wrong bearer token, and valid bearer token.
describe('authorizeCron', () => {
  // Server misconfiguration should block the job with 500.
  it('returns 500 when secret missing', () => {
    const req = new NextRequest('https://example.com/api/cron/reminders')
    const res = authorizeCron(req, undefined)
    expect(res?.status).toBe(500)
  })

  // Wrong Authorization header should get 401.
  it('returns 401 for wrong secret', () => {
    const req = new NextRequest('https://example.com/api/cron/reminders', {
      headers: { authorization: 'Bearer wrong' },
    })
    const res = authorizeCron(req, 'correct-secret')
    expect(res?.status).toBe(401)
  })

  // Matching bearer secret means the caller is allowed through.
  it('returns null for correct secret', () => {
    const req = new NextRequest('https://example.com/api/cron/reminders', {
      headers: { authorization: 'Bearer correct-secret' },
    })
    expect(authorizeCron(req, 'correct-secret')).toBeNull()
  })
})