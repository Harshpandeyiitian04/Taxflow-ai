// Sends anonymous usage events to PostHog when configured.

// Records one server-side product event for analytics.
export async function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

  try {
    await fetch(`${host.replace(/\/+$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'taxflow-server' },
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
  }
}