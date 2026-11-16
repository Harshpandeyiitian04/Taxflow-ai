-- Read-only verification queries AFTER 002 is applied (run manually).
-- Do not use these to mutate data.

-- 1) Role flags
select rolname, rolsuper, rolbypassrls, rolcanlogin
  from pg_roles
 where rolname in ('taxflow_app', 'neondb_owner', 'authenticated')
 order by 1;

-- 2) FORCE RLS
select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('ca_firms','clients','documents','reminders','upload_tokens','usage_daily')
 order by 1;

-- 3) Policies present
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('ca_firms','clients','documents','reminders','upload_tokens','usage_daily')
 order by 1, 2;

-- 4) RPC execute grants (PUBLIC must be absent)
select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('consume_extraction','increment_extractions_used','claim_upload_slot')
 order by 1, 2;

-- 5) auth.uid definition
select pg_get_functiondef('auth.uid()'::regprocedure);
