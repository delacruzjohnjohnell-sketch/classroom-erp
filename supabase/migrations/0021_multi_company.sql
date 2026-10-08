-- ============================================================
-- Classroom ERP — upgrade migration 0021
--
--  1. One account, several companies. `memberships` records which companies each
--     person belongs to; `profiles.tenant_id` stays as the ACTIVE company, so every
--     existing row-level-security policy (tenant_id = my_tenant_id()) keeps
--     isolating data to exactly one company at a time.
--  2. create_tenant / join_tenant add a membership and make that company active;
--     switch_tenant changes the active company, but only to one you belong to.
--  3. Closes a hole: a student could `update profiles set tenant_id = <any company>`.
--     That is now refused unless they are a member (teachers are exempt).
--  4. delete_company moves people who also belong elsewhere into that company.
--  5. post_recurring_entry posts on the entry's own due date unless told otherwise,
--     and says so when an entry has ended instead of quietly doing nothing.
-- ============================================================

-- ---------- 1. Memberships ----------
create table if not exists memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index if not exists memberships_tenant_idx on memberships (tenant_id);

alter table memberships enable row level security;
drop policy if exists "read own memberships" on memberships;
create policy "read own memberships" on memberships for select
  using (user_id = auth.uid() or is_teacher());
-- No insert/update/delete policies: only the functions below change memberships.

-- Everyone who is in a company today stays in it.
insert into memberships (user_id, tenant_id)
select p.id, p.tenant_id from profiles p
where p.tenant_id is not null and p.role = 'student'
  and exists (select 1 from auth.users u where u.id = p.id)
on conflict do nothing;

-- ---------- 2. Create / join / switch ----------
create or replace function create_tenant(tenant_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce(trim(tenant_name), '') = '' then raise exception 'Enter a company name.'; end if;

  insert into tenants (name, owner_id) values (trim(tenant_name), auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    (new_id, '1000', 'Cash', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
    (new_id, '1150', 'Employee Loans Receivable', 'asset', false),
    (new_id, '1160', 'Input Tax (VAT)', 'asset', false),
    (new_id, '1200', 'Inventory', 'asset', false),
    (new_id, '1500', 'Fixed Assets', 'asset', false),
    (new_id, '1590', 'Accumulated Depreciation', 'asset', false),
    (new_id, '2000', 'Accounts Payable', 'liability', false),
    (new_id, '2100', 'SSS Payable', 'liability', false),
    (new_id, '2110', 'PhilHealth Payable', 'liability', false),
    (new_id, '2120', 'Pag-IBIG Payable', 'liability', false),
    (new_id, '2130', 'Withholding Tax Payable', 'liability', false),
    (new_id, '2200', 'VAT Payable', 'liability', false),
    (new_id, '3000', 'Owner''s Equity', 'equity', false),
    (new_id, '4000', 'Sales Revenue', 'revenue', false),
    (new_id, '5000', 'Cost of Goods Sold', 'expense', false),
    (new_id, '5100', 'Operating Expenses', 'expense', false),
    (new_id, '5200', 'Marketing Expense', 'expense', false),
    (new_id, '5300', 'Payroll Expense', 'expense', false),
    (new_id, '5310', 'Payroll Tax Expense (Employer Share)', 'expense', false),
    (new_id, '5320', '13th Month Pay Expense', 'expense', false),
    (new_id, '5400', 'Depreciation Expense', 'expense', false);

  insert into memberships (user_id, tenant_id) values (auth.uid(), new_id) on conflict do nothing;
  update profiles set tenant_id = new_id where id = auth.uid();
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function join_tenant(target_tenant uuid)
returns void as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from tenants where id = target_tenant) then
    raise exception 'That company no longer exists.';
  end if;
  insert into memberships (user_id, tenant_id) values (auth.uid(), target_tenant) on conflict do nothing;
  update profiles set tenant_id = target_tenant where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function switch_tenant(target_tenant uuid)
returns void as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from memberships where user_id = auth.uid() and tenant_id = target_tenant) then
    raise exception 'You are not a member of that company.';
  end if;
  update profiles set tenant_id = target_tenant where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function switch_tenant(uuid) from public, anon;
grant execute on function switch_tenant(uuid) to authenticated;

-- ---------- 3. A profile can only point at a company its owner belongs to ----------
create or replace function guard_profile_tenant()
returns trigger as $$
begin
  if current_user in ('anon', 'authenticated')
     and is_teacher() is not true
     and new.tenant_id is not null
     and new.tenant_id is distinct from old.tenant_id
     and not exists (select 1 from memberships where user_id = old.id and tenant_id = new.tenant_id) then
    raise exception 'You can only switch to a company you belong to.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_guard_profile_tenant on profiles;
create trigger trg_guard_profile_tenant before update on profiles
  for each row execute function guard_profile_tenant();

-- ---------- 4. Deleting a company ----------
create or replace function delete_company(target_tenant uuid)
returns jsonb as $$
declare
  company_name text;
  affected uuid[];
  released int;
begin
  if is_teacher() is not true then
    raise exception 'Only a teacher can delete a company.';
  end if;

  select name into company_name from tenants where id = target_tenant;
  if not found then
    raise exception 'That company no longer exists.';
  end if;

  select coalesce(array_agg(id), '{}') into affected from profiles where tenant_id = target_tenant;
  update profiles set tenant_id = null where tenant_id = target_tenant;

  perform set_config('app.deleting_company', target_tenant::text, true);

  delete from bank_transactions where tenant_id = target_tenant;
  delete from journal_entries where tenant_id = target_tenant;
  delete from recurring_entries where tenant_id = target_tenant;
  delete from invoices where tenant_id = target_tenant;
  delete from quotes where tenant_id = target_tenant;
  delete from sales_orders where tenant_id = target_tenant;
  delete from bills where tenant_id = target_tenant;
  delete from purchase_orders where tenant_id = target_tenant;
  delete from payroll_runs where tenant_id = target_tenant;

  delete from tenants where id = target_tenant;   -- memberships go with it

  -- Anyone who also belongs to another company lands in it; the rest are released.
  update profiles p set tenant_id = (
    select m.tenant_id from memberships m where m.user_id = p.id order by m.created_at limit 1
  ) where p.id = any(affected);
  select count(*) into released from profiles where id = any(affected) and tenant_id is null;

  return jsonb_build_object('name', company_name, 'students_released', released);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 5. Recurring entries ----------
create or replace function post_recurring_entry(target_recurring_id uuid, post_date date default null)
returns uuid as $$
declare
  rec recurring_entries%rowtype;
  je_id uuid;
  line record;
  next_date date;
  entry_dt date;
begin
  select * into rec from recurring_entries where id = target_recurring_id;
  perform assert_tenant_access(rec.tenant_id);
  if not rec.active then
    raise exception 'This recurring entry has ended — there is nothing left to post.';
  end if;

  -- Post on the date it is due unless a date is given.
  entry_dt := coalesce(post_date, rec.next_run_date);

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (rec.tenant_id, entry_dt, rec.memo || ' (recurring)', auth.uid()) returning id into je_id;

  for line in select * from recurring_entry_lines where recurring_entry_id = target_recurring_id loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (je_id, line.account_id, line.debit, line.credit);
  end loop;

  -- The schedule moves forward from the due date, not from the date it was posted on.
  if rec.frequency = 'weekly' then
    next_date := (rec.next_run_date + interval '7 days')::date;
  else
    next_date := (rec.next_run_date + interval '1 month')::date;
  end if;

  update recurring_entries set
    next_run_date = next_date,
    active = case when rec.end_date is not null and next_date > rec.end_date then false else rec.active end
  where id = target_recurring_id;

  return je_id;
end;
$$ language plpgsql security definer set search_path = public;
