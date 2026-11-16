// Cleans redirect paths so users only go to safe pages on this site.

// Returns a safe internal path or falls back to the dashboard.
export function sanitizeNextPath(requestedNext: string, origin: string): string {
  const fallback = '/dashboard'
  if (!requestedNext.startsWith('/') || requestedNext.startsWith('//')) return fallback
  if (
    requestedNext.includes('\\') ||
    /%2f/i.test(requestedNext) ||
    /%5c/i.test(requestedNext)
  ) {
    return fallback
  }
  try {
    const nextUrl = new URL(requestedNext, origin)
    if (nextUrl.origin !== origin) return fallback
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  } catch {
    return fallback
  }
}