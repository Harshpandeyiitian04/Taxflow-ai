import { GoogleGenerativeAI } from '@google/generative-ai'

// Connects to Google Gemini for reading tax documents.

let genAI: GoogleGenerativeAI | null = null

// Returns a shared Gemini client using the API key from settings.
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

// Returns the AI model configured for JSON document extraction.
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

// Tells whether a Gemini API key is present.
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}