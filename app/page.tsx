import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">TaxFlow AI</span>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Sign in
          </Link>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <div className="inline-block bg-green-50 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8 border border-green-200">
          Built for Indian CA firms
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Stop typing Form 16 data.<br />
          <span className="text-green-600">Let AI do it in 8 seconds.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          TaxFlow AI reads your clients&apos; Form 16 PDFs and extracts every field automatically.
          No more manual data entry. No more missed fields.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login"
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-semibold text-lg transition-colors"
          >
            Start free — 5 extractions
          </Link>
        </div>
        <p className="text-sm text-gray-400 mt-4">No credit card · Takes 2 minutes</p>
      </div>
    </main>
  )
}