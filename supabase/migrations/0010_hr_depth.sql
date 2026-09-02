-- ============================================================
-- Classroom ERP — upgrade migration 0010
-- HR depth: time tracking, leave requests, 13th month pay, loan
-- deductions, and semi-monthly pay periods.
--
-- Notes on simplifications (stated plainly, not hidden):
-- - Time tracking is a record-keeping log, not yet wired into
--   payroll proration (salaries stay fixed regardless of hours logged).
-- - Leave requests track balance/approval; approved leave doesn't
--   currently reduce pay (assumed paid leave) — marking a request
--   "unpaid" is tracked but doesn't yet touch the payroll calculation.
-- - Semi-monthly withholding tax uses a scaled version of the monthly
--   BIR bracket table (halved thresholds/base, same marginal rates) —
--   a reasonable approximation, not the official separate semi-monthly
--   table BIR publishes.
-- - Employees are assumed to have at most one active loan at a time.
-- ============================================================

-- ---------- New accounts ----------

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '1150', 'Employee Loans Receivable', 'asset', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '1150');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '5320', '13th Month Pay Expense', 'expense', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '5320');

-- Also seed them for every NEW tenant going forward.
create or replace function create_tenant(tenant_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  insert into tenants (name, owner_id) values (tenant_name, auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    (new_id, '1000', 'Cash', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
    (new_id, '1150', 'Employee Loans Receivable', 'asset', false),
    (new_id, '1200', 'Inventory', 'asset', false),
    (new_id, '1500', 'Fixed Assets', 'asset', false),
    (new_id, '1590', 'Accumulated Depreciation', 'asset', false),
    (new_id, '2000', 'Accounts Payable', 'liability', false),
    (new_id, '2100', 'SSS Payable', 'liability', false),
    (new_id, '2110', 'PhilHealth Payable', 'liability', false),
    (new_id, '2120', 'Pag-IBIG Payable', 'liability', false),
    (new_id, '2130', 'Withholding Tax Payable', 'liability', false),
    (new_id, '3000', 'Owner''s Equity', 'equity', false),
    (new_id, '4000', 'Sales Revenue', 'revenue', false),
    (new_id, '5000', 'Cost of Goods Sold', 'expense', false),
    (new_id, '5100', 'Operating Expenses', 'expense', false),
    (new_id, '5200', 'Marketing Expense', 'expense', false),
    (new_id, '5300', 'Payroll Expense', 'expense', false),
    (new_id, '5310', 'Payroll Tax Expense (Employer Share)', 'expense', false),
    (new_id, '5320', '13th Month Pay Expense', 'expense', false),
    (new_id, '5400', 'Depreciation Expense', 'expense', false);

  update profiles set tenant_id = new_id where id = auth.uid();
  return new_id;
end;
$$ language plpgsql security definer;

-- ---------- Time tracking ----------

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  work_date date not null,
  hours_worked numeric not null,
  notes text,
  created_at timestamptz default now()
);

select tenant_scoped_policy('time_entries');

-- ---------- Leave management ----------

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('vacation', 'sick', 'emergency', 'unpaid')),
  start_date date not null,
  end_date date not null,
  days numeric not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reason text,
  created_at timestamptz default now()
);

select tenant_scoped_policy('leave_requests');

-- Only a teacher can approve or deny — a student can file a request (or leave it
-- pending) but can't self-approve, mirroring how approval thresholds work elsewhere.
create or replace function guard_leave_approval()
returns trigger as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'denied') and not is_teacher() then
    raise exception 'Only the teacher can approve or deny a leave request.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_guard_leave_approval before update on leave_requests
  for each row execute function guard_leave_approval();

-- ---------- Employee loans ----------

create table employee_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  principal numeric not null,
  monthly_deduction numeric not null,
  balance_remaining numeric not null,
  start_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'paid_off')),
  created_at timestamptz default now()
);

select tenant_scoped_policy('employee_loans');

-- Issuing a loan is itself a transaction: Dr Employee Loans Receivable / Cr Cash.
create or replace function issue_employee_loan(target_tenant uuid, target_employee_id uuid, loan_principal numeric, loan_monthly_deduction numeric, loan_date date)
returns uuid as $$
declare
  new_id uuid;
  je_id uuid;
  loans_account uuid; cash_account uuid;
begin
  insert into employee_loans (tenant_id, employee_id, principal, monthly_deduction, balance_remaining, start_date)
  values (target_tenant, target_employee_id, loan_principal, loan_monthly_deduction, loan_principal, loan_date)
  returning id into new_id;

  select id into loans_account from accounts where tenant_id = target_tenant and code = '1150';
  select id into cash_account from accounts where tenant_id = target_tenant and code = '1000';

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, loan_date, 'Employee loan issued', auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, loans_account, loan_principal, 0),
    (je_id, cash_account, 0, loan_principal);

  return new_id;
end;
$$ language plpgsql security definer;

-- ---------- Payroll: pay periods, loan deductions, 13th month ----------

alter table payroll_runs add column if not exists run_type text not null default 'regular' check (run_type in ('regular', '13th_month'));
alter table payroll_runs add column if not exists pay_period text;
alter table payroll_run_lines add column if not exists loan_deduction numeric not null default 0;

-- Replaces the earlier version: same signature, now also handles loan deductions
-- (crediting Employee Loans Receivable instead of Cash for that portion, and paying
-- down the employee's loan balance) and records which pay period this run covers.
-- CREATE OR REPLACE does NOT replace a function whose parameter list changed —
-- Postgres treats that as a new overload. Drop the old 3-parameter version explicitly
-- so calls don't accidentally resolve to the old (buggy-headcount) version.
drop function if exists run_payroll_ph(uuid, date, jsonb);

create or replace function run_payroll_ph(target_tenant uuid, run_date date, lines jsonb, pay_period text default 'monthly')
returns uuid as $$
declare
  new_run_id uuid;
  line jsonb;
  total_gross numeric := 0;
  total_er_contrib numeric := 0;
  total_net numeric := 0;
  total_sss numeric := 0;
  total_philhealth numeric := 0;
  total_pagibig numeric := 0;
  total_wtax numeric := 0;
  total_loan numeric := 0;
  line_count int := 0;
  je_id uuid;
  acc_payroll_exp uuid; acc_payroll_tax_exp uuid; acc_cash uuid;
  acc_sss uuid; acc_philhealth uuid; acc_pagibig uuid; acc_wtax uuid; acc_loans uuid;
  emp_id uuid;
  this_loan_ded numeric;
  active_loan employee_loans%rowtype;
begin
  select id into acc_payroll_exp from accounts where tenant_id = target_tenant and code = '5300';
  select id into acc_payroll_tax_exp from accounts where tenant_id = target_tenant and code = '5310';
  select id into acc_cash from accounts where tenant_id = target_tenant and code = '1000';
  select id into acc_sss from accounts where tenant_id = target_tenant and code = '2100';
  select id into acc_philhealth from accounts where tenant_id = target_tenant and code = '2110';
  select id into acc_pagibig from accounts where tenant_id = target_tenant and code = '2120';
  select id into acc_wtax from accounts where tenant_id = target_tenant and code = '2130';
  select id into acc_loans from accounts where tenant_id = target_tenant and code = '1150';

  insert into payroll_runs (tenant_id, run_date, total, headcount, run_type, pay_period)
  values (target_tenant, run_date, 0, 0, 'regular', pay_period)
  returning id into new_run_id;

  for line in select * from jsonb_array_elements(lines) loop
    line_count := line_count + 1;
    total_gross := total_gross + (line->>'gross')::numeric;
    total_net := total_net + (line->>'netPay')::numeric;
    total_sss := total_sss + (line->>'sssEE')::numeric + (line->>'sssER')::numeric;
    total_philhealth := total_philhealth + (line->>'philhealthEE')::numeric + (line->>'philhealthER')::numeric;
    total_pagibig := total_pagibig + (line->>'pagibigEE')::numeric + (line->>'pagibigER')::numeric;
    total_wtax := total_wtax + (line->>'withholdingTax')::numeric;
    total_er_contrib := total_er_contrib
      + (line->>'sssER')::numeric + (line->>'philhealthER')::numeric + (line->>'pagibigER')::numeric;

    this_loan_ded := coalesce((line->>'loanDeduction')::numeric, 0);
    total_loan := total_loan + this_loan_ded;
    emp_id := (line->>'employeeId')::uuid;

    insert into payroll_run_lines (
      tenant_id, payroll_run_id, employee_id, gross, sss_ee, sss_er,
      philhealth_ee, philhealth_er, pagibig_ee, pagibig_er, withholding_tax, loan_deduction, net_pay
    ) values (
      target_tenant, new_run_id, emp_id, (line->>'gross')::numeric,
      (line->>'sssEE')::numeric, (line->>'sssER')::numeric,
      (line->>'philhealthEE')::numeric, (line->>'philhealthER')::numeric,
      (line->>'pagibigEE')::numeric, (line->>'pagibigER')::numeric,
      (line->>'withholdingTax')::numeric, this_loan_ded, (line->>'netPay')::numeric
    );

    if this_loan_ded > 0 then
      select * into active_loan from employee_loans where employee_id = emp_id and status = 'active' limit 1;
      if found then
        update employee_loans set balance_remaining = greatest(0, balance_remaining - this_loan_ded) where id = active_loan.id;
        update employee_loans set status = 'paid_off' where id = active_loan.id and balance_remaining <= 0;
      end if;
    end if;
  end loop;

  update payroll_runs set total = round(total_gross, 2), headcount = line_count where id = new_run_id;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, run_date, 'Payroll run (' || pay_period || ')', auth.uid()) returning id into je_id;

  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, acc_payroll_exp, round(total_gross, 2), 0),
    (je_id, acc_payroll_tax_exp, round(total_er_contrib, 2), 0),
    (je_id, acc_cash, 0, round(total_net, 2)),
    (je_id, acc_sss, 0, round(total_sss, 2)),
    (je_id, acc_philhealth, 0, round(total_philhealth, 2)),
    (je_id, acc_pagibig, 0, round(total_pagibig, 2)),
    (je_id, acc_wtax, 0, round(total_wtax, 2));

  if total_loan > 0 then
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, acc_loans, 0, round(total_loan, 2));
  end if;

  return new_run_id;
end;
$$ language plpgsql security definer;

-- 13th month pay: sum of each employee's regular gross pay actually run during the
-- given calendar year, divided by 12 — the standard Philippine statutory formula.
create or replace function post_13th_month_pay(target_tenant uuid, pay_year int)
returns uuid as $$
declare
  new_run_id uuid;
  emp record;
  total_13th numeric := 0;
  emp_count int := 0;
  emp_13th numeric;
  je_id uuid;
  acc_13th uuid; acc_cash uuid;
begin
  select id into acc_13th from accounts where tenant_id = target_tenant and code = '5320';
  select id into acc_cash from accounts where tenant_id = target_tenant and code = '1000';

  insert into payroll_runs (tenant_id, run_date, total, headcount, run_type, pay_period)
  values (target_tenant, make_date(pay_year, 12, 31), 0, 0, '13th_month', null)
  returning id into new_run_id;

  for emp in select id, name from employees where tenant_id = target_tenant loop
    select coalesce(sum(prl.gross), 0) into emp_13th
    from payroll_run_lines prl
    join payroll_runs pr on pr.id = prl.payroll_run_id
    where prl.employee_id = emp.id and pr.run_type = 'regular' and extract(year from pr.run_date) = pay_year;

    emp_13th := round(emp_13th / 12.0, 2);
    if emp_13th > 0 then
      emp_count := emp_count + 1;
      total_13th := total_13th + emp_13th;
      insert into payroll_run_lines (tenant_id, payroll_run_id, employee_id, gross, net_pay)
      values (target_tenant, new_run_id, emp.id, emp_13th, emp_13th);
    end if;
  end loop;

  update payroll_runs set total = round(total_13th, 2), headcount = emp_count where id = new_run_id;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, make_date(pay_year, 12, 31), '13th month pay, ' || pay_year, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, acc_13th, round(total_13th, 2), 0),
    (je_id, acc_cash, 0, round(total_13th, 2));

  return new_run_id;
end;
$$ language plpgsql security definer;
