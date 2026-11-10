import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BulkExtractClient } from '@/components/extraction/BulkExtractClient'

export default async function BulkPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <BulkExtractClient />
}
