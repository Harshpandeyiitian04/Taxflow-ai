export async function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  await fetch('https://app.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event,
      distinct_id: distinctId,
      properties: { ...properties, $lib: 'taxflow-server' },
    }),
  }).catch(() => {})
}
