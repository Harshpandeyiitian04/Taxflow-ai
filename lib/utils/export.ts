// Generates a flat CSV from Form 16 extracted data
// Format is compatible with most CA software import templates

export function generateForm16CSV(data: Record<string, unknown>, filename: string): void {
  const e = (data?.employer ?? {}) as Record<string, unknown>
  const emp = (data?.employee ?? {}) as Record<string, unknown>
  const p = (data?.period ?? {}) as Record<string, unknown>
  const inc = (data?.income ?? {}) as Record<string, unknown>
  const ded = (data?.deductions_vi_a ?? {}) as Record<string, unknown>
  const tax = (data?.tax_computation ?? {}) as Record<string, unknown>
  const tds = (data?.tds ?? {}) as Record<string, unknown>
  const meta = (data?.meta ?? {}) as Record<string, unknown>

  const rows: [string, unknown][] = [
    // Header info
    ['Field', 'Value'],
    ['', ''],
    ['=== EMPLOYER ===', ''],
    ['Employer Name', e.name ?? ''],
    ['Employer PAN', e.pan ?? ''],
    ['Employer TAN', e.tan ?? ''],
    ['Employer Address', e.address ?? ''],
    ['', ''],
    ['=== EMPLOYEE ===', ''],
    ['Employee Name', emp.name ?? ''],
    ['Employee PAN', emp.pan ?? ''],
    ['Designation', emp.designation ?? ''],
    ['Employee ID', emp.employee_id ?? ''],
    ['', ''],
    ['=== PERIOD ===', ''],
    ['Assessment Year', p.assessment_year ?? ''],
    ['Financial Year', p.financial_year ?? ''],
    ['From Date', p.from_date ?? ''],
    ['To Date', p.to_date ?? ''],
    ['', ''],
    ['=== INCOME (Part B) ===', ''],
    ['Gross Salary', inc.gross_salary ?? ''],
    ['Salary u/s 17(1)', inc.salary_17_1 ?? ''],
    ['Perquisites u/s 17(2)', inc.perquisites_17_2 ?? ''],
    ['Profits in Lieu u/s 17(3)', inc.profits_in_lieu_17_3 ?? ''],
    ['HRA Received', inc.hra_received ?? ''],
    ['HRA Exempt u/s 10(13A)', inc.hra_exempt_10_13a ?? ''],
    ['LTA Exempt u/s 10(5)', inc.lta_exempt_10_5 ?? ''],
    ['Other Exemptions u/s 10', inc.other_exemptions_10 ?? ''],
    ['Standard Deduction u/s 16(ia)', inc.standard_deduction_16_ia ?? ''],
    ['Professional Tax u/s 16(iii)', inc.professional_tax_16_iii ?? ''],
    ['Income from Salary (Net)', inc.income_from_salary ?? ''],
    ['Income from House Property', inc.income_from_house_property ?? ''],
    ['Income from Other Sources', inc.income_from_other_sources ?? ''],
    ['Gross Total Income', inc.gross_total_income ?? ''],
    ['', ''],
    ['=== CHAPTER VI-A DEDUCTIONS ===', ''],
    ['80C', ded['80c'] ?? ''],
    ['80CCC', ded['80ccc'] ?? ''],
    ['80CCD(1)', ded['80ccd_1'] ?? ''],
    ['80CCD(1B) - Additional NPS', ded['80ccd_1b_nps'] ?? ''],
    ['80CCD(2) - Employer NPS', ded['80ccd_2_employer_nps'] ?? ''],
    ['80D - Mediclaim', ded['80d_mediclaim'] ?? ''],
    ['80E - Education Loan Interest', ded['80e_education_loan'] ?? ''],
    ['80G - Donations', ded['80g_donations'] ?? ''],
    ['80TTA - Savings Interest', ded['80tta_savings_interest'] ?? ''],
    ['Total Chapter VI-A', ded.total_chapter_vi_a ?? ''],
    ['', ''],
    ['=== TAX COMPUTATION ===', ''],
    ['Total Income After Deductions', tax.total_income_after_deductions ?? ''],
    ['Tax on Total Income', tax.tax_on_total_income ?? ''],
    ['Surcharge', tax.surcharge ?? ''],
    ['Health & Education Cess', tax.health_education_cess ?? ''],
    ['Gross Tax Liability', tax.gross_tax_liability ?? ''],
    ['Relief u/s 89', tax.relief_under_89 ?? ''],
    ['Net Tax Payable', tax.net_tax_payable ?? ''],
    ['', ''],
    ['=== TDS ===', ''],
    ['Total TDS Deducted', tds.total_tds_deducted ?? ''],
    ['Total TDS Deposited', tds.total_tds_deposited ?? ''],
    ['Q1 TDS (Apr-Jun)', tds.q1_tds_deducted ?? ''],
    ['Q2 TDS (Jul-Sep)', tds.q2_tds_deducted ?? ''],
    ['Q3 TDS (Oct-Dec)', tds.q3_tds_deducted ?? ''],
    ['Q4 TDS (Jan-Mar)', tds.q4_tds_deducted ?? ''],
    ['', ''],
    ['=== META ===', ''],
    ['Extraction Confidence', meta.extraction_confidence ?? ''],
    ['Has Part A', meta.has_part_a ?? ''],
    ['Has Part B', meta.has_part_b ?? ''],
    ['Document Type', meta.document_type ?? ''],
    ['Warnings', Array.isArray(meta.warnings) ? meta.warnings.join('; ') : ''],
    ['', ''],
    ['Extracted by TaxFlow AI', 'taxflowai.in'],
  ]

  const csvContent = rows
    .map(([k, v]) => {
      const val = v === null || v === undefined ? '' : String(v)
      const cells = [k, val].map(cell => `"${String(cell).replace(/"/g, '""')}"`)
      return cells.join(',')
    })
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, '') + '_extracted.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function generateExtractionCSV(data: Record<string, unknown>, filename: string): void {
  const rows: string[][] = [['Field', 'Value']]

  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      if (value.length === 0) rows.push([path, ''])
      value.forEach((item, index) => visit(item, `${path}[${index + 1}]`))
      return
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) rows.push([path, ''])
      entries.forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key))
      return
    }

    rows.push([path, value === null || value === undefined ? '' : String(value)])
  }

  visit(data, '')

  const csvContent = rows
    .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, '') + '_extracted.csv'
  link.click()
  URL.revokeObjectURL(url)
}