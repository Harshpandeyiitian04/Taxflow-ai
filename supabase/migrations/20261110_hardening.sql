-- TaxFlow AI hardening migration (Batch 1+)
-- Idempotent. Run in the Supabase SQL editor.
-- Does NOT drop plan / razorpay / referral_credits columns.

begin;

create extension if not exists pgcrypto;

-- ── reminders: optional failure reason ───────────────────────
alter table public.reminders
  add column if not exists failure_reason text;

-- ── Column-level grants on ca_firms (re-assert) ───────────────
revoke update on public.ca_firms from authenticated;
grant update (firm_name, owner_name, phone, city) on public.ca_firms to authenticated;

-- ── BEFORE UPDATE guard: non-service-role cannot change billing/identity fields
create or replace function public.protect_ca_firms_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
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

-- ── ca_analytics with security_invoker ───────────────────────
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

grant select on public.ca_analytics to authenticated;

-- ── handle_new_user backup provisioning ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ca_firms (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
exception
  when unique_violation then
    -- email unique race: ignore; callback will link
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

commit;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run manually after applying)
-- ═══════════════════════════════════════════════════════════════
--
-- 1) Confirm column grants (authenticated should only update firm_name, owner_name, phone, city):
--    select grantee, privilege_type, column_name
--    from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'ca_firms' and privilege_type = 'UPDATE'
--    order by grantee, column_name;
--
-- 2) Confirm ca_analytics uses security_invoker:
--    select c.relname, c.reloptions
--    from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'ca_analytics';
--
-- 3) As an authenticated user (not service_role), this should FAIL:
--    update public.ca_firms set plan = 'firm' where user_id = auth.uid();
--
-- 4) Confirm handle_new_user trigger exists:
--    select tgname from pg_trigger where tgname = 'on_auth_user_created';

-- ═══════════════════════════════════════════════════════════════
-- BATCH 2: fair-use quotas + upload token slots
-- ═══════════════════════════════════════════════════════════════

begin;

alter table public.upload_tokens
  add column if not exists upload_count integer not null default 0;

create table if not exists public.usage_daily (
  firm_id uuid not null references public.ca_firms(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (firm_id, day)
);

alter table public.usage_daily enable row level security;

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
  update public.ca_firms
  set extractions_used = coalesce(extractions_used, 0) + 1
  where id = p_firm;
end;
$$;

revoke all on function public.consume_extraction(uuid, int) from public, anon, authenticated;
revoke all on function public.claim_upload_slot(text, int) from public, anon, authenticated;
revoke all on function public.increment_extractions_used(uuid) from public, anon, authenticated;
grant execute on function public.consume_extraction(uuid, int) to service_role;
grant execute on function public.claim_upload_slot(text, int) to service_role;
grant execute on function public.increment_extractions_used(uuid) to service_role;

commit;
