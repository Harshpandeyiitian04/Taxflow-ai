// Runs auth checks on protected app pages before they load.
import { auth } from '@/lib/auth/server'

// Wires Neon auth middleware; unauthenticated users go to login.
export default auth.middleware({ loginUrl: '/login' })

// Lists which URL paths use the auth middleware above.
export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/extract',
    '/extract/:path*',
    '/bulk',
    '/bulk/:path*',
    '/gst',
    '/gst/:path*',
    '/analytics',
    '/analytics/:path*',
    '/referral',
    '/referral/:path*',
    '/profile',
    '/profile/:path*',
    '/auth/callback',
  ],
}