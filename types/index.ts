// Updated types matching exact database schema

export type Plan = 'trial' | 'starter' | 'professional' | 'firm'
export type ClientStatus = 'pending' | 'received' | 'processing' | 'done' | 'filed'
export type DocumentType = 'form16' | 'bank_statement' | 'ais' | 'form16a' | 'capital_gains'
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface CAFirm {
  id: string
  user_id: string
  email: string
  firm_name: string | null
  owner_name: string | null
  phone: string | null
  city: string | null
  plan: Plan
  extractions_used: number
  client_limit: number
  razorpay_payment_id: string | null
  razorpay_sub_id: string | null
  razorpay_customer_id: string | null
  plan_expires_at: string | null
  referral_code: string
  referred_by: string | null
  referral_credits: number
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  ca_firm_id: string
  name: string
  pan: string | null
  phone: string | null
  email: string | null
  assessment_year: string | null
  status: ClientStatus
  notes: string | null
  tags: string[]
  gstin: string | null
  gst_scheme: string | null
  fee_amount: number | null
  fee_paid: boolean
  last_reminder_sent_at: string | null
  reminder_count: number
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  client_id: string
  ca_firm_id: string
  type: DocumentType
  storage_path: string | null
  original_filename: string | null
  file_size_bytes: number | null
  extracted_data: Record<string, unknown> | null
  extraction_status: ExtractionStatus
  extraction_error: string | null
  created_at: string
  updated_at: string
}

export interface UploadToken {
  id: string
  client_id: string
  ca_firm_id: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

// Extracted Form 16 data shape (what Gemini returns)
export interface Form16ExtractedData {
  // Part A
  employer_name: string
  employer_pan: string
  employer_tan: string
  employer_address: string
  employee_name: string
  employee_pan: string
  assessment_year: string
  period_from: string
  period_to: string
  // Part B
  gross_salary: number
  hra_exemption: number
  standard_deduction: number
  professional_tax: number
  taxable_salary: number
  gross_total_income: number
  // Deductions
  deduction_80c: number
  deduction_80d: number
  deduction_80ccd: number
  total_deductions: number
  // Tax
  net_taxable_income: number
  income_tax: number
  surcharge: number
  health_education_cess: number
  total_tax: number
  tds_deducted: number
  tds_deposited: number
  // Meta
  extraction_confidence: 'high' | 'medium' | 'low'
  raw_text_sample: string
}
// Append to types/index.ts

export interface PlanConfig {
  id: Plan
  name: string
  monthlyPrice: number
  annualPrice: number
  clientLimit: number
  features: string[]
  popular?: boolean
}

export const PLANS: PlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 3999,
    annualPrice: 39999,
    clientLimit: 50,
    features: [
      'Up to 50 clients',
      'Form 16 AI extraction',
      'Bank statement reader',
      'Client upload portal',
      'CSV export',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 6999,
    annualPrice: 69999,
    clientLimit: 200,
    features: [
      'Up to 200 clients',
      'Everything in Starter',
      'Bulk processing',
      'AIS & Form 16A extraction',
      'Auto reminder sequences',
      'GST + TDS calendar',
    ],
    popular: true,
  },
  {
    id: 'firm',
    name: 'Firm',
    monthlyPrice: 12999,
    annualPrice: 119999,
    clientLimit: 9999,
    features: [
      'Unlimited clients',
      'Everything in Professional',
      'Up to 5 staff accounts',
      'White-label portal',
      'Priority WhatsApp support',
    ],
  },
]