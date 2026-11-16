import 'server-only'

import { createNeonAuth } from '@neon/auth/next/server'

// Server-side sign-in setup used by API routes and pages.

// Reads a required setting from the environment.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

export const auth = createNeonAuth({
  baseUrl: requireEnv('NEON_AUTH_BASE_URL'),
  cookies: {
    secret: requireEnv('NEON_AUTH_COOKIE_SECRET'),
  },
})