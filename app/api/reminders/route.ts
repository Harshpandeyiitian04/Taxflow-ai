import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentFirm, getOrCreateUploadToken } from '@/lib/supabase/queries'

interface ScheduledReminder {
  type: string
  message: string
  scheduled_at: string
}

// POST /api/reminders — schedule reminder sequence for a client
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

  const { clientId, sequence } = await request.json()
  if (!['document_request', 'gst_gstr1', 'gst_gstr3b'].includes(sequence)) {
    return NextResponse.json({ error: 'Invalid reminder sequence' }, { status: 400 })
  }

  // Fetch client
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('name, phone, email, gstin, gst_scheme')
    .eq('id', clientId)
    .eq('ca_firm_id', firm.id)
    .single()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.phone && !client.email) {
    return NextResponse.json({ error: 'Add a client phone or email to deliver reminders' }, { status: 400 })
  }

  const firmDisplay = firm.firm_name ?? firm.owner_name ?? 'Your CA'
  const firstName = client.name.split(' ')[0]
  const now = new Date()

  const remindersToCreate: ScheduledReminder[] = []

  if (sequence === 'document_request') {
    const token = await getOrCreateUploadToken(clientId, firm.id)
    if (!token) return NextResponse.json({ error: 'Could not create an upload link' }, { status: 500 })
    const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`

    // 3-message sequence: Day 1, Day 4, Day 8
    remindersToCreate.push(
      {
        type: sequence,
        message: `Hello ${firstName} ji, ${firmDisplay} needs your Form 16 for ITR filing. Please upload it securely here: ${uploadUrl}`,
        scheduled_at: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        type: sequence,
        message: `${firstName} ji, this is a friendly reminder to upload your Form 16: ${uploadUrl}`,
        scheduled_at: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        type: sequence,
        message: `${firstName} ji, your Form 16 is still needed for ITR filing. Please upload it here: ${uploadUrl}`,
        scheduled_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      }
    )
  }

  if (sequence !== 'document_request') {
    if (!client.gstin) return NextResponse.json({ error: 'Client GSTIN is required for GST reminders' }, { status: 400 })

    const dueDay = sequence === 'gst_gstr1' ? 11 : 20
    let dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay, 9)
    if (dueDate <= now) dueDate = new Date(now.getFullYear(), now.getMonth() + 2, dueDay, 9)
    const label = sequence === 'gst_gstr1' ? 'GSTR-1' : 'GSTR-3B'

    for (const daysBefore of [3, 1]) {
      const scheduledAt = new Date(dueDate.getTime() - daysBefore * 24 * 60 * 60 * 1000)
      if (scheduledAt <= now) continue
      remindersToCreate.push({
        type: sequence,
        message: `${firstName} ji, your ${label} return is due on ${dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Please share the required information.`,
        scheduled_at: scheduledAt.toISOString(),
      })
    }
  }

  if (remindersToCreate.length === 0) {
    return NextResponse.json({ error: 'No future reminders to schedule' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('reminders')
    .select('id')
    .eq('client_id', clientId)
    .eq('ca_firm_id', firm.id)
    .eq('type', sequence)
    .eq('status', 'pending')
    .limit(1)

  if (existing?.length) {
    return NextResponse.json({ error: 'This reminder sequence is already scheduled' }, { status: 409 })
  }

  // Insert all reminders
  const { error } = await admin
    .from('reminders')
    .insert(remindersToCreate.map(r => ({
      ...r,
      client_id: clientId,
      ca_firm_id: firm.id,
    })))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ scheduled: remindersToCreate.length })
}

// GET /api/reminders?clientId=xxx — get reminders for a client
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientId = request.nextUrl.searchParams.get('clientId')

  const query = supabase
    .from('reminders')
    .select('*')
    .eq('ca_firm_id', firm.id)
    .order('scheduled_at', { ascending: true })

  if (clientId) query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminders: data })
}