import { describe, expect, it } from 'vitest'
import { form16Schema } from '@/lib/schemas/form16'
import clean from './fixtures/form16-clean.json'
import missing from './fixtures/form16-missing.json'

describe('form16Schema', () => {
  it('accepts a valid fixture', () => {
    const parsed = form16Schema.parse(clean)
    expect(parsed.employee.pan).toBe('ABCDE1234F')
    expect(parsed.income.standard_deduction_16_ia).toBe(75000)
  })

  it('accepts null fields', () => {
    const parsed = form16Schema.parse(missing)
    expect(parsed.employer.pan).toBeNull()
    expect(parsed.income.gross_salary).toBeNull()
  })

  it('rejects wrong types', () => {
    expect(() =>
      form16Schema.parse({
        ...clean,
        income: { ...clean.income, gross_salary: 'not-a-number' },
      })
    ).toThrow()
  })
})
