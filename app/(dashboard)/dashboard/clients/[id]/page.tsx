// Server page for one client's detail view and documents.
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import {
  getClientWithDocuments,
  getCurrentFirm,
  getOrCreateUploadToken,
  isUuid,
} from '@/lib/db/queries'
import { ClientDetailClient } from '@/components/dashboard/ClientDetailClient'

export const dynamic = 'force-dynamic'

// Loads one client and their upload link for the detail screen.
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data: session } = await auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const firm = await getCurrentFirm(user.id)
  if (!firm) redirect('/login')

  const client = isUuid(id) ? await getClientWithDocuments(id, firm.id) : null

  if (!client) notFound()

  const token = await getOrCreateUploadToken(id, firm.id)
  const uploadUrl = token
    ? `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`
    : null

  return <ClientDetailClient client={client} firm={firm} uploadUrl={uploadUrl} />
}