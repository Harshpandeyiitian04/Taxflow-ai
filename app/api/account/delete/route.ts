import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireFirm } from '@/lib/auth/requireFirm'
import { logError } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { user, firm } = auth

  let body: { confirm?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Type DELETE to confirm account deletion.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  try {
    // Remove storage objects under firm prefix
    const { data: docs } = await admin
      .from('documents')
      .select('storage_path')
      .eq('ca_firm_id', firm.id)

    const paths = (docs ?? [])
      .map(d => d.storage_path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)

    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from('documents').remove(paths)
      if (storageError) {
        logError('account_delete_storage_failed', { firmId: firm.id, count: paths.length })
      }
    }

    // Also try listing firm folder for orphans
    const { data: listed } = await admin.storage.from('documents').list(firm.id, { limit: 1000 })
    if (listed?.length) {
      const folderPaths = listed.map(f => `${firm.id}/${f.name}`)
      await admin.storage.from('documents').remove(folderPaths)
    }

    const { error: firmError } = await admin.from('ca_firms').delete().eq('id', firm.id)
    if (firmError) {
      logError('account_delete_firm_failed', { firmId: firm.id })
      return NextResponse.json({ error: 'Could not delete firm data' }, { status: 500 })
    }

    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) {
      logError('account_delete_auth_failed', { userId: user.id })
      return NextResponse.json({ error: 'Firm data removed but auth user deletion failed. Contact support.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    logError('account_delete_unexpected', { firmId: firm.id })
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 })
  }
}
