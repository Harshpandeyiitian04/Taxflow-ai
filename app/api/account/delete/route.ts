// API to permanently delete a CA firm account and stored files.
import { NextRequest, NextResponse } from 'next/server'
import { auth as neonAuth } from '@/lib/auth/server'
import { sql, withAdmin } from '@/lib/db/sql'
import { getFirmStoragePaths } from '@/lib/db/queries'
import { deleteDocumentObjects, listDocumentKeys } from '@/lib/storage/documents'
import { requireFirm } from '@/lib/auth/requireFirm'
import { logError } from '@/lib/logger'

// Removes the login user after firm data has been deleted.
async function deleteAuthUser(userId: string): Promise<boolean> {
  try {
    const { error } = await neonAuth.deleteUser({})
    if (!error) return true
  } catch {
  }

  try {
    await withAdmin(txn => [
      txn`delete from neon_auth."user" where id = ${userId}::uuid`,
    ])
    return true
  } catch {
    return false
  }
}

// Deletes firm data, storage, and auth when the user types DELETE.
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

  try {
    const recordedPaths = await getFirmStoragePaths(firm.id)

    let orphanPaths: string[] = []
    try {
      orphanPaths = await listDocumentKeys({ firmId: firm.id })
    } catch {
      logError('account_delete_storage_list_failed', { firmId: firm.id })
    }

    const paths = [...new Set([...recordedPaths, ...orphanPaths])]
    if (paths.length > 0) {
      try {
        await deleteDocumentObjects({ firmId: firm.id, keys: paths })
      } catch {
        logError('account_delete_storage_failed', { firmId: firm.id, count: paths.length })
      }
    }

    try {
      await sql()`delete from public.ca_firms where id = ${firm.id}::uuid`
    } catch {
      logError('account_delete_firm_failed', { firmId: firm.id })
      return NextResponse.json({ error: 'Could not delete firm data' }, { status: 500 })
    }

    const authDeleted = await deleteAuthUser(user.id)
    if (!authDeleted) {
      logError('account_delete_auth_failed', { userId: user.id })
      return NextResponse.json({ error: 'Firm data removed but auth user deletion failed. Contact support.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    logError('account_delete_unexpected', { firmId: firm.id })
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 })
  }
}