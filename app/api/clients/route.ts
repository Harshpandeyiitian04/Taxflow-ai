// API to list clients and create new ones with upload links.
import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/sql'
import { countClients, getClientsWithDocuments, insertClient } from '@/lib/db/queries'
import { requireFirm } from '@/lib/auth/requireFirm'
import { trackServerEvent } from '@/lib/analytics'
import { MAX_CLIENTS_PER_FIRM } from '@/lib/constants'
import { defaultAssessmentYear } from '@/lib/dates'

const CLIENT_LIST_LIMIT = 500

// Adds a client record and returns a shareable upload URL.
export async function POST(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { user, firm } = auth

  const body = await request.json()
  const { name, pan, phone, email, assessment_year } = body
  const ay = (typeof assessment_year === 'string' && assessment_year.trim())
    ? assessment_year.trim()
    : defaultAssessmentYear()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }

  let clientCount: number
  try {
    clientCount = await countClients(firm.id)
  } catch (err: unknown) {
    console.error('Count clients error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
  if (clientCount >= MAX_CLIENTS_PER_FIRM) {
    return NextResponse.json(
      { error: `Client limit of ${MAX_CLIENTS_PER_FIRM} reached for this firm.` },
      { status: 429 }
    )
  }

  let client
  try {
    client = await insertClient(firm.id, {
      name: name.trim(),
      pan: pan?.trim().toUpperCase() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      assessment_year: ay,
    })
  } catch (err: unknown) {
    console.error('Create client error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  let token: string
  try {
    const tokenRows = await sql()`
      insert into public.upload_tokens (client_id, ca_firm_id, token)
      values (${client.id}::uuid, ${firm.id}::uuid, ${randomBytes(32).toString('hex')})
      returning token
    `
    token = (tokenRows[0] as { token: string }).token
  } catch (err: unknown) {
    console.error('Token generation error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to generate upload link' }, { status: 500 })
  }

  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`

  await trackServerEvent(user.id, 'client_added', {
    has_pan: !!pan?.trim(),
    has_phone: !!phone?.trim(),
    assessment_year: ay,
  })
  await trackServerEvent(user.id, 'upload_link_created', {
    assessment_year: ay,
  })

  return NextResponse.json({
    success: true,
    client,
    uploadUrl,
    token,
  })
}

// Lists clients for the signed-in firm up to a fixed cap.
export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  try {
    const { clients, total } = await getClientsWithDocuments(firm.id, CLIENT_LIST_LIMIT)
    return NextResponse.json({
      clients,
      total,
      truncated: total > CLIENT_LIST_LIMIT,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load clients' },
      { status: 500 }
    )
  }
}