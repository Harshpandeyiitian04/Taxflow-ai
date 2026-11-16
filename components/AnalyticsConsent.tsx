'use client'

// Stores and reads whether the user allowed usage analytics.

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'taxflow_analytics_consent'

export type AnalyticsConsentValue = 'granted' | 'denied'

// Reads the saved consent value from browser storage.
function readConsent(): AnalyticsConsentValue | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(STORAGE_KEY)
  if (value === 'granted' || value === 'denied') return value
  return null
}

const listeners = new Set<() => void>()

// Registers a listener for consent changes.
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Notifies all listeners that consent changed.
function emit() {
  listeners.forEach(l => l())
}

// Returns the current consent without using React.
export function getAnalyticsConsent(): AnalyticsConsentValue | null {
  return readConsent()
}

// Saves consent and tells subscribers to refresh.
export function setAnalyticsConsent(value: AnalyticsConsentValue) {
  window.localStorage.setItem(STORAGE_KEY, value)
  emit()
}

// React hook that re-renders when consent changes.
export function useAnalyticsConsent(): AnalyticsConsentValue | null {
  return useSyncExternalStore(subscribe, readConsent, () => null)
}

// Bottom bar asking the user to accept or decline analytics.
export function AnalyticsConsentBanner({
  onDecision,
}: {
  onDecision: (value: AnalyticsConsentValue) => void
}) {
  const consent = useAnalyticsConsent()
  // Saves consent and notifies the parent provider.
  const decide = useCallback((value: AnalyticsConsentValue) => {
    setAnalyticsConsent(value)
    onDecision(value)
  }, [onDecision])

  if (consent !== null) return null

  return (
    <div
      role="dialog"
      aria-label="Analytics cookies"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:left-auto"
    >
      <p className="text-sm text-gray-700">
        We use privacy-preserving analytics (PostHog) only after you consent. Session recording and
        form autocapture stay off. See our{' '}
        <a href="/privacy" className="text-green-700 underline">privacy draft</a>.
      </p>
      <div className="mt-3 flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => decide('denied')}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => decide('granted')}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
