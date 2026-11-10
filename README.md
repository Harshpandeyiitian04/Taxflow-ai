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
- A Supabase project
- A Google AI Studio API key for Gemini
- A Resend API key for email notifications (optional; requires verified From domain)
- A WATI account for automated WhatsApp reminders (optional)
- A PostHog project key for event analytics (optional; consent-gated)

## Supabase setup

For a new Supabase project, open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). Then apply the hardening migration [`supabase/migrations/20261110_hardening.sql`](supabase/migrations/20261110_hardening.sql) (fair-use RPCs, upload slot claims, cron hardening).

In Supabase Authentication settings, enable email magic links and add `http://localhost:3000/auth/callback**` plus `https://<your-domain>/auth/callback**` to the redirect allowlist. Because this app uses server-side PKCE, update both the **Magic Link** and **Confirm signup** email templates to send the token hash directly to the callback:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in to TaxFlow AI</a>
```

Never expose the service-role key to browser code.

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
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

1. Run `supabase/migrations/20261110_hardening.sql` in the Supabase SQL editor.
2. Configure Vercel Firewall: path `/api/upload/*`, **20 requests / minute / IP**.
3. Set `RESEND_FROM_EMAIL` to a verified domain sender, plus fair-use env vars from `.env.example`.
4. After staging, review CSP Report-Only violations and switch to enforcing CSP when clean.
5. Have a lawyer review `/privacy` and `/terms` drafts before treating them as legal policies.
