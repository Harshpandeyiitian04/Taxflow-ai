import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentFirm, getOrCreateUploadToken } from '@/lib/supabase/queries'
import { trackServerEvent } from '@/lib/analytics'

// GET /api/clients/[id] — fetch client + documents + upload token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('clients')
    .select(`*, documents(id, type, original_filename, extraction_status, extracted_data, extraction_error, file_size_bytes, created_at)`)
    .eq('id', id)
    .eq('ca_firm_id', firm.id)  // RLS: can only fetch own clients
    .single()

  if (error || !data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Get or create upload token for sharing
  const token = await getOrCreateUploadToken(id, firm.id)
  const uploadUrl = token
    ? `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`
    : null

  if (uploadUrl) {
    await trackServerEvent(user.id, 'upload_link_shared', { firm_id: firm.id })
  }

  return NextResponse.json({ client: data, uploadUrl })
}

// PATCH /api/clients/[id] — update status or details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const validStatuses = ['pending', 'received', 'processing', 'done', 'filed']
  if ('status' in body && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid client status' }, { status: 400 })
  }

  if ('tags' in body && (!Array.isArray(body.tags) || body.tags.some((tag: unknown) => typeof tag !== 'string'))) {
    return NextResponse.json({ error: 'Tags must be an array of strings' }, { status: 400 })
  }
  if ('fee_amount' in body && body.fee_amount !== null &&
      (typeof body.fee_amount !== 'number' || !Number.isFinite(body.fee_amount) || body.fee_amount < 0)) {
    return NextResponse.json({ error: 'Fee must be a non-negative number' }, { status: 400 })
  }
  if ('fee_paid' in body && typeof body.fee_paid !== 'boolean') {
    return NextResponse.json({ error: 'Fee status must be boolean' }, { status: 400 })
  }
  if ('gstin' in body && body.gstin !== null && typeof body.gstin !== 'string') {
    return NextResponse.json({ error: 'GSTIN must be text' }, { status: 400 })
  }
  if ('gst_scheme' in body && !['monthly', 'quarterly', 'composition', 'exempt'].includes(body.gst_scheme)) {
    return NextResponse.json({ error: 'Invalid GST scheme' }, { status: 400 })
  }

  const allowed = ['status', 'pan', 'phone', 'email', 'tags', 'notes', 'fee_amount', 'fee_paid', 'gstin', 'gst_scheme']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .eq('ca_firm_id', firm.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}

// DELETE /api/clients/[id] — remove client and all documents
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cascade deletes documents + tokens due to ON DELETE CASCADE
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('ca_firm_id', firm.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}