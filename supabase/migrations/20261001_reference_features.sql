begin;

create extension if not exists pgcrypto;

alter table public.ca_firms
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists firm_name text,
  add column if not exists owner_name text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists plan text not null default 'trial',
  add column if not exists extractions_used integer not null default 0,
  add column if not exists client_limit integer not null default 50,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_sub_id text,
  add column if not exists razorpay_customer_id text,
  add column if not exists plan_expires_at timestamptz,
  add column if not exists referral_code text,
  add column if not exists referred_by text,
  add column if not exists referral_credits integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.ca_firms
set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

alter table public.ca_firms alter column referral_code set not null;
create unique index if not exists ca_firms_referral_code_unique_idx
  on public.ca_firms (referral_code);
create unique index if not exists ca_firms_user_id_unique_idx
  on public.ca_firms (user_id) where user_id is not null;

alter table public.clients
  add column if not exists email text,
  add column if not exists assessment_year text,
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists gstin text,
  add column if not exists gst_scheme text,
  add column if not exists fee_amount numeric(12, 2),
  add column if not exists fee_paid boolean not null default false,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.documents
  add column if not exists ca_firm_id uuid references public.ca_firms(id) on delete cascade,
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists extraction_error text,
  add column if not exists updated_at timestamptz not null default now();

update public.documents as documents
set ca_firm_id = clients.ca_firm_id
from public.clients as clients
where documents.client_id = clients.id
  and documents.ca_firm_id is null;

alter table public.documents alter column ca_firm_id set not null;

alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents
  add constraint documents_type_check
  check (type in ('form16', 'bank_statement', 'ais', 'form16a', 'capital_gains')) not valid;

alter table public.documents alter column type set default 'form16';
alter table public.upload_tokens
  add column if not exists ca_firm_id uuid references public.ca_firms(id) on delete cascade,
  add column if not exists expires_at timestamptz default (now() + interval '30 days'),
  add column if not exists used boolean not null default false;

update public.upload_tokens as tokens
set ca_firm_id = clients.ca_firm_id
from public.clients as clients
where tokens.client_id = clients.id
  and tokens.ca_firm_id is null;

alter table public.upload_tokens alter column ca_firm_id set not null;

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
  created_at timestamptz not null default now()
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

alter table public.ca_firms enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.upload_tokens enable row level security;
alter table public.reminders enable row level security;

drop policy if exists ca_firms_select_own on public.ca_firms;
create policy ca_firms_select_own on public.ca_firms
  for select to authenticated using (user_id = auth.uid());
drop policy if exists ca_firms_update_own on public.ca_firms;
create policy ca_firms_update_own on public.ca_firms
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke update on public.ca_firms from authenticated;
grant update (firm_name, owner_name, phone, city) on public.ca_firms to authenticated;

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

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
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

create or replace view public.ca_analytics with (security_invoker = true) as
select
  firms.id as ca_firm_id,
  count(clients.id)::integer as total_clients,
  count(clients.id) filter (where clients.status = 'filed')::integer as filed_count,
  count(clients.id) filter (where clients.status = 'done')::integer as done_count,
  count(clients.id) filter (where clients.status = 'processing')::integer as processing_count,
  count(clients.id) filter (where clients.status = 'received')::integer as received_count,
  count(clients.id) filter (where clients.status = 'pending')::integer as pending_count,
  coalesce(round(100.0 * count(clients.id) filter (where clients.status = 'filed')
    / nullif(count(clients.id), 0), 0), 0) as filed_pct,
  coalesce(sum(clients.fee_amount), 0) as revenue_total,
  coalesce(sum(clients.fee_amount) filter (where clients.fee_paid), 0) as revenue_collected,
  count(clients.id) filter (where clients.fee_paid)::integer as paid_clients
from public.ca_firms as firms
left join public.clients as clients on clients.ca_firm_id = firms.id
group by firms.id;
grant select on public.ca_analytics to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_storage_select_own on storage.objects;
create policy documents_storage_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'documents' and exists (
      select 1 from public.ca_firms
      where ca_firms.user_id = auth.uid()
        and ca_firms.id::text = (storage.foldername(name))[1]
    )
  );
drop policy if exists documents_storage_insert_own on storage.objects;
create policy documents_storage_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents' and exists (
      select 1 from public.ca_firms
      where ca_firms.user_id = auth.uid()
        and ca_firms.id::text = (storage.foldername(name))[1]
    )
  );
drop policy if exists documents_storage_delete_own on storage.objects;
create policy documents_storage_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'documents' and exists (
      select 1 from public.ca_firms
      where ca_firms.user_id = auth.uid()
        and ca_firms.id::text = (storage.foldername(name))[1]
    )
  );

commit;