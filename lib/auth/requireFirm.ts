import 'server-only'

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getCurrentFirm } from '@/lib/supabase/queries'
import type { CAFirm } from '@/types'

export type RequireFirmSuccess = { ok: true; user: User; firm: CAFirm }
export type RequireFirmFailure = { ok: false; response: NextResponse }
export type RequireFirmResult = RequireFirmSuccess | RequireFirmFailure

/** Authenticate the caller and resolve their CA firm, or return a JSON error response. */
export async function requireFirm(): Promise<RequireFirmResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const firm = await getCurrentFirm()
  if (!firm) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Firm not found' }, { status: 404 }),
    }
  }

  return { ok: true, user, firm }
}
