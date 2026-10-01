import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentFirm } from '@/lib/supabase/queries'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ firm })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firm = await getCurrentFirm()
  if (!firm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { firm_name, owner_name, phone, city } = body

  const { data, error } = await supabase
    .from('ca_firms')
    .update({
      firm_name: firm_name?.trim() || null,
      owner_name: owner_name?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
    })
    .eq('id', firm.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ firm: data })
}