// Makes spreadsheet exports safe from formula tricks and broken commas.

// Formats one cell so it is safe to put in a CSV file.
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

// Joins many cells into one CSV line.
export function csvSafeRow(cells: unknown[]): string {
  return cells.map(csvSafeCell).join(',')
}