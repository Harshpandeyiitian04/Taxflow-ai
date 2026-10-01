import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { ReferralClient } from '@/components/referral/ReferralClient'
import type { CAFirm } from '@/types'

export default async function ReferralPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')
  return <ReferralClient firm={firm as CAFirm & { referral_code: string; referral_credits: number }} />
}