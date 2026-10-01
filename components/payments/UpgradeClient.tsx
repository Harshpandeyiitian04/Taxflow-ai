'use client'

import Link from 'next/link'

export function UpgradeClient() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">TaxFlow AI is free during early access</h1>
        <p className="mt-3 text-sm text-gray-600">
          Payments are disabled. Your account has unlimited Form 16 extractions.
        </p>
        <Link href="/dashboard" className="inline-block mt-6 bg-green-600 text-white px-5 py-2.5 rounded-md text-sm font-medium">
          Return to dashboard
        </Link>
      </section>
    </main>
  )
}