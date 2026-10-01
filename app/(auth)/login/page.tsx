'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading login form…</div>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const callbackError = searchParams.get('error')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const redirectUrl = new URL('/auth/callback', window.location.origin)
    // Keep a ref parameter even when empty so the Supabase email template can
    // append token_hash and type with a stable query-string separator.
    redirectUrl.searchParams.set('ref', refCode?.trim().toUpperCase() ?? '')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectUrl.toString(),
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-500">
            We sent a magic link to <strong className="text-gray-900">{email}</strong>.
            Click it to sign in or finish creating your account — no password needed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-2xl border border-gray-200 w-full max-w-md">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-6 block">
          ← Back to home
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in or create your free account</h1>
        <p className="text-gray-500 mb-7 text-sm">
          Enter your email. If this is your first time, we&apos;ll create your account after you confirm the link.
        </p>
        {callbackError && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">
            {callbackError === 'account-setup'
              ? 'Your email was verified, but we could not finish setting up your firm account. Check the Supabase database and server configuration, then request a new magic link.'
              : 'This magic link is invalid, expired, or already used. Request a new magic link.'}
          </p>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-shadow"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            {loading ? 'Sending magic link...' : 'Send magic link'}
          </button>
        </form>
      </div>
    </div>
  )
}
