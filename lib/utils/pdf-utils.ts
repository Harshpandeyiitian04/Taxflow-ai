import { PDFDocument } from 'pdf-lib'

/** Detect if a PDF is password-protected by trying to load it without a password. */
export async function isPDFPasswordProtected(arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(arrayBuffer)
    return false
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : ''
    return msg.includes('password') || msg.includes('encrypted')
  }
}
