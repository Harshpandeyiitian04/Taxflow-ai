import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentFirm } from '@/lib/supabase/queries'

// GET /api/referrals — get referral history for current CA
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()

  // Find all firms that were referred by this firm's referral code
  const firmFields = firm as typeof firm & { referral_code?: unknown; referralCode?: unknown }
  const referralCode = firmFields.referral_code ?? firmFields.referralCode
  const firmReferralCode = typeof referralCode === 'string' ? referralCode : null

  if (!firmReferralCode) {
    return NextResponse.json({ referrals: [], code: null })
  }

  const { data: referred } = await admin
    .from('ca_firms')
    .select('email, created_at')
    .eq('referred_by', firmReferralCode)
    .order('created_at', { ascending: false })

  const referrals = (referred ?? []).map(r => ({
    email: r.email,
    created_at: r.created_at,
  }))

  return NextResponse.json({ referrals, code: firmReferralCode })
}
