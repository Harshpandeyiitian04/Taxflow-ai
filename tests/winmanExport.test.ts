import { describe, expect, it } from 'vitest'
import { buildWinmanCsvContent } from '@/lib/utils/winman-export'
import clean from './fixtures/form16-clean.json'

describe('buildWinmanCsvContent', () => {
  it('does not invent standard deduction or Category/Regime defaults', () => {
    const csv = buildWinmanCsvContent('Ramesh Gupta', 'ABCDE1234F', clean as Record<string, unknown>)
    expect(csv).toContain('75000.00')
    expect(csv).toContain('StdDeduction_16ia')
    // No invented 50000 when value is present as 75000
    expect(csv).toContain('ABCDE1234F,Ramesh Gupta,2026-27,,,,')
  })

  it('neutralizes formula cells and keeps header comments', () => {
    const csv = buildWinmanCsvContent('=1+1', null, {
      ...clean,
      income: { ...clean.income, salary_17_1: null, standard_deduction_16_ia: null },
    } as Record<string, unknown>)
    expect(csv).toContain('# Verify DateOfBirth')
    expect(csv).toContain("'=1+1")
  })
})
