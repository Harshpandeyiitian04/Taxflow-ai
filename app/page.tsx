import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const EXTRACTED_FIELDS = [
  'Employer name, PAN, TAN',
  'Employee name and PAN',
  'Gross salary u/s 17(1)',
  'HRA exempt u/s 10(13A)',
  'LTA exempt u/s 10(5)',
  'Standard deduction ₹50,000',
  'Professional tax u/s 16(iii)',
  'All Chapter VI-A deductions',
  'Net taxable income',
  'Total TDS deducted',
  'Quarter-wise TDS (Q1–Q4)',
  'Tax computation & cess',
]

const LOOM_DEMO_URL = process.env.NEXT_PUBLIC_LOOM_DEMO_URL

const FAQ = [
  {
    q: 'Is my client data safe?',
    a: 'Documents are stored in the private storage bucket configured in your Supabase project. Access is restricted to the CA firm that owns the client record.',
  },
  {
    q: 'Which software does the CSV export work with?',
    a: 'The exported CSV works with Winman, Computax, KDK (Zen IT), Gen IT, ClearTax, and any software that accepts Excel or CSV input. Simply copy-paste the extracted values.',
  },
  {
    q: 'What if the Form 16 is a scanned copy or photo?',
    a: 'TaxFlow AI uses Gemini Vision AI which handles scanned PDFs and high-quality photos. Digital PDFs give the best accuracy. WhatsApp photos usually work well for major fields.',
  },
  {
    q: 'Can my clients upload their own documents?',
    a: 'Yes. For each client you get a unique upload link to share on WhatsApp. Your client clicks the link on their phone, selects their Form 16, and uploads it. No login required for clients.',
  },
  {
    q: 'Is TaxFlow AI free to use?',
    a: 'Yes. TaxFlow AI is free during early access, with no extraction limit and no payment details required.',
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: firm } = user
    ? await supabase.from('ca_firms').select('id').eq('user_id', user.id).maybeSingle()
    : { data: null }
  const accountHref = firm ? '/dashboard' : user ? '/login?error=account-setup' : '/login'

  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ─────────────────────────────────── */}
      <nav className="border-b border-gray-100 px-6 py-4 sticky top-0 bg-white/95 backdrop-blur-sm z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">TaxFlow AI</span>
          <div className="flex items-center gap-4">
            <a href="#faq" className="text-sm text-gray-500 hover:text-gray-900 hidden sm:block">FAQ</a>
            <a href="#pricing" className="text-sm text-gray-500 hover:text-gray-900 hidden sm:block">Pricing</a>
            {firm ? (
              <>
                <Link href="/dashboard"
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Dashboard
                </Link>
                <a href="/auth/signout"
                  className="text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">
                  Sign out
                </a>
              </>
            ) : user ? (
              <>
                <Link href="/login?error=account-setup"
                  className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Finish account setup
                </Link>
                <a href="/auth/signout"
                  className="text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">
                  Sign out
                </a>
              </>
            ) : (
              <>
                <Link href="/login"
                  className="text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">
                  Sign in
                </Link>
                <Link href="/login"
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────── */}
      <section className="px-6 py-20 text-center max-w-4xl mx-auto">
        <div className="inline-block bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          Built for Indian CA firms
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Stop typing Form 16 data.<br />
          <span className="text-green-600">AI does it in 8 seconds.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          TaxFlow AI reads your clients&apos; Form 16 PDFs and extracts every field automatically —
          employer PAN, gross salary, TDS, all Chapter VI-A deductions, everything.
          No more manual data entry.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link href={accountHref}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors">
            {firm ? 'Go to dashboard' : user ? 'Finish account setup' : 'Start free — unlimited extractions'}
          </Link>
          <a href={LOOM_DEMO_URL ? '#demo' : accountHref}
            className="text-gray-600 hover:text-gray-900 px-8 py-4 rounded-xl font-medium text-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            {LOOM_DEMO_URL ? 'Watch the demo' : 'Try Form 16 extraction'}
          </a>
        </div>
        <p className="text-sm text-gray-400 mt-3">No credit card · Setup in 2 minutes · Works with Winman, Computax, KDK</p>
      </section>

      {/* ── Pain numbers ──────────────────────────── */}
      <section className="bg-gray-50 px-6 py-14">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            How much time are you losing to Form 16 data entry?
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { num: '15 min', label: `per Form 16
typed manually` },
              { num: '25 hrs', label: `lost per 100 clients
every ITR season` },
              { num: '8 sec', label: `with TaxFlow AI
per Form 16` },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="text-3xl font-bold text-gray-900">{s.num}</div>
                <div className="text-sm text-gray-500 mt-1 whitespace-pre-line">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-gray-600 text-base">
            At 100 clients, Form 16 data entry alone takes <strong>25 hours</strong> — more than 3 full working days.
            Every year. TaxFlow cuts that to <strong>under 15 minutes</strong>.
          </p>
        </div>
      </section>

      {/* ── Demo ──────────────────────────────────── */}
      {LOOM_DEMO_URL && <section id="demo" className="px-6 py-16 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Watch it work — 90 seconds</h2>
          <p className="text-gray-500">Real Form 16, real extraction, no editing after</p>
        </div>
        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 shadow-lg"
          style={{ paddingTop: '56.25%' }}>
          <iframe
            src={LOOM_DEMO_URL}
            frameBorder="0"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
            title="TaxFlow AI — Form 16 extraction demo"
          />
        </div>
        <p className="text-center text-sm text-gray-400 mt-3">
          Showing extraction of a real Form 16 PDF · High confidence · All fields correct
        </p>
      </section>}

      {/* ── What gets extracted ───────────────────── */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Every field. Automatically.</h2>
            <p className="text-gray-500">
              TaxFlow reads Part A and Part B of Form 16 and extracts all fields in one pass.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {EXTRACTED_FIELDS.map(f => (
              <div key={f} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-green-500 text-lg shrink-0">✓</span>
                <span className="text-sm text-gray-700">{f}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-5">
            Form 16 Part A and Part B are processed in one extraction.
          </p>
        </div>
      </section>

      {/* ── How it works ──────────────────────────── */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">How it works</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Add your client', desc: 'Enter the client name and PAN. Get a unique upload link in 10 seconds.' },
            { step: '2', title: 'Client uploads on WhatsApp', desc: 'Share the link on WhatsApp. Client opens it on their phone and uploads Form 16 in 2 minutes. No login needed.' },
            { step: '3', title: 'AI extracts everything', desc: 'TaxFlow reads the PDF and populates all fields. Download CSV and paste into Winman or Computax. Done.' },
          ].map(s => (
            <div key={s.step} className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-4">
                {s.step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Free during early access</h2>
          <p className="text-gray-500 mb-8">All six MVP workflows are available without an extraction limit or payment details.</p>
          <Link href={accountHref}
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold text-sm transition-colors">
            {firm ? 'Open your dashboard' : user ? 'Finish account setup' : 'Create your free account'}
          </Link>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────── */}
      <section id="faq" className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQ.map(item => (
            <div key={item.q} className="border border-gray-200 rounded-2xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">{item.q}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────── */}
      <section className="bg-green-600 px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            ITR deadline is July 31. Start saving time today.
          </h2>
          <p className="text-green-100 mb-8 text-lg">
            Unlimited extractions. No payment details. Takes 2 minutes to set up.
          </p>
          <Link href={accountHref}
            className="inline-block bg-white text-green-700 hover:bg-green-50 px-10 py-4 rounded-xl font-bold text-lg transition-colors">
            {firm ? 'Open your dashboard →' : user ? 'Finish account setup →' : 'Start extracting for free →'}
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────── */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-gray-900">TaxFlow AI</span>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="mailto:harshpandeyiitian04@gmail.com" className="hover:text-gray-600">support@taxflowai.in</a>
            <span>Built for Indian CA firms</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
