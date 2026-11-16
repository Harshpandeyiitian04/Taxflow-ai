// Hides part of an email address for privacy on screen.

// Shows only the first letter of the name part before the @ sign.
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const visible = local.slice(0, 1)
  return `${visible}***@${domain}`
}