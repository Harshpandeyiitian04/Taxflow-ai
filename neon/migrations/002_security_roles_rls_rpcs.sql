-- TaxFlow AI — multi-tenant security hardening (PREPARED, NOT AUTO-APPLIED)
-- Target: mute-leaf-59269378 / production / neondb
--
-- DOES NOT: drop tables, delete rows, or rewrite existing firm data.
-- REQUIRES OPERATOR APPROVAL before execution.
--
-- Prerequisites (do these in Neon Console / CLI before running this file):
--   1. Create role `taxflow_app` with LOGIN, NOBYPASSRLS, NOSUPERUSER.
--   2. Store its connection string as DATABASE_URL_APP (pooled) — do NOT
--      replace DATABASE_URL until cutover is approved.
--   3. Keep neondb_owner (or equivalent) as DATABASE_URL / DATABASE_URL_ADMIN
--      for migrations, cron, and break-glass admin only.

begin;

-- ── 0. Preconditions ─────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'taxflow_app') then
    raise exception
      'Role taxflow_app is missing. Create it in Neon Console with LOGIN + NOBYPASSRLS, then re-run.';
  end if;
  if exists (
    select 1 from pg_roles where rolname = 'taxflow_app' and rolbypassrls
  ) then
    raise exception 'taxflow_app must NOT have BYPASSRLS';
  end if;
  if exists (
    select 1 from pg_roles where rolname = 'taxflow_app' and rolsuper
  ) then
    raise exception 'taxflow_app must NOT be SUPERUSER';
  end if;
end $$;

-- Ensure authenticated exists (Data API / future JWT path)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant connect on database neondb to taxflow_app;
grant usage on schema public to taxflow_app;
grant usage on schema public to authenticated;
-- auth.uid() lives in schema auth; without USAGE, RLS helpers fail with 42501
grant usage on schema auth to taxflow_app;
grant usage on schema auth to authenticated;

-- ── 1. Identity helpers for RLS ──────────────────────────────
-- Prefer Neon Data API / pg_session_jwt auth.user_id() / auth.uid() when
-- available. Keep a claims fallback for direct server connections that set
-- request.jwt.claims after verifying Neon Auth session in the Next.js app.
create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language plpgsql
stable
as $$
declare
  v_sub text;
  v_claims text;
begin
  v_sub := nullif(current_setting('request.jwt.claim.sub', true), '');
  if v_sub is not null then
    return v_sub::uuid;
  end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is null then
    return null;
  end if;

  begin
    v_sub := nullif(v_claims::jsonb ->> 'sub', '');
  exception
    when others then
      return null;
  end;

  if v_sub is null then
    return null;
  end if;
  return v_sub::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function auth.uid() to taxflow_app;
grant execute on function auth.uid() to authenticated;

-- Helper: current user owns firm?
create or replace function public.current_user_owns_firm(p_firm uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
      from public.ca_firms f
     where f.id = p_firm
       and f.user_id = auth.uid()
  );
$$;

-- ── 2. Table privileges for runtime role ─────────────────────
revoke all on table
  public.ca_firms,
  public.clients,
  public.documents,
  public.reminders,
  public.upload_tokens,
  public.usage_daily,
  public.ca_analytics
from public;

grant select, update on public.ca_firms to taxflow_app;
grant select, insert, update, delete on public.clients to taxflow_app;
grant select, insert, update, delete on public.documents to taxflow_app;
grant select, insert, update, delete on public.reminders to taxflow_app;
grant select, insert, update, delete on public.upload_tokens to taxflow_app;
grant select on public.usage_daily to taxflow_app; -- mutations via RPC only
grant select on public.ca_analytics to taxflow_app;

-- authenticated: same DML shape for future Data API; RLS still required
grant select, update on public.ca_firms to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert, update, delete on public.upload_tokens to authenticated;
grant select on public.usage_daily to authenticated;
grant select on public.ca_analytics to authenticated;

revoke update on public.ca_firms from taxflow_app, authenticated;
grant update (firm_name, owner_name, phone, city) on public.ca_firms to taxflow_app, authenticated;

-- ── 3. RLS + FORCE ───────────────────────────────────────────
alter table public.ca_firms enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.upload_tokens enable row level security;
alter table public.usage_daily enable row level security;

alter table public.ca_firms force row level security;
alter table public.clients force row level security;
alter table public.documents force row level security;
alter table public.reminders force row level security;
alter table public.upload_tokens force row level security;
alter table public.usage_daily force row level security;

-- Drop legacy policies then recreate complete set
drop policy if exists ca_firms_select_own on public.ca_firms;
drop policy if exists ca_firms_update_own on public.ca_firms;
drop policy if exists clients_select_own on public.clients;
drop policy if exists clients_update_own on public.clients;
drop policy if exists clients_delete_own on public.clients;
drop policy if exists clients_insert_own on public.clients;
drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;
drop policy if exists reminders_select_own on public.reminders;
drop policy if exists reminders_insert_own on public.reminders;
drop policy if exists reminders_update_own on public.reminders;
drop policy if exists reminders_delete_own on public.reminders;
drop policy if exists upload_tokens_select_own on public.upload_tokens;
drop policy if exists upload_tokens_insert_own on public.upload_tokens;
drop policy if exists upload_tokens_update_own on public.upload_tokens;
drop policy if exists upload_tokens_delete_own on public.upload_tokens;
drop policy if exists usage_daily_select_own on public.usage_daily;
drop policy if exists documents_insert_upload_token on public.documents;
drop policy if exists documents_update_upload_token on public.documents;

-- ca_firms
create policy ca_firms_select_own on public.ca_firms
  for select to taxflow_app, authenticated
  using (user_id = auth.uid());

create policy ca_firms_update_own on public.ca_firms
  for update to taxflow_app, authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- clients
create policy clients_select_own on public.clients
  for select to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

create policy clients_insert_own on public.clients
  for insert to taxflow_app, authenticated
  with check (public.current_user_owns_firm(ca_firm_id));

create policy clients_update_own on public.clients
  for update to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id))
  with check (public.current_user_owns_firm(ca_firm_id));

create policy clients_delete_own on public.clients
  for delete to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

-- documents (firm owner OR activated public upload token context)
create policy documents_select_own on public.documents
  for select to taxflow_app, authenticated
  using (
    public.current_user_owns_firm(ca_firm_id)
    or (
      ca_firm_id::text = nullif(current_setting('app.upload_firm_id', true), '')
      and client_id::text = nullif(current_setting('app.upload_client_id', true), '')
    )
  );

create policy documents_insert_own on public.documents
  for insert to taxflow_app, authenticated
  with check (
    public.current_user_owns_firm(ca_firm_id)
    or (
      ca_firm_id::text = nullif(current_setting('app.upload_firm_id', true), '')
      and client_id::text = nullif(current_setting('app.upload_client_id', true), '')
    )
  );

create policy documents_update_own on public.documents
  for update to taxflow_app, authenticated
  using (
    public.current_user_owns_firm(ca_firm_id)
    or (
      ca_firm_id::text = nullif(current_setting('app.upload_firm_id', true), '')
      and client_id::text = nullif(current_setting('app.upload_client_id', true), '')
    )
  )
  with check (
    public.current_user_owns_firm(ca_firm_id)
    or (
      ca_firm_id::text = nullif(current_setting('app.upload_firm_id', true), '')
      and client_id::text = nullif(current_setting('app.upload_client_id', true), '')
    )
  );

create policy documents_delete_own on public.documents
  for delete to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

-- reminders
create policy reminders_select_own on public.reminders
  for select to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

create policy reminders_insert_own on public.reminders
  for insert to taxflow_app, authenticated
  with check (public.current_user_owns_firm(ca_firm_id));

create policy reminders_update_own on public.reminders
  for update to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id))
  with check (public.current_user_owns_firm(ca_firm_id));

create policy reminders_delete_own on public.reminders
  for delete to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

-- upload_tokens (firm owners manage links; claim RPC is definer)
create policy upload_tokens_select_own on public.upload_tokens
  for select to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

create policy upload_tokens_insert_own on public.upload_tokens
  for insert to taxflow_app, authenticated
  with check (public.current_user_owns_firm(ca_firm_id));

create policy upload_tokens_update_own on public.upload_tokens
  for update to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id))
  with check (public.current_user_owns_firm(ca_firm_id));

create policy upload_tokens_delete_own on public.upload_tokens
  for delete to taxflow_app, authenticated
  using (public.current_user_owns_firm(ca_firm_id));

-- usage_daily: read own firm only; writes via SECURITY DEFINER RPCs
create policy usage_daily_select_own on public.usage_daily
  for select to taxflow_app, authenticated
  using (public.current_user_owns_firm(firm_id));

-- ── 4. Hardened RPCs ─────────────────────────────────────────

create or replace function public.consume_extraction(p_firm uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (timezone('Asia/Kolkata', now()))::date;
  v_count integer;
  v_uid uuid := auth.uid();
  v_upload_firm text := nullif(current_setting('app.upload_firm_id', true), '');
begin
  if p_firm is null or p_limit is null or p_limit < 1 then
    raise exception 'invalid consume_extraction arguments';
  end if;

  -- Authenticated firm owner OR activated upload-token firm context
  if not (
    (v_uid is not null and exists (
      select 1 from public.ca_firms f
       where f.id = p_firm and f.user_id = v_uid
    ))
    or (v_upload_firm is not null and v_upload_firm = p_firm::text)
  ) then
    raise exception 'consume_extraction denied for firm %', p_firm
      using errcode = '42501';
  end if;

  perform set_config('app.admin', '1', true);

  insert into public.usage_daily (firm_id, day, count)
  values (p_firm, v_day, 0)
  on conflict (firm_id, day) do nothing;

  update public.usage_daily
     set count = count + 1
   where firm_id = p_firm
     and day = v_day
     and count < p_limit
  returning count into v_count;

  return found;
end;
$$;

create or replace function public.increment_extractions_used(p_firm uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_upload_firm text := nullif(current_setting('app.upload_firm_id', true), '');
begin
  if p_firm is null then
    raise exception 'invalid firm';
  end if;

  if not (
    (v_uid is not null and exists (
      select 1 from public.ca_firms f
       where f.id = p_firm and f.user_id = v_uid
    ))
    or (v_upload_firm is not null and v_upload_firm = p_firm::text)
  ) then
    raise exception 'increment_extractions_used denied for firm %', p_firm
      using errcode = '42501';
  end if;

  perform set_config('app.admin', '1', true);
  update public.ca_firms
     set extractions_used = coalesce(extractions_used, 0) + 1
   where id = p_firm;
end;
$$;

-- Atomically claim a slot and activate upload GUCs for the rest of the txn
create or replace function public.claim_upload_slot(p_token text, p_max int)
returns table (client_id uuid, ca_firm_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_firm uuid;
begin
  if p_token is null or length(p_token) < 32 or p_max is null or p_max < 1 then
    return;
  end if;

  update public.upload_tokens as t
     set upload_count = t.upload_count + 1,
         used = ((t.upload_count + 1) >= p_max)
   where t.token = p_token
     and t.expires_at > now()
     and t.upload_count < p_max
  returning t.client_id, t.ca_firm_id into v_client, v_firm;

  if v_client is null then
    return;
  end if;

  perform set_config('app.upload_client_id', v_client::text, true);
  perform set_config('app.upload_firm_id', v_firm::text, true);

  client_id := v_client;
  ca_firm_id := v_firm;
  return next;
end;
$$;

-- ── 5. EXECUTE grants ────────────────────────────────────────
revoke all on function public.consume_extraction(uuid, int) from public;
revoke all on function public.increment_extractions_used(uuid) from public;
revoke all on function public.claim_upload_slot(text, int) from public;
revoke all on function public.current_user_owns_firm(uuid) from public;

grant execute on function public.consume_extraction(uuid, int) to taxflow_app;
grant execute on function public.increment_extractions_used(uuid) to taxflow_app;
grant execute on function public.claim_upload_slot(text, int) to taxflow_app;
grant execute on function public.current_user_owns_firm(uuid) to taxflow_app, authenticated;

-- authenticated may need RPCs if Data API is enabled later
grant execute on function public.consume_extraction(uuid, int) to authenticated;
grant execute on function public.increment_extractions_used(uuid) to authenticated;
grant execute on function public.claim_upload_slot(text, int) to authenticated;

commit;
