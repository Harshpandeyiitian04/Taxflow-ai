// API to list masked firms referred by the current CA.
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/sql'
import { requireFirm } from '@/lib/auth/requireFirm'
import { maskEmail } from '@/lib/utils/maskEmail'

// Returns referral code and privacy-safe list of referred signups.
export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const firmReferralCode = typeof firm.referral_code === 'string' ? firm.referral_code : null
  if (!firmReferralCode) {
    return NextResponse.json({ referrals: [], code: null, count: 0 })
  }

  const rows = await sql()`
    select email, to_jsonb(created_at) #>> '{}' as created_at
      from public.ca_firms
     where referred_by = ${firmReferralCode}
     order by created_at desc
  `
  const referred = rows as { email: string; created_at: string }[]

  const referrals = referred.map(r => ({
    email: maskEmail(r.email),
    created_at: r.created_at,
  }))

  return NextResponse.json({
    referrals,
    code: firmReferralCode,
    count: referrals.length,
  })
}