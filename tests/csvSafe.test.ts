// Tests that CSV cells are safe to open in Excel and similar tools.
import { describe, expect, it } from 'vitest'
import { csvSafeCell, csvSafeRow } from '@/lib/utils/csvSafe'

// Covers formula prefixes, quoting, empty values, and full rows.
describe('csvSafeCell', () => {
  // Prefixes like = and @ get a leading quote so they are not formulas.
  it('neutralizes formula injection prefixes', () => {
    expect(csvSafeCell('=CMD()')).toBe("'=CMD()")
    expect(csvSafeCell('+1+1')).toBe("'+1+1")
    expect(csvSafeCell('-1+1')).toBe("'-1+1")
    expect(csvSafeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvSafeCell('\tTAB')).toBe("'\tTAB")
  })

  // Commas, quotes, and line breaks are wrapped in CSV quotes.
  it('escapes commas quotes and newlines', () => {
    expect(csvSafeCell('a,b')).toBe('"a,b"')
    expect(csvSafeCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvSafeCell('line1\nline2')).toBe('"line1\nline2"')
  })

  // Null and undefined become empty strings; numbers stay as text.
  it('stringifies empty values', () => {
    expect(csvSafeCell(null)).toBe('')
    expect(csvSafeCell(undefined)).toBe('')
    expect(csvSafeCell(0)).toBe('0')
  })

  // A full row joins escaped cells with commas.
  it('joins rows', () => {
    expect(csvSafeRow(['a', '=1', 'b,c'])).toBe('a,\'=1,"b,c"')
  })
})