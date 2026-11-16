// Tests GST return due dates and Indian WhatsApp phone formatting.
import { describe, expect, it } from 'vitest'
import { getGSTDeadlines, normalizeWhatsAppPhone } from '@/lib/gst'

// Monthly and quarterly GSTR due date rolling rules.
describe('getGSTDeadlines', () => {
  const monthly = {
    id: '1',
    name: 'Monthly Co',
    gstin: '27AAAAA0000A1Z5',
    gst_scheme: 'monthly',
    phone: '9876543210',
  }

  // Early in the month we should see the current month's GSTR-1 due.
  it('includes current-month dues near month start', () => {
    const now = new Date(2026, 0, 5, 12, 0, 0)
    const deadlines = getGSTDeadlines([monthly], now)
    const gstr1 = deadlines.find(d => d.type === 'GSTR-1')
    expect(gstr1).toBeTruthy()
    expect(gstr1!.dueDate.getDate()).toBe(11)
    expect(gstr1!.dueDate.getMonth()).toBe(0)
    expect(gstr1!.daysLeft).toBeGreaterThan(0)
  })

  // After the 11th the same return should show as overdue.
  it('shows overdue after the 11th within 15 days', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0)
    const deadlines = getGSTDeadlines([monthly], now)
    const gstr1 = deadlines.find(d => d.type === 'GSTR-1')
    expect(gstr1).toBeTruthy()
    expect(gstr1!.daysLeft).toBeLessThan(0)
  })

  // Very late in the month should roll forward to next month's due date.
  it('rolls past dues more than 15 days overdue', () => {
    const now = new Date(2026, 0, 28, 12, 0, 0)
    const deadlines = getGSTDeadlines([monthly], now)
    const gstr1 = deadlines.find(d => d.type === 'GSTR-1')
    expect(gstr1!.dueDate.getMonth()).toBe(1)
    expect(gstr1!.dueDate.getDate()).toBe(11)
  })

  // December GSTR-3B should roll cleanly into January when overdue.
  it('handles Dec to Jan rollover for GSTR-3B', () => {
    const now = new Date(2026, 11, 25, 12, 0, 0)
    const deadlines = getGSTDeadlines([monthly], now)
    const gstr3b = deadlines.find(d => d.type === 'GSTR-3B')
    expect(gstr3b!.dueDate.getFullYear()).toBe(2026)
    expect(gstr3b!.dueDate.getMonth()).toBe(11)
    expect(gstr3b!.dueDate.getDate()).toBe(20)
    expect(gstr3b!.daysLeft).toBeLessThan(0)

    const later = new Date(2027, 0, 6, 12, 0, 0)
    const rolled = getGSTDeadlines([monthly], later).find(d => d.type === 'GSTR-3B')
    expect(rolled!.dueDate.getFullYear()).toBe(2027)
    expect(rolled!.dueDate.getMonth()).toBe(0)
    expect(rolled!.dueDate.getDate()).toBe(20)
  })

  // Quarterly filers get different due dates in early quarter.
  it('computes quarterly dues for early-quarter windows', () => {
    const quarterly = { ...monthly, id: '2', gst_scheme: 'quarterly' }
    const now = new Date(2026, 3, 5, 12, 0, 0)
    const deadlines = getGSTDeadlines([quarterly], now)
    const gstr1 = deadlines.find(d => d.type === 'GSTR-1')
    expect(gstr1).toBeTruthy()
    expect(gstr1!.dueDate.getMonth()).toBe(3)
    expect(gstr1!.dueDate.getDate()).toBe(13)
  })
})

// Turns local mobile numbers into WhatsApp's 91-prefixed format.
describe('normalizeWhatsAppPhone', () => {
  // Common Indian formats should all map to the same digits.
  it('normalizes Indian mobiles', () => {
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('09876543210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210')
  })
})