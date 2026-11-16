// Server page for bulk Form 16 extraction uploads.
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { BulkExtractClient } from '@/components/extraction/BulkExtractClient'

export const dynamic = 'force-dynamic'

// Shows the bulk extraction tool to signed-in users only.
export default async function BulkPage() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/login')

  return <BulkExtractClient />
}