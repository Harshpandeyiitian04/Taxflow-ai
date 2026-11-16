// Next.js settings plus security headers for every page.
import type { NextConfig } from 'next'

// Gets the main site address from a full URL, or blank if invalid.
function originOf(value: string | undefined): string {
  if (!value) return ''
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

const neonAuthOrigin = originOf(process.env.NEON_AUTH_BASE_URL)
const storageOrigin = originOf(process.env.AWS_ENDPOINT_URL_S3)
const dataHosts = [neonAuthOrigin, storageOrigin].filter(Boolean).join(' ')

const posthogHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_POSTHOG_HOST
      ? new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST).origin
      : 'https://us.i.posthog.com'
  } catch {
    return 'https://us.i.posthog.com'
  }
})()

const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${posthogHost}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${dataHosts}`.trim(),
  `font-src 'self' data:`,
  `connect-src 'self' ${dataHosts} ${posthogHost} https://generativelanguage.googleapis.com`.trim(),
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

const nextConfig: NextConfig = {
  // Adds security-related HTTP headers to every response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: cspReportOnly,
          },
        ],
      },
    ]
  },
}

export default nextConfig