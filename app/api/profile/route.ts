// API to read and update the signed-in CA firm's profile.
import { NextRequest, NextResponse } from 'next/server'
import { requireFirm } from '@/lib/auth/requireFirm'
import { updateFirmProfile } from '@/lib/db/queries'

// Returns the current firm's profile for the logged-in user.
export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  return NextResponse.json({ firm: auth.firm })
}

// Updates firm name, owner, phone, or city from the request body.
export async function PATCH(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm, user } = auth

  const body = await request.json()
  const { firm_name, owner_name, phone, city } = body

  try {
    const updated = await updateFirmProfile(firm.id, user.id, {
      firm_name: firm_name?.trim() || null,
      owner_name: owner_name?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
    })
    if (!updated) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
    return NextResponse.json({ firm: updated })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update profile' },
      { status: 500 }
    )
  }
}