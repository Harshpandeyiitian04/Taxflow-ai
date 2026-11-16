# TaxFlow AI — Multi-Tenant Security Remediation

**Status:** Non-production experiment completed on Neon child branch. **Production DB objects unchanged. No Vercel prod deploy. No production env cutover.**  
**Git branch:** `neon-migration`  
**Neon project:** `mute-leaf-59269378`  
**Experiment branch:** `security-hardening-002` (`br-winter-forest-b3bu6unt`)  
**Parent / production:** `production` (`br-small-thunder-b3ewuxz8`)

---

## 0. Pre-apply isolation checks (required)

### Are Neon roles project-wide or branch-specific?

**Branch-specific.** Official Neon docs ([Manage roles](https://neon.com/docs/manage/roles)): roles belong to a branch; child branches **copy** parent roles at creation time; creating a role on a child does **not** create it on the parent.

### Can creating `taxflow_app` affect production?

**Not if created only on the child.** Verified after experiment:

| Check (production) | Result |
|---|---|
| `taxflow_app` exists | **false** |
| `clients.relforcerowsecurity` | **false** |
| security-it Neon Auth users | **0** |
| PUBLIC can `consume_extraction` | **true** (still pre-hardening on production) |

**Caution:** Creating `taxflow_app` on **production** would affect production. Neon Console/API roles default to `neon_superuser` (**includes BYPASSRLS**). For least privilege use SQL `CREATE ROLE … NOBYPASSRLS` or Neon API `--access read_write` / `read_only` (not default admin).

### Is the child branch isolated and resettable?

**Yes.** Child `security-hardening-002` has its own compute endpoint, roles, auth schema data, and table state. Rollback = `reset_from_parent` (discards child changes) or delete the child branch. Production is untouched.

---

## 1. Architecture decision

### Chosen: Architecture B (hybrid) — Direct Postgres + verified session claims

| Option | Decision |
|---|---|
| A. Neon Data API + JWT | Deferred as primary path; grants prepared for later. |
| B. Direct SQL + session claims | **Selected** for Next.js: `@neondatabase/serverless` + `taxflow_app` + `set_config` after `auth.getSession()`. |

### Application-set claim limitations (honest)

Postgres does **not** cryptographically verify `request.jwt.claims` when the app sets them via `set_config`. Security depends on:

1. Claims are set **only** in server-side `withUser(userId)` after Neon Auth `getSession()`.
2. `userId` is never taken from request body/headers/query.
3. Browser clients cannot call `set_config` (no direct DB credentials).
4. App connects as `taxflow_app` (**NOBYPASSRLS**), so RLS still applies.

**Residual risks:** compromised app server, SQL injection that can run `set_config`, or accidental use of `DATABASE_URL` (owner / BYPASSRLS). Mitigate with `TAXFLOW_RLS_ENFORCED=1` after cutover and eventual Neon Data API / JWKS path.

**Browser-controlled inputs:** Grep confirms `set_config('request.jwt.*')` only in `lib/db/sql.ts` `withUser`. API routes use `requireFirm()` → session user id.

---

## 2. Role architecture

| Role | Purpose | BYPASSRLS | Used by |
|---|---|---|---|
| `neondb_owner` | Migrations, break-glass, admin | yes | `DATABASE_URL` / admin (production unchanged) |
| `taxflow_app` | Runtime app queries | **NO** | `DATABASE_URL_APP` on experiment branch only |
| `authenticated` | Future Data API | no | Grants prepared |

Child verification: `taxflow_app` → `rolsuper=false`, `rolbypassrls=false`, not member of `neon_superuser`.

---

## 3. SECURITY DEFINER review

| Function | Notes |
|---|---|
| `consume_extraction` | DEFINER, `search_path=''`; requires firm owner via `auth.uid()` **or** matching `app.upload_firm_id`; PUBLIC EXECUTE revoked |
| `increment_extractions_used` | Same ownership gate; PUBLIC EXECUTE revoked |
| `claim_upload_slot` | DEFINER by design for public upload links; validates token length ≥ 32, expiry, max uses; **atomically** increments `upload_count`; sets `app.upload_client_id` / `app.upload_firm_id` for remainder of txn; **no** firm-owner check (token is the capability); PUBLIC EXECUTE revoked — callers need `taxflow_app` |
| `protect_ca_firms_sensitive_columns` | Trigger DEFINER; unchanged; blocks sensitive column updates unless `app.admin` |

`claim_upload_slot` residual risk: anyone who knows a live token and can authenticate as `taxflow_app` (or later `authenticated`) can claim a slot. Token entropy (32+ bytes hex) is the control. Do not restore PUBLIC EXECUTE.

---

## 4. Experiment execution evidence

### Applied only on `br-winter-forest-b3bu6unt`

1. Created role `taxflow_app` with Neon API `access=read_write` (not admin / not neon_superuser).
2. Applied `002_security_roles_rls_rpcs.sql` via admin connection to **child only**.
3. Hotfixes folded back into `002`: `GRANT USAGE ON SCHEMA auth`, resilient `auth.uid()` for empty claims.
4. Created Neon Auth users on **child only** (absent on production).
5. Ran `scripts/security-it.mjs` → **20/20 PASS**.

### Migration 003 / policy verification (child)

- FORCE RLS = true on all six tenant tables
- PUBLIC EXECUTE on quota/upload RPCs = false; `taxflow_app` EXECUTE = true
- Full SELECT/INSERT/UPDATE/DELETE policies present

### Integration test summary (`scripts/security-it-results.json`)

```
total=20 passed=20 failed=0
branch=br-winter-forest-b3bu6unt
auth USER_A=56e3a3e9-83fe-4770-b3a0-29a9d28701d9
auth USER_B=04acd052-0041-4b1d-9c73-3d3aee1d1a1b
```

Coverage:

- Firm A/B own SELECT clients & documents
- Cross-firm SELECT / UPDATE / DELETE / INSERT denied
- Cross-firm `consume_extraction` → `42501`
- Anonymous SELECT empty; anonymous RPC denied
- Invalid JWT sub → no rows / safe failure
- Upload-token claim + document insert + quota for claimed firm
- Upload-token B cannot insert Firm A documents
- Concurrent quota race: 12 workers, limit 5 → successes=5, finalCount=5

---

## 5. Rollback procedure (verified options)

**Experiment branch (preferred):**

1. Neon Console / MCP `reset_from_parent` on `br-winter-forest-b3bu6unt`, **or** delete the child branch.
2. Production remains as before (no `taxflow_app`, no FORCE RLS, PUBLIC still has RPC execute).

**If 002 were ever applied to production (not done):**

1. Restore policies from `001_app_schema.sql` snapshot.
2. `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` on the six tables.
3. Re-grant EXECUTE as needed; drop `taxflow_app` or revoke its grants.
4. Keep app on `DATABASE_URL` (owner) — do not set `TAXFLOW_RLS_ENFORCED`.

**App cutover rollback:** unset `DATABASE_URL_APP` / `TAXFLOW_RLS_ENFORCED` (never set on production in this experiment).

---

## 6. Deployment instructions (production — still requires approval)

1. Create `taxflow_app` on production with **NOBYPASSRLS** (SQL or `access=read_write`, never default admin).
2. Apply updated `002` with owner unpooled URL.
3. Run `003` verification.
4. Preview env only first: `DATABASE_URL_APP`, keep owner `DATABASE_URL`, then `TAXFLOW_RLS_ENFORCED=1`.
5. Re-run security IT against production **preview** data path.
6. Production connection-string cutover only with written approval.

---

## 7. Files

| File | Purpose |
|---|---|
| `neon/migrations/002_security_roles_rls_rpcs.sql` | Roles checks, FORCE RLS, policies, hardened RPCs, auth schema grants |
| `neon/migrations/003_security_verification.sql` | Read-only verification |
| `scripts/apply-sql-file.mjs` | Apply SQL file to a branch admin URL |
| `scripts/security-it.mjs` | Two-firm cross-tenant IT |
| `scripts/security-it-results.json` | Last IT evidence |
| `.env.security-it.local` | Gitignored child-branch URLs (do not commit) |
| `lib/db/{sql,identity,queries}.ts` | App hardened path |
| `lib/storage/documents.ts` | Firm/client key + signed GET |

---

## 8. What is still NOT claimed

RLS is **proven on the isolated child branch**, not on production, until production applies 002, uses `DATABASE_URL_APP`, and passes the same IT. Production currently still has owner BYPASSRLS path and PUBLIC RPC execute.
