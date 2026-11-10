function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export const FAIR_USE_DAILY_EXTRACTIONS = intEnv('FAIR_USE_DAILY_EXTRACTIONS', 300)
export const MAX_CLIENTS_PER_FIRM = intEnv('MAX_CLIENTS_PER_FIRM', 1000)
export const MAX_UPLOADS_PER_TOKEN = intEnv('MAX_UPLOADS_PER_TOKEN', 12)
export const MAX_UPLOAD_MB = intEnv('MAX_UPLOAD_MB', 4)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number]
