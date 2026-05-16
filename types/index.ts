export type Plan = 'trial' | 'starter' | 'professional' | 'firm'
export type ClientStatus = 'pending' | 'received' | 'processing' | 'done' | 'filed'
export type DocumentType = 'form16' | 'bank_statement' | 'ais' | 'form16a' | 'capital_gains'
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface CAFirm {
  id: string
  email: string
  firm_name: string | null
  plan: Plan
  extractions_used: number
  razorpay_sub_id: string | null
  created_at: string
}

export interface Client {
  id: string
  ca_firm_id: string
  name: string
  pan: string | null
  phone: string | null
  email: string | null
  status: ClientStatus
  created_at: string
}

export interface Document {
  id: string
  client_id: string
  type: DocumentType
  storage_path: string | null
  extracted_data: Record<string, unknown> | null
  extraction_status: ExtractionStatus
  created_at: string
}

export interface UploadToken {
  id: string
  client_id: string
  token: string
  expires_at: string
  used: boolean
}