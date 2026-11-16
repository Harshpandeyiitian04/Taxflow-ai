// POST handler that signs the user out and sends them home.
import { auth } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'

// Returns true when Origin or Referer matches the configured app URL.
function hostMatchesAppUrl(candidate: string | null, appUrl: string): boolean {
  if (!candidate) return false
  try {
    const appHost = new URL(appUrl).host
    const candidateHost = candidate.includes('://')
      ? new URL(candidate).host
      : new URL(`https://${candidate}`).host
    return candidateHost === appHost
  } catch {
    return false
  }
}

// Ends the session after checking the request came from this app.
export async function POST(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return NextResponse.json({ error: 'App URL is not configured' }, { status: 500 })
  }

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (!hostMatchesAppUrl(origin, appUrl) && !hostMatchesAppUrl(referer, appUrl)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  await auth.signOut()
  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/', request.url))
}