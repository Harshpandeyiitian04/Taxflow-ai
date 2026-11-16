// Proxies Neon Auth HTTP routes into the Next.js app.
import { auth } from '@/lib/auth/server'

export const { GET, POST, PUT, PATCH, DELETE } = auth.handler()