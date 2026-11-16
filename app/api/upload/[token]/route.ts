// Public API for token-based client document upload and portal info.
import { NextRequest, NextResponse } from 'next/server'
import { queryRpcBoolean, sql } from '@/lib/db/sql'
import {
  documentTypeExistsForClient,
  finishDocumentExtraction,
  incrementExtractionCount,
  insertProcessingDocument,
  markClientReceived,
  markDocumentFailed,
  setDocumentStoragePath,
} from '@/lib/db/queries'
import { uploadDocumentObject } from '@/lib/storage/documents'
import { getExtractionModel, isGeminiConfigured } from '@/lib/gemini'
import { FORM16_SYSTEM_PROMPT, FORM16_USER_PROMPT } from '@/lib/prompts/form16'
import { BANK_STATEMENT_SYSTEM_PROMPT, BANK_STATEMENT_USER_PROMPT } from '@/lib/prompts/bank-statement'
import { AIS_SYSTEM_PROMPT, AIS_USER_PROMPT } from '@/lib/prompts/ais'
import { FORM16A_SYSTEM_PROMPT, FORM16A_USER_PROMPT } from '@/lib/prompts/form16a'
import { CAPITAL_GAINS_SYSTEM_PROMPT, CAPITAL_GAINS_USER_PROMPT } from '@/lib/prompts/capital-gains'
import { sendClientUploadNotification } from '@/lib/email'
import { isPDFPasswordProtected } from '@/lib/utils/pdf-utils'
import { verifyMagicBytes } from '@/lib/utils/magicBytes'
import { parseExtractionJson } from '@/lib/extraction/parseGemini'
import { logError, logWarn } from '@/lib/logger'
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  FAIR_USE_DAILY_EXTRACTIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MAX_UPLOADS_PER_TOKEN,
} from '@/lib/constants'
import { claimUploadSlot } from '@/lib/upload/claimSlot'

export const runtime = 'nodejs'
export const maxDuration = 60

const UPLOAD_PROMPTS: Record<string, { system: string; user: string }> = {
  form16: { system: FORM16_SYSTEM_PROMPT, user: FORM16_USER_PROMPT },
  bank_statement: { system: BANK_STATEMENT_SYSTEM_PROMPT, user: BANK_STATEMENT_USER_PROMPT },
  ais: { system: AIS_SYSTEM_PROMPT, user: AIS_USER_PROMPT },
  form16a: { system: FORM16A_SYSTEM_PROMPT, user: FORM16A_USER_PROMPT },
  capital_gains: { system: CAPITAL_GAINS_SYSTEM_PROMPT, user: CAPITAL_GAINS_USER_PROMPT },
}

// Stores an upload, runs extraction, and notifies the CA firm.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const docType = (formData.get('type') as string) || 'form16'
  if (!Object.hasOwn(UPLOAD_PROMPTS, docType)) {
    return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 })
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and image files are accepted' }, { status: 400 })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Max ${MAX_UPLOAD_MB} MB. Compress or split the PDF and try again.`,
      },
      { status: 400 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const magic = verifyMagicBytes(arrayBuffer, file.type)
  if (!magic.ok) {
    return NextResponse.json({ error: magic.error }, { status: 400 })
  }

  if (magic.mime === 'application/pdf' && await isPDFPasswordProtected(arrayBuffer)) {
    return NextResponse.json(
      { error: 'This PDF is password-protected. Remove its password and upload it again.' },
      { status: 422 }
    )
  }

  const query = sql()
  const claimed = await claimUploadSlot(query, token, MAX_UPLOADS_PER_TOKEN)
  if (!claimed.ok) {
    if (claimed.status === 503) logError('claim_upload_slot_failed', {})
    return NextResponse.json({ error: claimed.error }, { status: claimed.status })
  }

  const clientId = claimed.slot.client_id
  const caFirmId = claimed.slot.ca_firm_id

  const clientRows = await query`
    select id
      from public.clients
     where id = ${clientId}::uuid
       and ca_firm_id = ${caFirmId}::uuid
     limit 1
  `

  if (clientRows.length === 0) {
    return NextResponse.json({ error: 'Upload link is no longer valid' }, { status: 404 })
  }

  if (await documentTypeExistsForClient(clientId, docType)) {
    return NextResponse.json({ error: 'This document type has already been uploaded' }, { status: 409 })
  }

  let allowed: boolean
  try {
    allowed = await queryRpcBoolean(query, 'consume_extraction', {
      p_firm: caFirmId,
      p_limit: FAIR_USE_DAILY_EXTRACTIONS,
    })
  } catch (quotaError: unknown) {
    logError('quota_rpc_failed', {
      message: quotaError instanceof Error ? quotaError.message : 'unknown',
    })
    return NextResponse.json({ error: 'Could not check usage limits' }, { status: 503 })
  }
  if (!allowed) {
    return NextResponse.json(
      {
        error: `This CA firm has reached today's fair-use extraction limit (${FAIR_USE_DAILY_EXTRACTIONS}). Please try again tomorrow.`,
      },
      { status: 429 }
    )
  }

  let documentId: string
  try {
    documentId = await insertProcessingDocument({
      clientId,
      firmId: caFirmId,
      type: docType,
      originalFilename: file.name,
      fileSizeBytes: file.size,
    })
  } catch (docInsertError: unknown) {
    logError('document_insert_failed', {
      message: docInsertError instanceof Error ? docInsertError.message : 'unknown',
    })
    return NextResponse.json({ error: 'Could not save the uploaded document' }, { status: 500 })
  }

  const ext = file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${caFirmId}/${clientId}/${docType}-${Date.now()}.${ext}`
  try {
    await uploadDocumentObject({
      firmId: caFirmId,
      clientId,
      key: storagePath,
      body: Buffer.from(arrayBuffer),
      contentType: magic.mime,
    })
  } catch (storageError: unknown) {
    logWarn('storage_upload_failed', {
      message: storageError instanceof Error ? storageError.message : 'unknown',
    })
    await markDocumentFailed(documentId, 'File storage failed')
    return NextResponse.json({ error: 'Could not store the uploaded file' }, { status: 500 })
  }

  await setDocumentStoragePath(documentId, storagePath)

  let extractedData: Record<string, unknown> | null = null
  let extractionStatus: 'completed' | 'failed' = 'failed'
  let extractionError: string | null = null
  const prompts = UPLOAD_PROMPTS[docType]

  try {
    const model = getExtractionModel()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const result = await model.generateContent([
      prompts.system,
      { inlineData: { mimeType: magic.mime, data: base64 } },
      prompts.user,
    ])
    const parsed = parseExtractionJson(docType, result.response.text())
    if (!parsed.ok) {
      extractionError = parsed.error
    } else {
      extractedData = parsed.data
      extractionStatus = 'completed'
    }
  } catch (err: unknown) {
    logError('upload_extraction_failed', {
      message: err instanceof Error ? err.message : 'unknown',
    })
    extractionError = 'Document extraction failed'
  }

  await finishDocumentExtraction(documentId, {
    extractedData,
    status: extractionStatus,
    error: extractionError,
  })

  await markClientReceived(clientId, caFirmId)

  const caFirmRows = await query`
    select email, firm_name, owner_name
      from public.ca_firms
     where id = ${caFirmId}::uuid
     limit 1
  `
  const caFirmData = caFirmRows[0] as
    | { email: string; firm_name: string | null; owner_name: string | null }
    | undefined

  const clientRowsForName = await query`
    select name
      from public.clients
     where id = ${clientId}::uuid
     limit 1
  `
  const clientData = clientRowsForName[0] as { name: string } | undefined

  if (caFirmData && clientData) {
    const clientDetailUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/clients/${clientId}`
    await sendClientUploadNotification({
      caEmail: caFirmData.email,
      caName: caFirmData.owner_name ?? caFirmData.firm_name ?? 'CA',
      clientName: clientData.name,
      documentType: docType,
      extractionSuccess: extractionStatus === 'completed',
      dashboardUrl: clientDetailUrl,
    })
  }

  if (extractionStatus === 'completed') {
    await incrementExtractionCount(caFirmId)
  }

  return NextResponse.json({
    success: true,
    extracted: extractionStatus === 'completed',
    message: extractionStatus === 'completed'
      ? 'Documents received and processed successfully'
      : 'Documents received. Your CA will review them shortly.',
  })
}

// Returns portal details and which document types are already uploaded.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const query = sql()

  let data:
    | {
        expires_at: Date | string
        upload_count: number | null
        used: boolean
        client_id: string
        client_name: string | null
        assessment_year: string | null
        firm_name: string | null
        owner_name: string | null
        firm_phone: string | null
      }
    | undefined
  try {
    const rows = await query`
      select t.expires_at,
             t.upload_count,
             t.used,
             c.id::text as client_id,
             c.name as client_name,
             c.assessment_year,
             f.firm_name,
             f.owner_name,
             f.phone as firm_phone
        from public.upload_tokens t
        join public.clients c on c.id = t.client_id
        join public.ca_firms f on f.id = c.ca_firm_id
       where t.token = ${token}
       limit 1
    `
    data = rows[0] as typeof data
  } catch {
    data = undefined
  }

  if (!data) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This link has expired. Ask your CA for a new one.' },
      { status: 410 }
    )
  }

  if ((data.upload_count ?? 0) >= MAX_UPLOADS_PER_TOKEN || data.used) {
    return NextResponse.json(
      { error: 'This upload link has reached its upload limit. Ask your CA for a new one.' },
      { status: 410 }
    )
  }

  const fullName = typeof data.client_name === 'string' ? data.client_name : 'Client'
  const clientFirstName = fullName.trim().split(/\s+/)[0] || 'Client'
  const firmDisplayName = data.firm_name || data.owner_name || 'Your CA'

  const uploadedDocuments = await query`
    select type
      from public.documents
     where client_id = ${data.client_id}::uuid
  `

  return NextResponse.json({
    valid: true,
    firmDisplayName,
    caPhone: data.firm_phone ?? null,
    clientFirstName,
    assessmentYear: data.assessment_year ?? null,
    uploadedTypes: (uploadedDocuments as { type: string }[]).map(document => document.type),
  })
}
