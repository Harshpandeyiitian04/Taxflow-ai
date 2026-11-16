# TaxFlow AI — Fix Report

Branch: `audit-fixes`  
Audit source: `AUDIT_FINDINGS.md`  
Date: 2026-11-11

## Batches completed

| Batch | Commit | Scope |
|-------|--------|--------|
| 1 | `5c32713` | Auth, cron fail-closed, proxy, Next 16.4.6, tenant access |
| 2 | `b2b9100` | Fair-use quotas, upload slots, zod, extraction hardening |
| 3 | `a437eac` | CSV/email safety, IST AY/ITR dates, GST deadlines |
| 4 | `7e830cc` | Fetch/error UX, a11y, bulk retry, remove payments UI |
| 5 | `c7a970a` | Security headers, PostHog consent, privacy/terms, account delete |
| 6 | (this commit) | Vitest suite, README/docs, FIX_REPORT |

## DECISIONS

1. **Payments permanently disabled** — Razorpay routes/UI removed; plan columns retained in DB but unused for gating.
2. **Fair-use limits** replace trial gating (`consume_extraction`, daily caps, client caps).
3. **Default AY** follows brief: from Apr 1 Y–Mar 31 Y+1 → `Y-(Y+1)%100` in Asia/Kolkata (e.g. Nov 2026 → `2026-27`).
4. **Winman Category / ResidentialStatus / TaxRegime** left empty (never invent `1`/`OLD`); standard deduction never defaults to `50000`.
5. **CSP is Report-Only** until staging review; then switch to enforcing.
6. **Vitest 3.2.4** installed with `--legacy-peer-deps` due to `@types/node@20` vs Vitest 5 peer range.
7. **PostHog** initializes only after consent; no pageviews on dashboard/extract/bulk/upload/gst/analytics/profile/referral.

## NEEDS-USER-ACTION

1. Run `supabase/migrations/20261110_hardening.sql` in Supabase SQL editor.
2. Vercel Firewall: `/api/upload/*` → **20 req/min/IP**.
3. Set `RESEND_FROM_EMAIL` (verified domain) + fair-use env vars from `.env.example`.
4. Review CSP Report-Only in staging; promote to enforcing when clean.
5. Lawyer review of `/privacy` and `/terms` drafts.

## Secret scan (patterns only)

Searched tracked sources (excluding `.git`, `node_modules`, `.next`) for `eyJ`, `AIza`, `re_`, `rzp_`, `sb_secret`, `sb_publishable`, `service_role`.

| File | Pattern | Notes |
|------|---------|--------|
| `.env.example` | `eyJ`, `AIza`, `re_` | Placeholders only (`eyJ_YOUR_…`, `AIza_YOUR_…`, `re_YOUR_…`) |
| `supabase/migrations/20261110_hardening.sql` | `service_role` | Intentional RPC grants / auth.role checks |
| Other hits | `re_` / hashes | False positives (`failure_reason`, package integrity, etc.) |

No live secrets found in tracked source. `.env.local` is gitignored and was not scanned into the report.

## Verification (real outputs)

### `npx tsc --noEmit --incremental false`

Exit code **0** (no diagnostics).

### `npm run lint`

Exit code **0** (eslint clean).

### `npm run build`

```
▲ Next.js 16.4.6 (Turbopack)
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages (23/23)
```

Routes include `/privacy`, `/terms`, `/api/account/delete`; Razorpay/`/upgrade` removed.

### `npm test`

```
Test Files  11 passed (11)
     Tests  33 passed (33)
```

Coverage: csvSafe, escapeHtml, dates, GST, form16Checks, form16Schema, magicBytes, cronAuth, claimSlot, winman export, sanitizeNextPath.

### `npm audit --omit=dev`

```
6 vulnerabilities (2 low, 4 moderate)
```

All in `shadcn` → `@shadcn/registry` / `deepmerge` / `ts-morph` / `minimatch`. Not addressed with `--force` (would downgrade shadcn to breaking 1.0.0). Track separately; not in the app request path for extraction/auth.

## Remaining known gaps (non-blocking)

- No E2E browser suite yet.
- GST due dates are calendar heuristics — always verify on the GST portal.
- Lawyer-ready privacy/terms still drafts.
- Optional: remove unused `shadcn` package to clear npm audit noise.
