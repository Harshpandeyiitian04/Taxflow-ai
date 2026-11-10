import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { DashboardClient } from '@/components/dashboard/DashboardClient'

const CLIENT_LIST_SELECT =
  'id, ca_firm_id, name, pan, phone, email, assessment_year, status, tags, notes, gstin, gst_scheme, fee_amount, fee_paid, last_reminder_sent_at, reminder_count, created_at, updated_at, documents(id, type, extraction_status, created_at)'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  const { data: clients, count } = await supabase
    .from('clients')
    .select(CLIENT_LIST_SELECT, { count: 'exact' })
    .eq('ca_firm_id', firm.id)
    .order('created_at', { ascending: false })
    .range(0, 499)

  return (
    <Suspense>
      <DashboardClient
        initialClients={clients ?? []}
        firm={firm}
        totalClients={count ?? clients?.length ?? 0}
        truncated={(count ?? 0) > 500}
      />
    </Suspense>
  )
}
