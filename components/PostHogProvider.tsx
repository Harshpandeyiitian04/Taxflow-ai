'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

  useEffect(() => {
    if (!key) {
      posthog.opt_out_capturing()
      return
    }

    posthog.init(key, {
      api_host: 'https://app.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.debug()
      },
    })
  }, [key])

  if (!key) return <>{children}</>
  return <PHProvider client={posthog}>{children}</PHProvider>
}