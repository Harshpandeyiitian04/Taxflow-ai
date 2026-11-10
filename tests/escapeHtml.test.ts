import { describe, expect, it } from 'vitest'
import { escapeHtml } from '@/lib/utils/escapeHtml'

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    )
    expect(escapeHtml(`O'Brien & Co`)).toBe('O&#39;Brien &amp; Co')
  })

  it('handles nullish', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
