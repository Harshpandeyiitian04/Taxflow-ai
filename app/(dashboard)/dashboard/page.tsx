import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { DashboardClient } from '@/components/dashboard/DashboardClient'

// Server component — fetches initial data, passes to interactive client component
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  // Fetch clients with document counts
  const { data: clients } = await supabase
    .from('clients')
    .select('*, documents(id, type, extraction_status, extracted_data)')
    .eq('ca_firm_id', firm.id)
    .order('created_at', { ascending: false })

  return (
    <Suspense>
      <DashboardClient
        initialClients={clients ?? []}
        firm={firm}
      />
    </Suspense>
  )
}