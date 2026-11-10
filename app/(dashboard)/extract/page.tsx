import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExtractClient } from '@/components/extraction/ExtractClient'

export default async function ExtractPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ExtractClient />
}
