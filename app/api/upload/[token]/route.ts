import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getExtractionModel } from '@/lib/gemini'
import { FORM16_SYSTEM_PROMPT, FORM16_USER_PROMPT } from '@/lib/prompts/form16'
import { BANK_STATEMENT_SYSTEM_PROMPT, BANK_STATEMENT_USER_PROMPT } from '@/lib/prompts/bank-statement'
import { AIS_SYSTEM_PROMPT, AIS_USER_PROMPT } from '@/lib/prompts/ais'
import { FORM16A_SYSTEM_PROMPT, FORM16A_USER_PROMPT } from '@/lib/prompts/form16a'
import { CAPITAL_GAINS_SYSTEM_PROMPT, CAPITAL_GAINS_USER_PROMPT } from '@/lib/prompts/capital-gains'
import { validateUploadToken } from '@/lib/supabase/queries'
import { sendClientUploadNotification } from '@/lib/email'
import { isPDFPasswordProtected } from '@/lib/utils/pdf-utils'

export const runtime = 'nodejs'
export const maxDuration = 60

const UPLOAD_PROMPTS: Record<string, { system: string; user: string }> = {
  form16: { system: FORM16_SYSTEM_PROMPT, user: FORM16_USER_PROMPT },
  bank_statement: { system: BANK_STATEMENT_SYSTEM_PROMPT, user: BANK_STATEMENT_USER_PROMPT },
  ais: { system: AIS_SYSTEM_PROMPT, user: AIS_USER_PROMPT },
  form16a: { system: FORM16A_SYSTEM_PROMPT, user: FORM16A_USER_PROMPT },
  capital_gains: { system: CAPITAL_GAINS_SYSTEM_PROMPT, user: CAPITAL_GAINS_USER_PROMPT },
}

// POST /api/upload/[token] — public endpoint, no auth required
// Called by the client upload portal when client submits their documents
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // ── 1. Validate token ─────────────────────────────────────
  const validation = await validateUploadToken(token)
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || 'Invalid or expired link' },
      { status: 400 }
    )
  }

  const { clientId, caFirmId } = validation

  // ── 2. Parse uploaded file ────────────────────────────────
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

  const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and image files are accepted' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 10 MB.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId!)
    .eq('ca_firm_id', caFirmId!)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Upload link is no longer valid' }, { status: 404 })
  }

  const { data: existingDocument } = await admin
    .from('documents')
    .select('id')
    .eq('client_id', clientId!)
    .eq('type', docType)
    .limit(1)
    .maybeSingle()

  if (existingDocument) {
    return NextResponse.json({ error: 'This document type has already been uploaded' }, { status: 409 })
  }

  const arrayBuffer = await file.arrayBuffer()
  if (file.type === 'application/pdf' && await isPDFPasswordProtected(arrayBuffer)) {
    return NextResponse.json(
      { error: 'This PDF is password-protected. Remove its password and upload it again.' },
      { status: 422 }
    )
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

  // ── 3. Upload file to storage ─────────────────────────────
  const ext = file.name.split('.').pop() ?? 'pdf'
  const storagePath = `${caFirmId}/${clientId}/${docType}-${Date.now()}.${ext}`

  const { error: storageError } = await admin.storage
    .from('documents')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (storageError) {
    console.warn('Storage upload failed:', storageError.message)
  }

  // ── 4. Run Gemini extraction ──────────────────────────────
  let extractedData = null
  let extractionStatus = 'failed'
  let extractionError = null
  const prompts = UPLOAD_PROMPTS[docType]

  try {
    const model = getExtractionModel()
    const result = await model.generateContent([
      prompts.system,
      { inlineData: { mimeType, data: base64 } },
      prompts.user,
    ])
    const raw = result.response.text()
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    extractedData = JSON.parse(cleaned)
    extractionStatus = 'completed'
  } catch (err: unknown) {
    console.error('Extraction error in upload portal:', err)
    extractionError = err instanceof Error ? err.message : 'Document extraction failed'
    extractionStatus = 'failed'
  }

  // ── 5. Save document record ───────────────────────────────
  const { error: documentError } = await admin.from('documents').insert({
    client_id: clientId,
    ca_firm_id: caFirmId,
    type: docType,
    storage_path: storageError ? null : storagePath,
    original_filename: file.name,
    file_size_bytes: file.size,
    extracted_data: extractedData,
    extraction_status: extractionStatus,
    extraction_error: extractionError,
  })

  if (documentError) {
    console.error('Document save failed:', documentError.message)
    return NextResponse.json({ error: 'Could not save the uploaded document' }, { status: 500 })
  }

  const { error: tokenUpdateError } = await admin
    .from('upload_tokens')
    .update({ used: true })
    .eq('token', token)
    .eq('used', false)

  if (tokenUpdateError) {
    console.error('Upload token could not be marked used:', tokenUpdateError.message)
  }

  // ── 6. Update client status ───────────────────────────────
  await admin
    .from('clients')
    .update({ status: 'received' })
    .eq('id', clientId)

  // ── Send email notification to CA ────────────────────────
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

  // ── 7. Increment CA's extraction count ───────────────────
  if (extractionStatus === 'completed') {
    const { data: firm } = await admin
      .from('ca_firms')
      .select('extractions_used, plan')
      .eq('id', caFirmId)
      .single()
    if (firm) {
      await admin
        .from('ca_firms')
        .update({ extractions_used: (firm.extractions_used ?? 0) + 1 })
        .eq('id', caFirmId)
    }
  }

  return NextResponse.json({
    success: true,
    extracted: extractionStatus === 'completed',
    message: extractionStatus === 'completed'
      ? 'Documents received and processed successfully'
      : 'Documents received. Your CA will review them shortly.',
  })
}

// GET /api/upload/[token] — return client info for the upload portal page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('upload_tokens')
    .select(`
      token,
      expires_at,
      used,
      client:clients(
        id,
        name,
        assessment_year,
        ca_firm:ca_firms(firm_name, owner_name, email, phone)
      )
    `)
    .eq('token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired. Ask your CA for a new one.' }, { status: 410 })
  }

  const client = Array.isArray(data.client) ? data.client[0] : data.client
  const { data: uploadedDocuments } = await admin
    .from('documents')
    .select('type')
    .eq('client_id', client.id)

  return NextResponse.json({
    valid: true,
    client,
    uploadedTypes: (uploadedDocuments ?? []).map(document => document.type),
  })
}