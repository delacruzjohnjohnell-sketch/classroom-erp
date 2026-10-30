-- ============================================================
-- Classroom ERP — migration 0066 (AIS edition, step 1: the foundation)
--
-- The third edition: Accounting Information Systems (James Hall). Two student seats, ACCOUNTING and AUDIT.
-- This file only lets a company BE an AIS company and gives the teacher the controls. Practice sets, posting and the Audit
-- tools come in later migrations (0068 onward).
--
-- ADDITIVE. The only existing objects it touches are the three edition CHECK constraints (widened to allow 'AIS'; every row that
-- was valid before is still valid) and one new trigger on memberships. No Standard or Manufacturing function, policy or table
-- is changed. A company with no row in tenant_editions is still Standard.
--
--   edition_settings 'AIS'       closed until the teacher opens it
--   ais_company_roles            who holds which seat in an AIS company (a student may hold both)
--   ais_company_settings         per-company switches (segregation-of-duties mode, fiscal year start)
--   ais_create_company, ais_set_seats, ais_remove_member, ais_companies_list, ais_roster, ais_class_students,
--   ais_set_sod_mode (teacher); ais_my_seats (student); ais__my_tenant(seat) (the one door for a student's write)
--
-- ROLLBACK:
--   drop trigger if exists trg_guard_ais_membership on memberships;
--   drop function if exists guard_ais_membership(), ais_set_sod_mode(uuid, text), ais_roster(uuid), ais_companies_list(), ais_class_students(),
--     ais_remove_member(uuid, uuid), ais_set_seats(uuid, uuid, text[]), ais_create_company(text, date), ais_my_seats(),
--     ais__my_tenant(text), assert_ais_tenant(uuid);
--   drop table if exists ais_company_settings, ais_company_roles;
--   delete from edition_settings where edition = 'AIS';
--   (then put the three CHECK constraints back to ('STANDARD','MANUFACTURING'); only possible while no AIS row exists)
-- ============================================================

-- ---------- allow a third edition ----------
do $do$
declare
  t text;
  c text;
begin
  foreach t in array array['tenant_editions', 'edition_settings', 'edition_last_used'] loop
    c := t || '_edition_check';
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = c and contype = 'c') then
      raise exception 'Expected constraint % on % was not found', c, t;
    end if;
    execute format('alter table %I drop constraint %I', t, c);
    execute format('alter table %I add constraint %I check (edition in (''STANDARD'', ''MANUFACTURING'', ''AIS''))', t, c);
  end loop;
end $do$;

insert into edition_settings (edition, enabled) values ('AIS', false) on conflict (edition) do nothing;

-- ---------- helpers ----------
create or replace function assert_ais_tenant(tid uuid)
returns void as $$
begin
  if auth.uid() is null then return; end if;   -- database owner / service role
  if tenant_edition(tid) <> 'AIS' then
    raise exception 'This company is not an AIS company.';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- seats ----------
create table if not exists ais_company_roles (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        text not null check (seat in ('ACCOUNTING', 'AUDIT')),
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (tenant_id, user_id, seat)
);
create index if not exists ais_company_roles_user on ais_company_roles (user_id);

create table if not exists ais_company_settings (
  tenant_id         uuid primary key references tenants(id) on delete cascade,
  fiscal_year_start date not null default date_trunc('year', current_date)::date,
  -- ENFORCE: a person cannot approve what they entered. ALLOW_LOGGED: allowed but written to the log, so the Audit seat can find it.
  sod_mode          text not null default 'ENFORCE' check (sod_mode in ('ENFORCE', 'ALLOW_LOGGED')),
  created_at        timestamptz not null default now()
);

alter table ais_company_roles enable row level security;
alter table ais_company_settings enable row level security;
drop policy if exists "ais read" on ais_company_roles;
create policy "ais read" on ais_company_roles for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_company_settings;
create policy "ais read" on ais_company_settings for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
-- No insert/update/delete policy: only the functions below write here.

-- The one door for a student's write: the company must be mine, an AIS company, and I must hold the seat.
create or replace function ais__my_tenant(p_seat text)
returns uuid as $$
declare
  t uuid := my_tenant_id();
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'The teacher reviews AIS companies but does not work in them.'; end if;
  if t is null then raise exception 'Choose a company first.'; end if;
  perform assert_ais_tenant(t);
  if not exists (select 1 from ais_company_roles r where r.tenant_id = t and r.user_id = auth.uid() and r.seat = p_seat) then
    raise exception 'You do not hold the % seat in this company. Ask your teacher.', initcap(p_seat);
  end if;
  return t;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_my_seats()
returns text[] as $$
  select coalesce(array_agg(r.seat order by r.seat), array[]::text[])
    from ais_company_roles r where r.tenant_id = my_tenant_id() and r.user_id = auth.uid() and tenant_edition(r.tenant_id) = 'AIS';
$$ language sql stable security definer set search_path = public;

-- A student cannot join an AIS company (by any route) while the teacher has the edition closed.
create or replace function guard_ais_membership()
returns trigger as $$
begin
  if tenant_edition(new.tenant_id) = 'AIS'
     and coalesce((select enabled from edition_settings where edition = 'AIS'), false) = false then
    raise exception 'The AIS edition has not been opened by your teacher yet.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_guard_ais_membership on memberships;
create trigger trg_guard_ais_membership before insert on memberships
  for each row execute function guard_ais_membership();

-- ---------- the teacher creates an AIS company (a merchandising chart of accounts; no owner seat, no membership for the teacher) ----------
create or replace function ais_create_company(p_name text, p_fiscal_year_start date)
returns uuid as $$
declare
  new_id uuid;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can create an AIS company.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter a company name.'; end if;
  if p_fiscal_year_start is null then raise exception 'Choose the date the fiscal year starts.'; end if;

  insert into tenants (name, owner_id) values (trim(p_name), auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    (new_id, '1000', 'Cash in Bank', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
    (new_id, '1110', 'Allowance for Doubtful Accounts', 'asset', false),
    (new_id, '1160', 'Input Tax (VAT)', 'asset', false),
    (new_id, '1200', 'Merchandise Inventory', 'asset', false),
    (new_id, '1300', 'Prepaid Expenses', 'asset', false),
    (new_id, '1500', 'Fixed Assets', 'asset', false),
    (new_id, '1590', 'Accumulated Depreciation', 'asset', false),
    (new_id, '2000', 'Accounts Payable', 'liability', false),
    (new_id, '2050', 'Goods Received / Invoice Received (GR/IR)', 'liability', false),
    (new_id, '2100', 'SSS Payable', 'liability', false),
    (new_id, '2110', 'PhilHealth Payable', 'liability', false),
    (new_id, '2120', 'Pag-IBIG Payable', 'liability', false),
    (new_id, '2130', 'Withholding Tax Payable', 'liability', false),
    (new_id, '2200', 'VAT Payable', 'liability', false),
    (new_id, '2300', 'Accrued Expenses', 'liability', false),
    (new_id, '2400', 'Unearned Revenue', 'liability', false),
    (new_id, '3000', 'Owner''s Equity', 'equity', false),
    (new_id, '4000', 'Sales Revenue', 'revenue', false),
    (new_id, '4010', 'Sales Returns and Allowances', 'revenue', false),
    (new_id, '4020', 'Sales Discounts', 'revenue', false),
    (new_id, '5000', 'Cost of Goods Sold', 'expense', false),
    (new_id, '5100', 'Operating Expenses', 'expense', false),
    (new_id, '5110', 'Bad Debts Expense', 'expense', false),
    (new_id, '5200', 'Marketing Expense', 'expense', false),
    (new_id, '5300', 'Payroll Expense', 'expense', false),
    (new_id, '5310', 'Payroll Tax Expense (Employer Share)', 'expense', false),
    (new_id, '5400', 'Depreciation Expense', 'expense', false),
    (new_id, '5900', 'Purchase Discounts and Adjustments', 'expense', false),
    (new_id, '9990', 'Suspense', 'asset', false);

  insert into tenant_editions (tenant_id, edition, owner_id) values (new_id, 'AIS', null);
  insert into ais_company_settings (tenant_id, fiscal_year_start) values (new_id, p_fiscal_year_start);
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_class_students()
returns table (id uuid, full_name text) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the class list.'; end if;
  return query select p.id, p.full_name from profiles p where p.role = 'student' order by p.full_name nulls last;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_companies_list()
returns table (tenant_id uuid, name text, members int, created_at timestamptz) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the AIS companies.'; end if;
  return query
  select t.id, t.name, (select count(*)::int from memberships m where m.tenant_id = t.id), te.created_at
    from tenant_editions te join tenants t on t.id = te.tenant_id where te.edition = 'AIS' order by te.created_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_roster(p_tenant uuid)
returns table (user_id uuid, full_name text, seats text[]) as $$
begin
  if not (is_teacher() or p_tenant = my_tenant_id()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_ais_tenant(p_tenant);
  return query
  select m.user_id, p.full_name,
         coalesce((select array_agg(r.seat order by r.seat) from ais_company_roles r where r.tenant_id = p_tenant and r.user_id = m.user_id), array[]::text[])
    from memberships m left join profiles p on p.id = m.user_id where m.tenant_id = p_tenant order by p.full_name nulls last;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_set_seats(p_tenant uuid, p_user uuid, p_seats text[])
returns void as $$
declare
  k text;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can add members or change seats.'; end if;
  perform assert_ais_tenant(p_tenant);
  if not exists (select 1 from profiles where id = p_user and role = 'student') then raise exception 'Choose a student.'; end if;
  foreach k in array coalesce(p_seats, array[]::text[]) loop
    if k not in ('ACCOUNTING', 'AUDIT') then raise exception 'Unknown seat: %', k; end if;
  end loop;
  insert into memberships (user_id, tenant_id) values (p_user, p_tenant) on conflict do nothing;
  update profiles set tenant_id = p_tenant where id = p_user and tenant_id is null;
  insert into edition_last_used (user_id, edition, tenant_id) values (p_user, 'AIS', p_tenant) on conflict (user_id, edition) do nothing;
  delete from ais_company_roles where tenant_id = p_tenant and user_id = p_user;
  insert into ais_company_roles (tenant_id, user_id, seat, assigned_by)
  select p_tenant, p_user, s.x, auth.uid() from (select distinct unnest(coalesce(p_seats, array[]::text[])) as x) s;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_remove_member(p_tenant uuid, p_user uuid)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can remove a member.'; end if;
  perform assert_ais_tenant(p_tenant);
  delete from ais_company_roles where tenant_id = p_tenant and user_id = p_user;
  delete from memberships where tenant_id = p_tenant and user_id = p_user;
  update profiles set tenant_id = (select m.tenant_id from memberships m where m.user_id = p_user order by m.created_at limit 1)
   where id = p_user and tenant_id = p_tenant;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_set_sod_mode(p_tenant uuid, p_mode text)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change the segregation-of-duties mode.'; end if;
  perform assert_ais_tenant(p_tenant);
  if p_mode not in ('ENFORCE', 'ALLOW_LOGGED') then raise exception 'Mode must be ENFORCE or ALLOW_LOGGED.'; end if;
  update ais_company_settings set sod_mode = p_mode where tenant_id = p_tenant;
  if not found then raise exception 'That company has no AIS settings.'; end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function assert_ais_tenant(uuid) from public, anon;
revoke execute on function ais__my_tenant(text) from public, anon;
revoke execute on function ais_my_seats() from public, anon;
revoke execute on function ais_create_company(text, date) from public, anon;
revoke execute on function ais_class_students() from public, anon;
revoke execute on function ais_companies_list() from public, anon;
revoke execute on function ais_roster(uuid) from public, anon;
revoke execute on function ais_set_seats(uuid, uuid, text[]) from public, anon;
revoke execute on function ais_remove_member(uuid, uuid) from public, anon;
revoke execute on function ais_set_sod_mode(uuid, text) from public, anon;
grant execute on function assert_ais_tenant(uuid) to authenticated;
grant execute on function ais__my_tenant(text) to authenticated;
grant execute on function ais_my_seats() to authenticated;
grant execute on function ais_create_company(text, date) to authenticated;
grant execute on function ais_class_students() to authenticated;
grant execute on function ais_companies_list() to authenticated;
grant execute on function ais_roster(uuid) to authenticated;
grant execute on function ais_set_seats(uuid, uuid, text[]) to authenticated;
grant execute on function ais_remove_member(uuid, uuid) to authenticated;
grant execute on function ais_set_sod_mode(uuid, text) to authenticated;
