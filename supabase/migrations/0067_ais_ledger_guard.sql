-- ============================================================
-- Classroom ERP — migration 0067 (AIS edition, step 2: the ledger guard)
--
-- Needs 0066. ADDITIVE: three new triggers and two new functions. No existing function, policy, table or trigger is changed.
--
-- Problem (found in the design study, exists today for every edition): the first migration gave each student "all" rights on journal_entries and
-- journal_lines inside their own company, so anyone could write the ledger directly through the API, skipping every control. And
-- tenants.books_locked_through can be changed by the company's own students, so an Audit student could unlock the books. reverse_journal_entry
-- checks neither seat nor edition.
--
-- Fix, for AIS companies ONLY: a signed-in person who is not the teacher cannot insert a journal entry or journal line, or move the lock date,
-- unless the call comes from an AIS posting function, which switches on the transaction-local flag ais.posting for the moment it writes.
-- That one rule also closes reverse_journal_entry for AIS companies (it inserts without the flag). Standard and Manufacturing companies are
-- not affected: the guards return at once for them. The database owner and the service role (no signed-in user) are never blocked.
--
-- ROLLBACK:
--   drop trigger if exists trg_ais_ledger_gate on journal_entries;
--   drop trigger if exists trg_ais_ledger_gate_lines on journal_lines;
--   drop trigger if exists trg_ais_lock_gate on tenants;
--   drop function if exists guard_ais_ledger_insert(), guard_ais_lock_date();
-- ============================================================

create or replace function guard_ais_ledger_insert()
returns trigger as $$
declare
  t uuid;
begin
  if auth.uid() is null then return new; end if;                                   -- database owner / service role
  if tg_table_name = 'journal_entries' then t := new.tenant_id;
  else select e.tenant_id into t from journal_entries e where e.id = new.journal_entry_id;
  end if;
  if t is null or tenant_edition(t) <> 'AIS' then return new; end if;               -- Standard and Manufacturing: untouched
  if is_teacher() then return new; end if;
  if coalesce(current_setting('ais.posting', true), '') = 'on' then return new; end if;
  raise exception 'In an AIS company the ledger can only be written by posting a document. Direct entries are not allowed.';
end;
$$ language plpgsql security definer set search_path = public;

create or replace function guard_ais_lock_date()
returns trigger as $$
begin
  if auth.uid() is null then return new; end if;
  if new.books_locked_through is not distinct from old.books_locked_through then return new; end if;
  if tenant_edition(new.id) <> 'AIS' then return new; end if;
  if is_teacher() then return new; end if;
  if coalesce(current_setting('ais.posting', true), '') = 'on' then return new; end if;
  raise exception 'In an AIS company the period is closed by the system when the Accounting phase ends, not by a student.';
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_ais_ledger_gate on journal_entries;
create trigger trg_ais_ledger_gate before insert on journal_entries for each row execute function guard_ais_ledger_insert();
drop trigger if exists trg_ais_ledger_gate_lines on journal_lines;
create trigger trg_ais_ledger_gate_lines before insert on journal_lines for each row execute function guard_ais_ledger_insert();
drop trigger if exists trg_ais_lock_gate on tenants;
create trigger trg_ais_lock_gate before update on tenants for each row execute function guard_ais_lock_date();
