import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { sendWelcomeEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type') as EmailOtpType | null
  const requestedNext = searchParams.get('next') ?? '/dashboard'
  let next = '/dashboard'
  try {
    const nextUrl = new URL(requestedNext, origin)
    if (nextUrl.origin === origin) {
      next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
    }
  } catch {
    // Ignore malformed redirect targets and send authenticated users to the dashboard.
  }
  const referralCode = searchParams.get('ref')?.trim().toUpperCase()

  if (code || (tokenHash && otpType)) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! })

    if (!error) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData.user
        if (!user) throw new Error('Authenticated user was not returned')

        const admin = createAdminClient()
        const { data: firmByUser, error: lookupError } = await admin
          .from('ca_firms')
          .select('id, user_id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (lookupError) throw lookupError

        let firm = firmByUser

        // An existing signup trigger may have created the firm by email before this callback runs.
        if (!firm && user.email) {
          const { data: firmByEmail, error: emailLookupError } = await admin
            .from('ca_firms')
            .select('id, user_id')
            .eq('email', user.email)
            .maybeSingle()

          if (emailLookupError) throw emailLookupError
          if (firmByEmail?.user_id && firmByEmail.user_id !== user.id) {
            throw new Error('Firm email is already linked to another account')
          }

          if (firmByEmail && !firmByEmail.user_id) {
            const { data: linkedFirm, error: linkError } = await admin
              .from('ca_firms')
              .update({ user_id: user.id })
              .eq('id', firmByEmail.id)
              .is('user_id', null)
              .select('id, user_id')
              .maybeSingle()

            if (linkError) throw linkError
            if (linkedFirm) {
              firm = linkedFirm
            } else {
              // Another callback may have linked this row between lookup and update.
              const { data: linkedByAnotherCallback, error: retryLinkError } = await admin
                .from('ca_firms')
                .select('id, user_id')
                .eq('user_id', user.id)
                .maybeSingle()

              if (retryLinkError) throw retryLinkError
              if (linkedByAnotherCallback) firm = linkedByAnotherCallback
            }
          } else if (firmByEmail) {
            firm = firmByEmail
          }
        }

        if (!firm) {
          const { data: newFirm, error: createError } = await admin
            .from('ca_firms')
            .insert({ user_id: user.id, email: user.email ?? '' })
            .select('id, user_id')
            .single()

          if (createError) {
            // Resolve a unique-email race or signup trigger that created the row concurrently.
            const { data: racedFirm, error: retryError } = await admin
              .from('ca_firms')
              .select('id, user_id')
              .eq('user_id', user.id)
              .maybeSingle()
            if (retryError || !racedFirm) throw createError
            firm = racedFirm
          } else {
            firm = newFirm
            if (user.email) await sendWelcomeEmail(user.email)
          }
        }

        if (referralCode && firm) {
          try {
            const { data: referrer } = await admin
              .from('ca_firms')
              .select('id')
              .eq('referral_code', referralCode)
              .maybeSingle()

            if (referrer && referrer.id !== firm.id) {
              const { error: referralError } = await admin
                .from('ca_firms')
                .update({ referred_by: referralCode })
                .eq('id', firm.id)
                .is('referred_by', null)

              if (referralError) throw referralError
            }
          } catch (err: unknown) {
            // A referral lookup must not undo a valid authentication or firm setup.
            console.error('Referral attribution failed:', err instanceof Error ? err.message : err)
          }
        }
      } catch (err: unknown) {
        console.error('Firm setup failed:', err instanceof Error ? err.message : err)
        return NextResponse.redirect(`${origin}/login?error=account-setup`)
      }

      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid-link`)
}
