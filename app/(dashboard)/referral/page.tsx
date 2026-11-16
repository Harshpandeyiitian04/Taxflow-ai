// Server page for sharing and tracking referral codes.
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { getCurrentFirm } from '@/lib/db/queries'
import { ReferralClient } from '@/components/referral/ReferralClient'
import type { CAFirm } from '@/types'

export const dynamic = 'force-dynamic'

// Loads firm referral data for the referral sharing UI.
export default async function ReferralPage() {
  const { data: session } = await auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')
  const firm = await getCurrentFirm(user.id)
  if (!firm) redirect('/login')
  return <ReferralClient firm={firm as CAFirm & { referral_code: string }} />
}