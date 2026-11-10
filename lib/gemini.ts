import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error('GEMINI_NOT_CONFIGURED')
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(key)
  }
  return genAI
}

export function getExtractionModel() {
  return getClient().getGenerativeModel(
    {
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    },
    { timeout: 50_000 }
  )
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}
