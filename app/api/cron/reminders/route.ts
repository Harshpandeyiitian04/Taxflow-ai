import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendReminderEmail } from '@/lib/email'

// Called by Vercel Cron twice daily: 9am and 2pm IST
// Sends due reminders or marks them as overdue

export const runtime = 'nodejs'

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel Cron (not a random person)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // Fetch pending reminders that are due
  const { data: dueReminders, error } = await admin
    .from('reminders')
    .select(`
      id, type, message, client_id, ca_firm_id,
      client:clients(name, phone, email),
      ca_firm:ca_firms(email, owner_name, firm_name)
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(50)

  if (error) {
    console.error('Cron: failed to fetch reminders:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueReminders?.length) {
    return NextResponse.json({ processed: 0, message: 'No reminders due' })
  }

  let sent = 0
  let failed = 0

  for (const reminder of dueReminders) {
    try {
      const client = getRecord(reminder.client)
      const phone = client.phone
      const email = client.email

      if (process.env.WATI_API_KEY && process.env.WATI_API_ENDPOINT && typeof phone === 'string') {
        await sendWATIMessage({ phone, message: reminder.message })
      } else if (typeof email === 'string') {
        const delivered = await sendReminderEmail({
          to: email,
          clientName: String(client.name ?? 'Client'),
          message: reminder.message,
        })
        if (!delivered) throw new Error('No WATI or Resend delivery is configured')
      } else {
        throw new Error('Configure WATI or add the client email for reminder delivery')
      }

      // Mark as sent
      await admin
        .from('reminders')
        .update({ status: 'sent', sent_at: now.toISOString() })
        .eq('id', reminder.id)

      sent++
    } catch (err) {
      console.error('Failed to send reminder:', reminder.id, err)
      await admin
        .from('reminders')
        .update({ status: 'failed' })
        .eq('id', reminder.id)
      failed++
    }
  }

  return NextResponse.json({
    processed: dueReminders.length,
    sent,
    failed,
    timestamp: now.toISOString(),
  })
}

// WATI WhatsApp API integration (optional — only if WATI_API_KEY is set)
async function sendWATIMessage({ phone, message }: { phone: string; message: string }) {
  const cleanPhone = phone.replace(/\D/g, '')
  const phoneWithCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`

  const res = await fetch(
    `${process.env.WATI_API_ENDPOINT}/api/v1/sendSessionMessage/${phoneWithCode}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WATI_API_KEY}`,
      },
      body: JSON.stringify({ messageText: message }),
    }
  )

  if (!res.ok) throw new Error(`WATI API error: ${res.status}`)
}