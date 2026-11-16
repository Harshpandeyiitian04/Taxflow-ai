// API to view, update, or delete a single client.
import { NextRequest, NextResponse } from 'next/server'
import { requireFirm } from '@/lib/auth/requireFirm'
import {
  deleteClientForFirm,
  getClientStoragePaths,
  getClientWithDocuments,
  getOrCreateUploadToken,
  isUuid,
  updateClientForFirm,
} from '@/lib/db/queries'
import { deleteDocumentObjects, listDocumentKeys } from '@/lib/storage/documents'
import { trackServerEvent } from '@/lib/analytics'
import { logError, logWarn } from '@/lib/logger'

// Loads one client, their documents, and an upload link.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { user, firm } = auth

  let data
  try {
    data = isUuid(id) ? await getClientWithDocuments(id, firm.id) : null
  } catch {
    data = null
  }

  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const token = await getOrCreateUploadToken(id, firm.id)
  const uploadUrl = token
    ? `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}`
    : null

  if (uploadUrl) {
    await trackServerEvent(user.id, 'upload_link_shared', { firm_id: firm.id })
  }

  return NextResponse.json({ client: data, uploadUrl })
}

// Patches allowed client fields such as status or GST details.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

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

  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  try {
    const client = await updateClientForFirm(id, firm.id, updates)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ client })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update client' },
      { status: 500 }
    )
  }
}

// Deletes the client row and removes stored document files.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireFirm()
  if (!auth.ok) return auth.response
  const { firm } = auth

  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  try {
    const paths = await getClientStoragePaths(id, firm.id)

    let listedPaths: string[] = []
    try {
      listedPaths = await listDocumentKeys({ firmId: firm.id, clientId: id })
    } catch (err: unknown) {
      logWarn('client_storage_list_failed', {
        message: err instanceof Error ? err.message : 'unknown',
        clientId: id,
      })
    }
    const toRemove = [...new Set([...paths, ...listedPaths])]

    if (toRemove.length) {
      try {
        await deleteDocumentObjects({ firmId: firm.id, keys: toRemove })
      } catch (err: unknown) {
        logWarn('client_storage_cleanup_failed', {
          message: err instanceof Error ? err.message : 'unknown',
          clientId: id,
        })
      }
    }

    await deleteClientForFirm(id, firm.id)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown'
    logError('client_delete_failed', { message, clientId: id })
    return NextResponse.json({ error: message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}