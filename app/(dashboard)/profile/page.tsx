import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { ProfileClient } from '@/components/profile/ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  return <ProfileClient firm={firm} userEmail={user.email!} />
}