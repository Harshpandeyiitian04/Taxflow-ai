import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

export const runtime = 'nodejs'
export const maxDuration = 60

const UPLOAD_PROMPTS: Record<string, { system: string; user: string }> = {
  form16: { system: FORM16_SYSTEM_PROMPT, user: FORM16_USER_PROMPT },
  bank_statement: { system: BANK_STATEMENT_SYSTEM_PROMPT, user: BANK_STATEMENT_USER_PROMPT },
  ais: { system: AIS_SYSTEM_PROMPT, user: AIS_USER_PROMPT },
  form16a: { system: FORM16A_SYSTEM_PROMPT, user: FORM16A_USER_PROMPT },
  capital_gains: { system: CAPITAL_GAINS_SYSTEM_PROMPT, user: CAPITAL_GAINS_USER_PROMPT },
}

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

  const admin = createAdminClient()
  const { data: claimed, error: claimError } = await admin.rpc('claim_upload_slot', {
    p_token: token,
    p_max: MAX_UPLOADS_PER_TOKEN,
  })

  if (claimError) {
    logError('claim_upload_slot_failed', { message: claimError.message })
    return NextResponse.json({ error: 'Could not validate upload link' }, { status: 503 })
  }

  const slot = Array.isArray(claimed) ? claimed[0] : claimed
  if (!slot?.client_id || !slot?.ca_firm_id) {
    return NextResponse.json(
      { error: 'Invalid, expired, or upload limit reached for this link' },
      { status: 400 }
    )
  }

  const clientId = slot.client_id as string
  const caFirmId = slot.ca_firm_id as string

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('ca_firm_id', caFirmId)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Upload link is no longer valid' }, { status: 404 })
  }

  const { data: existingDocument } = await admin
    .from('documents')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', docType)
    .limit(1)
    .maybeSingle()

  if (existingDocument) {
    return NextResponse.json({ error: 'This document type has already been uploaded' }, { status: 409 })
  }

  const { data: allowed, error: quotaError } = await admin.rpc('consume_extraction', {
    p_firm: caFirmId,
    p_limit: FAIR_USE_DAILY_EXTRACTIONS,
  })
  if (quotaError) {
    logError('quota_rpc_failed', { message: quotaError.message })
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

  const { data: docRow, error: docInsertError } = await admin
    .from('documents')
    .insert({
      client_id: clientId,
      ca_firm_id: caFirmId,
      type: docType,
      storage_path: null,
      original_filename: file.name,
      file_size_bytes: file.size,
      extracted_data: null,
      extraction_status: 'processing',
    })
    .select('id')
    .single()

  if (docInsertError || !docRow) {
    logError('document_insert_failed', { message: docInsertError?.message })
    return NextResponse.json({ error: 'Could not save the uploaded document' }, { status: 500 })
  }

  const ext = file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${caFirmId}/${clientId}/${docType}-${Date.now()}.${ext}`
  const { error: storageError } = await admin.storage
    .from('documents')
    .upload(storagePath, arrayBuffer, { contentType: magic.mime, upsert: false })

  if (storageError) {
    logWarn('storage_upload_failed', { message: storageError.message })
    await admin
      .from('documents')
      .update({ extraction_status: 'failed', extraction_error: 'File storage failed' })
      .eq('id', docRow.id)
    return NextResponse.json({ error: 'Could not store the uploaded file' }, { status: 500 })
  }

  await admin.from('documents').update({ storage_path: storagePath }).eq('id', docRow.id)

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

  await admin
    .from('documents')
    .update({
      extracted_data: extractedData,
      extraction_status: extractionStatus,
      extraction_error: extractionError,
    })
    .eq('id', docRow.id)

  await admin
    .from('clients')
    .update({ status: 'received' })
    .eq('id', clientId)
    .eq('ca_firm_id', caFirmId)

  const { data: caFirmData } = await admin
    .from('ca_firms')
    .select('email, firm_name, owner_name')
    .eq('id', caFirmId)
    .single()

  const { data: clientData } = await admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()

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
    await admin.rpc('increment_extractions_used', { p_firm: caFirmId })
  }

  return NextResponse.json({
    success: true,
    extracted: extractionStatus === 'completed',
    message: extractionStatus === 'completed'
      ? 'Documents received and processed successfully'
      : 'Documents received. Your CA will review them shortly.',
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('upload_tokens')
    .select(`
      token,
      expires_at,
      upload_count,
      used,
      client:clients(
        id,
        name,
        assessment_year,
        ca_firm:ca_firms(firm_name, owner_name, phone)
      )
    `)
    .eq('token', token)
    .single()

  if (error || !data) {
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

  const client = Array.isArray(data.client) ? data.client[0] : data.client
  const firm = client?.ca_firm
  const firmObj = Array.isArray(firm) ? firm[0] : firm
  const fullName = typeof client?.name === 'string' ? client.name : 'Client'
  const clientFirstName = fullName.trim().split(/\s+/)[0] || 'Client'
  const firmDisplayName =
    firmObj?.firm_name || firmObj?.owner_name || 'Your CA'

  const { data: uploadedDocuments } = await admin
    .from('documents')
    .select('type')
    .eq('client_id', client.id)

  return NextResponse.json({
    valid: true,
    firmDisplayName,
    caPhone: firmObj?.phone ?? null,
    clientFirstName,
    assessmentYear: client?.assessment_year ?? null,
    uploadedTypes: (uploadedDocuments ?? []).map(document => document.type),
  })
}
