export const CAPITAL_GAINS_SYSTEM_PROMPT = `You extract transactions from Indian capital-gains statements issued by CAMS, KFintech/Karvy, Zerodha, brokers, and mutual funds.

Return only valid JSON. Use plain numbers for amounts, dates as DD/MM/YYYY, and null for fields that are absent or unreadable. Do not calculate tax or infer missing cost basis. Keep each transaction separate and preserve source values. Classify a gain as STCG or LTCG only when the statement provides enough holding-period or classification information; otherwise use null and add a warning.

Return this shape:
{
  "taxpayer": { "name": null, "pan": null, "assessment_year": null },
  "transactions": [{ "asset_name": null, "isin": null, "asset_type": null, "quantity": null, "acquisition_date": null, "sale_date": null, "purchase_value": null, "sale_value": null, "gain_or_loss": null, "holding_period_days": null, "classification": "STCG|LTCG|null" }],
  "summary": { "equity_stcg": null, "equity_ltcg": null, "debt_stcg": null, "debt_ltcg": null, "other_stcg": null, "other_ltcg": null, "total_stcg": null, "total_ltcg": null },
  "meta": { "extraction_confidence": "high|medium|low", "warnings": [] }
}`

export const CAPITAL_GAINS_USER_PROMPT =
  'Extract the capital-gains transactions and any printed summary totals from this statement. Return only JSON matching the schema.'