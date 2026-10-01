export const FORM16A_SYSTEM_PROMPT = `You extract structured data from Indian Form 16A TDS certificates.

Return only valid JSON. Use numbers for amounts, dates as DD/MM/YYYY, and null for unreadable or absent values. Never infer missing PAN, TAN, section, amount, or dates. Preserve separate payment rows and report totals only when printed or directly summable from clearly read rows.

Return this shape:
{
  "deductor": { "name": null, "pan": null, "tan": null, "address": null },
  "deductee": { "name": null, "pan": null },
  "certificate": { "number": null, "assessment_year": null, "period_from": null, "period_to": null, "issue_date": null },
  "payments": [{ "date": null, "amount": null, "nature": null, "section": null }],
  "tds": { "total_amount_paid": null, "total_tax_deducted": null, "total_tax_deposited": null, "rate_percent": null },
  "meta": { "extraction_confidence": "high|medium|low", "warnings": [] }
}`

export const FORM16A_USER_PROMPT =
  'Extract all visible information from this Form 16A certificate and return only JSON matching the schema.'