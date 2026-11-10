import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendReminderEmail } from '@/lib/email'

// Called by Vercel Cron once daily (Hobby plan). See vercel.json.
export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH_SIZE = 50
const TIME_BUDGET_MS = 45_000

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function authorizeCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length)
  const tokenBuf = Buffer.from(token)
  const secretBuf = Buffer.from(secret)
  if (
    tokenBuf.length !== secretBuf.length ||
    !timingSafeEqual(tokenBuf, secretBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request)
  if (denied) return denied

  const admin = createAdminClient()
  const started = Date.now()
  const now = new Date()

  let sent = 0
  let failed = 0
  let processed = 0

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: dueReminders, error } = await admin
      .from('reminders')
      .select(`
        id, type, message, client_id, ca_firm_id,
        client:clients(name, phone, email),
        ca_firm:ca_firms(email, owner_name, firm_name)
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) {
      console.error('Cron: failed to fetch reminders:', error.message)
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
    }

    if (!dueReminders?.length) break

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
          await admin
            .from('reminders')
            .update({ status: 'failed', failure_reason: failureReason })
            .eq('id', reminder.id)
          failed++
          continue
        }

        await admin
          .from('reminders')
          .update({
            status: 'sent',
            sent_at: now.toISOString(),
            failure_reason: null,
          })
          .eq('id', reminder.id)
        sent++
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Delivery failed'
        console.error('Failed to send reminder:', reminder.id, reason)
        await admin
          .from('reminders')
          .update({ status: 'failed', failure_reason: reason.slice(0, 500) })
          .eq('id', reminder.id)
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
