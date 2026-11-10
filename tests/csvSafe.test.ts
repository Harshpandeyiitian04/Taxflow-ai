import { describe, expect, it } from 'vitest'
import { csvSafeCell, csvSafeRow } from '@/lib/utils/csvSafe'

describe('csvSafeCell', () => {
  it('neutralizes formula injection prefixes', () => {
    expect(csvSafeCell('=CMD()')).toBe("'=CMD()")
    expect(csvSafeCell('+1+1')).toBe("'+1+1")
    expect(csvSafeCell('-1+1')).toBe("'-1+1")
    expect(csvSafeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvSafeCell('\tTAB')).toBe("'\tTAB")
  })

  it('escapes commas quotes and newlines', () => {
    expect(csvSafeCell('a,b')).toBe('"a,b"')
    expect(csvSafeCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvSafeCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('stringifies empty values', () => {
    expect(csvSafeCell(null)).toBe('')
    expect(csvSafeCell(undefined)).toBe('')
    expect(csvSafeCell(0)).toBe('0')
  })

  it('joins rows', () => {
    expect(csvSafeRow(['a', '=1', 'b,c'])).toBe('a,\'=1,"b,c"')
  })
})
