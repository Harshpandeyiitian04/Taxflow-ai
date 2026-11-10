import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireFirm } from '@/lib/auth/requireFirm'

export async function GET() {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  return NextResponse.json({ firm: auth.firm })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  const body = await request.json()
  const { firm_name, owner_name, phone, city } = body

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ca_firms')
    .update({
      firm_name: firm_name?.trim() || null,
      owner_name: owner_name?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
    })
    .eq('id', firm.id)
    .select('id, user_id, email, firm_name, owner_name, phone, city, referral_code, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ firm: data })
}
