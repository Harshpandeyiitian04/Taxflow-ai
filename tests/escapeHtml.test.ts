// Tests turning user text into safe HTML without script tags.
import { describe, expect, it } from 'vitest'
import { escapeHtml } from '@/lib/utils/escapeHtml'

// Escapes tags, quotes, and ampersands for display in HTML.
describe('escapeHtml', () => {
  // Special characters become HTML entities.
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    )
    expect(escapeHtml(`O'Brien & Co`)).toBe('O&#39;Brien &amp; Co')
  })

  // Null and undefined become an empty string.
  it('handles nullish', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})