import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentFirm } from '@/lib/supabase/queries'

// POST /api/clients/[id]/token — regenerate upload token for existing client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', id)
    .eq('ca_firm_id', firm.id)
    .maybeSingle()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Delete any existing active tokens for this client
  await admin
    .from('upload_tokens')
    .delete()
    .eq('client_id', id)
    .eq('ca_firm_id', firm.id)
    .eq('used', false)

  // Create a fresh token (expires in 30 days)
  const { data: tokenRow, error } = await admin
    .from('upload_tokens')
    .insert({ client_id: id, ca_firm_id: firm.id, token: randomBytes(32).toString('hex') })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })

  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${tokenRow.token}`
  return NextResponse.json({ uploadUrl, token: tokenRow.token })
}