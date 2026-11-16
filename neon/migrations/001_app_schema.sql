-- TaxFlow AI app schema for Neon (Lakebase Postgres + Managed Better Auth)
-- App tables only — does NOT dump Supabase auth/storage schemas.
-- Safe on empty Neon DB. No customer data migration.

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────

create table if not exists public.ca_firms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null unique,
  firm_name text,
  owner_name text,
  phone text,
  city text,
  plan text not null default 'trial',
  extractions_used integer not null default 0,
  client_limit integer not null default 50,
  razorpay_payment_id text,
  razorpay_sub_id text,
  razorpay_customer_id text,
  plan_expires_at timestamptz,
  referral_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)),
  referred_by text,
  referral_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prefer FK into Managed Better Auth users when the table exists.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'neon_auth' and table_name = 'user'
  ) then
    begin
      alter table public.ca_firms
        add constraint ca_firms_user_id_fkey
        foreign key (user_id) references neon_auth."user"(id) on delete cascade;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  name text not null,
  pan text,
  phone text,
  email text,
  assessment_year text not null default '2027-28',
  status text not null default 'pending'
    check (status in ('pending', 'received', 'processing', 'done', 'filed')),
  tags text[] not null default '{}',
  notes text,
  gstin text,
  gst_scheme text,
  fee_amount numeric(12, 2),
  fee_paid boolean not null default false,
  last_reminder_sent_at timestamptz,
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  type text not null default 'form16'
    check (type in ('form16', 'bank_statement', 'ais', 'form16a', 'capital_gains')),
  storage_path text,
  original_filename text,
  file_size_bytes bigint,
  extracted_data jsonb,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '30 days'),
  used boolean not null default false,
  upload_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  type text not null,
  message text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_daily (
  firm_id uuid not null references public.ca_firms(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (firm_id, day)
);

create index if not exists clients_firm_created_idx
  on public.clients (ca_firm_id, created_at desc);
create index if not exists documents_client_created_idx
  on public.documents (client_id, created_at desc);
create index if not exists documents_firm_idx
  on public.documents (ca_firm_id);
create index if not exists upload_tokens_client_idx
  on public.upload_tokens (client_id, created_at desc);
create index if not exists reminders_due_idx
  on public.reminders (status, scheduled_at);

-- ── updated_at triggers ──────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ca_firms_set_updated_at on public.ca_firms;
create trigger ca_firms_set_updated_at before update on public.ca_firms
  for each row execute function public.set_updated_at();
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ── Sensitive column guard (admin bypass via set_config) ─────

create or replace function public.protect_ca_firms_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.admin', true), '') = '1' then
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.extractions_used is distinct from old.extractions_used
     or new.client_limit is distinct from old.client_limit
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.referral_credits is distinct from old.referral_credits
     or new.razorpay_payment_id is distinct from old.razorpay_payment_id
     or new.razorpay_sub_id is distinct from old.razorpay_sub_id
     or new.razorpay_customer_id is distinct from old.razorpay_customer_id
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
  then
    raise exception 'Updating protected ca_firms columns is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists ca_firms_protect_sensitive on public.ca_firms;
create trigger ca_firms_protect_sensitive
  before update on public.ca_firms
  for each row
  execute function public.protect_ca_firms_sensitive_columns();

-- ── Analytics view ───────────────────────────────────────────

create or replace view public.ca_analytics
with (security_invoker = true)
as
select
  firms.id as ca_firm_id,
  count(clients.id)::integer as total_clients,
  count(clients.id) filter (where clients.status = 'filed')::integer as filed_count,
  count(clients.id) filter (where clients.status = 'done')::integer as done_count,
  count(clients.id) filter (where clients.status = 'processing')::integer as processing_count,
  count(clients.id) filter (where clients.status = 'received')::integer as received_count,
  count(clients.id) filter (where clients.status = 'pending')::integer as pending_count,
  coalesce(round(
    100.0 * count(clients.id) filter (where clients.status = 'filed')
      / nullif(count(clients.id), 0),
    0
  ), 0) as filed_pct,
  coalesce(sum(clients.fee_amount), 0) as revenue_total,
  coalesce(sum(clients.fee_amount) filter (where clients.fee_paid), 0) as revenue_collected,
  count(clients.id) filter (where clients.fee_paid)::integer as paid_clients
from public.ca_firms as firms
left join public.clients as clients on clients.ca_firm_id = firms.id
group by firms.id;

-- ── Fair-use / upload RPCs ───────────────────────────────────

create or replace function public.consume_extraction(p_firm uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (timezone('Asia/Kolkata', now()))::date;
  v_count integer;
begin
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

create or replace function public.claim_upload_slot(p_token text, p_max int)
returns table (client_id uuid, ca_firm_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.upload_tokens as t
  set
    upload_count = t.upload_count + 1,
    used = ((t.upload_count + 1) >= p_max)
  where t.token = p_token
    and t.expires_at > now()
    and t.upload_count < p_max
  returning t.client_id, t.ca_firm_id;
end;
$$;

create or replace function public.increment_extractions_used(p_firm uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.admin', '1', true);
  update public.ca_firms
  set extractions_used = coalesce(extractions_used, 0) + 1
  where id = p_firm;
end;
$$;

-- ── RLS (defense in depth; app also enforces firm ownership) ─
-- Table owner connections used by the Next.js server bypass RLS unless FORCE.
-- auth.uid() works with Neon Data API / pg_session_jwt; provide a safe stub otherwise.

create schema if not exists auth;

do $$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $fn$
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$
    $fn$;
  end if;
end $$;

alter table public.ca_firms enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.upload_tokens enable row level security;
alter table public.reminders enable row level security;
alter table public.usage_daily enable row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

drop policy if exists ca_firms_select_own on public.ca_firms;
create policy ca_firms_select_own on public.ca_firms
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ca_firms_update_own on public.ca_firms;
create policy ca_firms_update_own on public.ca_firms
  for update to authenticated using (
    user_id = auth.uid()
  ) with check (
    user_id = auth.uid()
  );

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own on public.clients
  for select to authenticated using (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = clients.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  );

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own on public.clients
  for update to authenticated using (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = clients.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = clients.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  );

drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own on public.clients
  for delete to authenticated using (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = clients.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  );

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to authenticated using (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = documents.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  );

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own on public.reminders
  for select to authenticated using (
    exists (
      select 1 from public.ca_firms
      where ca_firms.id = reminders.ca_firm_id and ca_firms.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated;
grant select, update on public.ca_firms to authenticated;
grant select, update, delete on public.clients to authenticated;
grant select on public.documents to authenticated;
grant select on public.reminders to authenticated;
grant select on public.ca_analytics to authenticated;

revoke update on public.ca_firms from authenticated;
grant update (firm_name, owner_name, phone, city) on public.ca_firms to authenticated;
