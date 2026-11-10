import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireFirm } from '@/lib/auth/requireFirm'
import { trackServerEvent } from '@/lib/analytics'

const CLIENT_LIST_SELECT =
  'id, ca_firm_id, name, pan, phone, email, assessment_year, status, tags, notes, gstin, gst_scheme, fee_amount, fee_paid, last_reminder_sent_at, reminder_count, created_at, updated_at, documents(id, type, extraction_status, created_at)'

// POST /api/clients — create a new client + generate upload token
export async function POST(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { user, firm } = auth

  const body = await request.json()
  const { name, pan, phone, email, assessment_year } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({
      ca_firm_id: firm.id,
      name: name.trim(),
      pan: pan?.trim().toUpperCase() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      assessment_year: assessment_year || '2026-27',
      status: 'pending',
    })
    .select()
    .single()

  if (clientError) {
    console.error('Create client error:', clientError.message)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: tokenRow, error: tokenError } = await admin
    .from('upload_tokens')
    .insert({
      client_id: client.id,
      ca_firm_id: firm.id,
      token: randomBytes(32).toString('hex'),
    })
    .select('token')
    .single()

  if (tokenError) {
    console.error('Token generation error:', tokenError.message)
    return NextResponse.json({ error: 'Failed to generate upload link' }, { status: 500 })
  }

  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${tokenRow.token}`

  await trackServerEvent(user.id, 'client_added', {
    has_pan: !!pan?.trim(),
    has_phone: !!phone?.trim(),
    assessment_year: assessment_year || '2026-27',
  })
  await trackServerEvent(user.id, 'upload_link_created', {
    assessment_year: assessment_year || '2026-27',
  })

  return NextResponse.json({
    success: true,
    client,
    uploadUrl,
    token: tokenRow.token,
  })
}

// GET /api/clients — list clients for current firm (no extracted_data)
export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const supabase = await createClient()
  const { data, error, count } = await supabase
    .from('clients')
    .select(CLIENT_LIST_SELECT, { count: 'exact' })
    .eq('ca_firm_id', firm.id)
    .order('created_at', { ascending: false })
    .range(0, 499)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    clients: data,
    total: count ?? data?.length ?? 0,
    truncated: (count ?? 0) > 500,
  })
}
