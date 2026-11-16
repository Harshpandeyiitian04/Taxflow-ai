// API to schedule and list client document or GST reminders.
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/sql'
import { requireFirm } from '@/lib/auth/requireFirm'
import { getOrCreateUploadToken, isUuid } from '@/lib/db/queries'

interface ScheduledReminder {
  type: string
  message: string
  scheduled_at: string
}

// Creates a reminder sequence for one client.
export async function POST(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const { clientId, sequence } = await request.json()
  if (!['document_request', 'gst_gstr1', 'gst_gstr3b'].includes(sequence)) {
    return NextResponse.json({ error: 'Invalid reminder sequence' }, { status: 400 })
  }

  if (!isUuid(clientId)) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const query = sql()
  const clientRows = await query`
    select name, phone, email, gstin, gst_scheme
      from public.clients
     where id = ${clientId}::uuid
       and ca_firm_id = ${firm.id}::uuid
     limit 1
  `
  const client = clientRows[0] as
    | {
        name: string
        phone: string | null
        email: string | null
        gstin: string | null
        gst_scheme: string | null
      }
    | undefined

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

  const existing = await query`
    select id
      from public.reminders
     where client_id = ${clientId}::uuid
       and ca_firm_id = ${firm.id}::uuid
       and type = ${sequence}
       and status = 'pending'
     limit 1
  `

  if (existing.length) {
    return NextResponse.json({ error: 'This reminder sequence is already scheduled' }, { status: 409 })
  }

  try {
    await query`
      insert into public.reminders (client_id, ca_firm_id, type, message, scheduled_at)
      select ${clientId}::uuid, ${firm.id}::uuid, r.type, r.message, r.scheduled_at
        from jsonb_to_recordset(${JSON.stringify(remindersToCreate)}::jsonb)
          as r(type text, message text, scheduled_at timestamptz)
    `
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to schedule reminders' },
      { status: 500 }
    )
  }

  return NextResponse.json({ scheduled: remindersToCreate.length })
}

// Lists reminders for the firm, optionally filtered by client.
export async function GET(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (clientId && !isUuid(clientId)) {
    return NextResponse.json({ reminders: [] })
  }

  try {
    const rows = await sql()`
      select to_jsonb(r) as row
        from public.reminders r
       where r.ca_firm_id = ${firm.id}::uuid
         and (${clientId}::uuid is null or r.client_id = ${clientId}::uuid)
       order by r.scheduled_at asc
    `
    return NextResponse.json({
      reminders: (rows as { row: unknown }[]).map(r => r.row),
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load reminders' },
      { status: 500 }
    )
  }
}
