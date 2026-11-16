// Tests that the security migration SQL includes expected RLS and RPC rules.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'neon/migrations/002_security_roles_rls_rpcs.sql'),
  'utf8'
)

// Static checks on migration file text (no database needed).
describe('002_security_roles_rls_rpcs.sql policy contracts', () => {
  // Every tenant table should have forced row level security.
  it('forces RLS on all tenant tables', () => {
    for (const table of [
      'ca_firms',
      'clients',
      'documents',
      'reminders',
      'upload_tokens',
      'usage_daily',
    ]) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} force row level security`, 'i')
      )
    }
  })

  // Sensitive RPCs should not be callable by PUBLIC.
  it('revokes RPC execute from PUBLIC', () => {
    expect(migration).toMatch(
      /revoke all on function public\.consume_extraction\(uuid, int\) from public/i
    )
    expect(migration).toMatch(
      /revoke all on function public\.increment_extractions_used\(uuid\) from public/i
    )
    expect(migration).toMatch(
      /revoke all on function public\.claim_upload_slot\(text, int\) from public/i
    )
  })

  // Quota functions should verify the caller owns the firm.
  it('requires ownership checks inside quota RPCs', () => {
    expect(migration).toMatch(/consume_extraction denied for firm/)
    expect(migration).toMatch(/increment_extractions_used denied for firm/)
    expect(migration).toMatch(/current_user_owns_firm|f\.user_id = v_uid/)
  })

  // Policies should tie rows to auth.uid() and firm ownership.
  it('binds policies to auth.uid() / firm ownership', () => {
    expect(migration).toMatch(/user_id = auth\.uid\(\)/)
    expect(migration).toMatch(/public\.current_user_owns_firm\(ca_firm_id\)/)
  })

  // App role must not bypass RLS.
  it('refuses taxflow_app with BYPASSRLS', () => {
    expect(migration).toMatch(/must NOT have BYPASSRLS/)
  })
})