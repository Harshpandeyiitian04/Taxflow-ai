// lib/utils/winman-export.ts
// Generates a CSV in Winman CA-ERP import format
// Tested against Winman 2025 bulk import template

import { csvSafeRow } from '@/lib/utils/csvSafe'

function n(val: unknown): string {
  if (val === null || val === undefined || val === '') return ''
  const num = Number(val)
  return isNaN(num) ? '' : num.toFixed(2)
}

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function s(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

const WINMAN_HEADERS = [
  'PAN', 'AssesseeName', 'AssessmentYear', 'DateOfBirth',
  'Category',
  'ResidentialStatus',
  'TaxRegime',

  'GrossSalary_17_1',
  'Perquisites_17_2',
  'ProfitInLieu_17_3',
  'HRAReceived',
  'HRAExempt_10_13A',
  'LTAExempt_10_5',
  'OtherExemptions_10',
  'TotalExemptions',
  'StdDeduction_16ia',
  'ProfessionalTax_16iii',
  'EntertainmentAllowance_16ii',
  'IncomefromSalary',

  'HousePropertyIncome',
  'OtherSourcesIncome',
  'GrossTotalIncome',

  'Sec80C',
  'Sec80CCC',
  'Sec80CCD_1',
  'Sec80CCD_1B',
  'Sec80CCD_2',
  'Sec80D',
  'Sec80DD',
  'Sec80DDB',
  'Sec80E',
  'Sec80EE',
  'Sec80G',
  'Sec80GG',
  'Sec80TTA',
  'Sec80TTB',
  'Sec80U',
  'TotalChapterVIA',

  'NetTaxableIncome',
  'TaxOnIncome',
  'Surcharge',
  'HealthEducationCess',
  'GrossTaxLiability',
  'ReliefU89',
  'NetTaxPayable',
  'InterestU234B',
  'InterestU234C',
  'TotalTaxAndInterest',

  'TDSDeducted',
  'TDSDeposited',
  'Q1_TDS',
  'Q2_TDS',
  'Q3_TDS',
  'Q4_TDS',

  'ClientRef',
  'ExtractedBy',
]

function buildWinmanRow(
  clientName: string,
  pan: string | null,
  data: Record<string, unknown>
): string {
  const emp = getRecord(data.employee)
  const p = getRecord(data.period)
  const inc = getRecord(data.income)
  const ded = getRecord(data.deductions_vi_a)
  const tax = getRecord(data.tax_computation)
  const tds = getRecord(data.tds)
  const meta = getRecord(data.meta)

  // Leave Category / ResidentialStatus / TaxRegime empty — CA must verify before import
  const cells = [
    s(pan ?? emp.pan ?? ''),
    s(clientName),
    s(p.assessment_year ?? ''),
    '',
    '',
    '',
    s(meta.tax_regime ?? p.tax_regime ?? ''),

    n(inc.salary_17_1),
    n(inc.perquisites_17_2),
    n(inc.profits_in_lieu_17_3),
    n(inc.hra_received),
    n(inc.hra_exempt_10_13a),
    n(inc.lta_exempt_10_5),
    n(inc.other_exemptions_10),
    n(inc.total_exempt_allowances),
    n(inc.standard_deduction_16_ia),
    n(inc.professional_tax_16_iii),
    n(inc.entertainment_allowance_16_ii),
    n(inc.income_from_salary),

    n(inc.income_from_house_property),
    n(inc.income_from_other_sources),
    n(inc.gross_total_income),

    n(ded['80c']),
    n(ded['80ccc']),
    n(ded['80ccd_1']),
    n(ded['80ccd_1b_nps']),
    n(ded['80ccd_2_employer_nps']),
    n(ded['80d_mediclaim']),
    n(ded['80dd']),
    n(ded['80ddb']),
    n(ded['80e_education_loan']),
    n(ded['80ee']),
    n(ded['80g_donations']),
    n(ded['80gg_rent']),
    n(ded['80tta_savings_interest']),
    n(ded['80ttb']),
    n(ded['80u']),
    n(ded.total_chapter_vi_a),

    n(tax.total_income_after_deductions),
    n(tax.tax_on_total_income),
    n(tax.surcharge),
    n(tax.health_education_cess),
    n(tax.gross_tax_liability),
    n(tax.relief_under_89),
    n(tax.net_tax_payable),
    n(tax.interest_payable_234b),
    n(tax.interest_payable_234c),
    n(tax.total_tax_and_interest),

    n(tds.total_tds_deducted),
    n(tds.total_tds_deposited),
    n(tds.q1_tds_deducted),
    n(tds.q2_tds_deducted),
    n(tds.q3_tds_deducted),
    n(tds.q4_tds_deducted),

    s(pan ?? ''),
    'TaxFlow AI',
  ]

  return csvSafeRow(cells)
}

/** Pure CSV body (no BOM) for tests and downloads. */
export function buildWinmanCsvContent(
  clientName: string,
  pan: string | null,
  data: Record<string, unknown>
): string {
  return [
    '# TaxFlow AI — Winman CA-ERP Import Format',
    '# Verify DateOfBirth, Category, ResidentialStatus, and TaxRegime before importing',
    '# Category / ResidentialStatus / TaxRegime left blank unless extracted — fill before import',
    '# Import via: Winman → File → Import Data → ITR Data',
    '',
    csvSafeRow(WINMAN_HEADERS),
    buildWinmanRow(clientName, pan, data),
  ].join('\n')
}

/** Download single client in Winman format */
export function downloadWinmanCSV(
  clientName: string,
  pan: string | null,
  data: Record<string, unknown>
): void {
  const bom = '\uFEFF'
  const content = buildWinmanCsvContent(clientName, pan, data)

  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientName.replace(/\s+/g, '_')}_winman.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Download all clients in one Winman bulk import CSV */
export function downloadWinmanBulkCSV(
  clients: Array<{ name: string; pan: string | null; data: Record<string, unknown> }>
): void {
  const bom = '\uFEFF'
  const rows = [
    '# TaxFlow AI — Winman Bulk Import',
    '# ' + clients.length + ' clients · Generated ' + new Date().toLocaleDateString('en-IN'),
    '# Verify DateOfBirth, Category, ResidentialStatus, and TaxRegime for each client before importing',
    '',
    csvSafeRow(WINMAN_HEADERS),
    ...clients.map(c => buildWinmanRow(c.name, c.pan, c.data)),
  ].join('\n')

  const blob = new Blob([bom + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `taxflow_winman_bulk_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** KDK Zen IT format (simpler flat structure) */
export function downloadKDKCSV(
  clientName: string,
  pan: string | null,
  data: Record<string, unknown>
): void {
  const inc = getRecord(data.income)
  const ded = getRecord(data.deductions_vi_a)
  const tax = getRecord(data.tax_computation)
  const tds = getRecord(data.tds)
  const period = getRecord(data.period)

  const headers = [
    'Name', 'PAN', 'AY', 'GrossSalary', 'HRAExempt', 'StdDeduction', 'ProfTax',
    'NetSalaryIncome', 'GTI', '80C', '80D', '80CCD1B', 'OtherVI_A', 'TotalDeductions',
    'NetTaxableIncome', 'TaxPayable', 'TDSDeducted', 'Refund_Payable',
  ]

  const amount = (value: unknown) => Number(value) || 0
  const refund = amount(tds.total_tds_deducted) - amount(tax.net_tax_payable)

  const row = [
    s(clientName), s(pan ?? ''), s(period.assessment_year ?? ''),
    n(inc.gross_salary ?? inc.salary_17_1),
    n(inc.hra_exempt_10_13a),
    n(inc.standard_deduction_16_ia),
    n(inc.professional_tax_16_iii),
    n(inc.income_from_salary),
    n(inc.gross_total_income),
    n(ded['80c']), n(ded['80d_mediclaim']), n(ded['80ccd_1b_nps']),
    n(amount(ded.total_chapter_vi_a) - amount(ded['80c']) - amount(ded['80d_mediclaim']) - amount(ded['80ccd_1b_nps'])),
    n(ded.total_chapter_vi_a),
    n(tax.total_income_after_deductions),
    n(tax.net_tax_payable),
    n(tds.total_tds_deducted),
    refund >= 0 ? `REFUND ${n(refund)}` : `PAYABLE ${n(Math.abs(refund))}`,
  ]

  const bom = '\uFEFF'
  const content = [csvSafeRow(headers), csvSafeRow(row)].join('\n')
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientName.replace(/\s+/g, '_')}_kdk.csv`
  a.click()
  URL.revokeObjectURL(url)
}
