import type { AllowedUploadMime } from '@/lib/constants'

function startsWithBytes(buf: Uint8Array, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  return bytes.every((b, i) => buf[i] === b)
}

/** Verify declared MIME matches file magic bytes. */
export function verifyMagicBytes(
  buffer: ArrayBuffer,
  declaredMime: string
): { ok: true; mime: AllowedUploadMime } | { ok: false; error: string } {
  const bytes = new Uint8Array(buffer)
  const mime = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime

  if (mime === 'application/pdf') {
    const header = String.fromCharCode(...bytes.slice(0, 5))
    if (header === '%PDF-') return { ok: true, mime: 'application/pdf' }
    return { ok: false, error: 'File content is not a valid PDF' }
  }

  if (mime === 'image/jpeg') {
    if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return { ok: true, mime: 'image/jpeg' }
    return { ok: false, error: 'File content is not a valid JPEG' }
  }

  if (mime === 'image/png') {
    if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) return { ok: true, mime: 'image/png' }
    return { ok: false, error: 'File content is not a valid PNG' }
  }

  if (mime === 'image/webp') {
    const riff = String.fromCharCode(...bytes.slice(0, 4))
    const webp = String.fromCharCode(...bytes.slice(8, 12))
    if (riff === 'RIFF' && webp === 'WEBP') return { ok: true, mime: 'image/webp' }
    return { ok: false, error: 'File content is not a valid WebP' }
  }

  return { ok: false, error: 'Unsupported file type' }
}
