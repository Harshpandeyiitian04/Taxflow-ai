// Server page for single-document AI extraction.
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { ExtractClient } from '@/components/extraction/ExtractClient'

export const dynamic = 'force-dynamic'

// Shows the one-off extraction UI to signed-in users only.
export default async function ExtractPage() {
  const { data: session } = await auth.getSession()
  if (!session?.user) redirect('/login')

  return <ExtractClient />
}