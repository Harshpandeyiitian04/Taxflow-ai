/** Neutralize CSV formula injection and escape for CSV cells. */
export function csvSafeCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function csvSafeRow(cells: unknown[]): string {
  return cells.map(csvSafeCell).join(',')
}
