-- ============================================================
-- Classroom ERP — upgrade migration 0012
-- Recurring journal entries.
--
-- Honest note: this stack has no background job scheduler (no cron,
-- no serverless function running on a timer). "Recurring" here means
-- the system tracks each template's next due date and surfaces it —
-- posting still happens with a click, not silently in the background.
-- That's a deliberate, stated simplification, not a hidden gap.
-- ============================================================

create table recurring_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  memo text not null,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  start_date date not null default current_date,
  next_run_date date not null,
  end_date date,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table recurring_entry_lines (
  id uuid primary key default gen_random_uuid(),
  recurring_entry_id uuid references recurring_entries(id) on delete cascade,
  account_id uuid references accounts(id),
  debit numeric not null default 0,
  credit numeric not null default 0
);

select tenant_scoped_policy('recurring_entries');
alter table recurring_entry_lines enable row level security;
create policy "recurring line read" on recurring_entry_lines for select
  using (exists (select 1 from recurring_entries r where r.id = recurring_entry_id and (r.tenant_id = my_tenant_id() or is_teacher())));
create policy "recurring line write" on recurring_entry_lines for all
  using (exists (select 1 from recurring_entries r where r.id = recurring_entry_id and (r.tenant_id = my_tenant_id() or is_teacher())));

-- Posts one instance of the template as a real journal entry (subject to the same
-- period-lock and balance rules as any other entry), then advances next_run_date.
create or replace function post_recurring_entry(target_recurring_id uuid, post_date date)
returns uuid as $$
declare
  rec recurring_entries%rowtype;
  je_id uuid;
  line record;
  next_date date;
begin
  select * into rec from recurring_entries where id = target_recurring_id;
  if not rec.active then return null; end if;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (rec.tenant_id, post_date, rec.memo || ' (recurring)', auth.uid()) returning id into je_id;

  for line in select * from recurring_entry_lines where recurring_entry_id = target_recurring_id loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (je_id, line.account_id, line.debit, line.credit);
  end loop;

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
$$ language plpgsql security definer;
