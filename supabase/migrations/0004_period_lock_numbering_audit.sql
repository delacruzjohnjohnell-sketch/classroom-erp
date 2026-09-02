-- ============================================================
-- Classroom ERP — upgrade migration 0004
-- Phase 1 of "real ERP" hardening: document numbering, period
-- close/lock, journal immutability (reversing entries instead of
-- edits), and audit-trail visibility (who posted what).
-- Run this AFTER 0001, 0002, and 0003.
-- ============================================================

-- ---------- Fix: teammates on the same tenant couldn't see each other's names ----------
-- (needed for an audit trail to mean anything — "posted by" has to resolve to a name)
create policy "read teammates' profiles" on profiles for select
  using (tenant_id = my_tenant_id());

-- ---------- Fix: tenants had no UPDATE policy, so period-lock settings couldn't be saved ----------
create policy "update own tenant" on tenants for update
  using (id = my_tenant_id() or is_teacher());

-- ---------- Period close / lock ----------

alter table tenants add column if not exists books_locked_through date;

create or replace function enforce_period_lock()
returns trigger as $$
declare
  locked_through date;
begin
  select books_locked_through into locked_through from tenants where id = new.tenant_id;
  if locked_through is not null and new.entry_date <= locked_through then
    raise exception 'This period is locked through %. Ask your teacher to move the lock date before posting entries on or before that date.', locked_through;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_period_lock before insert on journal_entries
  for each row execute function enforce_period_lock();

-- ---------- Journal immutability ----------
-- Real books don't get edited after the fact — mistakes get corrected with a
-- reversing entry, so the history stays intact. Enforce that at the database level.

create or replace function block_journal_mutation()
returns trigger as $$
begin
  raise exception 'Journal entries can''t be edited or deleted once posted — post a reversing entry instead.';
end;
$$ language plpgsql;

create trigger trg_no_edit_je before update or delete on journal_entries
  for each row execute function block_journal_mutation();
create trigger trg_no_edit_jl before update or delete on journal_lines
  for each row execute function block_journal_mutation();

-- Helper the UI calls for "Reverse this entry" — creates a brand-new entry with every
-- debit/credit flipped, referencing the original in its memo. The original is untouched.
create or replace function reverse_journal_entry(original_id uuid, reversal_date date)
returns uuid as $$
declare
  orig journal_entries%rowtype;
  new_id uuid;
  line record;
begin
  select * into orig from journal_entries where id = original_id;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (orig.tenant_id, reversal_date, 'Reversal of: ' || coalesce(orig.memo, original_id::text), auth.uid())
  returning id into new_id;

  for line in select * from journal_lines where journal_entry_id = original_id loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (new_id, line.account_id, line.credit, line.debit); -- flipped
  end loop;

  return new_id;
end;
$$ language plpgsql security definer;

-- ---------- Document numbering ----------
-- Human-readable, per-tenant, auto-incrementing numbers: INV-0001, BILL-0001.

create table doc_counters (
  tenant_id uuid references tenants(id) on delete cascade,
  doc_type text not null,
  next_number int not null default 1,
  primary key (tenant_id, doc_type)
);

select tenant_scoped_policy('doc_counters');

create or replace function next_doc_number(target_tenant uuid, dtype text, prefix text)
returns text as $$
declare
  n int;
begin
  insert into doc_counters (tenant_id, doc_type, next_number) values (target_tenant, dtype, 2)
  on conflict (tenant_id, doc_type) do update set next_number = doc_counters.next_number + 1
  returning next_number - 1 into n;
  return prefix || '-' || lpad(n::text, 4, '0');
end;
$$ language plpgsql security definer;

alter table sales_orders add column if not exists document_number text;
alter table purchase_orders add column if not exists document_number text;

create or replace function assign_so_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'invoice', 'INV');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_so_number before insert on sales_orders
  for each row execute function assign_so_number();

create or replace function assign_po_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'bill', 'BILL');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_po_number before insert on purchase_orders
  for each row execute function assign_po_number();

-- Backfill numbers for any invoices/bills created before this migration.
do $$
declare
  r record;
begin
  for r in select id, tenant_id from sales_orders where document_number is null order by order_date loop
    update sales_orders set document_number = next_doc_number(r.tenant_id, 'invoice', 'INV') where id = r.id;
  end loop;
  for r in select id, tenant_id from purchase_orders where document_number is null order by order_date loop
    update purchase_orders set document_number = next_doc_number(r.tenant_id, 'bill', 'BILL') where id = r.id;
  end loop;
end $$;
