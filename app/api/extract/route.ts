// Authenticated API to run Gemini extraction on an uploaded file.
import { NextRequest, NextResponse } from 'next/server'
import { getExtractionModel, isGeminiConfigured } from '@/lib/gemini'
import { FORM16_SYSTEM_PROMPT, FORM16_USER_PROMPT } from '@/lib/prompts/form16'
import { BANK_STATEMENT_SYSTEM_PROMPT, BANK_STATEMENT_USER_PROMPT } from '@/lib/prompts/bank-statement'
import { AIS_SYSTEM_PROMPT, AIS_USER_PROMPT } from '@/lib/prompts/ais'
import { FORM16A_SYSTEM_PROMPT, FORM16A_USER_PROMPT } from '@/lib/prompts/form16a'
import { CAPITAL_GAINS_SYSTEM_PROMPT, CAPITAL_GAINS_USER_PROMPT } from '@/lib/prompts/capital-gains'
import { queryRpcBoolean, sql } from '@/lib/db/sql'
import { requireFirm } from '@/lib/auth/requireFirm'
import {
  clientBelongsToFirm,
  finishDocumentExtraction,
  incrementExtractionCount,
  insertProcessingDocument,
  isUuid,
  markClientReceived,
  markDocumentFailed,
  setDocumentStoragePath,
} from '@/lib/db/queries'
import { uploadDocumentObject } from '@/lib/storage/documents'
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

// Accepts a file upload, runs AI extraction, and optionally saves to a client.
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
      if (!isUuid(clientId) || !(await clientBelongsToFirm(clientId, firm.id))) {
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

    let allowed: boolean
    try {
      allowed = await queryRpcBoolean(sql(), 'consume_extraction', {
        p_firm: firm.id,
        p_limit: FAIR_USE_DAILY_EXTRACTIONS,
      })
    } catch (quotaError: unknown) {
      logError('quota_rpc_failed', {
        firmId: firm.id,
        message: quotaError instanceof Error ? quotaError.message : 'unknown',
      })
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
      try {
        documentId = await insertProcessingDocument({
          clientId,
          firmId: firm.id,
          type: docType,
          originalFilename: file.name,
          fileSizeBytes: file.size,
        })
      } catch (docInsertError: unknown) {
        logError('document_insert_failed', {
          message: docInsertError instanceof Error ? docInsertError.message : 'unknown',
        })
        return NextResponse.json({ error: 'Could not create document record' }, { status: 500 })
      }

      const ext = file.name.split('.').pop() ?? 'pdf'
      storagePath = `${firm.id}/${clientId}/${docType}-${Date.now()}.${ext}`
      try {
        await uploadDocumentObject({
          firmId: firm.id,
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
          await markDocumentFailed(documentId, parsed.error)
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
        await markDocumentFailed(documentId, 'AI extraction failed')
      }
      return NextResponse.json(
        { error: 'AI extraction failed. Please try again in a moment.' },
        { status: 503 }
      )
    }

    if (documentId) {
      await finishDocumentExtraction(documentId, {
        extractedData,
        status: 'completed',
        error: null,
      })

      if (clientId) {
        await markClientReceived(clientId, firm.id)
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

// Pulls the confidence score from extraction metadata when present.
function getExtractionConfidence(data: Record<string, unknown>): unknown {
  const meta = data.meta
  return meta !== null && typeof meta === 'object' && 'extraction_confidence' in meta
    ? (meta as { extraction_confidence?: unknown }).extraction_confidence
    : undefined
}
