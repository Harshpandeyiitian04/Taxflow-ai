// Scheduled job that sends due client reminders in batches.
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/sql'
import { sendReminderEmail } from '@/lib/email'
import { authorizeCron } from '@/lib/auth/cronAuth'

export const runtime = 'nodejs'
export const maxDuration = 60

type DueReminder = {
  id: string
  type: string
  message: string
  client_id: string
  ca_firm_id: string
  client: unknown
}

const BATCH_SIZE = 50
const TIME_BUDGET_MS = 45_000

// Safely treats a JSON value as a plain object for reminder delivery.
function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

// Processes pending reminders until the time budget is used.
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request)
  if (denied) return denied

  const query = sql()
  const started = Date.now()
  const now = new Date()

  let sent = 0
  let failed = 0
  let processed = 0

  while (Date.now() - started < TIME_BUDGET_MS) {
    let dueReminders: DueReminder[]
    try {
      const rows = await query`
        select r.id::text as id,
               r.type,
               r.message,
               r.client_id::text as client_id,
               r.ca_firm_id::text as ca_firm_id,
               jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email) as client
          from public.reminders r
          left join public.clients c on c.id = r.client_id
         where r.status = 'pending'
           and r.scheduled_at <= ${now.toISOString()}::timestamptz
         order by r.scheduled_at asc
         limit ${BATCH_SIZE}::int
      `
      dueReminders = rows as DueReminder[]
    } catch (err) {
      console.error('Cron: failed to fetch reminders:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
    }

    if (!dueReminders.length) break

    for (const reminder of dueReminders) {
      if (Date.now() - started >= TIME_BUDGET_MS) break

      processed++
      try {
        const client = getRecord(reminder.client)
        const phone = client.phone
        const email = client.email
        let delivered = false
        let failureReason = 'No delivery channel available'

        if (process.env.WATI_API_KEY && process.env.WATI_API_ENDPOINT && typeof phone === 'string') {
          await sendWATIMessage({ phone, message: reminder.message })
          delivered = true
        } else if (typeof email === 'string') {
          const emailOk = await sendReminderEmail({
            to: email,
            clientName: String(client.name ?? 'Client'),
            message: reminder.message,
          })
          if (emailOk) {
            delivered = true
          } else {
            failureReason = 'Email delivery is not configured'
          }
        } else {
          failureReason = 'Client has no phone or email for delivery'
        }

        if (!delivered) {
          await query`
            update public.reminders
               set status = 'failed', failure_reason = ${failureReason}
             where id = ${reminder.id}::uuid
          `
          failed++
          continue
        }

        await query`
          update public.reminders
             set status = 'sent',
                 sent_at = ${now.toISOString()}::timestamptz,
                 failure_reason = null
           where id = ${reminder.id}::uuid
        `
        sent++
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Delivery failed'
        console.error('Failed to send reminder:', reminder.id, reason)
        await query`
          update public.reminders
             set status = 'failed', failure_reason = ${reason.slice(0, 500)}
           where id = ${reminder.id}::uuid
        `
        failed++
      }
    }

    if (dueReminders.length < BATCH_SIZE) break
  }

  return NextResponse.json({
    processed,
    sent,
    failed,
    timestamp: now.toISOString(),
    budget_ms: TIME_BUDGET_MS,
  })
}

// Sends a one-off WhatsApp session message through WATI.
async function sendWATIMessage({ phone, message }: { phone: string; message: string }) {
  const cleanPhone = phone.replace(/\D/g, '')
  const phoneWithCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`

  const res = await fetch(
    `${process.env.WATI_API_ENDPOINT}/api/v1/sendSessionMessage/${phoneWithCode}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WATI_API_KEY}`,
      },
      body: JSON.stringify({ messageText: message }),
      signal: AbortSignal.timeout(8000),
    }
  )

  if (!res.ok) throw new Error(`WATI API error: ${res.status}`)
}
