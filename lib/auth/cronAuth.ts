import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

/** Authorize Vercel cron / bearer-secret callers. Returns a response when denied. */
export function authorizeCron(request: NextRequest, secret = process.env.CRON_SECRET): NextResponse | null {
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length)
  const tokenBuf = Buffer.from(token)
  const secretBuf = Buffer.from(secret)
  if (
    tokenBuf.length !== secretBuf.length ||
    !timingSafeEqual(tokenBuf, secretBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
