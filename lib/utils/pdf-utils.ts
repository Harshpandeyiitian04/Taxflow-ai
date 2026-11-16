import { PDFDocument } from 'pdf-lib'

// Checks whether a PDF needs a password before it can be read.

// Returns true when the PDF is locked with a password.
export async function isPDFPasswordProtected(arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(arrayBuffer)
    return false
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : ''
    return msg.includes('password') || msg.includes('encrypted')
  }
}