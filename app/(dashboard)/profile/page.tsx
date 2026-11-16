// Server page for firm profile and account settings.
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { getCurrentFirm } from '@/lib/db/queries'
import { ProfileClient } from '@/components/profile/ProfileClient'

export const dynamic = 'force-dynamic'

// Loads firm profile data for the settings screen.
export default async function ProfilePage() {
  const { data: session } = await auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const firm = await getCurrentFirm(user.id)
  if (!firm) redirect('/login')

  return <ProfileClient firm={firm} userEmail={user.email ?? firm.email} />
}