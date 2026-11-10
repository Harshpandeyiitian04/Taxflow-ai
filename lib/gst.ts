export type GSTReturnType = 'GSTR-1' | 'GSTR-3B' | 'CMP-08'

export interface GSTClientInput {
  id: string
  name: string
  gstin: string | null
  gst_scheme?: string | null
  phone?: string | null
}

export interface GSTDeadline {
  clientName: string
  clientId: string
  gstin: string
  phone: string | null
  type: GSTReturnType
  dueDate: Date
  daysLeft: number
}

function endOfDay(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 23, 59, 59, 999)
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

/** Roll a due date forward month-by-month until it is not more than 15 days overdue. */
function nextMonthlyDue(now: Date, dayOfMonth: number): Date {
  let year = now.getFullYear()
  let month = now.getMonth()
  let due = endOfDay(year, month, dayOfMonth)
  // If more than 15 days past this month's due, move to next month
  while (daysBetween(now, due) < -15) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    due = endOfDay(year, month, dayOfMonth)
  }
  return due
}

function currentQuarterIndex(monthIndex: number): number {
  return Math.floor(monthIndex / 3)
}

/** Due dates for QRMP / composition fall in the month after the quarter ends. */
function nextQuarterlyDue(now: Date, dayOfMonth: number): Date {
  // Month after quarter end: Q0→Apr(3), Q1→Jul(6), Q2→Oct(9), Q3→Jan next (0)
  const dueMonthForQuarter = (quarter: number) => ((quarter + 1) * 3) % 12
  const dueYearFor = (year: number, quarter: number) =>
    quarter === 3 ? year + 1 : year

  // Start one quarter back so early-in-quarter dues (e.g. 13 Apr for Q0) are not skipped
  let year = now.getFullYear()
  let q = currentQuarterIndex(now.getMonth())
  q -= 1
  if (q < 0) {
    q = 3
    year -= 1
  }

  let due = endOfDay(dueYearFor(year, q), dueMonthForQuarter(q), dayOfMonth)
  while (daysBetween(now, due) < -15) {
    q += 1
    if (q > 3) {
      q = 0
      year += 1
    }
    due = endOfDay(dueYearFor(year, q), dueMonthForQuarter(q), dayOfMonth)
  }
  return due
}

/**
 * GST deadlines for clients.
 * Window: from 15 days overdue through 30 days ahead.
 * Monthly: GSTR-1 on 11th, GSTR-3B on 20th of current period first.
 * Quarterly: GSTR-1 on 13th, GSTR-3B on 22nd of month after quarter.
 * Composition: CMP-08 on 18th of month after quarter.
 */
export function getGSTDeadlines(clients: GSTClientInput[], now: Date = new Date()): GSTDeadline[] {
  const deadlines: GSTDeadline[] = []

  for (const client of clients) {
    if (!client.gstin || !client.gst_scheme || client.gst_scheme === 'exempt') continue

    const push = (type: GSTReturnType, dueDate: Date) => {
      const daysLeft = daysBetween(now, dueDate)
      if (daysLeft < -15 || daysLeft > 30) return
      deadlines.push({
        clientName: client.name,
        clientId: client.id,
        gstin: client.gstin!,
        phone: client.phone ?? null,
        type,
        dueDate,
        daysLeft,
      })
    }

    if (client.gst_scheme === 'monthly') {
      push('GSTR-1', nextMonthlyDue(now, 11))
      push('GSTR-3B', nextMonthlyDue(now, 20))
      continue
    }

    if (client.gst_scheme === 'quarterly') {
      push('GSTR-1', nextQuarterlyDue(now, 13))
      push('GSTR-3B', nextQuarterlyDue(now, 22))
    } else if (client.gst_scheme === 'composition') {
      push('CMP-08', nextQuarterlyDue(now, 18))
    }
  }

  return deadlines.sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Normalize Indian mobile to 91XXXXXXXXXX digits for wa.me links. */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.startsWith('91') && digits.length >= 12) return digits.slice(0, 12)
  if (digits.length === 10) return `91${digits}`
  if (digits.length >= 10) return digits
  return null
}
