import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getCurrentFirm } from '@/lib/db/queries'
import type { CAFirm } from '@/types'

// Ensures an API call comes from a logged-in CA firm user.

export type AuthUser = { id: string; email?: string | null; name?: string | null }

export type RequireFirmSuccess = { ok: true; user: AuthUser; firm: CAFirm }
export type RequireFirmFailure = { ok: false; response: NextResponse }
export type RequireFirmResult = RequireFirmSuccess | RequireFirmFailure

// Loads the signed-in user and their firm, or sends an error response.
export async function requireFirm(): Promise<RequireFirmResult> {
  const { data: session } = await auth.getSession()
  const sessionUser = session?.user
  if (!sessionUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const user: AuthUser = {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name,
  }

  const firm = await getCurrentFirm(user.id)
  if (!firm) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Firm not found' }, { status: 404 }),
    }
  }

  return { ok: true, user, firm }
}