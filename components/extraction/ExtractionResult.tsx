'use client'

import { useEffect, useState } from 'react'
import { downloadWinmanCSV, downloadKDKCSV } from '@/lib/utils/winman-export'
import { generateExtractionCSV } from '@/lib/utils/export'

interface ExtractionResultProps {
  data: Record<string, unknown>
  filename: string
  onReset: () => void
}

type Tab = 'employer' | 'income' | 'deductions' | 'tax' | 'tds' | 'raw'

function formatCurrency(val: unknown): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—'
  return '₹' + val.toLocaleString('en-IN')
}

function Field({ label, value }: { label: string; value: unknown }) {
  const display = value === null || value === undefined || value === ''
    ? <span className="text-gray-400 italic text-xs">Not found</span>
    : typeof value === 'number'
      ? <span className="font-mono">{value.toLocaleString('en-IN')}</span>
      : <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>

  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0 gap-4">
      <span className="text-sm text-gray-500 shrink-0 max-w-50">{label}</span>
      <span className="text-sm text-gray-900 text-right">{display}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function flattenData(value: unknown, path = ''): Array<{ label: string; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenData(item, `${path}[${index + 1}]`))
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, child]) => flattenData(child, path ? `${path}.${key}` : key))
  }

  return path
    ? [{ label: path.replaceAll('_', ' '), value: value === null || value === undefined ? 'Not found' : String(value) }]
    : []
}

export function ExtractionResult({ data, filename, onReset }: ExtractionResultProps) {
  const [activeTab, setActiveTab] = useState<Tab>('employer')
  const [showExportMenu, setShowExportMenu] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const menu = document.getElementById('export-menu')
      const button = document.getElementById('export-dropdown-button')
      if (menu?.contains(e.target as Node) || button?.contains(e.target as Node)) return
      if (showExportMenu) setShowExportMenu(false)
    }

    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showExportMenu])

  const e = getRecord(data.employer)
  const emp = getRecord(data.employee)
  const p = getRecord(data.period)
  const inc = getRecord(data.income)
  const ded = getRecord(data.deductions_vi_a)
  const tax = getRecord(data.tax_computation)
  const tds = getRecord(data.tds)
  const meta = getRecord(data.meta)
  const warnings = Array.isArray(meta.warnings) ? meta.warnings : []
  const employeePan = typeof emp.pan === 'string' ? emp.pan : null
  const confidence = meta.extraction_confidence ?? 'unknown'
  const isForm16 = Boolean(data?.employer || data?.employee || data?.income || data?.deductions_vi_a)
  const genericFields = isForm16 ? [] : flattenData(data)
  const confColor = confidence === 'high'
    ? 'bg-green-50 text-green-700 border-green-200'
    : confidence === 'medium'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'employer', label: 'Employer & Employee' },
    { id: 'income', label: 'Income' },
    { id: 'deductions', label: 'Deductions' },
    { id: 'tax', label: 'Tax' },
    { id: 'tds', label: 'TDS' },
    { id: 'raw', label: 'Raw JSON' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">✅</span>
            <h2 className="font-bold text-gray-900">Extraction complete</h2>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${confColor}`}>
              {String(confidence)} confidence
            </span>
          </div>
          <p className="text-sm text-gray-500">{filename}</p>
        </div>
        <div className="relative">
          <button
            id="export-dropdown-button"
            onClick={() => setShowExportMenu(prev => !prev)}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ⬇ Export
            <span className="ml-1 opacity-75">▾</span>
          </button>

          {showExportMenu && (
            <div id="export-menu" className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 min-w-50">
              {isForm16 && (
                <>
                  <button
                    onClick={() => { downloadWinmanCSV(filename, employeePan, data); setShowExportMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-start gap-2"
                  >
                    <div>
                      <div className="font-medium">Winman CA-ERP</div>
                      <div className="text-xs text-gray-400">Bulk import format</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { downloadKDKCSV(filename, employeePan, data); setShowExportMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-start gap-2"
                  >
                    <div>
                      <div className="font-medium">KDK / Zen IT</div>
                      <div className="text-xs text-gray-400">Computax compatible</div>
                    </div>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                </>
              )}
              <button
                onClick={() => { generateExtractionCSV(data, filename); setShowExportMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-start gap-2"
              >
                <div>
                  <div className="font-medium">Download CSV</div>
                  <div className="text-xs text-gray-400">All extracted fields</div>
                </div>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onReset}
          className="text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Close preview
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">⚠ Warnings</p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map((warning, i) => (
              <li key={i} className="text-sm text-amber-700">{String(warning)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick stats */}
      {isForm16 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Gross salary', value: formatCurrency(inc.gross_salary) },
          { label: 'Net taxable income', value: formatCurrency(tax.total_income_after_deductions) },
          { label: 'TDS deducted', value: formatCurrency(tds.total_tds_deducted) },
          { label: 'Chapter VI-A deductions', value: formatCurrency(ded.total_chapter_vi_a) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-base font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>}

      {/* Tabs */}
      {isForm16 && <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>}

      {/* Tab content */}
      {!isForm16 ? (
        <Section title="Extracted fields">
          {genericFields.map(field => (
            <Field key={field.label} label={field.label} value={field.value} />
          ))}
        </Section>
      ) : activeTab === 'employer' && (
        <div>
          <Section title="Employer (Part A)">
            <Field label="Employer name" value={e.name} />
            <Field label="Employer PAN" value={e.pan} />
            <Field label="TAN" value={e.tan} />
            <Field label="Address" value={e.address} />
          </Section>
          <Section title="Employee">
            <Field label="Employee name" value={emp.name} />
            <Field label="Employee PAN" value={emp.pan} />
            <Field label="Designation" value={emp.designation} />
            <Field label="Employee ID" value={emp.employee_id} />
          </Section>
          <Section title="Period">
            <Field label="Assessment year" value={p.assessment_year} />
            <Field label="Financial year" value={p.financial_year} />
            <Field label="From" value={p.from_date} />
            <Field label="To" value={p.to_date} />
          </Section>
        </div>
      )}

      {activeTab === 'income' && (
        <Section title="Income computation (Part B — Schedule S)">
          <Field label="Gross salary" value={inc.gross_salary} />
          <Field label="Salary u/s 17(1)" value={inc.salary_17_1} />
          <Field label="Perquisites u/s 17(2)" value={inc.perquisites_17_2} />
          <Field label="Profits in lieu u/s 17(3)" value={inc.profits_in_lieu_17_3} />
          <Field label="HRA received" value={inc.hra_received} />
          <Field label="HRA exempt u/s 10(13A)" value={inc.hra_exempt_10_13a} />
          <Field label="LTA exempt u/s 10(5)" value={inc.lta_exempt_10_5} />
          <Field label="Other exemptions u/s 10" value={inc.other_exemptions_10} />
          <Field label="Total exempt allowances" value={inc.total_exempt_allowances} />
          <Field label="Net salary after exemptions" value={inc.net_salary_after_exemptions} />
          <Field label="Standard deduction u/s 16(ia)" value={inc.standard_deduction_16_ia} />
          <Field label="Professional tax u/s 16(iii)" value={inc.professional_tax_16_iii} />
          <Field label="Total deductions u/s 16" value={inc.total_deductions_under_16} />
          <Field label="Income from salary (net)" value={inc.income_from_salary} />
          <Field label="Income from house property" value={inc.income_from_house_property} />
          <Field label="Income from other sources" value={inc.income_from_other_sources} />
          <Field label="Gross total income" value={inc.gross_total_income} />
        </Section>
      )}

      {activeTab === 'deductions' && (
        <Section title="Deductions under Chapter VI-A">
          <Field label="80C (PF, LIC, ELSS, PPF...)" value={ded['80c']} />
          <Field label="80CCC (Pension plan)" value={ded['80ccc']} />
          <Field label="80CCD(1) (NPS)" value={ded['80ccd_1']} />
          <Field label="80CCD(1B) (Additional NPS ₹50k)" value={ded['80ccd_1b_nps']} />
          <Field label="80CCD(2) (Employer NPS)" value={ded['80ccd_2_employer_nps']} />
          <Field label="80D (Mediclaim)" value={ded['80d_mediclaim']} />
          <Field label="80DD (Disabled dependent)" value={ded['80dd']} />
          <Field label="80DDB (Treatment)" value={ded['80ddb']} />
          <Field label="80E (Education loan interest)" value={ded['80e_education_loan']} />
          <Field label="80EE (Housing loan interest)" value={ded['80ee']} />
          <Field label="80G (Donations)" value={ded['80g_donations']} />
          <Field label="80GG (Rent paid)" value={ded['80gg_rent']} />
          <Field label="80TTA (Savings interest)" value={ded['80tta_savings_interest']} />
          <Field label="80TTB" value={ded['80ttb']} />
          <Field label="80U (Disability)" value={ded['80u']} />
          <Field label="Other deductions" value={ded.other_deductions} />
          <Field label="Total Chapter VI-A deductions" value={ded.total_chapter_vi_a} />
        </Section>
      )}

      {activeTab === 'tax' && (
        <Section title="Tax computation">
          <Field label="Total income after deductions" value={tax.total_income_after_deductions} />
          <Field label="Tax on total income" value={tax.tax_on_total_income} />
          <Field label="Surcharge" value={tax.surcharge} />
          <Field label="Health & education cess (4%)" value={tax.health_education_cess} />
          <Field label="Gross tax liability" value={tax.gross_tax_liability} />
          <Field label="Relief u/s 89" value={tax.relief_under_89} />
          <Field label="Net tax payable" value={tax.net_tax_payable} />
          <Field label="Interest u/s 234B" value={tax.interest_payable_234b} />
          <Field label="Interest u/s 234C" value={tax.interest_payable_234c} />
          <Field label="Total tax + interest" value={tax.total_tax_and_interest} />
        </Section>
      )}

      {activeTab === 'tds' && (
        <Section title="TDS deducted and deposited">
          <Field label="Total TDS deducted" value={tds.total_tds_deducted} />
          <Field label="Total TDS deposited" value={tds.total_tds_deposited} />
          <Field label="Q1 (Apr–Jun)" value={tds.q1_tds_deducted} />
          <Field label="Q2 (Jul–Sep)" value={tds.q2_tds_deducted} />
          <Field label="Q3 (Oct–Dec)" value={tds.q3_tds_deducted} />
          <Field label="Q4 (Jan–Mar)" value={tds.q4_tds_deducted} />
          <Field label="Challans deposited" value={tds.tds_deposited_challan_count} />
        </Section>
      )}

      {activeTab === 'raw' && (
        <div className="bg-gray-900 rounded-xl p-4 overflow-auto max-h-96">
          <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}