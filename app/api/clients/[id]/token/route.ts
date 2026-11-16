// API to mint a fresh client document upload link.
import { NextRequest, NextResponse } from 'next/server'
import { requireFirm } from '@/lib/auth/requireFirm'
import { clientBelongsToFirm, isUuid, regenerateUploadToken } from '@/lib/db/queries'

// Creates a new upload token and public URL for one client.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  if (!isUuid(id) || !(await clientBelongsToFirm(id, firm.id))) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let token: string
  try {
    token = await regenerateUploadToken(id, firm.id)
  } catch {
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }

  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`
  return NextResponse.json({ uploadUrl, token })
}