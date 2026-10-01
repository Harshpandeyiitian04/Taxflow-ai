// lib/email.ts — reusable email functions using Resend

import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.RESEND_FROM_EMAIL ?? 'harshpandeyiitian04@gmail.com'

// Email sent to CA when a client uploads documents
export async function sendClientUploadNotification({
  caEmail,
  caName,
  clientName,
  documentType,
  extractionSuccess,
  dashboardUrl,
}: {
  caEmail: string
  caName: string
  clientName: string
  documentType: string
  extractionSuccess: boolean
  dashboardUrl: string
}) {
  if (!resend) return

  const docLabel: Record<string, string> = {
    form16: 'Form 16',
    bank_statement: 'Bank Statement',
    ais: 'AIS / 26AS',
    form16a: 'Form 16A',
    capital_gains: 'Capital Gains Statement',
    other: 'Document',
  }

  const subject = extractionSuccess
    ? `✓ ${clientName} uploaded ${docLabel[documentType] ?? documentType} — data extracted`
    : `${clientName} uploaded a document — please review`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#16a34a;padding:20px 24px">
      <p style="color:#ffffff;font-size:18px;font-weight:600;margin:0">TaxFlow AI</p>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#111827;margin:0 0 16px">Hello ${caName || 'CA'},</p>
      <p style="font-size:15px;color:#111827;margin:0 0 16px">
        Your client <strong>${clientName}</strong> has uploaded their
        <strong>${docLabel[documentType] ?? documentType}</strong>.
      </p>
      ${extractionSuccess
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px">
            <p style="color:#166534;font-size:14px;margin:0">
              ✓ <strong>AI extraction complete.</strong>
              All fields have been extracted and are ready to review.
            </p>
          </div>`
        : `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px">
            <p style="color:#92400e;font-size:14px;margin:0">
              ⚠ Document received. Extraction needs manual review.
            </p>
          </div>`
      }
      <a href="${dashboardUrl}"
        style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View extracted data →
      </a>
      <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">
        TaxFlow AI · Built for Indian CA firms<br>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#9ca3af">Visit dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>`

  try {
    await resend.emails.send({ from: FROM, to: caEmail, subject, html })
  } catch (err) {
    console.error('Email send failed (non-fatal):', err)
    // Never let email failure crash the upload flow
  }
}

// Welcome email sent after first signup
export async function sendWelcomeEmail(caEmail: string) {
  if (!resend) return

  await resend.emails.send({
    from: FROM,
    to: caEmail,
    subject: 'Welcome to TaxFlow AI — your free account is ready',
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:28px">
    <p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">Welcome to TaxFlow AI 🎉</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">
      You have unlimited Form 16 extractions during early access.
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px">
      <strong>Start in 30 seconds:</strong><br>
      1. Click "+ Add client" on your dashboard<br>
      2. Copy the upload link that appears<br>
      3. Send it to your client on WhatsApp<br>
      4. Client uploads Form 16 → you see extracted data instantly
    </p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
      style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
      Go to dashboard →
    </a>
    <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">
      Any questions? WhatsApp or email us at support@taxflowai.in
    </p>
  </div>
</body>
</html>`,
  }).catch(err => console.error('Welcome email failed:', err))
}

export async function sendReminderEmail({
  to,
  clientName,
  message,
}: {
  to: string
  clientName: string
  message: string
}): Promise<boolean> {
  if (!resend) return false

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'A reminder from your tax consultant',
    text: `Hello ${clientName},\n\n${message}\n\nTaxFlow AI`,
  })

  if (error) throw error
  return true
}