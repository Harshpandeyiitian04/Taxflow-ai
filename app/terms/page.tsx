// Draft terms of use page for TaxFlow AI.
import Link from 'next/link'

// Renders the public draft terms of use content.
export default function TermsPage() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@taxflowai.in'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm">
          <Link href="/" className="font-semibold text-gray-900">TaxFlow AI</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600">Terms (DRAFT)</span>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-6 py-10 prose prose-sm prose-gray">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 not-prose text-sm">
          DRAFT — not a binding contract. Have a lawyer review before publishing as Terms of Service.
        </p>
        <h1>Terms of use (draft)</h1>
        <p>
          TaxFlow AI provides AI-assisted document extraction for CA firms. Extracted values are assistive only.
          You must verify every field against source documents before filing returns or importing into tax software.
        </p>
        <h2>Acceptable use</h2>
        <ul>
          <li>Use only for clients you are authorized to serve</li>
          <li>Do not upload documents you lack rights to process</li>
          <li>Do not attempt to abuse fair-use extraction limits or probe other firms&apos; data</li>
        </ul>
        <h2>No tax advice</h2>
        <p>
          TaxFlow AI does not provide tax, legal, or accounting advice. Deadlines shown in-product are estimates;
          confirm statutory dates on the Income Tax and GST portals.
        </p>
        <h2>Early access</h2>
        <p>
          During free early access, features and limits may change. Payments are disabled.
        </p>
        <h2>Contact</h2>
        <p>
          Questions: <a href={`mailto:${support}`}>{support}</a>
        </p>
        <p className="not-prose mt-8">
          <Link href="/privacy" className="text-green-700 underline">Privacy (draft)</Link>
          {' · '}
          <Link href="/" className="text-green-700 underline">Home</Link>
        </p>
      </main>
    </div>
  )
}