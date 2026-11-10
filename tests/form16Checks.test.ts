import { describe, expect, it } from 'vitest'
import { runForm16Checks } from '@/lib/validation/form16Checks'
import { form16Schema } from '@/lib/schemas/form16'
import clean from './fixtures/form16-clean.json'
import tampered from './fixtures/form16-tampered.json'
import missing from './fixtures/form16-missing.json'

describe('runForm16Checks', () => {
  it('passes a clean fixture', () => {
    const data = form16Schema.parse(clean)
    const result = runForm16Checks(data)
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('flags PAN/TAN, AY, TDS sum, and arithmetic mismatches', () => {
    const data = form16Schema.parse(tampered)
    const result = runForm16Checks(data)
    expect(result.ok).toBe(false)
    expect(result.issues.some(i => i.includes('PAN'))).toBe(true)
    expect(result.issues.some(i => i.includes('TAN'))).toBe(true)
    expect(result.issues.some(i => i.includes('Assessment year'))).toBe(true)
    expect(result.issues.some(i => i.includes('Quarterly TDS'))).toBe(true)
    expect(result.issues.some(i => i.includes('Income from salary'))).toBe(true)
    expect(result.issues.some(i => i.includes('Chapter VI-A'))).toBe(true)
  })

  it('allows mostly-null missing fixtures without invented values', () => {
    const data = form16Schema.parse(missing)
    const result = runForm16Checks(data)
    expect(result.ok).toBe(true)
  })
})
