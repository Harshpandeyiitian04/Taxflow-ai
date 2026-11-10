import { describe, expect, it } from 'vitest'
import { defaultAssessmentYear, itrDeadlineCopy } from '@/lib/dates'

describe('defaultAssessmentYear', () => {
  it('uses Apr 1 boundary in IST', () => {
    // 2026-03-31 20:00 UTC = 2026-04-01 01:30 IST → AY 2026-27
    expect(defaultAssessmentYear(new Date('2026-03-31T20:00:00.000Z'))).toBe('2026-27')
    // 2026-03-31 18:00 UTC = 2026-03-31 23:30 IST → AY 2025-26
    expect(defaultAssessmentYear(new Date('2026-03-31T18:00:00.000Z'))).toBe('2025-26')
  })

  it('keeps AY through the following March', () => {
    expect(defaultAssessmentYear(new Date('2026-11-10T06:30:00.000Z'))).toBe('2026-27')
    expect(defaultAssessmentYear(new Date('2027-01-15T06:30:00.000Z'))).toBe('2026-27')
    expect(defaultAssessmentYear(new Date('2027-04-01T00:00:00.000+05:30'))).toBe('2027-28')
  })
})

describe('itrDeadlineCopy', () => {
  it('marks July 31 as passed after the date', () => {
    const copy = itrDeadlineCopy(new Date('2026-11-10T06:30:00.000Z'))
    expect(copy.passed).toBe(true)
    expect(copy.dueLabel).toContain('2026')
  })
})
