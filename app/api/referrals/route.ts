import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireFirm } from '@/lib/auth/requireFirm'
import { maskEmail } from '@/lib/utils/maskEmail'

// GET /api/referrals — masked referral history for current CA
export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const firmReferralCode = typeof firm.referral_code === 'string' ? firm.referral_code : null
  if (!firmReferralCode) {
    return NextResponse.json({ referrals: [], code: null, count: 0 })
  }

  const admin = createAdminClient()
  const { data: referred, count } = await admin
    .from('ca_firms')
    .select('email, created_at', { count: 'exact' })
    .eq('referred_by', firmReferralCode)
    .order('created_at', { ascending: false })

  const referrals = (referred ?? []).map(r => ({
    email: maskEmail(r.email),
    created_at: r.created_at,
  }))

  return NextResponse.json({
    referrals,
    code: firmReferralCode,
    count: count ?? referrals.length,
  })
}
