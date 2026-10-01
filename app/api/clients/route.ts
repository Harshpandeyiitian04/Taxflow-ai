import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { trackServerEvent } from '@/lib/analytics'

// POST /api/clients — create a new client + generate upload token
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

  const body = await request.json()
  const { name, pan, phone, email, assessment_year } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Create the client
  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({
      ca_firm_id: firm.id,
      name: name.trim(),
      pan: pan?.trim().toUpperCase() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      assessment_year: assessment_year || '2027-28',
      status: 'pending',
    })
    .select()
    .single()

  if (clientError) {
    console.error('Create client error:', clientError)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  // Generate upload token
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
    console.error('Token generation error:', tokenError)
    return NextResponse.json({ error: 'Failed to generate upload link' }, { status: 500 })
  }

  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${tokenRow.token}`

  await trackServerEvent(user.id, 'client_added', {
    plan: firm.plan,
    has_pan: !!pan?.trim(),
    has_phone: !!phone?.trim(),
    assessment_year: assessment_year || '2027-28',
  })
  await trackServerEvent(user.id, 'upload_link_created', {
    plan: firm.plan,
    assessment_year: assessment_year || '2027-28',
  })

  return NextResponse.json({
    success: true,
    client,
    uploadUrl,
    token: tokenRow.token,
  })
}

// GET /api/clients — list all clients for current firm
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('clients')
    .select('*, documents(id, type, extraction_status, created_at)')
    .eq('ca_firm_id', firm.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clients: data })
}