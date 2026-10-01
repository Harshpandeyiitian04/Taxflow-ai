import { NextRequest, NextResponse } from 'next/server'
import { getExtractionModel } from '@/lib/gemini'
import { FORM16_SYSTEM_PROMPT, FORM16_USER_PROMPT } from '@/lib/prompts/form16'
import { BANK_STATEMENT_SYSTEM_PROMPT, BANK_STATEMENT_USER_PROMPT } from '@/lib/prompts/bank-statement'
import { AIS_SYSTEM_PROMPT, AIS_USER_PROMPT } from '@/lib/prompts/ais'
import { FORM16A_SYSTEM_PROMPT, FORM16A_USER_PROMPT } from '@/lib/prompts/form16a'
import { CAPITAL_GAINS_SYSTEM_PROMPT, CAPITAL_GAINS_USER_PROMPT } from '@/lib/prompts/capital-gains'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentFirm, incrementExtractionCount } from '@/lib/supabase/queries'
import { trackServerEvent } from '@/lib/analytics'
import { isPDFPasswordProtected } from '@/lib/utils/pdf-utils'

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
    // ── 1. Auth ──────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. Get firm ───────────────────────────────────────────
    const firm = await getCurrentFirm()
    if (!firm) {
      return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
    }

    // ── 4. Parse form data ────────────────────────────────────
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

    // ── 5. Validate file ──────────────────────────────────────
    const ALLOWED_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF and image files (JPEG, PNG, WebP) are supported.' },
        { status: 400 }
      )
    }

    const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 }
      )
    }

    // ── 6. Convert to base64 ──────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    if (file.type === 'application/pdf' && await isPDFPasswordProtected(arrayBuffer)) {
      return NextResponse.json(
        { error: 'This PDF is password-protected. Remove its password and upload it again.' },
        { status: 422 }
      )
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type as
      | 'application/pdf'
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp'

    await trackServerEvent(user.id, 'extraction_started', {
      document_type: docType,
      has_client: !!clientId,
      file_size_bytes: file.size,
    })

    // ── 7. Call Gemini ────────────────────────────────────────
    const model = getExtractionModel()

    let geminiResponse
    try {
      const prompts = EXTRACTION_PROMPTS[docType]
      geminiResponse = await model.generateContent([
        prompts.system,
        { inlineData: { mimeType, data: base64 } },
        prompts.user,
      ])
    } catch (geminiError: unknown) {
      console.error('Gemini API error:', geminiError)
      return NextResponse.json(
        { error: 'AI extraction failed. Please try again in a moment.' },
        { status: 503 }
      )
    }

    // ── 8. Parse JSON response ────────────────────────────────
    const rawText = geminiResponse.response.text()
    let extractedData: Record<string, unknown>

    try {
      // responseMimeType: 'application/json' should give clean JSON
      // but we clean up just in case
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim()
      extractedData = JSON.parse(cleaned)
    } catch {
      console.error('JSON parse failed. Raw response:', rawText.slice(0, 500))
      return NextResponse.json(
        { error: 'Could not parse AI response. Try a clearer PDF scan.' },
        { status: 500 }
      )
    }

    // ── 9. Persist to database (optional — only if clientId given) ──
    let documentId: string | null = null

    if (clientId) {
      const admin = createAdminClient()

      // Upload file to Supabase storage
      const ext = file.name.split('.').pop() ?? 'pdf'
      const storagePath = `${firm.id}/${clientId}/${docType}-${Date.now()}.${ext}`

      const { error: storageError } = await admin.storage
        .from('documents')
        .upload(storagePath, arrayBuffer, {
          contentType: file.type,
          upsert: false,
        })

      if (storageError) {
        console.warn('Storage upload failed (non-fatal):', storageError.message)
      }

      // Create document record
      const { data: doc, error: docError } = await admin
        .from('documents')
        .insert({
          client_id: clientId,
          ca_firm_id: firm.id,
          type: docType,
          storage_path: storageError ? null : storagePath,
          original_filename: file.name,
          file_size_bytes: file.size,
          extracted_data: extractedData,
          extraction_status: 'completed',
        })
        .select('id')
        .single()

      if (!docError && doc) {
        documentId = doc.id

        // Update client status to 'received'
        await admin
          .from('clients')
          .update({ status: 'received' })
          .eq('id', clientId)
      }
    }

    // ── 10. Increment extraction count ────────────────────────
    await incrementExtractionCount(firm.id)
    await trackServerEvent(user.id, 'extraction_completed', {
      plan: firm.plan,
      remaining: null,
      document_type: docType,
      confidence: getExtractionConfidence(extractedData),
      has_client: !!clientId,
    })

    // ── 11. Return result ─────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: extractedData,
      documentId,
      remaining: null,
    })
  } catch (error: unknown) {
    console.error('Unhandled extraction error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

function getExtractionConfidence(data: Record<string, unknown>): unknown {
  const meta = data.meta
  return meta !== null && typeof meta === 'object' && 'extraction_confidence' in meta
    ? meta.extraction_confidence
    : undefined
}