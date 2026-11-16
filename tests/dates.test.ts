// Tests default assessment year and ITR due-date messaging in Indian time.
import { describe, expect, it } from 'vitest'
import { defaultAssessmentYear, itrDeadlineCopy } from '@/lib/dates'

// Picks the tax year based on April 1 in IST.
describe('defaultAssessmentYear', () => {
  // Dates just before and after April 1 in IST pick different AY strings.
  it('uses Apr 1 boundary in IST', () => {
    expect(defaultAssessmentYear(new Date('2026-03-31T20:00:00.000Z'))).toBe('2026-27')
    expect(defaultAssessmentYear(new Date('2026-03-31T18:00:00.000Z'))).toBe('2025-26')
  })

  // Same AY holds from April through the following March.
  it('keeps AY through the following March', () => {
    expect(defaultAssessmentYear(new Date('2026-11-10T06:30:00.000Z'))).toBe('2026-27')
    expect(defaultAssessmentYear(new Date('2027-01-15T06:30:00.000Z'))).toBe('2026-27')
    expect(defaultAssessmentYear(new Date('2027-04-01T00:00:00.000+05:30'))).toBe('2027-28')
  })
})

// User-facing text around the July 31 filing deadline.
describe('itrDeadlineCopy', () => {
  // After July 31 the copy should say the deadline has passed.
  it('marks July 31 as passed after the date', () => {
    const copy = itrDeadlineCopy(new Date('2026-11-10T06:30:00.000Z'))
    expect(copy.passed).toBe(true)
    expect(copy.dueLabel).toContain('2026')
  })
})