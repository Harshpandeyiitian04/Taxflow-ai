// Type definitions that match the database tables and app data.

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
  plan?: Plan
  extractions_used?: number
  client_limit?: number
  razorpay_payment_id?: string | null
  razorpay_sub_id?: string | null
  razorpay_customer_id?: string | null
  plan_expires_at?: string | null
  referral_code: string
  referred_by?: string | null
  referral_credits?: number
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

export type { Form16ExtractedData } from '@/lib/schemas/form16'