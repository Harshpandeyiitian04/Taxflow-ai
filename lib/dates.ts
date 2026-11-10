/** Assessment year helpers using Asia/Kolkata calendar rules. */

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

/**
 * Default assessment year for "now" in IST.
 * During FY Y-(Y+1) (Apr Y … Mar Y+1), default AY is `(Y+1)-(Y+2)%100`.
 * Example: Nov 2026 → 2027-28; Jan 2027 → 2027-28; Apr 2027 → 2028-29.
 */
export function defaultAssessmentYear(now: Date = new Date()): string {
  const { year, month } = kolkataParts(now)
  // Apr–Mar FY: AY start year is calendar year of FY end (Apr 2026 → AY 2027-28)
  const ayStartYear = month >= 4 ? year + 1 : year
  const ayEnd = String((ayStartYear + 1) % 100).padStart(2, '0')
  return `${ayStartYear}-${ayEnd}`
}

export function previousAssessmentYear(now: Date = new Date()): string {
  const current = defaultAssessmentYear(now)
  const start = Number(current.slice(0, 4)) - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** July 31 of the AY start year (original individual ITR due date copy). */
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

  // Approximate days left using IST calendar parts (enough for UI copy)
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
