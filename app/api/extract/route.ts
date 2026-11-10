import { NextRequest, NextResponse } from 'next/server'
import { getExtractionModel, isGeminiConfigured } from '@/lib/gemini'
import { FORM16_SYSTEM_PROMPT, FORM16_USER_PROMPT } from '@/lib/prompts/form16'
import { BANK_STATEMENT_SYSTEM_PROMPT, BANK_STATEMENT_USER_PROMPT } from '@/lib/prompts/bank-statement'
import { AIS_SYSTEM_PROMPT, AIS_USER_PROMPT } from '@/lib/prompts/ais'
import { FORM16A_SYSTEM_PROMPT, FORM16A_USER_PROMPT } from '@/lib/prompts/form16a'
import { CAPITAL_GAINS_SYSTEM_PROMPT, CAPITAL_GAINS_USER_PROMPT } from '@/lib/prompts/capital-gains'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireFirm } from '@/lib/auth/requireFirm'
import { incrementExtractionCount } from '@/lib/supabase/queries'
import { trackServerEvent } from '@/lib/analytics'
import { isPDFPasswordProtected } from '@/lib/utils/pdf-utils'
import { verifyMagicBytes } from '@/lib/utils/magicBytes'
import { parseExtractionJson } from '@/lib/extraction/parseGemini'
import { logError, logWarn } from '@/lib/logger'
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  FAIR_USE_DAILY_EXTRACTIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from '@/lib/constants'

export const runtime = 'nodejs'
export const maxDuration = 60

const EXTRACTION_PROMPTS: Record<string, { system: string; user: string }> = {
  form16: { system: FORM16_SYSTEM_PROMPT, user: FORM16_USER_PROMPT },
  bank_statement: { system: BANK_STATEMENT_SYSTEM_PROMPT, user: BANK_STATEMENT_USER_PROMPT },
  ais: { system: AIS_SYSTEM_PROMPT, user: AIS_USER_PROMPT },
  form16a: { system: FORM16A_SYSTEM_PROMPT, user: FORM16A_USER_PROMPT },
  capital_gains: { system: CAPITAL_GAINS_SYSTEM_PROMPT, user: CAPITAL_GAINS_USER_PROMPT },
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireFirm()
    if (!auth.ok) return auth.response
    const { user, firm } = auth

    if (!isGeminiConfigured()) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const clientId = formData.get('clientId') as string | null
    const docType = (formData.get('docType') as string) || 'form16'

    if (!Object.hasOwn(EXTRACTION_PROMPTS, docType)) {
      return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 })
    }

    if (clientId) {
      const admin = createAdminClient()
      const { data: client } = await admin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('ca_firm_id', firm.id)
        .maybeSingle()

      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF and image files (JPEG, PNG, WebP) are supported.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_UPLOAD_MB} MB. Compress or split the PDF and try again.`,
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
    const { data: allowed, error: quotaError } = await admin.rpc('consume_extraction', {
      p_firm: firm.id,
      p_limit: FAIR_USE_DAILY_EXTRACTIONS,
    })

    if (quotaError) {
      logError('quota_rpc_failed', { firmId: firm.id, message: quotaError.message })
      return NextResponse.json({ error: 'Could not check usage limits' }, { status: 503 })
    }
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Daily fair-use limit of ${FAIR_USE_DAILY_EXTRACTIONS} extractions reached. Try again tomorrow.`,
        },
        { status: 429 }
      )
    }

    await trackServerEvent(user.id, 'extraction_started', {
      document_type: docType,
      has_client: !!clientId,
      file_size_bytes: file.size,
    })

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const prompts = EXTRACTION_PROMPTS[docType]

    let documentId: string | null = null
    let storagePath: string | null = null

    if (clientId) {
      const { data: doc, error: docInsertError } = await admin
        .from('documents')
        .insert({
          client_id: clientId,
          ca_firm_id: firm.id,
          type: docType,
          storage_path: null,
          original_filename: file.name,
          file_size_bytes: file.size,
          extracted_data: null,
          extraction_status: 'processing',
        })
        .select('id')
        .single()

      if (docInsertError || !doc) {
        logError('document_insert_failed', { message: docInsertError?.message })
        return NextResponse.json({ error: 'Could not create document record' }, { status: 500 })
      }
      documentId = doc.id

      const ext = file.name.split('.').pop() ?? 'pdf'
      storagePath = `${firm.id}/${clientId}/${docType}-${Date.now()}.${ext}`
      const { error: storageError } = await admin.storage
        .from('documents')
        .upload(storagePath, arrayBuffer, { contentType: magic.mime, upsert: false })

      if (storageError) {
        logWarn('storage_upload_failed', { message: storageError.message })
        await admin
          .from('documents')
          .update({
            extraction_status: 'failed',
            extraction_error: 'File storage failed',
          })
          .eq('id', documentId)
        return NextResponse.json({ error: 'Could not store the uploaded file' }, { status: 500 })
      }

      await admin
        .from('documents')
        .update({ storage_path: storagePath })
        .eq('id', documentId)
    }

    let extractedData: Record<string, unknown>
    try {
      const model = getExtractionModel()
      const geminiResponse = await model.generateContent([
        prompts.system,
        { inlineData: { mimeType: magic.mime, data: base64 } },
        prompts.user,
      ])
      const rawText = geminiResponse.response.text()
      const parsed = parseExtractionJson(docType, rawText)
      if (!parsed.ok) {
        if (documentId) {
          await admin
            .from('documents')
            .update({
              extraction_status: 'failed',
              extraction_error: parsed.error,
            })
            .eq('id', documentId)
        }
        return NextResponse.json({ error: parsed.error }, { status: 500 })
      }
      extractedData = parsed.data
    } catch (geminiError: unknown) {
      const code = geminiError instanceof Error && geminiError.message === 'GEMINI_NOT_CONFIGURED'
        ? 'gemini_not_configured'
        : 'gemini_failed'
      logError(code, {
        message: geminiError instanceof Error ? geminiError.message : 'unknown',
      })
      if (documentId) {
        await admin
          .from('documents')
          .update({
            extraction_status: 'failed',
            extraction_error: 'AI extraction failed',
          })
          .eq('id', documentId)
      }
      return NextResponse.json(
        { error: 'AI extraction failed. Please try again in a moment.' },
        { status: 503 }
      )
    }

    if (documentId) {
      await admin
        .from('documents')
        .update({
          extracted_data: extractedData,
          extraction_status: 'completed',
          extraction_error: null,
        })
        .eq('id', documentId)

      if (clientId) {
        await admin
          .from('clients')
          .update({ status: 'received' })
          .eq('id', clientId)
          .eq('ca_firm_id', firm.id)
      }
    }

    await incrementExtractionCount(firm.id)
    await trackServerEvent(user.id, 'extraction_completed', {
      remaining: null,
      document_type: docType,
      confidence: getExtractionConfidence(extractedData),
      has_client: !!clientId,
    })

    return NextResponse.json({
      success: true,
      data: extractedData,
      documentId,
      remaining: null,
    })
  } catch (error: unknown) {
    logError('extract_unhandled', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

function getExtractionConfidence(data: Record<string, unknown>): unknown {
  const meta = data.meta
  return meta !== null && typeof meta === 'object' && 'extraction_confidence' in meta
    ? (meta as { extraction_confidence?: unknown }).extraction_confidence
    : undefined
}
