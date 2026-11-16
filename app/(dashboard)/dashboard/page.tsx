// Server page that loads the main CA client dashboard.
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { getCurrentFirm, getClientsWithDocuments } from '@/lib/db/queries'
import { DashboardClient } from '@/components/dashboard/DashboardClient'

const CLIENT_LIST_LIMIT = 500

export const dynamic = 'force-dynamic'

// Fetches firm clients and renders the interactive dashboard.
export default async function DashboardPage() {
  const { data: session } = await auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  const firm = await getCurrentFirm(user.id)
  if (!firm) redirect('/login')

  const { clients, total } = await getClientsWithDocuments(firm.id, CLIENT_LIST_LIMIT)

  return (
    <Suspense>
      <DashboardClient
        initialClients={clients}
        firm={firm}
        totalClients={total}
        truncated={total > CLIENT_LIST_LIMIT}
      />
    </Suspense>
  )
}