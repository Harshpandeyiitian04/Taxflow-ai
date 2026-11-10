import type { NextConfig } from 'next'

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : ''
  } catch {
    return ''
  }
})()

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
  `img-src 'self' data: blob: ${supabaseHost}`.trim(),
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseHost} ${posthogHost} https://generativelanguage.googleapis.com`.trim(),
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

const nextConfig: NextConfig = {
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
