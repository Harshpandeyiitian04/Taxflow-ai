import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getCurrentFirm, getOrCreateUploadToken } from '@/lib/supabase/queries'
import { ClientDetailClient } from '@/components/dashboard/ClientDetailClient'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  const { data: client, error } = await supabase
    .from('clients')
    .select(`
      *,
      documents (
        id, type, original_filename, extraction_status,
        extracted_data, extraction_error, file_size_bytes, created_at
      )
    `)
    .eq('id', id)
    .eq('ca_firm_id', firm.id)
    .single()

  if (error || !client) notFound()

  const token = await getOrCreateUploadToken(id, firm.id)
  const uploadUrl = token
    ? `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`
    : null

  return <ClientDetailClient client={client} firm={firm} uploadUrl={uploadUrl} />
}
