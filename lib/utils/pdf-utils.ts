// lib/utils/pdf-utils.ts
// PDF pre-processing utilities

import { PDFDocument } from 'pdf-lib'

// Detect if a PDF is password-protected by trying to load it without a password
export async function isPDFPasswordProtected(arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(arrayBuffer)
    return false  // loaded fine, not protected
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : ''
    return msg.includes('password') || msg.includes('encrypted')
  }
}

// Attempt to decrypt a password-protected PDF
export async function decryptPDF(
  arrayBuffer: ArrayBuffer,
  password: string
): Promise<ArrayBuffer> {
  void arrayBuffer
  void password
  throw new Error('PASSWORD_PROTECTED_PDF_UNSUPPORTED')
}

// Get page count of a PDF
export async function getPDFPageCount(arrayBuffer: ArrayBuffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer)
    return pdfDoc.getPageCount()
  } catch {
    return 1
  }
}

// Common Form 16 passwords (employer uses employee's PAN or DOB)
export function getCommonPasswordHints(
  pan: string | null,
  dob: string | null
): string[] {
  const hints: string[] = []

  if (pan) {
    hints.push(pan.toUpperCase())
    hints.push(pan.toLowerCase())
  }

  if (dob) {
    // DOB in various formats: DDMMYYYY, DD/MM/YYYY, DDMMYY
    const d = dob.replace(/\D/g, '')
    if (d.length === 8) {
      hints.push(d)                          // DDMMYYYY
      hints.push(d.slice(0, 6))             // DDMMYY
      hints.push(d.slice(4) + d.slice(2,4) + d.slice(0,2))  // YYYYMMDD
    }
  }

  return hints
}