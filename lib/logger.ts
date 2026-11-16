// Structured logs for errors without leaking private client data.

type LogMeta = Record<string, string | number | boolean | null | undefined>

// Writes a redacted error line to the server log.
export function logError(code: string, meta: LogMeta = {}): void {
  const safe: Record<string, string | number | boolean | null> = { code }
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.length > 120) {
      safe[key] = `[len:${value.length}]`
    } else {
      safe[key] = value
    }
  }
  console.error(JSON.stringify(safe))
}

// Writes a redacted warning line to the server log.
export function logWarn(code: string, meta: LogMeta = {}): void {
  const safe: Record<string, string | number | boolean | null> = { code }
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue
    safe[key] = typeof value === 'string' && value.length > 120
      ? `[len:${value.length}]`
      : value
  }
  console.warn(JSON.stringify(safe))
}