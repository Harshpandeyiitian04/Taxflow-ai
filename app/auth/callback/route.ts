// Redirect target after a magic-link sign-in succeeds.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email'
import { auth } from '@/lib/auth/server'
import { sql, withAdmin } from '@/lib/db/sql'
import { sanitizeNextPath } from '@/lib/auth/sanitizeNextPath'

export { sanitizeNextPath }

type FirmRef = { id: string; user_id: string | null }

// Ensures a firm row exists, then sends the user to their destination.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const requestedNext = searchParams.get('next') ?? '/dashboard'
  const next = sanitizeNextPath(requestedNext, origin)
  const referralCode = searchParams.get('ref')?.trim().toUpperCase()

  const { data: session } = await auth.getSession()
  const user = session?.user
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`)
  }

  try {
    const query = sql()

    const byUser = await query`
      select id::text as id, user_id::text as user_id
        from public.ca_firms
       where user_id = ${user.id}::uuid
       limit 1
    `
    let firm = (byUser[0] as FirmRef | undefined) ?? null

    if (!firm && user.email) {
      const byEmail = await query`
        select id::text as id, user_id::text as user_id
          from public.ca_firms
         where email = ${user.email}
         limit 1
      `
      const firmByEmail = (byEmail[0] as FirmRef | undefined) ?? null

      if (firmByEmail?.user_id && firmByEmail.user_id !== user.id) {
        throw new Error('Firm email is already linked to another account')
      }
      if (firmByEmail) firm = firmByEmail
    }

    if (!firm) {
      try {
        const inserted = await query`
          insert into public.ca_firms (user_id, email)
          values (${user.id}::uuid, ${user.email ?? ''})
          returning id::text as id, user_id::text as user_id
        `
        firm = (inserted[0] as FirmRef | undefined) ?? null
        if (firm && user.email) await sendWelcomeEmail(user.email)
      } catch (createError) {
        const raced = await query`
          select id::text as id, user_id::text as user_id
            from public.ca_firms
           where user_id = ${user.id}::uuid
           limit 1
        `
        const racedFirm = (raced[0] as FirmRef | undefined) ?? null
        if (!racedFirm) throw createError
        firm = racedFirm
      }
    }

    if (referralCode && firm) {
      try {
        const referrerRows = await query`
          select id::text as id
            from public.ca_firms
           where referral_code = ${referralCode}
           limit 1
        `
        const referrer = referrerRows[0] as { id: string } | undefined

        if (referrer && referrer.id !== firm.id) {
          const firmId = firm.id
          await withAdmin(txn => [
            txn`
              update public.ca_firms
                 set referred_by = ${referralCode}
               where id = ${firmId}::uuid
                 and referred_by is null
            `,
          ])
        }
      } catch (err: unknown) {
        console.error('Referral attribution failed:', err instanceof Error ? err.message : err)
      }
    }
  } catch (err: unknown) {
    console.error('Firm setup failed:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(`${origin}/login?error=account-setup`)
  }

  return NextResponse.redirect(new URL(next, origin))
}