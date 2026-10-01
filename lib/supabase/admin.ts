import { createClient } from '@supabase/supabase-js'

// Admin client uses service role key — bypasses RLS
// ONLY use this in API routes (server-side), NEVER in components
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}