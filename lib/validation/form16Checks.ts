import type { Form16ExtractedData } from '@/lib/schemas/form16'

// Sanity checks on extracted Form 16 numbers and IDs.

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/
const AY_RE = /^\d{4}-\d{2}$/
const TOLERANCE = 1

// Converts a value to a finite number or null.
function n(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export interface Form16ValidationResult {
  ok: boolean
  issues: string[]
}

// Lists problems with PAN, TDS totals, and salary math without changing data.
export function runForm16Checks(data: Form16ExtractedData): Form16ValidationResult {
  const issues: string[] = []

  const employerPan = data.employer.pan
  if (employerPan && !PAN_RE.test(employerPan.toUpperCase())) {
    issues.push(`Employer PAN format looks invalid: ${employerPan}`)
  }
  const employeePan = data.employee.pan
  if (employeePan && !PAN_RE.test(employeePan.toUpperCase())) {
    issues.push(`Employee PAN format looks invalid: ${employeePan}`)
  }
  const tan = data.employer.tan
  if (tan && !TAN_RE.test(tan.toUpperCase())) {
    issues.push(`Employer TAN format looks invalid: ${tan}`)
  }

  const ay = data.period.assessment_year
  if (ay && !AY_RE.test(ay)) {
    issues.push(`Assessment year should look like YYYY-YY (got ${ay})`)
  }

  const q1 = n(data.tds.q1_tds_deducted) ?? 0
  const q2 = n(data.tds.q2_tds_deducted) ?? 0
  const q3 = n(data.tds.q3_tds_deducted) ?? 0
  const q4 = n(data.tds.q4_tds_deducted) ?? 0
  const totalTds = n(data.tds.total_tds_deducted)
  if (totalTds !== null) {
    const quarterSum = q1 + q2 + q3 + q4
    if (Math.abs(quarterSum - totalTds) > TOLERANCE && (q1 || q2 || q3 || q4)) {
      issues.push(
        `Quarterly TDS sum (${quarterSum}) does not match total TDS deducted (${totalTds})`
      )
    }
  }

  const gross = n(data.income.gross_salary) ?? n(data.income.salary_17_1)
  const exempt = n(data.income.total_exempt_allowances)
  const std = n(data.income.standard_deduction_16_ia) ?? 0
  const ptax = n(data.income.professional_tax_16_iii) ?? 0
  const ent = n(data.income.entertainment_allowance_16_ii) ?? 0
  const salary = n(data.income.income_from_salary)
  if (gross !== null && salary !== null) {
    const expected = gross - (exempt ?? 0) - std - ptax - ent
    if (Math.abs(expected - salary) > TOLERANCE) {
      issues.push(
        `Income from salary (${salary}) does not match gross − exemptions − s.16 deductions (≈ ${expected})`
      )
    }
  }

  const ded = data.deductions_vi_a
  const itemSum = [
    ded['80c'], ded['80ccc'], ded['80ccd_1'], ded['80ccd_1b_nps'], ded['80ccd_2_employer_nps'],
    ded['80d_mediclaim'], ded['80dd'], ded['80ddb'], ded['80e_education_loan'], ded['80ee'],
    ded['80g_donations'], ded['80gg_rent'], ded['80tta_savings_interest'], ded['80ttb'],
    ded['80u'], ded.other_deductions,
  ].reduce((acc: number, v) => acc + (n(v) ?? 0), 0)
  const totalVia = n(ded.total_chapter_vi_a)
  if (totalVia !== null && itemSum > 0 && Math.abs(itemSum - totalVia) > TOLERANCE) {
    issues.push(
      `Chapter VI-A items sum (${itemSum}) does not match total (${totalVia})`
    )
  }

  return { ok: issues.length === 0, issues }
}