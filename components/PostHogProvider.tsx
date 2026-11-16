'use client'

// Loads analytics only after consent and skips sensitive pages.

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  AnalyticsConsentBanner,
  useAnalyticsConsent,
  type AnalyticsConsentValue,
} from '@/components/AnalyticsConsent'

const SENSITIVE_PREFIXES = [
  '/dashboard',
  '/extract',
  '/bulk',
  '/upload',
  '/gst',
  '/analytics',
  '/profile',
  '/referral',
  '/clients',
]

// True when the URL should not send analytics events.
function isSensitivePath(pathname: string | null): boolean {
  if (!pathname) return true
  return SENSITIVE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

let posthogBootstrapped = false

// Starts or stops PostHog based on the user's consent choice.
function ensurePostHog(key: string, host: string, consent: AnalyticsConsentValue) {
  if (consent !== 'granted') {
    posthog.opt_out_capturing()
    return false
  }
  if (posthogBootstrapped) {
    posthog.opt_in_capturing()
    return true
  }
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug()
    },
  })
  posthogBootstrapped = true
  return true
}

// Wraps the app with PostHog and the consent banner.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
  const pathname = usePathname()
  const consent = useAnalyticsConsent()
  const readyRef = useRef(false)

  useEffect(() => {
    if (!key) {
      posthog.opt_out_capturing()
      readyRef.current = false
      return
    }
    if (!consent) return
    readyRef.current = ensurePostHog(key, host, consent)
  }, [key, host, consent])

  useEffect(() => {
    if (!key || consent !== 'granted') return
    if (!readyRef.current && key) {
      readyRef.current = ensurePostHog(key, host, 'granted')
    }
    if (!readyRef.current) return
    if (isSensitivePath(pathname)) return
    posthog.capture('$pageview', { path: pathname })
  }, [pathname, consent, key, host])

  // Applies accept or decline from the consent banner.
  function handleDecision(value: AnalyticsConsentValue) {
    if (!key) return
    readyRef.current = ensurePostHog(key, host, value)
  }

  if (!key) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      {children}
      <AnalyticsConsentBanner onDecision={handleDecision} />
    </PHProvider>
  )
}
