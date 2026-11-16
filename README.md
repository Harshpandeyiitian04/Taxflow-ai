# TaxFlow AI

TaxFlow AI helps Indian CA firms extract Form 16 and related tax documents with AI, then review and export CSV for CA software.

Active workflow:

1. AI extraction for Form 16, bank statements, AIS/26AS, Form 16A, and capital-gains statements (max **4 MB** per file).
2. A unique client upload link (fair-use / slot limits apply).
3. A CA dashboard for client status, tags, notes, fee/GST details, and CSV/bulk exports.
4. Reminder scheduling, GST deadlines, analytics, and referral signup tracking.

CA accounts use magic-link authentication. **Payments are permanently disabled** for this product direction. The app is free during early access with **fair-use extraction limits** (not a paid trial gate). DB plan/razorpay columns may still exist but are not used for gating.

Exports are provided as CSV. Verify against your software's import template before bulk importing (Winman, KDK, etc.).

## Requirements

- Node.js 20.9 or newer
- A Neon project with Neon Auth and Object Storage enabled
- A Google AI Studio API key for Gemini
- A Resend API key for email notifications (optional; requires verified From domain)
- A WATI account for automated WhatsApp reminders (optional)
- A PostHog project key for event analytics (optional; consent-gated)

## Neon setup

TaxFlow AI runs on Neon: Postgres (`DATABASE_URL`), Neon Auth (Managed Better Auth magic links) and S3-compatible object storage for documents. Supabase has been removed; the legacy `supabase/` folder is kept for reference only.

Apply [`neon/migrations/001_app_schema.sql`](neon/migrations/001_app_schema.sql) to the Neon database (app tables, fair-use/upload RPCs, analytics view). Enable **Magic Link** for the Neon Auth branch and add `http://localhost:3000` plus your production origin as trusted domains (`neon neon-auth domain add <origin>`). The app sends users back to `/auth/callback`, which provisions their firm.

Never expose `DATABASE_URL` or the storage credentials to browser code.

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
- `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_JWKS_URL`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT_URL_S3`, `NEON_STORAGE_BUCKET`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` if email delivery is enabled (`RESEND_FROM_EMAIL` is required — there is no hardcoded From fallback)
- `NEXT_PUBLIC_SUPPORT_EMAIL` for the public support address
- Fair-use vars such as `FAIR_USE_DAILY_EXTRACTIONS`, `MAX_UPLOAD_MB` (default 4), `MAX_CLIENTS_PER_FIRM`, `MAX_UPLOADS_PER_TOKEN` as listed in `.env.example`
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` if analytics is enabled
- `NEXT_PUBLIC_LOOM_DEMO_URL` if a real Loom embed is available
- `WATI_API_KEY`, `WATI_API_ENDPOINT`, and `CRON_SECRET` if WhatsApp reminders are enabled

For deployment, configure these in the hosting provider and set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin. Do not configure Razorpay keys; payments are disabled.

Resend only sends from a verified domain. A `gmail.com` From address will fail. Until a domain is verified, `onboarding@resend.dev` delivers only to the Resend account owner's email.

Security headers (HSTS, nosniff, frame deny, referrer, permissions) are set in `next.config.ts`. A `Content-Security-Policy-Report-Only` header is also enabled — review browser reports, then switch it to enforcing CSP after testing.

## Run and verify

```bash
npm ci
npm run dev
```

Before deployment, run:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm test
```

## Important limits

- Max upload size is **4 MB**. Compress or split larger PDFs.
- Password-protected PDFs are detected and rejected; unlock them before upload.
- Extraction quality still needs validation against representative samples. Review extracted values before filing.
- Automatic WhatsApp reminders require WATI; email reminders require client email + Resend.
- Exports are CSV only — verify Category / ResidentialStatus / TaxRegime (left blank unless extracted) and amounts against your import template.
- Standard deduction and other amounts are exported exactly as extracted (never invented).

## NEEDS-USER-ACTION

1. Apply `neon/migrations/001_app_schema.sql` to the Neon database and set `AWS_ENDPOINT_URL_S3` for object storage.
2. Configure Vercel Firewall: path `/api/upload/*`, **20 requests / minute / IP**.
3. Set `RESEND_FROM_EMAIL` to a verified domain sender, plus fair-use env vars from `.env.example`.
4. After staging, review CSP Report-Only violations and switch to enforcing CSP when clean.
5. Have a lawyer review `/privacy` and `/terms` drafts before treating them as legal policies.
