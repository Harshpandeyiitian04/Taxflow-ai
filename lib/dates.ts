// Indian tax calendar helpers for assessment years and ITR due dates.

// Splits a date into year, month, and day in India time.
function kolkataParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = Number(parts.find(p => p.type === 'year')?.value)
  const month = Number(parts.find(p => p.type === 'month')?.value)
  const day = Number(parts.find(p => p.type === 'day')?.value)
  return { year, month, day }
}

// Returns the default assessment year label for today in India.
export function defaultAssessmentYear(now: Date = new Date()): string {
  const { year, month } = kolkataParts(now)
  const ayStartYear = month >= 4 ? year : year - 1
  const ayEnd = String((ayStartYear + 1) % 100).padStart(2, '0')
  return `${ayStartYear}-${ayEnd}`
}

// Returns the assessment year before the current one.
export function previousAssessmentYear(now: Date = new Date()): string {
  const current = defaultAssessmentYear(now)
  const start = Number(current.slice(0, 4)) - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

// Builds user-facing text about the July 31 ITR due date for the current AY.
export function itrDeadlineCopy(now: Date = new Date()): {
  dueLabel: string
  dueYear: number
  daysLeft: number
  passed: boolean
  message: string
} {
  const ay = defaultAssessmentYear(now)
  const ayStartYear = Number(ay.slice(0, 4))
  const { year, month, day } = kolkataParts(now)
  const duePassed =
    year > ayStartYear ||
    (year === ayStartYear && (month > 7 || (month === 7 && day > 31)))

  const dueUtc = Date.UTC(ayStartYear, 6, 31)
  const nowUtc = Date.UTC(year, month - 1, day)
  const daysLeft = Math.ceil((dueUtc - nowUtc) / (1000 * 60 * 60 * 24))

  const dueLabel = `31 July ${ayStartYear}`
  if (duePassed) {
    return {
      dueLabel,
      dueYear: ayStartYear,
      daysLeft,
      passed: true,
      message:
        'Original due date passed. Belated/revised returns may still be possible. Verify on the IT portal.',
    }
  }
  return {
    dueLabel,
    dueYear: ayStartYear,
    daysLeft,
    passed: false,
    message: `Original ITR due date for AY ${ay} is ${dueLabel}. Confirm any extensions on the IT portal.`,
  }
}