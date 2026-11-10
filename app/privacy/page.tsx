import Link from 'next/link'

export default function PrivacyPage() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@taxflowai.in'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm">
          <Link href="/" className="font-semibold text-gray-900">TaxFlow AI</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600">Privacy (DRAFT)</span>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-6 py-10 prose prose-sm prose-gray">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 not-prose text-sm">
          DRAFT — for product transparency only. Not legal advice. Have a lawyer review before relying on this as a privacy policy.
        </p>
        <h1>Privacy notice (draft)</h1>
        <p>
          TaxFlow AI helps Indian CA firms extract fields from client tax documents. This draft describes how
          we intend to handle personal data under India&apos;s Digital Personal Data Protection Act (DPDP) orientation.
        </p>
        <h2>What we process</h2>
        <ul>
          <li>CA account details (email, firm name, phone)</li>
          <li>Client metadata you enter (name, PAN, phone, GSTIN, notes, tags)</li>
          <li>Uploaded documents (Form 16 and related files) and extracted structured fields</li>
        </ul>
        <h2>Processors</h2>
        <ul>
          <li><strong>Supabase</strong> — authentication, Postgres database, private object storage</li>
          <li><strong>Google Gemini</strong> — document understanding / field extraction</li>
          <li><strong>Resend</strong> — transactional email (when configured)</li>
          <li><strong>PostHog</strong> — product analytics only after consent; no session replay</li>
          <li><strong>Vercel</strong> — application hosting</li>
          <li><strong>WATI</strong> (optional) — WhatsApp reminders when configured</li>
        </ul>
        <h2>Storage and sharing</h2>
        <p>
          Documents are stored in a private Supabase storage bucket and shared only with the CA firm that owns
          the client record. Documents are processed by Google Gemini to extract data. They are not sold.
        </p>
        <h2>Retention</h2>
        <p>
          We retain firm and client data while the account is active. You may delete individual clients from the
          dashboard. You may delete your entire account from Profile → Delete account, which removes firm storage
          objects, related rows, and the auth user.
        </p>
        <h2>Contact</h2>
        <p>
          For deletion or privacy requests, email{' '}
          <a href={`mailto:${support}`}>{support}</a>.
        </p>
        <p className="not-prose mt-8">
          <Link href="/terms" className="text-green-700 underline">Terms (draft)</Link>
          {' · '}
          <Link href="/" className="text-green-700 underline">Home</Link>
        </p>
      </main>
    </div>
  )
}
