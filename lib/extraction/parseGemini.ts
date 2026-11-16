import { form16Schema, genericExtractionSchema, type Form16ExtractedData } from '@/lib/schemas/form16'
import { runForm16Checks } from '@/lib/validation/form16Checks'

// Turns raw AI text into validated extraction JSON.

// Removes markdown code fences around JSON from the model.
export function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
}

// Parses and validates extraction JSON for the given document type.
export function parseExtractionJson(
  docType: string,
  rawText: string
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFences(rawText))
  } catch {
    return { ok: false, error: 'Could not parse AI response as JSON' }
  }

  if (docType === 'form16') {
    const result = form16Schema.safeParse(parsed)
    if (!result.success) {
      return { ok: false, error: 'AI response did not match the Form 16 schema' }
    }
    const data = result.data as Form16ExtractedData
    const validation = runForm16Checks(data)
    const warnings = [
      ...(Array.isArray(data.meta.warnings) ? data.meta.warnings : []),
      ...validation.issues,
    ]
    return {
      ok: true,
      data: {
        ...data,
        meta: { ...data.meta, warnings },
        validation,
      },
    }
  }

  const result = genericExtractionSchema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, error: 'AI response was not a valid object' }
  }
  return { ok: true, data: result.data }
}