-- ============================================================
-- Classroom ERP — upgrade migration 0022
--
-- A loan was two things that nothing tied together: the journal entry (Dr Employee
-- Loans Receivable / Cr Cash) and the loan record in HR. Reversing the journal entry
-- left the loan record behind, and there was no way to delete it.
--
-- cancel_employee_loan removes a loan that payroll has not touched yet, and puts the
-- ledger right:
--   * if the loan's issue entry is still standing, it posts the reversing entry on the
--     date given (Dr Cash / Cr Employee Loans Receivable);
--   * if that entry was ALREADY reversed by hand, it posts nothing more, so the cash is
--     not put back twice;
--   * once payroll has deducted anything from the loan it refuses — at that point the
--     loan is part of paid payroll and can only run its course.
-- ============================================================
create or replace function cancel_employee_loan(target_loan uuid, cancel_date date)
returns jsonb as $$
declare
  ln employee_loans%rowtype;
  cash_account uuid; loans_account uuid;
  issued int; reversed int; others int;
  je_id uuid;
  posted boolean := false;
begin
  select * into ln from employee_loans where id = target_loan;
  if not found then raise exception 'That loan no longer exists.'; end if;
  perform assert_tenant_access(ln.tenant_id);

  if ln.balance_remaining < ln.principal - 0.005 or ln.status <> 'active' then
    raise exception 'Payroll has already taken deductions from this loan, so it can''t be cancelled.';
  end if;

  select id into cash_account from accounts where tenant_id = ln.tenant_id and code = '1000';
  select id into loans_account from accounts where tenant_id = ln.tenant_id and code = '1150';

  -- How many loan-issue entries of this size exist, how many have been reversed already,
  -- and how many OTHER standing loans of the same size own one of them.
  select count(*) into issued from journal_entries je
   where je.tenant_id = ln.tenant_id and je.memo = 'Employee loan issued'
     and exists (select 1 from journal_lines l where l.journal_entry_id = je.id and l.account_id = loans_account and l.debit = ln.principal);
  select count(*) into reversed from journal_entries je
   where je.tenant_id = ln.tenant_id and je.memo = 'Reversal of: Employee loan issued'
     and exists (select 1 from journal_lines l where l.journal_entry_id = je.id and l.account_id = loans_account and l.credit = ln.principal);
  select count(*) into others from employee_loans
   where tenant_id = ln.tenant_id and principal = ln.principal and id <> ln.id;

  -- If this loan's entry is still standing, offset it.
  if (issued - reversed) > others then
    insert into journal_entries (tenant_id, entry_date, memo, created_by)
    values (ln.tenant_id, cancel_date, 'Reversal of: Employee loan issued', auth.uid()) returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cash_account, ln.principal, 0),
      (je_id, loans_account, 0, ln.principal);
    posted := true;
  end if;

  delete from employee_loans where id = target_loan;
  return jsonb_build_object('reversal_posted', posted);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_employee_loan(uuid, date) from public, anon;
grant execute on function cancel_employee_loan(uuid, date) to authenticated;
