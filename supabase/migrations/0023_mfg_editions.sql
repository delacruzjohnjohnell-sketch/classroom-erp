-- ============================================================
-- Classroom ERP — migration 0023 (Manufacturing ERP, Phase 1, part 1)
--
-- ADDITIVE ONLY. Creates new objects; alters, drops or replaces nothing that existed.
--
--   tenant_editions       which edition each company belongs to (no row = STANDARD, so every
--                         existing company stays Standard with no data change)
--   edition_settings      the teacher's on/off switch per edition
--   mfg_company_settings  per-company Manufacturing settings (costing method, …)
--   mfg_audit_log         who changed what in a Manufacturing company's settings
--   edition_last_used     remembers each person's last company per edition
--   tenant_edition(), assert_mfg_tenant(), set_edition_enabled(), record_edition_open(),
--   update_mfg_settings(), set_mfg_costing_method()
--
-- ROLLBACK (these drop only objects created by this file):
--   drop trigger if exists trg_guard_mfg_membership on memberships;
--   drop function if exists guard_mfg_membership();
--   drop function if exists set_mfg_costing_method(uuid, text);
--   drop function if exists update_mfg_settings(uuid, date, text, text, boolean);
--   drop function if exists record_edition_open(text, uuid);
--   drop function if exists set_edition_enabled(text, boolean);
--   drop function if exists assert_mfg_tenant(uuid);
--   drop table if exists edition_last_used, mfg_audit_log, mfg_company_settings, edition_settings, tenant_editions;
--   drop function if exists tenant_edition(uuid);
-- ============================================================

-- ---------- which edition is a company? ----------
create table if not exists tenant_editions (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  edition    text not null check (edition in ('STANDARD', 'MANUFACTURING')),
  owner_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- One Manufacturing company per student (the Standard ERP keeps allowing several).
create unique index if not exists tenant_editions_one_mfg_per_owner
  on tenant_editions (owner_id) where edition = 'MANUFACTURING';

create or replace function tenant_edition(tid uuid)
returns text as $$
  select coalesce((select edition from tenant_editions where tenant_id = tid), 'STANDARD');
$$ language sql stable security definer set search_path = public;

create or replace function assert_mfg_tenant(tid uuid)
returns void as $$
begin
  if auth.uid() is null then return; end if;   -- database owner / service role
  if tenant_edition(tid) <> 'MANUFACTURING' then
    raise exception 'This company is not a Manufacturing ERP company.';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

alter table tenant_editions enable row level security;
drop policy if exists "edition read" on tenant_editions;
create policy "edition read" on tenant_editions for select using (
  is_teacher()
  or tenant_id = my_tenant_id()
  or exists (select 1 from memberships m where m.user_id = auth.uid() and m.tenant_id = tenant_editions.tenant_id)
);
-- No insert/update/delete policy: only create_mfg_company() writes here.

-- ---------- the teacher's switch ----------
create table if not exists edition_settings (
  edition    text primary key check (edition in ('STANDARD', 'MANUFACTURING')),
  enabled    boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into edition_settings (edition, enabled) values ('STANDARD', true), ('MANUFACTURING', false)
  on conflict (edition) do nothing;

alter table edition_settings enable row level security;
drop policy if exists "edition settings read" on edition_settings;
create policy "edition settings read" on edition_settings for select using (auth.uid() is not null);

create or replace function set_edition_enabled(target_edition text, is_enabled boolean)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can open or close an edition.'; end if;
  if target_edition = 'STANDARD' and not is_enabled then raise exception 'The Standard ERP can''t be turned off.'; end if;
  update edition_settings set enabled = is_enabled, updated_by = auth.uid(), updated_at = now()
   where edition = target_edition;
  if not found then raise exception 'Unknown edition.'; end if;
end;
$$ language plpgsql security definer set search_path = public;

-- A student can't slip into a Manufacturing company (by joining it) while the edition is closed.
create or replace function guard_mfg_membership()
returns trigger as $$
begin
  if tenant_edition(new.tenant_id) = 'MANUFACTURING'
     and coalesce((select enabled from edition_settings where edition = 'MANUFACTURING'), false) = false then
    raise exception 'The Manufacturing ERP has not been opened by your teacher yet.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_guard_mfg_membership on memberships;
create trigger trg_guard_mfg_membership before insert on memberships
  for each row execute function guard_mfg_membership();

-- ---------- per-company Manufacturing settings ----------
create table if not exists mfg_company_settings (
  tenant_id             uuid primary key references tenants(id) on delete cascade,
  costing_method        text not null default 'STANDARD' check (costing_method in ('STANDARD', 'ACTUAL')),
  fiscal_year_start     date not null default date_trunc('year', current_date)::date,
  variance_close_method text not null default 'COGS' check (variance_close_method in ('COGS', 'PRORATE')),
  oh_close_method       text not null default 'COGS' check (oh_close_method in ('COGS', 'PRORATE')),
  explain_postings      boolean not null default true,
  created_at            timestamptz not null default now()
);
alter table mfg_company_settings enable row level security;
drop policy if exists "mfg settings read" on mfg_company_settings;
create policy "mfg settings read" on mfg_company_settings for select using (
  (tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING'
);

create table if not exists mfg_audit_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  event      text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists mfg_audit_log_tenant_idx on mfg_audit_log (tenant_id, created_at desc);
alter table mfg_audit_log enable row level security;
drop policy if exists "mfg audit read" on mfg_audit_log;
create policy "mfg audit read" on mfg_audit_log for select using (
  (tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING'
);

-- Settings are changed by the teacher only (students see them, never edit them).
create or replace function update_mfg_settings(
  target_tenant uuid, new_fiscal_year_start date, new_variance_close text, new_oh_close text, new_explain boolean)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change Manufacturing settings.'; end if;
  perform assert_mfg_tenant(target_tenant);
  if new_variance_close not in ('COGS', 'PRORATE') or new_oh_close not in ('COGS', 'PRORATE') then
    raise exception 'Close method must be COGS or PRORATE.';
  end if;
  update mfg_company_settings set
    fiscal_year_start = coalesce(new_fiscal_year_start, fiscal_year_start),
    variance_close_method = new_variance_close,
    oh_close_method = new_oh_close,
    explain_postings = coalesce(new_explain, explain_postings)
  where tenant_id = target_tenant;
  if not found then raise exception 'That company has no Manufacturing settings.'; end if;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (target_tenant, 'settings_changed',
          jsonb_build_object('fiscal_year_start', new_fiscal_year_start, 'variance_close', new_variance_close,
                             'oh_close', new_oh_close, 'explain_postings', new_explain), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- Switching the costing method is only safe at a period boundary with nothing in flight.
create or replace function set_mfg_costing_method(target_tenant uuid, new_method text)
returns void as $$
declare
  old_method text;
  locked_through date;
  open_orders int := 0;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change the costing method.'; end if;
  perform assert_mfg_tenant(target_tenant);
  if new_method not in ('STANDARD', 'ACTUAL') then raise exception 'Costing method must be STANDARD or ACTUAL.'; end if;

  select costing_method into old_method from mfg_company_settings where tenant_id = target_tenant;
  if old_method is null then raise exception 'That company has no Manufacturing settings.'; end if;
  if old_method = new_method then return; end if;

  -- open production orders (the table arrives in a later phase; until then there can be none)
  if to_regclass('public.mfg_production_orders') is not null then
    execute 'select count(*) from mfg_production_orders where tenant_id = $1 and status not in (''CLOSED'', ''CANCELLED'')'
      into open_orders using target_tenant;
  end if;
  if open_orders > 0 then
    raise exception 'Close or cancel the % open production order(s) before changing the costing method.', open_orders;
  end if;

  -- everything already posted must sit inside a locked period
  select books_locked_through into locked_through from tenants where id = target_tenant;
  if exists (select 1 from journal_entries where tenant_id = target_tenant
             and (locked_through is null or entry_date > locked_through)) then
    raise exception 'Lock the books through the end of the last period first — the costing method can only change at a period boundary.';
  end if;

  update mfg_company_settings set costing_method = new_method where tenant_id = target_tenant;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (target_tenant, 'costing_method_changed', jsonb_build_object('from', old_method, 'to', new_method), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- remembers the last company opened in each edition ----------
create table if not exists edition_last_used (
  user_id   uuid not null references auth.users(id) on delete cascade,
  edition   text not null check (edition in ('STANDARD', 'MANUFACTURING')),
  tenant_id uuid not null references tenants(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, edition)
);
alter table edition_last_used enable row level security;
drop policy if exists "last used read" on edition_last_used;
create policy "last used read" on edition_last_used for select using (user_id = auth.uid());

create or replace function record_edition_open(target_edition text, target_tenant uuid)
returns void as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from memberships where user_id = auth.uid() and tenant_id = target_tenant) then
    raise exception 'You are not a member of that company.';
  end if;
  if tenant_edition(target_tenant) <> target_edition then
    raise exception 'That company belongs to a different ERP.';
  end if;
  insert into edition_last_used (user_id, edition, tenant_id, opened_at)
  values (auth.uid(), target_edition, target_tenant, now())
  on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = excluded.opened_at;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function assert_mfg_tenant(uuid) from public, anon;
revoke execute on function set_edition_enabled(text, boolean) from public, anon;
revoke execute on function update_mfg_settings(uuid, date, text, text, boolean) from public, anon;
revoke execute on function set_mfg_costing_method(uuid, text) from public, anon;
revoke execute on function record_edition_open(text, uuid) from public, anon;
grant execute on function assert_mfg_tenant(uuid) to authenticated;
grant execute on function set_edition_enabled(text, boolean) to authenticated;
grant execute on function update_mfg_settings(uuid, date, text, text, boolean) to authenticated;
grant execute on function set_mfg_costing_method(uuid, text) to authenticated;
grant execute on function record_edition_open(text, uuid) to authenticated;
-- tenant_edition() stays open: row-level-security policies call it.
