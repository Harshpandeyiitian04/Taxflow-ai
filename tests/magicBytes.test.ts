// Tests matching uploaded file headers to allowed MIME types.
import { describe, expect, it } from 'vitest'
import { verifyMagicBytes } from '@/lib/utils/magicBytes'

// Builds an in-memory file buffer from byte values.
function buf(...bytes: number[]) {
  return new Uint8Array(bytes).buffer
}

// PDF and image signatures versus wrong MIME labels.
describe('verifyMagicBytes', () => {
  // Known magic bytes for PDF and common images should pass.
  it('accepts PDF JPEG PNG WebP magic', () => {
    expect(verifyMagicBytes(buf(0x25, 0x50, 0x44, 0x46, 0x2d), 'application/pdf').ok).toBe(true)
    expect(verifyMagicBytes(buf(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg').ok).toBe(true)
    expect(verifyMagicBytes(buf(0x89, 0x50, 0x4e, 0x47, 0x0d), 'image/png').ok).toBe(true)

    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(verifyMagicBytes(webp.buffer, 'image/webp').ok).toBe(true)
  })

  // Header bytes that do not match the declared type should fail.
  it('rejects MIME/magic mismatches', () => {
    expect(verifyMagicBytes(buf(0xff, 0xd8, 0xff), 'application/pdf').ok).toBe(false)
    expect(verifyMagicBytes(buf(0x00, 0x01), 'image/png').ok).toBe(false)
  })
})