# TaxFlow AI

TaxFlow AI's active workflow for Indian CA firms includes:

1. AI extraction for Form 16, bank statements, AIS/26AS, Form 16A, and capital-gains statements.
2. A unique 30-day client upload link with one upload per document type.
3. A CA dashboard for client status, tags, notes, fee/GST details, and CSV/bulk exports.
4. Reminder scheduling, GST deadlines, analytics, and referral signup tracking.

CA accounts use magic-link authentication. The Razorpay/paywall item from the original plan is intentionally excluded: the app is free during early access, extraction limits are disabled, and all checkout paths are unavailable.

## Requirements

- Node.js 20.9 or newer
- A Supabase project
- A Google AI Studio API key for Gemini 2.0 Flash
- A Resend API key for email notifications and reminder fallback (optional)
- A WATI account for automated WhatsApp reminders (optional)
- A PostHog project key for event analytics (optional)

## Supabase setup

For a new Supabase project, open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates the four core tables plus a reminders table, owner-scoped RLS policies, the `ca_analytics` view, timestamp triggers, and a private `documents` storage bucket. For an existing project, back up the database and review [`supabase/migrations/20261001_reference_features.sql`](supabase/migrations/20261001_reference_features.sql) before applying it. The migration preserves existing rows, but existing firms must have their `user_id` mapped to the corresponding Supabase Auth user for owner-scoped queries to work.

In Supabase Authentication settings, enable email magic links and add `http://localhost:3000/auth/callback**` plus `https://<your-domain>/auth/callback**` to the redirect allowlist. The `**` allows the callback's `ref` query parameter. Because this app uses server-side PKCE, update both the **Magic Link** and **Confirm signup** email templates to send the token hash directly to the callback. The login form always includes a `ref` query parameter so the template can append the auth values safely:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in to TaxFlow AI</a>
```

The callback verifies `token_hash`, writes the session to cookies, creates or links the CA firm, and redirects to the dashboard. The default `{{ .ConfirmationURL }}` link can return tokens in a URL fragment, which a server callback cannot read and can send users back to sign-in. Never expose the service-role key to browser code.

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` if email delivery is enabled
- `NEXT_PUBLIC_POSTHOG_KEY` if analytics is enabled
- `NEXT_PUBLIC_LOOM_DEMO_URL` if a real Loom embed is available
- `WATI_API_KEY`, `WATI_API_ENDPOINT`, and `CRON_SECRET` if WhatsApp reminders are enabled

For deployment, configure these in the hosting provider and set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin. Do not configure Razorpay keys; payments are disabled.

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
```

## Important limits

- Password-protected PDFs are detected and rejected with instructions; automatic decryption is not implemented because `pdf-lib` does not decrypt encrypted input.
- Extraction quality still needs validation against representative samples for every document type. Review extracted values before using them for tax filing.
- Automatic WhatsApp reminders require a configured WATI account; without it, email reminders require a client email and Resend configuration.
- Winman/KDK CSV output should be tested against the exact import templates used by each firm.
- No automated test suite is currently included.
