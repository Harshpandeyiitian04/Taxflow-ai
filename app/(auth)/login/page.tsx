'use client'

import { Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getHashSnapshot() {
  return window.location.hash
}

function getServerHashSnapshot() {
  return ''
}

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
  const [mode, setMode] = useState<'signup' | 'login'>(
    searchParams.get('mode') === 'login' ? 'login' : 'signup'
  )
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const hash = useSyncExternalStore(subscribeToHash, getHashSnapshot, getServerHashSnapshot)
  const fragment = new URLSearchParams(hash.slice(1))
  const fragmentError = fragment.get('error_code') || fragment.get('error')
  const queryErrorCode = searchParams.get('error_code')
  const errorDescription = fragment.get('error_description')
    || searchParams.get('error_description')
    || ''
  const authErrorCode = fragmentError || queryErrorCode
  const callbackError = authErrorCode
    ? authErrorCode === 'otp_expired' || /expired|already used/i.test(errorDescription)
      ? 'expired-link'
      : 'invalid-link'
    : searchParams.get('error')

  useEffect(() => {
    const url = new URL(window.location.href)
    const fragment = new URLSearchParams(url.hash.slice(1))
    const errorCode = fragment.get('error_code')
      || fragment.get('error')
      || url.searchParams.get('error_code')
    const description = fragment.get('error_description')
      || url.searchParams.get('error_description')
      || ''

    if (errorCode) {
      url.searchParams.set(
        'error',
        errorCode === 'otp_expired' || /expired|already used/i.test(description)
          ? 'expired-link'
          : 'invalid-link'
      )
      url.hash = ''
      url.searchParams.delete('error_code')
      url.searchParams.delete('error_description')
      window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    }
  }, [])

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
        shouldCreateUser: mode === 'signup',
        emailRedirectTo: redirectUrl.toString(),
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
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
            {mode === 'signup'
              ? 'Click it to confirm your email and finish signing up. If this email already has an account, the link will sign you in.'
              : 'If an account exists for this email, the link will sign you in. If you are new, choose Sign up.'}
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-6 text-sm font-medium text-green-700 hover:text-green-800"
          >
            Use another email
          </button>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {mode === 'signup' ? 'Create your free account' : 'Log in to TaxFlow AI'}
        </h1>
        <p className="text-gray-500 mb-7 text-sm">
          {mode === 'signup'
            ? 'Enter your firm email. If it already exists in TaxFlow records, we’ll connect that firm when you confirm.'
            : 'For an existing TaxFlow login. If your email is only in firm records and you have never logged in, choose Sign up.'}
        </p>
        {callbackError && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">
            {callbackError === 'account-setup'
              ? 'Your email was verified, but we could not finish setting up your firm account. Check the Supabase database and server configuration, then request a new magic link.'
              : callbackError === 'expired-link'
                ? 'This magic link expired or was already used. Request a new link and open the newest email once.'
                : 'This magic link could not be verified. Request a new link and try again.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 mb-5" role="group" aria-label="Choose sign up or log in">
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            onClick={() => { setMode('signup'); setError('') }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Sign up
          </button>
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => { setMode('login'); setError('') }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Log in
          </button>
        </div>
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
            {loading
              ? 'Sending magic link...'
              : mode === 'signup'
                ? 'Send sign-up link'
                : 'Send login link'}
          </button>
        </form>
      </div>
    </div>
  )
}
