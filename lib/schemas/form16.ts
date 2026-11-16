import { z } from 'zod'

// Describes the shape of extracted Form 16 data for validation.

const nullableNumber = z.number().finite().nullable()
const nullableString = z.string().nullable()

export const form16Schema = z.object({
  employer: z.object({
    name: nullableString,
    pan: nullableString,
    tan: nullableString,
    address: nullableString,
  }),
  employee: z.object({
    name: nullableString,
    pan: nullableString,
    designation: nullableString,
    employee_id: nullableString,
  }),
  period: z.object({
    assessment_year: nullableString,
    financial_year: nullableString,
    from_date: nullableString,
    to_date: nullableString,
  }),
  income: z.object({
    gross_salary: nullableNumber,
    salary_17_1: nullableNumber,
    perquisites_17_2: nullableNumber,
    profits_in_lieu_17_3: nullableNumber,
    hra_received: nullableNumber,
    hra_exempt_10_13a: nullableNumber,
    lta_exempt_10_5: nullableNumber,
    other_exemptions_10: nullableNumber,
    total_exempt_allowances: nullableNumber,
    net_salary_after_exemptions: nullableNumber,
    standard_deduction_16_ia: nullableNumber,
    professional_tax_16_iii: nullableNumber,
    entertainment_allowance_16_ii: nullableNumber,
    total_deductions_under_16: nullableNumber,
    income_from_salary: nullableNumber,
    income_from_house_property: nullableNumber,
    income_from_other_sources: nullableNumber,
    gross_total_income: nullableNumber,
  }),
  deductions_vi_a: z.object({
    '80c': nullableNumber,
    '80ccc': nullableNumber,
    '80ccd_1': nullableNumber,
    '80ccd_1b_nps': nullableNumber,
    '80ccd_2_employer_nps': nullableNumber,
    '80d_mediclaim': nullableNumber,
    '80dd': nullableNumber,
    '80ddb': nullableNumber,
    '80e_education_loan': nullableNumber,
    '80ee': nullableNumber,
    '80g_donations': nullableNumber,
    '80gg_rent': nullableNumber,
    '80tta_savings_interest': nullableNumber,
    '80ttb': nullableNumber,
    '80u': nullableNumber,
    other_deductions: nullableNumber,
    total_chapter_vi_a: nullableNumber,
  }),
  tax_computation: z.object({
    total_income_after_deductions: nullableNumber,
    tax_on_total_income: nullableNumber,
    surcharge: nullableNumber,
    health_education_cess: nullableNumber,
    gross_tax_liability: nullableNumber,
    relief_under_89: nullableNumber,
    net_tax_payable: nullableNumber,
    interest_payable_234b: nullableNumber,
    interest_payable_234c: nullableNumber,
    total_tax_and_interest: nullableNumber,
  }),
  tds: z.object({
    total_tds_deducted: nullableNumber,
    total_tds_deposited: nullableNumber,
    q1_tds_deducted: nullableNumber,
    q2_tds_deducted: nullableNumber,
    q3_tds_deducted: nullableNumber,
    q4_tds_deducted: nullableNumber,
    tds_deposited_challan_count: nullableNumber,
  }),
  meta: z.object({
    extraction_confidence: z.enum(['high', 'medium', 'low']),
    has_part_a: z.boolean(),
    has_part_b: z.boolean(),
    document_type: z.enum([
      'form16_complete',
      'form16_part_a_only',
      'form16_part_b_only',
      'unclear',
    ]),
    warnings: z.array(z.string()).default([]),
  }).passthrough(),
}).passthrough()

export type Form16ExtractedData = z.infer<typeof form16Schema>

// Accepts any JSON object for non–Form 16 document types.
export const genericExtractionSchema = z.record(z.string(), z.unknown())