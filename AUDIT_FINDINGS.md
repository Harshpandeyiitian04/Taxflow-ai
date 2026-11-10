# TaxFlow AI — Hostile Production Audit

**Stack observed:** Next.js **16.2.6** (not 15), React 19.2.4, App Router, TypeScript, Supabase, Gemini, Resend, PostHog. Razorpay routes are stubs (410). Auth gate lives in `proxy.ts` (Next.js 16 rename of middleware).

**Audit mode:** READ-ONLY of source. Only this file is created/updated.

**Phases completed:** 0–14 + continuation deep-pass (UI/GST/bulk/notes)

---

## 1. EXECUTIVE SUMMARY

| Severity | Count |
|----------|------:|
| P0 | 6 |
| P1 | 23 |
| P2 | 35 |
| P3 | 14 |
| **Total findings** | **78** |

| Category | Count (approx) |
|----------|------:|
| Security/Privacy | 12 |
| Auth / Authz/RLS | 10 |
| Upload | 7 |
| AI | 6 |
| Payments / Config | 8 |
| Email/Cron | 5 |
| Export / Frontend / DB / Perf / Docs | remainder |

### Top 10 most dangerous (priority order)

1. **F-005** — Next.js 16.2.6 has critical advisories (proxy/middleware bypass, RCE paths). Upgrade required.
2. **F-045** — Cron auth compares to `Bearer ${undefined}` when `CRON_SECRET` unset → anyone can trigger reminder fan-out.
3. **F-024 / F-026** — Public `/api/upload/[token]` has no rate limit and burns Gemini quota / increments firm counters without plan gates.
4. **F-023** — `validateUploadToken` never checks `used`; bearer links stay reusable across doc types after “used”.
5. **F-008** — `/bulk` is a pure client page, not in proxy `protectedPaths`, and builds as static → UI reachable without login (API still 401).
6. **F-020** — Unauthenticated GET `/api/upload/[token]` returns firm email/phone + client name.
7. **F-036 / F-037 / F-038** — `canExtract` always allows; `plan_expires_at` and `client_limit` never enforced (cost/abuse when paywall returns).
8. **F-001** — Vercel cron path `/api/cron` ≠ `/api/cron/reminders` → reminders never run.
9. **F-048 / F-050** — Unescaped names in HTML emails; CSV cells can start with `=` (formula injection).
10. **F-033 / F-051** — Winman/KDK invent `standard_deduction=50000` and hard-code Category/Resident/OLD regime → wrong filings.

---

## PHASE 0 — REPOSITORY MAP

### 0.1 Full file tree (excluding `node_modules`, `.next`, `.git`)

```
.env.example
.env.local
.gitignore
AGENTS.md
CLAUDE.md
AUDIT_FINDINGS.md          ← this file (audit artifact)
README.md
components.json
eslint.config.mjs
next.config.ts
next-env.d.ts
package.json
package-lock.json
postcss.config.mjs
proxy.ts                   ← Next.js 16 request proxy (ex-middleware)
tsconfig.json
vercel.json

app/
  favicon.ico
  globals.css
  layout.tsx
  page.tsx                 → /
  (auth)/
    login/page.tsx         → /login
  (dashboard)/
    analytics/page.tsx     → /analytics
    bulk/page.tsx          → /bulk
    dashboard/
      page.tsx             → /dashboard
      clients/[id]/page.tsx → /dashboard/clients/[id]
    extract/page.tsx       → /extract
    gst/page.tsx           → /gst
    profile/page.tsx       → /profile
    referral/page.tsx      → /referral
    upgrade/page.tsx       → /upgrade
  api/
    clients/
      route.ts
      [id]/route.ts
      [id]/token/route.ts
    cron/reminders/route.ts
    extract/route.ts
    profile/route.ts
    razorpay/
      create-order/route.ts
      verify/route.ts
      webhook/route.ts
    referrals/route.ts
    reminders/route.ts
    upload/[token]/route.ts
  auth/
    callback/route.ts
    signout/route.ts
  upload/[token]/page.tsx  → /upload/[token]

components/
  PostHogProvider.tsx
  clients/
    AddClientButton.tsx
    AddClientModal.tsx
    NotesEditor.tsx
    TagEditor.tsx
    UploadLinkModal.tsx
  dashboard/
    ClientDetailClient.tsx
    DashboardClient.tsx
  extraction/
    ExtractionResult.tsx
    UploadZone.tsx
  payments/
    RazorpayButton.tsx
    UpgradeClient.tsx
  profile/ProfileClient.tsx
  referral/ReferralClient.tsx
  ui/button.tsx

lib/
  analytics.ts
  email.ts
  gemini.ts
  prompts/
    ais.ts
    bank-statement.ts
    capital-gains.ts
    form16.ts
    form16a.ts
  supabase/
    admin.ts
    client.ts
    queries.ts
    server.ts
  utils.ts
  utils/
    export.ts
    pdf-utils.ts
    winman-export.ts

public/
  file.svg, globe.svg, next.svg, vercel.svg, window.svg

supabase/
  schema.sql
  migrations/20261001_reference_features.sql

types/index.ts
```

### 0.2 Public page URLs (route groups stripped)

| File | Public URL |
|------|------------|
| `app/page.tsx` | `/` |
| `app/(auth)/login/page.tsx` | `/login` |
| `app/(dashboard)/dashboard/page.tsx` | `/dashboard` |
| `app/(dashboard)/dashboard/clients/[id]/page.tsx` | `/dashboard/clients/[id]` |
| `app/(dashboard)/extract/page.tsx` | `/extract` |
| `app/(dashboard)/bulk/page.tsx` | `/bulk` |
| `app/(dashboard)/gst/page.tsx` | `/gst` |
| `app/(dashboard)/analytics/page.tsx` | `/analytics` |
| `app/(dashboard)/referral/page.tsx` | `/referral` |
| `app/(dashboard)/profile/page.tsx` | `/profile` |
| `app/(dashboard)/upgrade/page.tsx` | `/upgrade` (server redirects to `/dashboard`) |
| `app/upload/[token]/page.tsx` | `/upload/[token]` |

**No page exists at** `/clients/[id]` **or** `/clients`. Client detail is under `/dashboard/clients/[id]`.

### 0.3 API routes

| Route | Methods | Auth required? | Supabase client |
|-------|---------|----------------|-----------------|
| `POST /api/clients` | POST | Yes (`createClient` getUser) | server + **admin** for insert/token |
| `GET /api/clients` | GET | Yes | server (RLS + `.eq('ca_firm_id')`) |
| `GET/PATCH/DELETE /api/clients/[id]` | GET, PATCH, DELETE | Yes | server only (+ `getOrCreateUploadToken` uses admin) |
| `POST /api/clients/[id]/token` | POST | Yes | server + **admin**; ownership via `.eq('ca_firm_id', firm.id)` |
| `POST /api/extract` | POST | Yes | server + **admin** when clientId present |
| `GET/POST /api/upload/[token]` | GET, POST | **No** (bearer token) | **admin only** |
| `GET/POST /api/reminders` | GET, POST | Yes | server + **admin**; ownership via firm.id |
| `GET /api/cron/reminders` | GET | Bearer `CRON_SECRET` | **admin only** |
| `GET /api/referrals` | GET | Yes | server + **admin** (reads other firms' emails by referral) |
| `GET/PATCH /api/profile` | GET, PATCH | Yes | server |
| `POST /api/razorpay/create-order` | POST | N/A (stub) | none — returns 410 |
| `POST /api/razorpay/verify` | POST | N/A (stub) | none — returns 410 |
| `POST /api/razorpay/webhook` | POST | N/A (stub) | none — returns 410 |
| `GET /auth/callback` | GET | code/token_hash | anon SSR + **admin** for firm setup |
| `POST /auth/signout` | POST | session cookies | server |

### 0.4 Environment variables

**Read in code (`process.env.*`):**

| Variable | Where | In `.env.example`? | Notes |
|----------|-------|--------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | server/client/admin/proxy/callback | Yes | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server/client/proxy/callback | Yes | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` | Yes | Secret — OK |
| `GEMINI_API_KEY` | `lib/gemini.ts` | Yes | Secret — OK |
| `RESEND_API_KEY` | `lib/email.ts` | Yes | Secret — OK |
| `RESEND_FROM_EMAIL` | `lib/email.ts` | Yes | |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHogProvider, analytics | Yes | Public |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHogProvider, analytics | Yes | Public |
| `NEXT_PUBLIC_LOOM_DEMO_URL` | `app/page.tsx` | Yes | Public |
| `NEXT_PUBLIC_APP_URL` | email, clients, upload, reminders, referral | Yes | Used for absolute links |
| `WATI_API_KEY` | cron | Yes | Secret — OK |
| `WATI_API_ENDPOINT` | cron | Yes | |
| `CRON_SECRET` | cron | Yes | Secret — OK |
| `NODE_ENV` | PostHogProvider | n/a | Built-in |

**Not read / not in example:**
- No `RAZORPAY_*` vars (payments stubbed; README says do not configure them).
- No `SENTRY_*` vars (Sentry not present in package.json).

**Flags from Phase 0 (will become findings in later phases):**
- `.gitignore` ignores `.env*` **including** `.env.example` (line 34–36) — example may not ship in git.
- `vercel.json` cron path is `/api/cron` but route is `/api/cron/reminders`.
- Default FROM email in code when unset: `harshpandeyiitian04@gmail.com`.

### 0.5 Database objects: code assumptions vs SQL

**Tables (schema.sql + migration):**
- `ca_firms` — columns match `types/CAFirm` including `plan_expires_at`, `referral_*`, razorpay ids.
- `clients` — includes `tags`, `gstin`, `gst_scheme`, `fee_amount`, `fee_paid`, `reminder_count`, `notes`.
- `documents` — types include form16/bank_statement/ais/form16a/capital_gains.
- `upload_tokens` — `token`, `expires_at`, `used`, `ca_firm_id`.
- `reminders` — pending/sent/failed.

**View:**
- `ca_analytics` with `(security_invoker = true)` — present in both SQL files.

**Functions / triggers in SQL:**
- `set_updated_at()` + triggers on ca_firms, clients, documents.
- **No** `handle_new_user` trigger in repo SQL.
- **No** `generate_referral_code` function; referral_code default uses `gen_random_bytes` / UUID substr in schema.

**RLS policies present:**
- ca_firms: SELECT own, UPDATE own + **column GRANT** limited to `(firm_name, owner_name, phone, city)`.
- clients: SELECT/UPDATE/DELETE own. **No INSERT policy.**
- documents: SELECT only. **No INSERT/UPDATE/DELETE.**
- upload_tokens: RLS enabled, **zero policies**.
- reminders: SELECT only. **No INSERT/UPDATE.**
- storage.objects: select/insert/delete own by firm folder.

**App behavior vs policies:** inserts/updates for clients, documents, tokens, reminders, extraction counters go through **admin/service-role** in API routes — intentional bypass.

**Indexes:** firm/client/created_at, reminders (status, scheduled_at), referral_code unique, user_id unique (partial in migration).

### 0.6 Proxy auth gate (preview for Phase 2)

`proxy.ts` protected paths:

```30:31:proxy.ts
  const protectedPaths = ['/dashboard', '/clients', '/extract', '/upgrade']
  const isProtected = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))
```

- Protects: `/dashboard*`, `/clients*`, `/extract*`, `/upgrade*`.
- Does **not** list: `/bulk`, `/gst`, `/analytics`, `/referral`, `/profile` (those pages call `redirect('/login')` themselves).
- `/clients` has no page; real client URL is `/dashboard/clients/[id]` (covered by `/dashboard` prefix).

### 0.7 Phase 0 map findings (preliminary IDs; detailed blocks in later phases)

| ID | Severity | One-liner |
|----|----------|-----------|
| F-001 | P1 | `vercel.json` cron path `/api/cron` ≠ route `/api/cron/reminders` |
| F-002 | P2 | Proxy does not gate `/bulk|/gst|/analytics|/referral|/profile` |
| F-003 | P2 | `.gitignore` ignores `.env.example` |
| F-004 | P3 | User brief said Next 15; repo is Next 16.2.6 |

---

## FINDINGS (detailed)

### F-001
- **Severity:** P1
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `vercel.json:3-6`; `app/api/cron/reminders/route.ts:16`
- **Evidence:**
  ```json
  "path": "/api/cron",
  "schedule": "30 3 * * *"
  ```
  vs exported handler at `/api/cron/reminders`.
- **Problem:** Vercel Cron will hit a non-existent path; reminder jobs never run in production.
- **Trigger / Impact:** Scheduled WhatsApp/email reminders never fire for any firm.
- **Fix direction:** Change cron path to `/api/cron/reminders` (or add a rewrite/alias route at `/api/cron`).
- **Depends on:** —

### F-002
- **Severity:** P2
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `proxy.ts:30-37`
- **Evidence:**
  ```ts
  const protectedPaths = ['/dashboard', '/clients', '/extract', '/upgrade']
  ```
- **Problem:** Proxy does not redirect unauthenticated users away from `/bulk`, `/gst`, `/analytics`, `/referral`, `/profile`.
- **Trigger / Impact:** `/gst|/analytics|/referral|/profile` still server-`redirect('/login')`. `/bulk` has no server auth (see F-008).
- **Fix direction:** Add all authenticated app paths to `protectedPaths`.
- **Depends on:** F-008

### F-003
- **Severity:** P2
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `.gitignore:33-36`
- **Evidence:** `.env*` / `.env.example` ignored.
- **Problem:** Env template may never ship in git.
- **Trigger / Impact:** Deploy/onboarding misconfiguration.
- **Fix direction:** `!.env.example`
- **Depends on:** —

### F-004
- **Severity:** P3
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `package.json:23`
- **Evidence:** `"next": "16.2.6"` with `proxy.ts`.
- **Problem:** Brief assumed Next 15 / middleware.ts.
- **Trigger / Impact:** Docs drift only.
- **Fix direction:** Align docs to Next 16 + proxy.
- **Depends on:** —

---

## PHASE 1 — TOOLCHAIN

### Results
| Command | Exit | Summary |
|---------|------|---------|
| `npx tsc --noEmit --incremental false` | 0 | Clean (npm warn on `devdir` only) |
| `npm run lint` | 0 | Clean (no ESLint findings) |
| `npm run build` | 0 | Success; Proxy detected; `/bulk`,`/extract`,`/login` static (○); rest dynamic |
| `npm audit --omit=dev` | 1 | **40 vulns (2 low, 18 moderate, 18 high, 2 critical)** |
| `npx depcheck` | non-zero | Unused: `@base-ui/react`, `@opentelemetry/*`, `@phosphor-icons/react`, `lucide-react`, `shadcn` (false+ for CSS), `tw-animate-css` (used in CSS), falsely flagged `tailwindcss`/`@tailwindcss/postcss` |

### F-005
- **Severity:** P0
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** `package.json:23` (`next@16.2.6`); npm audit GHSA-6gpp-xcg3-4w24 (proxy bypass), GHSA-p293-qw3h-jr36 (Windows RCE), multiple Next advisories; fix via `next@16.4.6`
- **Evidence:** Audit output: `next 9.3.4-canary.0 - 16.4.0` Severity: **critical** including “Middleware / Proxy bypass in App Router applications using Turbopack and single locale” and unauthenticated RCE advisories.
- **Problem:** Production framework version is inside critical advisory range.
- **Trigger / Impact:** Auth-boundary bypass or RCE against the deployment depending on advisory applicability.
- **Fix direction:** Upgrade Next to ≥16.4.6; re-run audit; verify proxy still runs.
- **Depends on:** —

### F-006
- **Severity:** P3
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `package.json:12-32` vs imports
- **Evidence:** depcheck unused `@base-ui/react`, `lucide-react`, `@phosphor-icons/react`; direct `@opentelemetry/*` unused in app code (PostHog bundles its own).
- **Problem:** Dead dependencies enlarge supply-chain surface.
- **Trigger / Impact:** Extra advisories (axios/hono/mcp via `shadcn` CLI toolchain) without product benefit.
- **Fix direction:** Remove unused runtime deps; keep Tailwind/`tw-animate-css` (depcheck false positives).
- **Depends on:** F-005

**PHASE 1 COMPLETE: +2 findings (F-005–F-006); toolchain clean for tsc/lint/build**

---

## PHASE 2 — ROUTING / PROXY / NEXT.JS

### F-008
- **Severity:** P1
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/bulk/page.tsx:1-20`; `proxy.ts:30-31`; build output `○ /bulk`
- **Evidence:**
  ```tsx
  'use client'
  export default function BulkExtractPage() {
  ```
  No `getUser` / `redirect`. Not in `protectedPaths`. Build marks route static.
- **Problem:** Anyone can load the bulk extraction UI without a session.
- **Trigger / Impact:** Product surface leak; API still 401, but UX/branding/JS exposed; confused-deputy probing easier.
- **Fix direction:** Protect `/bulk` in proxy; add server wrapper with auth redirect.
- **Depends on:** F-002

### F-009
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** repo root `app/` — no `error.tsx`, `loading.tsx`, or custom `not-found.tsx` (glob zero matches)
- **Evidence:** Build shows default `/_not-found` only.
- **Problem:** Unhandled render errors fall to generic Next overlay/blank; no branded recovery.
- **Trigger / Impact:** Deadline-rush users see opaque failures.
- **Fix direction:** Add `app/error.tsx`, `loading.tsx`, `not-found.tsx`.
- **Depends on:** —

### F-010
- **Severity:** P2
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `next.config.ts:3-5` empty config
- **Evidence:** `const nextConfig: NextConfig = { /* config options here */ };`
- **Problem:** No security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy).
- **Trigger / Impact:** Clickjacking / XSS impact amplification / missing baseline hardening.
- **Fix direction:** Set headers in `next.config.ts` or Vercel.
- **Depends on:** —

### F-011
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** Links in `DashboardClient.tsx:305,431`, `analytics/page.tsx:233`, `gst/page.tsx:180` → `/dashboard/clients/${id}`
- **Evidence:** Page exists at `app/(dashboard)/dashboard/clients/[id]/page.tsx`.
- **Problem:** None — known-suspect mismatch is **REFUTED**.
- **Trigger / Impact:** N/A
- **Fix direction:** —
- **Depends on:** —

### F-012
- **Severity:** P3
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** (no `applyReferralCredit` export in any `route.ts`)
- **Evidence:** Grep finds no such symbol.
- **Problem:** Known suspect “helper exported from route.ts” **REFUTED**.
- **Trigger / Impact:** N/A
- **Fix direction:** —
- **Depends on:** —

**PHASE 2 COMPLETE: F-008–F-012 (plus F-002/F-010 headers)**

---

## PHASE 3 — AUTHENTICATION / SESSIONS

### F-013
- **Severity:** P2
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `app/auth/callback/route.ts:14-23,107-126`; no `handle_new_user` in SQL
- **Evidence:** Firm created/linked in callback via admin; SQL has no signup trigger.
- **Problem:** Firm provisioning depends entirely on callback succeeding after OTP.
- **Trigger / Impact:** If firm setup throws → `/login?error=account-setup`; `getCurrentFirm` null blocks APIs (404).
- **Fix direction:** Idempotent DB trigger as backup; clearer recovery UX.
- **Depends on:** —

### F-014
- **Severity:** P2
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `app/auth/callback/route.ts:16-20`
- **Evidence:**
  ```ts
  const nextUrl = new URL(requestedNext, origin)
  if (nextUrl.origin === origin) {
    next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  }
  ```
- **Problem:** Open-redirect known suspect **REFUTED** for `@evil.com`, `//evil.com` (different origin → stays `/dashboard`).
- **Trigger / Impact:** N/A for classic open redirect.
- **Fix direction:** Keep allowlist; optionally reject `\` and encoded slashes.
- **Depends on:** —

### F-015
- **Severity:** P2
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `app/auth/callback/route.ts:129-145`; `types/index.ts:25`; no writers of `referral_credits`
- **Evidence:** Only sets `referred_by` if null; `referral_credits` never incremented/consumed anywhere.
- **Problem:** Referral attribution is write-only metadata; credits are dead schema.
- **Trigger / Impact:** UI types imply credits that never change; no self-referral credit abuse because credits unused.
- **Fix direction:** Implement credit grant atomically or remove column/UI.
- **Depends on:** F-041

### F-016
- **Severity:** P3
- **Category:** Auth
- **Confidence:** CONFIRMED
- **Location:** `app/auth/signout/route.ts:5-9`; `app/page.tsx:68` form POST
- **Evidence:** Cookie session signOut via POST form (no CSRF token).
- **Problem:** Cross-site POST could sign user out (logout CSRF).
- **Trigger / Impact:** Nuisance DoS of session, not data theft.
- **Fix direction:** Origin check or SameSite-strict cookies (Supabase defaults) — verify cookie flags.
- **Depends on:** —

**PHASE 3 COMPLETE: F-013–F-016**

---

## PHASE 4 — AUTHORIZATION / RLS / TENANT ISOLATION

### F-017
- **Severity:** P1
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `supabase/schema.sql:113-114,108-111`
- **Evidence:**
  ```sql
  revoke update on public.ca_firms from authenticated;
  grant update (firm_name, owner_name, phone, city) on public.ca_firms to authenticated;
  ```
- **Problem:** Known suspect “update own plan/extractions via RLS” **LIKELY REFUTED** *if* live DB matches SQL. Column grants block plan fields.
- **Trigger / Impact:** If production skipped this revoke/grant, policy alone would allow full-row updates (NEEDS-RUNTIME-TEST).
- **Fix direction:** Verify live grants; add trigger rejecting changes to plan/extractions_used/etc.
- **Depends on:** —

### F-018
- **Severity:** P1
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `supabase/schema.sql:187-188`; `app/(dashboard)/analytics/page.tsx:19-23`
- **Evidence:** `create or replace view public.ca_analytics with (security_invoker = true)`; query `.eq('ca_firm_id', firm.id)`.
- **Problem:** Cross-tenant view bypass **LIKELY REFUTED** when invoker + clients RLS hold.
- **Trigger / Impact:** If view deployed without `security_invoker`, owner rights could leak all firms (NEEDS-RUNTIME-TEST).
- **Fix direction:** Confirm view definition in production; keep firm filter.
- **Depends on:** —

### F-019
- **Severity:** P2
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `supabase/schema.sql:116-164` — no INSERT on clients; no INSERT/UPDATE on documents/reminders; upload_tokens RLS on, **zero policies**
- **Evidence:** Policies listed select/update/delete only as documented in Phase 0.
- **Problem:** Authenticated role cannot insert clients/docs/tokens via user client; app relies on service role. Tokens table locked for non-admin.
- **Trigger / Impact:** Safe if all writes use admin after authz checks; dangerous if a future code path uses anon insert without firm scope.
- **Fix direction:** Add INSERT policies with `WITH CHECK` firm ownership; or document admin-only write contract.
- **Depends on:** —

### F-020
- **Severity:** P1
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `app/api/upload/[token]/route.ts:231-265`
- **Evidence:** Select includes `ca_firms(firm_name, owner_name, email, phone)` returned to anonymous caller.
- **Problem:** Bearer upload link leaks CA email/phone and client name/AY.
- **Trigger / Impact:** Token sniffer/enumerator learns PII + contact vectors for phishing.
- **Fix direction:** Return only firm display name + client first name; omit email/phone from API.
- **Depends on:** F-023

### F-021
- **Severity:** P2
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `app/api/clients/[id]/token/route.ts:20-26`; `app/api/reminders/route.ts:27-33`; `app/api/extract/route.ts:56-67`
- **Evidence:** Admin queries always `.eq('ca_firm_id', firm.id)` after `getCurrentFirm()`.
- **Problem:** Known IDOR suspects for token/reminders **REFUTED** in current code.
- **Trigger / Impact:** N/A
- **Fix direction:** Keep ownership checks before every admin write.
- **Depends on:** —

### F-022
- **Severity:** P1
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `lib/supabase/queries.ts:161-177` (`getClientWithDocuments`); `:111-121` (`updateClientStatus`)
- **Evidence:** `.eq('id', clientId)` only — no `ca_firm_id`.
- **Problem:** Helpers are tenant-unsafe if called with a foreign id under a context that bypasses RLS (admin) or if RLS misconfigured.
- **Trigger / Impact:** Currently unused by routes (grep: definitions only) — latent IDOR footgun.
- **Fix direction:** Add firm scope or delete unused helpers.
- **Depends on:** —

### F-042-dash
- **Severity:** P1
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/dashboard/page.tsx:17-19`
- **Evidence:** `.select('*, documents(id, type, extraction_status, extracted_data)')`
- **Problem:** Full extraction JSON for all clients shipped to browser on dashboard load.
- **Trigger / Impact:** XSS/extension/PostHog session can exfiltrate all Form 16 fields for the firm.
- **Fix direction:** Select status fields only on list; load `extracted_data` on detail/export.
- **Depends on:** F-060

**PHASE 4 COMPLETE: F-017–F-022 (+ dashboard PII dump)**

---

## PHASE 5 — PUBLIC UPLOAD PORTAL

### F-023
- **Severity:** P1
- **Category:** Upload
- **Confidence:** CONFIRMED
- **Location:** `lib/supabase/queries.ts:147-156`; `app/api/upload/[token]/route.ts:158-162`
- **Evidence:**
  ```ts
  if (new Date(data.expires_at) < new Date()) return { valid: false, error: 'Token expired' }
  return { valid: true, clientId: data.client_id, caFirmId: data.ca_firm_id }
  ```
  (no `used` check). POST still sets `used: true`.
- **Problem:** `used` is written but never enforced.
- **Trigger / Impact:** After one upload, token remains valid for other doc types / retries until expiry; “one-time” claim false.
- **Fix direction:** Reject when `used===true` *or* redefine semantics as multi-doc and stop setting meaningless flag.
- **Depends on:** —

### F-024
- **Severity:** P0
- **Category:** Upload
- **Confidence:** CONFIRMED
- **Location:** `app/api/upload/[token]/route.ts:24-68` (no rate-limit middleware anywhere)
- **Evidence:** Public POST accepts file and calls Gemini with no IP/token throttle.
- **Problem:** Unlimited unauthenticated expensive requests per valid (or scraped) token.
- **Trigger / Impact:** Gemini bill spike; DoS of extraction capacity during filing season.
- **Fix direction:** Per-token and per-IP rate limits; max uploads per token; WAF.
- **Depends on:** F-026

### F-025
- **Severity:** P2
- **Category:** Upload
- **Confidence:** CONFIRMED
- **Location:** `app/api/upload/[token]/route.ts:61-64`; `app/api/extract/route.ts:82-86`
- **Evidence:** `ALLOWED.includes(file.type)` — client-declared MIME only.
- **Problem:** No magic-byte sniffing.
- **Trigger / Impact:** Polyglot/malware stored as “PDF”; Gemini/prompt abuse.
- **Fix direction:** Verify PDF `%PDF` / image signatures server-side.
- **Depends on:** —

### F-026
- **Severity:** P0
- **Category:** Upload
- **Confidence:** CONFIRMED
- **Location:** `app/api/upload/[token]/route.ts` entire POST; `lib/supabase/queries.ts:45-56` `canExtract` unused by upload/extract
- **Evidence:** Upload path never calls `canExtract` / never reads `plan_expires_at` / `client_limit`. Extract path also never calls `canExtract`.
- **Problem:** Public upload bypasses any plan/trial enforcement the authenticated path was supposed to have (and authenticated path also lacks it).
- **Trigger / Impact:** Attacker with a link burns quota attributed to the CA firm (`extractions_used++`).
- **Fix direction:** Enforce firm plan before Gemini; fail closed on expired/over-limit firms.
- **Depends on:** F-036, F-037

### F-027
- **Severity:** P1
- **Category:** Upload
- **Confidence:** LIKELY
- **Location:** `app/api/upload/[token]/route.ts:66-67`; upload UI “max 10 MB”
- **Evidence:** App allows 10 MB; Vercel serverless request body limit ~4.5 MB for non-streaming.
- **Problem:** Advertised 6–10 MB PDFs likely fail in production with opaque errors.
- **Trigger / Impact:** Clients cannot upload large Form 16 scans; CA support load.
- **Fix direction:** NEEDS-RUNTIME-TEST; use direct-to-storage upload or lower advertised limit to 4 MB.
- **Depends on:** —

### F-028
- **Severity:** P2
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** `app/upload/[token]/page.tsx:266-267`
- **Evidence:** `Your documents are encrypted and shared only with {firmName}.`
- **Problem:** False encryption claim; storage is private bucket, not end-to-end encryption; Gemini receives plaintext bytes.
- **Trigger / Impact:** Misleads users / DPDP fairness issues.
- **Fix direction:** Accurate copy: “stored privately for your CA; processed by AI provider”.
- **Depends on:** F-061

**PHASE 5 COMPLETE: F-023–F-028**

---

## PHASE 6 — AI / EXTRACTION

### F-029
- **Severity:** P1
- **Category:** AI
- **Confidence:** CONFIRMED
- **Location:** `app/api/extract/route.ts:142-156`; `app/api/upload/[token]/route.ts:130-132`
- **Evidence:** `JSON.parse(cleaned)` into `Record<string, unknown>` — no zod/schema.
- **Problem:** Unvalidated model output stored and shown/exported.
- **Trigger / Impact:** Wrong types, injected strings, prompt-injection payloads reach CSV/email/UI.
- **Fix direction:** Zod validate; reject/flag on schema failure.
- **Depends on:** F-050, F-048

### F-030
- **Severity:** P2
- **Category:** AI
- **Confidence:** CONFIRMED
- **Location:** `types/index.ts:77-111` flat `Form16ExtractedData` vs `lib/prompts/form16.ts:33-119` nested JSON
- **Evidence:** Type uses `gross_salary` top-level; prompt/UI/export use `income.gross_salary`.
- **Problem:** Type contract is stale; no compile-time safety for extraction shape.
- **Trigger / Impact:** Future refactors break silently.
- **Fix direction:** Replace type with nested schema matching prompt.
- **Depends on:** F-029

### F-031
- **Severity:** P3
- **Category:** AI
- **Confidence:** CONFIRMED
- **Location:** `lib/gemini.ts:36-54`
- **Evidence:** `extractWithRetry` sleeps 65000 ms; **never imported** by extract/upload routes (they call `generateContent` directly).
- **Problem:** Known “65s retry exceeds timeout” is **dead code** — REFUTED as active runtime bug; still hazardous if wired later with `maxDuration=60`.
- **Trigger / Impact:** N/A today; landmine tomorrow.
- **Fix direction:** Delete or rewrite with short backoff + respect `maxDuration`.
- **Depends on:** —

### F-032
- **Severity:** P2
- **Category:** AI
- **Confidence:** CONFIRMED
- **Location:** `lib/utils/pdf-utils.ts:17-24`; `app/api/extract/route.ts:99-103`
- **Evidence:** `decryptPDF` always `throw new Error('PASSWORD_PROTECTED_PDF_UNSUPPORTED')`; callers reject protected PDFs via `isPDFPasswordProtected`.
- **Problem:** Known “decrypt path works” **REFUTED**; product correctly refuses. Dead decrypt/hints remain.
- **Trigger / Impact:** Users must strip passwords externally (documented in README).
- **Fix direction:** Remove dead decrypt helpers to avoid false hope.
- **Depends on:** —

### F-033
- **Severity:** P1
- **Category:** Export
- **Confidence:** CONFIRMED
- **Location:** `lib/utils/winman-export.ts:128,254`
- **Evidence:** `n(inc?.standard_deduction_16_ia ?? 50000)`
- **Problem:** Invents ₹50,000 when model returns null — contradicts prompt rule 9 and regime/year variance.
- **Trigger / Impact:** Wrong salary computation in Winman/KDK imports → filing liability.
- **Fix direction:** Export empty/null; never default monetary fields.
- **Depends on:** F-051

### F-034
- **Severity:** P1
- **Category:** AI
- **Confidence:** CONFIRMED
- **Location:** extract/upload routes — no post-parse arithmetic or PAN/TAN regex checks
- **Evidence:** Only JSON parse; prompt asks for warnings but code never verifies gross−exemptions−deductions, Q-sum TDS, PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`.
- **Problem:** Missing safeguards before display/store/export.
- **Trigger / Impact:** Silent bad numbers enter CA workflow.
- **Fix direction:** Deterministic validators; surface mismatches in UI.
- **Depends on:** F-029

### F-035
- **Severity:** P2
- **Category:** Performance
- **Confidence:** CONFIRMED
- **Location:** (no `activeExtractions` / module semaphore in repo)
- **Evidence:** Grep finds none.
- **Problem:** In-memory concurrency semaphore suspect **REFUTED** (does not exist).
- **Trigger / Impact:** N/A
- **Fix direction:** —
- **Depends on:** —

**PHASE 6 COMPLETE: F-029–F-035**

---

## PHASE 7 — PAYMENTS / PLAN ENFORCEMENT

### F-036
- **Severity:** P0
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** `lib/supabase/queries.ts:45-56`
- **Evidence:**
  ```ts
  if (!firm) return { allowed: false, remaining: 0 }
  return { allowed: true, remaining: null }
  ```
  Never called from `app/api/extract/route.ts`.
- **Problem:** Trial/limit gate is a no-op stub and unused.
- **Trigger / Impact:** Unlimited Gemini spend per authenticated user; intentional early-access per README, but unsafe for paid relaunch.
- **Fix direction:** Atomic limit check before model call.
- **Depends on:** F-039

### F-037
- **Severity:** P0
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** codebase grep `plan_expires_at` — only type + ProfileClient display
- **Evidence:** No API checks `plan_expires_at` before extract/upload/client create.
- **Problem:** Expiry never enforced.
- **Trigger / Impact:** Expired paid plans (when payments return) keep working forever.
- **Fix direction:** Enforce in `canExtract` and client-create.
- **Depends on:** F-040

### F-038
- **Severity:** P1
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** `app/api/clients/route.ts:24-39` — no count vs `client_limit`
- **Evidence:** Insert always allowed for authed firm.
- **Problem:** `client_limit` unused.
- **Trigger / Impact:** Unlimited clients despite schema/plan config.
- **Fix direction:** Count clients before insert.
- **Depends on:** —

### F-039
- **Severity:** P2
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** `lib/supabase/queries.ts:60-73`; `app/api/upload/[token]/route.ts:201-210`
- **Evidence:** Read `extractions_used` then update `+1` (non-atomic).
- **Problem:** Classic RMW race under parallel extracts/uploads.
- **Trigger / Impact:** Undercount under load (limits ineffective when re-enabled).
- **Fix direction:** `update ... set extractions_used = extractions_used + 1` or RPC.
- **Depends on:** F-036

### F-040
- **Severity:** P2
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** `app/api/razorpay/{create-order,verify,webhook}/route.ts` each returns 410
- **Evidence:** `"Payments are disabled. TaxFlow AI is free during early access."`
- **Problem:** Verify-body plan tampering / webhook idempotency suspects **REFUTED as active money bugs** while stubs exist; payment code is absent.
- **Trigger / Impact:** No real charges; relaunch must not restore naive verify.
- **Fix direction:** When re-enabling, bind plan to Razorpay order notes; verify signature; idempotent webhook.
- **Depends on:** —

### F-041
- **Severity:** P2
- **Category:** Payments
- **Confidence:** CONFIRMED
- **Location:** no code writes `referral_credits`
- **Evidence:** Grep only types + ReferralClient prop type.
- **Problem:** Credits never granted/consumed.
- **Trigger / Impact:** Dead monetization path; no duplicate-credit bug possible today.
- **Fix direction:** Implement or remove.
- **Depends on:** F-015

**PHASE 7 COMPLETE: F-036–F-041**

---

## PHASE 8 — DATABASE / SQL

### F-042
- **Severity:** P1
- **Category:** DB
- **Confidence:** CONFIRMED
- **Location:** `app/api/clients/[id]/route.ts:108-113`
- **Evidence:** DB delete only; comment claims cascade removes documents/tokens — **storage objects not deleted**.
- **Problem:** Orphan files remain in `documents` bucket after client delete.
- **Trigger / Impact:** PII retention beyond user intent; storage cost; DPDP deletion gap.
- **Fix direction:** List/remove storage paths before/after delete.
- **Depends on:** F-061

### F-043
- **Severity:** P2
- **Category:** DB
- **Confidence:** CONFIRMED
- **Location:** `app/api/clients/route.ts:35`; `components/clients/AddClientModal.tsx:13,76-78`
- **Evidence:** Default AY `2027-28` while UI also offers `2025-26`/`2026-27`.
- **Problem:** Default assessment year may be wrong for current season (Nov 2026 → FY26-27 / AY27-28 is plausible, but prompt examples still say 2025-26).
- **Trigger / Impact:** Wrong AY stamped on clients/exports.
- **Fix direction:** Derive default from IST calendar rules; align prompts.
- **Depends on:** F-054

### F-044
- **Severity:** P2
- **Category:** DB
- **Confidence:** CONFIRMED
- **Location:** `app/api/clients/route.ts:92-96` unbounded select; dashboard same
- **Evidence:** No `.range` / pagination.
- **Problem:** Firms with 1000+ clients pull full graph including documents.
- **Trigger / Impact:** Slow TTFB / browser OOM in season.
- **Fix direction:** Paginate; defer document payloads.
- **Depends on:** F-042-dash

**PHASE 8 COMPLETE: F-042–F-044**

---

## PHASE 9 — EMAIL / WHATSAPP / CRON

### F-045
- **Severity:** P0
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `app/api/cron/reminders/route.ts:18-20`
- **Evidence:**
  ```ts
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  ```
- **Problem:** If `CRON_SECRET` unset, required header is literally `Bearer undefined`.
- **Trigger / Impact:** Anyone who sends that header runs admin reminder job (email/WhatsApp fan-out). Combined with F-001, cron may be unused — but route is still publicly reachable.
- **Fix direction:** Fail closed if secret missing/empty; use timing-safe compare.
- **Depends on:** F-001

### F-046
- **Severity:** P2
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `app/api/cron/reminders/route.ts:36` `.limit(50)`; schedule once daily `30 3 * * *`
- **Evidence:** Processes max 50 due reminders per run.
- **Problem:** Starvation if backlog >50/day; comment claims “twice daily” but vercel.json is once.
- **Trigger / Impact:** Late reminders during rush.
- **Fix direction:** Loop until empty / raise limit; align schedule comment.
- **Depends on:** F-001

### F-047
- **Severity:** P2
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `app/api/reminders/route.ts:52-67` builds full URLs — **no** `[upload_link]` placeholder
- **Evidence:** Messages embed `${uploadUrl}` directly.
- **Problem:** Known “[upload_link] unreplaced” suspect **REFUTED**.
- **Trigger / Impact:** N/A
- **Fix direction:** —
- **Depends on:** —

### F-048
- **Severity:** P1
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `lib/email.ts:49-52,67`
- **Evidence:** `` Hello ${caName} `` / `` <strong>${clientName}</strong> `` interpolated into HTML without escape.
- **Problem:** HTML injection if client/firm name contains `<script>`/`<img onerror>`.
- **Trigger / Impact:** XSS in email clients that render HTML; phishing from CA mailbox.
- **Fix direction:** HTML-escape all interpolated fields; prefer text parts.
- **Depends on:** F-029

### F-049
- **Severity:** P2
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `lib/email.ts:6`; `app/page.tsx:271`
- **Evidence:** Default FROM `harshpandeyiitian04@gmail.com`; footer mailto same personal address labeled `support@taxflowai.in`.
- **Problem:** Personal Gmail as fallback sender; brand/support mismatch.
- **Trigger / Impact:** Spoofing/spam failures; privacy leak of personal inbox.
- **Fix direction:** Require `RESEND_FROM_EMAIL`; align public support address.
- **Depends on:** —

**PHASE 9 COMPLETE: F-045–F-049**

---

## PHASE 10 — EXPORTS

### F-050
- **Severity:** P1
- **Category:** Export
- **Confidence:** CONFIRMED
- **Location:** `lib/utils/export.ts:91-96`; `lib/utils/winman-export.ts:16-18,20-25`
- **Evidence:** Values quoted/escaped for CSV commas but **no** neutralization of leading `= + - @`.
- **Problem:** CSV/formula injection from AI or client-controlled names.
- **Trigger / Impact:** Excel executes formulas when CA opens export.
- **Fix direction:** Prefix risky cells with `'`.
- **Depends on:** F-029

### F-051
- **Severity:** P1
- **Category:** Export
- **Confidence:** CONFIRMED
- **Location:** `lib/utils/winman-export.ts:116-118`
- **Evidence:** `'1','1','OLD'` hard-coded Category/Resident/TaxRegime.
- **Problem:** Silent wrong filing defaults.
- **Trigger / Impact:** Non-individual / NRI / new-regime clients mis-imported.
- **Fix direction:** Require explicit CA confirmation fields; never invent regime.
- **Depends on:** F-033

### F-052
- **Severity:** P2
- **Category:** Export
- **Confidence:** CONFIRMED
- **Location:** `lib/utils/export.ts` nested keys vs prompt nested keys — aligned; flat `Form16ExtractedData` unused by exporters
- **Evidence:** Exporters read `data.employer` / `data.income` matching prompt.
- **Problem:** Runtime exporters OK; TypeScript type wrong (F-030). FAQ claims universal Winman compatibility without fixture tests.
- **Trigger / Impact:** Import failures discovered by CAs in season.
- **Fix direction:** Golden-file tests against Winman/KDK templates.
- **Depends on:** F-068

**PHASE 10 COMPLETE: F-050–F-052**

---

## PHASE 11 — FRONTEND / UX / A11Y

### F-053
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/dashboard/DashboardClient.tsx:76-79`
- **Evidence:**
  ```ts
  await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
  setClients(prev => prev.filter(c => c.id !== clientId))
  ```
- **Problem:** Optimistic delete without `res.ok`; no rollback.
- **Trigger / Impact:** UI hides client that still exists (or opposite on network fail).
- **Fix direction:** Check response; refresh on failure.
- **Depends on:** —

### F-054
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `app/page.tsx:254`; `app/(dashboard)/analytics/page.tsx:65-69`
- **Evidence:** Landing “ITR deadline is July 31.”; analytics computes next July 31 dynamically.
- **Problem:** Landing hard-codes July 31 without year; still wrong when deadline extended.
- **Trigger / Impact:** Misleading urgency copy.
- **Fix direction:** Dynamic deadline copy; note extensions.
- **Depends on:** —

### F-055
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `app/page.tsx:10`; prompt rule 9 forbids assuming 50000
- **Evidence:** Marketing list `'Standard deduction ₹50,000'`.
- **Problem:** Contradicts extraction rules and new-regime amounts.
- **Trigger / Impact:** False expectation; related to F-033 defaulting.
- **Fix direction:** Say “standard deduction as printed”.
- **Depends on:** F-033

### F-056
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `types/index.ts:124-168` PLANS prices vs landing “Free during early access” / UpgradeClient
- **Evidence:** PLANS still list 3999/6999/12999; UI/Razorpay disabled.
- **Problem:** Stale plan catalog in code vs product messaging (not currently shown on landing).
- **Trigger / Impact:** Confusion if any UI reuses PLANS.
- **Fix direction:** Hide or mark deprecated until payments return.
- **Depends on:** F-040

### F-057
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** multiple `alert`/`confirm` in DashboardClient, bulk, upload portal
- **Evidence:** e.g. delete confirm; upload errors via `alert`.
- **Problem:** Blocking dialogs; weak a11y for modals (no focus trap on AddClient/UploadLink).
- **Trigger / Impact:** Poor mobile UX during rush.
- **Fix direction:** Inline toasts; dialog focus management.
- **Depends on:** —

### F-058-winloc
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `app/(auth)/login/page.tsx:13-18,39` uses `useSyncExternalStore` for hash; `window.location.origin` only inside `handleLogin`
- **Evidence:** Server snapshot returns `''`.
- **Problem:** Known “window.location.origin during render SSR crash” **REFUTED**.
- **Trigger / Impact:** N/A
- **Fix direction:** —
- **Depends on:** —

**PHASE 11 COMPLETE: F-053–F-058**

---

## PHASE 12 — SECURITY / PRIVACY / COMPLIANCE

### F-059
- **Severity:** P1
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** all public/expensive routes — no rate limiting middleware
- **Evidence:** login OTP via Supabase client; `/api/extract`, `/api/upload/[token]`, `/api/clients` unthrottled in-app.
- **Problem:** No app-level rate limits on OTP spam, extract, upload, create-order (stub).
- **Trigger / Impact:** Abuse / cost / account enumeration via magic-link volume.
- **Fix direction:** Edge rate limits; Supabase auth rate config.
- **Depends on:** F-024

### F-060
- **Severity:** P1
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** `components/PostHogProvider.tsx:17-24`; dashboard ships extracted_data (F-042-dash)
- **Evidence:** `capture_pageview: true` with no `mask_all_text` / input masking configured.
- **Problem:** Analytics may capture tax UI content; no consent banner in repo.
- **Trigger / Impact:** PII to PostHog; DPDP consent gap.
- **Fix direction:** Masking, disable on dashboard, consent gate; scrub server events.
- **Depends on:** F-061

### F-061
- **Severity:** P1
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** `app/page.tsx` footer — no privacy/terms links; no deletion API beyond client delete; no breach runbook in repo
- **Evidence:** FAQ claims private bucket only.
- **Problem:** DPDP-oriented disclosure/deletion/breach process absent from product surface (compliance gap flag, not legal advice).
- **Trigger / Impact:** Regulatory exposure for a tax-document SaaS.
- **Fix direction:** Add privacy/terms; account deletion; processor disclosures (Gemini/Resend/PostHog).
- **Depends on:** F-042, F-028

### F-062
- **Severity:** P2
- **Category:** Security/Privacy
- **Confidence:** CONFIRMED
- **Location:** extract/upload `console.error('JSON parse failed. Raw response:', rawText.slice(0, 500))`
- **Evidence:** `app/api/extract/route.ts:151`
- **Problem:** May log salary/PAN snippets to Vercel logs.
- **Trigger / Impact:** Operator/PII leakage via log access.
- **Fix direction:** Log hashes/lengths only.
- **Depends on:** —

### F-063
- **Severity:** P2
- **Category:** Authz/RLS
- **Confidence:** CONFIRMED
- **Location:** `app/api/referrals/route.ts:26-35`
- **Evidence:** Admin select `email, created_at` of referred firms returned to referrer.
- **Problem:** Cross-tenant email disclosure by design of referral feature.
- **Trigger / Impact:** Referrer learns colleague emails; acceptable only with disclosure.
- **Fix direction:** Mask emails; document sharing.
- **Depends on:** F-061

**PHASE 12 COMPLETE: F-059–F-063**

---

## PHASE 13 — PERFORMANCE / RELIABILITY

### F-064
- **Severity:** P2
- **Category:** Performance
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/bulk/page.tsx:28-79`; `maxDuration=60` on extract
- **Evidence:** Up to 50 files, batches of 3, 2s delay; each call up to 60s.
- **Problem:** Browser-held bulk job can exceed practical session/time; no AbortController.
- **Trigger / Impact:** Partial results; user refreshes; duplicate spends.
- **Fix direction:** Server-side job queue; cancel tokens.
- **Depends on:** F-066

### F-065
- **Severity:** P2
- **Category:** Performance
- **Confidence:** CONFIRMED
- **Location:** `app/api/extract/route.ts:168-177`; upload route similar
- **Evidence:** Storage failure is `console.warn` non-fatal; DB may still insert with null path; or storage succeeds and DB fails (upload returns 500 after storage write).
- **Problem:** Orphan storage objects / incomplete records; no reconciliation job.
- **Trigger / Impact:** Silent missing files; storage bloat.
- **Fix direction:** Transactional outbox / cleanup cron.
- **Depends on:** F-042

### F-066
- **Severity:** P2
- **Category:** Performance
- **Confidence:** CONFIRMED
- **Location:** Gemini/Resend/WATI/PostHog fetches — no AbortSignal/timeout wrappers in app code
- **Evidence:** `model.generateContent`, `resend.emails.send`, WATI `fetch`, analytics `fetch` without timeout.
- **Problem:** Hung upstream can pin serverless until platform kill.
- **Trigger / Impact:** Cascading 504s under Gemini slowdown.
- **Fix direction:** Explicit timeouts; retry budget.
- **Depends on:** —

### F-067
- **Severity:** P3
- **Category:** Performance
- **Confidence:** CONFIRMED
- **Location:** `lib/gemini.ts:7` module-level `GoogleGenerativeAI` init
- **Evidence:** Requires `GEMINI_API_KEY` at import; throws if missing.
- **Problem:** Any import of gemini in a route without env fails hard (build had `.env.local`).
- **Trigger / Impact:** Deploy without key → runtime crash on first extract.
- **Fix direction:** Lazy init inside handler with clear 503.
- **Depends on:** —

**PHASE 13 COMPLETE: F-064–F-067**

---

## PHASE 14 — OBSERVABILITY / TESTS / DOCS

### F-068
- **Severity:** P1
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** README.md:70; no `**/*.{test,spec}.*` files
- **Evidence:** “No automated test suite is currently included.”
- **Problem:** Zero automated coverage for highest-risk units.
- **Trigger / Impact:** Regressions in authz/payments/export ship unnoticed.
- **Fix direction:** Prioritize tests listed in Runtime Test Plan / dangerous units below.
- **Depends on:** —

### F-069
- **Severity:** P2
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** `app/page.tsx:27-28` FAQ Winman/Computax/KDK claim; README:69 “should be tested”
- **Evidence:** Marketing asserts compatibility; README admits unverified.
- **Problem:** Overclaim vs code/tests.
- **Trigger / Impact:** CA trusts import → bad filings.
- **Fix direction:** Soften copy until fixtures pass.
- **Depends on:** F-052

### F-070
- **Severity:** P2
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** tracked events via `trackServerEvent`: `client_added`, `upload_link_created`, `extraction_started`, `extraction_completed`, `upload_link_shared`
- **Evidence:** Five server events exist; PostHog client pageviews separate. **No Sentry** in package.json/README.
- **Problem:** Observability is PostHog-only; errors rely on `console.error`.
- **Trigger / Impact:** Production incidents lack error aggregation.
- **Fix direction:** Add error tracking; verify 5 events in PostHog.
- **Depends on:** F-060

### F-071
- **Severity:** P3
- **Category:** Tests/Docs
- **Confidence:** CONFIRMED
- **Location:** dead/unused: `canExtract`, `createClient_`, `getTextModel`, `extractWithRetry`, `decryptPDF`, `getCommonPasswordHints`, `RazorpayButton`, `components/ui/button.tsx` (no feature imports)
- **Evidence:** Grep shows definitions without consumers (button only self-contained).
- **Problem:** Dead code and confusing naming (`createClient_`).
- **Trigger / Impact:** Maintenance hazard.
- **Fix direction:** Delete or wire deliberately.
- **Depends on:** —

### F-072
- **Severity:** P2
- **Category:** Config
- **Confidence:** CONFIRMED
- **Location:** `vercel.json` cron vs `app/api/cron/reminders` (F-001); comment in cron route “twice daily” vs single schedule
- **Evidence:** Docs/comments disagree with config.
- **Problem:** Operational reality ≠ comments.
- **Trigger / Impact:** Engineers debug “why reminders don’t send” for days.
- **Fix direction:** Single source of truth.
- **Depends on:** F-001

**PHASE 14 COMPLETE: F-068–F-072**

---

## 3. RUNTIME TEST PLAN (NEEDS-RUNTIME-TEST items)

1. **F-005 Next proxy bypass:** Deploy current build; attempt GHSA-6gpp repro against auth-gated `/dashboard` with Turbopack/locale conditions; confirm after upgrading to 16.4.6.
2. **F-017 column grants:** As authenticated user in SQL editor/`supabase-js` user client, `update ca_firms set plan='firm' where user_id=auth.uid()` — expect failure. Repeat for `extractions_used`, `client_limit`, `referral_credits`.
3. **F-018 ca_analytics:** Firm A session `select * from ca_analytics` — must return only A’s row.
4. **F-027 body size:** POST 6 MB and 9 MB PDF to production `/api/upload/[token]` and `/api/extract`; record status codes/body.
5. **F-045 cron secret missing:** Temporarily unset `CRON_SECRET`; `curl -H 'Authorization: Bearer undefined' https://<host>/api/cron/reminders` — must NOT succeed after fix; today may 200.
6. **F-001 cron path:** Confirm Vercel cron invocations 404 on `/api/cron`.
7. **F-023 token reuse:** Upload form16 via token; confirm `used=true`; upload bank_statement with same token — expect blocked after fix.
8. **F-008 /bulk:** Open `/bulk` in private window logged-out — page renders; POST `/api/extract` returns 401.
9. **Open redirect (F-014 confirmation):** `/auth/callback?next=//evil.com` and `next=@evil.com` after valid login — must land on same origin `/dashboard`.
10. **Password PDF:** Upload encrypted PDF — expect 422 message (already coded).
11. **CSV injection:** Extract/export name `=cmd|' /C calc'!A0` — open in Excel; observe formula warn; after fix should be text.
12. **Email HTML:** Create client name `<img src=x onerror=alert(1)>`; trigger upload notification; inspect raw HTML.

---

## 4. KNOWN SUSPECTS — FINAL VERDICT

| Suspect | Verdict |
|---------|---------|
| Middleware only `/dashboard*` | **PARTIALLY CONFIRMED** — proxy also has extract/upgrade/clients; missing bulk/gst/analytics/referral/profile (F-002/F-008) |
| Links `/dashboard/clients/[id]` vs `/clients/[id]` | **REFUTED** — page is `/dashboard/clients/[id]` |
| `applyReferralCredit` from route.ts | **REFUTED** |
| `ca_analytics` RLS bypass | **LIKELY REFUTED** (security_invoker); verify live (F-018) |
| `ca_firms` update own plan fields | **LIKELY REFUTED** via column grants (F-017); verify live |
| Token/reminders admin IDOR | **REFUTED** — firm_id checked |
| Upload skips trial; never marks used | **CONFIRMED** skip limits (F-026); **PARTIAL** used written but not enforced (F-023) |
| Auth callback open redirect | **REFUTED** (F-014) |
| Cron `Bearer undefined` | **CONFIRMED** (F-045) |
| plan_expires_at never enforced; trial RMW | **CONFIRMED** (F-037, F-039); canExtract noop (F-036) |
| Verify trusts body plan | **REFUTED** (payments stubbed F-040) |
| Webhook non-idempotent | **REFUTED** (stub) |
| pdf-lib decrypt broken | **CONFIRMED** decrypt impossible; product rejects instead (F-032) |
| In-memory semaphore; 65s sleep | **REFUTED** semaphore absent; 65s retry dead code (F-031/F-035) |
| 10 MB vs 4.5 MB | **LIKELY** (F-027) |
| `[upload_link]` placeholders | **REFUTED** (F-047) |
| PATCH missing tags/fee/gstin | **REFUTED** — allowed list includes them (`clients/[id]/route.ts:77`) |
| `window.location.origin` SSR crash | **REFUTED** (F-058) |
| CSV formula injection; field mismatches | **CONFIRMED** injection (F-050); nested fields align; flat type stale (F-030) |
| HTML email injection; PII logs; PostHog | **CONFIRMED** (F-048, F-062, F-060) |
| Hard-coded July 31 / AY 2025-26 | **PARTIALLY CONFIRMED** — landing July 31 (F-054); AY defaults 2027-28; prompt examples 2025-26 |
| Inconsistent pricing | **PARTIALLY CONFIRMED** — UI free; PLANS still priced (F-056); Razorpay amounts N/A |

---

## 5. COVERAGE REPORT

### Files read
All application source under `app/`, `components/`, `lib/`, `types/`, `supabase/`, plus `package.json`, `package-lock.json` (audit), `.env.example`, `.gitignore`, `vercel.json`, `next.config.ts`, `proxy.ts`, `README.md`, `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `app/globals.css`, `public/*` (listed only).

### Not opened
- `.env.local` (secrets) — assumed present because build loaded “Environments: .env.local”
- `node_modules/**`, `.next/**`, `.git/**`
- Binary `app/favicon.ico` (not text-audited)

### Assumptions
- Live Supabase may differ from committed SQL → several RLS findings marked NEEDS-RUNTIME-TEST.
- Vercel ~4.5 MB body limit assumed from platform docs (F-027).
- Early-access “unlimited” is intentional per README; still filed as P0 for relaunch/abuse cost.

### Most dangerous untested units (for F-068)
1. Tenant isolation on admin queries  
2. Upload token validate/expiry/used  
3. Cron secret fail-closed  
4. Plan/limit enforcement (`canExtract`)  
5. Razorpay verify/webhook (when re-enabled)  
6. `normalize`/validation of Gemini JSON  
7. Winman/KDK CSV fixtures  
8. Auth callback `next` allowlist  
9. Storage orphan cleanup on delete  
10. CSV formula neutralization  

---

## 6. TOOL OUTPUTS

### tsc
```
exit 0
(no diagnostics; npm warn Unknown env config "devdir" only)
```

### lint
```
> taxflow-ai@0.1.0 lint
> eslint
exit 0
```

### build
```
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages (24/24)
Route (app): / analytics bulk dashboard extract gst login ... api/* upload/[token]
ƒ Proxy (Middleware)
○ Static: /bulk /extract /login
ƒ Dynamic: remainder
exit 0
```

### npm audit --omit=dev
```
40 vulnerabilities (2 low, 18 moderate, 18 high, 2 critical)
Critical includes: next (proxy bypass, RCE advisories), proxy-addr
High includes: axios, body-parser, postcss, sharp, zod (via shadcn), etc.
fix: npm audit fix / npm audit fix --force → next@16.4.6
exit 1
```

### depcheck
```
Unused dependencies: @base-ui/react, @opentelemetry/exporter-logs-otlp-http,
  @opentelemetry/resources, @opentelemetry/sdk-logs, @phosphor-icons/react,
  lucide-react, shadcn, tw-animate-css
Unused devDependencies: @tailwindcss/postcss, tailwindcss
(note: tailwind/tw-animate/shadcn CSS imports are false positives)
```

---

**PHASE 0 COMPLETE: 4 findings (F-001–F-004)**  
**PHASE 1 COMPLETE: +2 (F-005–F-006)**  
**PHASES 2–14 COMPLETE: findings through F-072 (+ F-042-dash)**  

---

## CONTINUATION PASS — UI / GST / BULK DEEP READ

Re-read previously under-covered UI and prompt files; 12 additional confirmed findings below. No `dangerouslySetInnerHTML` sinks found. Prompt files (`form16a`, `capital-gains`, `bank-statement`, `ais`) are schema-coherent with no secrets.

### F-073
- **Severity:** P1
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/gst/page.tsx:36-50`
- **Evidence:**
  ```ts
  addDeadline('GSTR-1', new Date(now.getFullYear(), now.getMonth() + 1, 11, 23, 59))
  const quarterDueMonth = (Math.floor(now.getMonth() / 3) + 1) * 3
  ```
  Combined with `daysLeft <= 30` filter at lines 31-32.
- **Problem:** Monthly dues always point at *next* calendar month; quarterly dues always at the *next* quarter boundary. Imminent current-period dues are never computed, so early-month / mid-quarter windows can show an empty calendar while real deadlines are days away (e.g. January hides ~13 Jan GSTR-1 in favor of April).
- **Trigger / Impact:** CAs miss GST filing deadlines during the highest-risk window.
- **Fix direction:** Compute current-period due dates; if past, roll to next; show overdue as negative/red.
- **Depends on:** —

### F-074
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/clients/NotesEditor.tsx:16-27,46`
- **Evidence:**
  ```ts
  await fetch(`/api/clients/${clientId}`, { method: 'PATCH', ... })
  setSaving(false)
  setSaved(true)
  // Cancel:
  setNotes(initialNotes ?? '')
  ```
- **Problem:** No `res.ok` check — failed PATCH still shows “✓ Saved”. Cancel resets to mount-time prop, not last successful save.
- **Trigger / Impact:** Notes appear persisted when they are not; Cancel can wipe a successful edit back to stale page-load text.
- **Fix direction:** Check `res.ok`; keep `lastSaved` local state for Cancel.
- **Depends on:** —

### F-075
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/bulk/page.tsx:118,187-192`
- **Evidence:**
  ```ts
  const doneCount = results.filter(r => r.status === 'done').length
  disabled={running || doneCount === files.length}
  {running ? 'Processing...' : doneCount > 0 ? 'Done' : 'Extract all'}
  ```
- **Problem:** With mixed success/error, `doneCount < files.length` so the button stays enabled, labeled “Done”, and `runBulk` re-POSTs **every** file including completed ones.
- **Trigger / Impact:** Duplicate Gemini spend; overwrites good extractions; no failed-only retry.
- **Fix direction:** Disable when no pending/error rows; retry errors only; label “Retry failed”.
- **Depends on:** F-024

### F-076
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/dashboard/ClientDetailClient.tsx:84-96`
- **Evidence:**
  ```ts
  if (res.ok) {
    const data = await res.json()
    setClient(prev => ({ ...prev, status: data.client.status }))
  }
  setUpdatingStatus(false)
  ```
  Stepper clicks call `updateStatus` without disabling during `updatingStatus` (only “Mark as filed” disables).
- **Problem:** Failed status PATCH is silent; rapid stepper clicks race concurrent updates.
- **Trigger / Impact:** UI status drifts from DB under deadline rush.
- **Fix direction:** Surface error; disable stepper while `updatingStatus`.
- **Depends on:** —

### F-077
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/dashboard/ClientDetailClient.tsx:259-260`
- **Evidence:** `client.documents.sort((a, b) => ...)`
- **Problem:** In-place `Array.sort` mutates React state array.
- **Trigger / Impact:** Unstable renders / subtle corruption when documents re-render after fee/status updates.
- **Fix direction:** `[...client.documents].sort(...)` or `toSorted`.
- **Depends on:** —

### F-078
- **Severity:** P2
- **Category:** Export
- **Confidence:** CONFIRMED
- **Location:** `components/extraction/ExtractionResult.tsx:248-267` vs `lib/prompts/form16.ts` (`entertainment_allowance_16_ii`); Winman maps it at `winman-export.ts:130`
- **Evidence:** Income tab lists standard deduction and professional tax but omits entertainment allowance u/s 16(ii).
- **Problem:** Field present in prompt schema and Winman export is invisible in review UI.
- **Trigger / Impact:** CAs miss §16(ii) amounts when validating before import.
- **Fix direction:** Add Field for `entertainment_allowance_16_ii`.
- **Depends on:** F-030

### F-079
- **Severity:** P2
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/dashboard/DashboardClient.tsx:48,237`
- **Evidence:**
  ```ts
  inProgress: clients.filter(c => c.status === 'received' || c.status === 'processing').length,
  { label: 'In progress', value: stats.inProgress, onClick: () => setStatusFilter('received') },
  ```
- **Problem:** Count includes `processing`; click filter is only `received`.
- **Trigger / Impact:** Stat card click hides processing clients the number claimed to represent.
- **Fix direction:** Filter to both statuses (or split cards).
- **Depends on:** —

### F-080
- **Severity:** P2
- **Category:** Upload
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/bulk/page.tsx:26-33`
- **Evidence:** MIME filter only; no `file.size` check (UploadZone enforces 10 MB client-side).
- **Problem:** Oversized files enter the bulk queue and fail mid-batch at API/platform.
- **Trigger / Impact:** Partial batch failures and wasted wait during rush.
- **Fix direction:** Reject > max size in `handleFiles` before queueing.
- **Depends on:** F-027

### F-081
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/extraction/UploadZone.tsx:63-85`
- **Evidence:** Clickable `<div onClick=...>` wrapping `className="hidden"` file input; no `role`, `tabIndex`, or keyboard handler.
- **Problem:** Primary extract dropzone is not keyboard/AT operable.
- **Trigger / Impact:** Accessibility failure on core workflow.
- **Fix direction:** Use `<label htmlFor>` or button+keyboard activation.
- **Depends on:** —

### F-082
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/clients/TagEditor.tsx` (save path checks `res.ok` only to update local state; no else/error UI; remove `×` lacks `aria-label`)
- **Evidence:** Failed tag PATCH leaves UI unchanged with no message.
- **Problem:** Silent tag-save failure; unlabeled remove controls.
- **Trigger / Impact:** CA thinks tags saved; screen-reader gap on destructive control.
- **Fix direction:** Show error toast; `aria-label={`Remove ${tag}`}`.
- **Depends on:** —

### F-083
- **Severity:** P3
- **Category:** Frontend
- **Confidence:** CONFIRMED
- **Location:** `components/profile/ProfileClient.tsx:60-62`
- **Evidence:** Hardcoded `Free access · unlimited extractions` regardless of `firm.plan`.
- **Problem:** Badge is marketing copy, not firm state (separate from unused `plan_expires_at` enforcement).
- **Trigger / Impact:** Misleading account UX when plans return.
- **Fix direction:** Render from `firm.plan` / limits.
- **Depends on:** F-056

### F-084
- **Severity:** P3
- **Category:** Email/Cron
- **Confidence:** CONFIRMED
- **Location:** `app/(dashboard)/gst/page.tsx:65-69,149-156`
- **Evidence:** Select is `id, name, gstin, gst_scheme` only; link is `https://wa.me/?text=...` (no phone).
- **Problem:** “Send reminder” never targets the client’s WhatsApp number because phone is not loaded.
- **Trigger / Impact:** Opens blank chat; CA must pick contact manually every time.
- **Fix direction:** Select `phone`; build `wa.me/91XXXXXXXXXX?text=`.
- **Depends on:** —

### Coverage addendum (continuation)
**Additionally deep-read:** ClientDetailClient, DashboardClient (full), UploadZone, ExtractionResult (full), NotesEditor, TagEditor, AddClientButton, ProfileClient, gst/page, extract/page, bulk/page, upgrade/profile/referral pages, prompts bank-statement/form16a/capital-gains/ais, lib/utils.ts, eslint.config.mjs.

**Still not opened:** `.env.local` (secrets).

---

**CONTINUATION PASS COMPLETE: +12 findings (F-073–F-084)**  
**AUDIT TOTAL: 78 findings in AUDIT_FINDINGS.md**
