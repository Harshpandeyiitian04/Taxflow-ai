import { GoogleGenerativeAI } from '@google/generative-ai'

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set')
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Use this for all extraction tasks — temperature 0 for deterministic output
export function getExtractionModel() {
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })
}

// Use this for text tasks (summaries, messages) — higher temperature ok
export function getTextModel() {
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.3,
    },
  })
}

type ExtractionPart = string | { inlineData: { mimeType: string; data: string } }

function isRateLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 429
}

export async function extractWithRetry(
  model: ReturnType<typeof getExtractionModel>,
  parts: ExtractionPart[],
  retries = 3
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(parts)
      return result.response.text()
    } catch (err: unknown) {
      if (isRateLimitError(err) && i < retries - 1) {
        // Wait 65 seconds then retry
        await new Promise(r => setTimeout(r, 65000))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}