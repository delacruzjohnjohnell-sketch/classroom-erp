-- ============================================================
-- Classroom ERP — upgrade migration 0003
-- Adds: editable chart of accounts, designated bank accounts,
--       fixed assets with depreciation, Philippine statutory payroll.
-- Run this AFTER 0001_init.sql and 0002_invoicing_upgrade.sql.
-- ============================================================

-- ---------- Bank account designation ----------
-- Any asset account can be flagged as a bank account (checking, savings, etc.)
-- so the Banking module can show a dropdown of real bank accounts instead of
-- assuming there's only one "Cash" account.

alter table accounts add column if not exists is_bank boolean not null default false;
update accounts set is_bank = true where code = '1000';

-- Banking transactions now point at a specific bank account, not implicitly "Cash".
alter table bank_transactions add column if not exists account_id uuid references accounts(id);
update bank_transactions set account_id = (
  select id from accounts a where a.tenant_id = bank_transactions.tenant_id and a.code = '1000'
) where account_id is null;

-- ---------- Fixed assets & depreciation ----------

create table fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  purchase_date date not null,
  cost numeric not null,
  salvage_value numeric not null default 0,
  useful_life_months int not null,
  accumulated_depreciation numeric not null default 0,
  created_at timestamptz default now()
);

select tenant_scoped_policy('fixed_assets');

create table depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  fixed_asset_id uuid references fixed_assets(id) on delete cascade,
  entry_date date not null default current_date,
  amount numeric not null,
  created_at timestamptz default now()
);

select tenant_scoped_policy('depreciation_entries');

create or replace function record_depreciation(asset_id uuid, dep_amount numeric, dep_date date)
returns void as $$
declare
  fa fixed_assets%rowtype;
  je_id uuid;
  dep_exp_account uuid; accum_dep_account uuid;
begin
  select * into fa from fixed_assets where id = asset_id;
  select id into dep_exp_account from accounts where tenant_id = fa.tenant_id and code = '5400';
  select id into accum_dep_account from accounts where tenant_id = fa.tenant_id and code = '1590';

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (fa.tenant_id, dep_date, 'Depreciation, ' || fa.name, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, dep_exp_account, dep_amount, 0),
    (je_id, accum_dep_account, 0, dep_amount);

  insert into depreciation_entries (tenant_id, fixed_asset_id, entry_date, amount)
  values (fa.tenant_id, asset_id, dep_date, dep_amount);

  update fixed_assets set accumulated_depreciation = accumulated_depreciation + dep_amount where id = asset_id;
end;
$$ language plpgsql security definer;

-- ---------- Philippine statutory payroll ----------
-- Per-employee breakdown for each payroll run (gross, mandatory deductions, net pay).
-- The actual SSS/PhilHealth/Pag-IBIG/withholding-tax bracket math is computed in the
-- app (src/lib/philippinePayroll.ts) since those tables change by law periodically —
-- easier to keep current there than baked into SQL. This function just posts the
-- already-computed numbers atomically.

create table payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  payroll_run_id uuid references payroll_runs(id) on delete cascade,
  employee_id uuid references employees(id),
  gross numeric not null,
  sss_ee numeric not null default 0,
  sss_er numeric not null default 0,
  philhealth_ee numeric not null default 0,
  philhealth_er numeric not null default 0,
  pagibig_ee numeric not null default 0,
  pagibig_er numeric not null default 0,
  withholding_tax numeric not null default 0,
  net_pay numeric not null
);

select tenant_scoped_policy('payroll_run_lines');

create or replace function run_payroll_ph(target_tenant uuid, run_date date, lines jsonb)
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
  headcount int := 0;
  je_id uuid;
  acc_payroll_exp uuid; acc_payroll_tax_exp uuid; acc_cash uuid;
  acc_sss uuid; acc_philhealth uuid; acc_pagibig uuid; acc_wtax uuid;
begin
  select id into acc_payroll_exp from accounts where tenant_id = target_tenant and code = '5300';
  select id into acc_payroll_tax_exp from accounts where tenant_id = target_tenant and code = '5310';
  select id into acc_cash from accounts where tenant_id = target_tenant and code = '1000';
  select id into acc_sss from accounts where tenant_id = target_tenant and code = '2100';
  select id into acc_philhealth from accounts where tenant_id = target_tenant and code = '2110';
  select id into acc_pagibig from accounts where tenant_id = target_tenant and code = '2120';
  select id into acc_wtax from accounts where tenant_id = target_tenant and code = '2130';

  insert into payroll_runs (tenant_id, run_date, total, headcount) values (target_tenant, run_date, 0, 0)
    returning id into new_run_id;

  for line in select * from jsonb_array_elements(lines) loop
    headcount := headcount + 1;
    total_gross := total_gross + (line->>'gross')::numeric;
    total_net := total_net + (line->>'netPay')::numeric;
    total_sss := total_sss + (line->>'sssEE')::numeric + (line->>'sssER')::numeric;
    total_philhealth := total_philhealth + (line->>'philhealthEE')::numeric + (line->>'philhealthER')::numeric;
    total_pagibig := total_pagibig + (line->>'pagibigEE')::numeric + (line->>'pagibigER')::numeric;
    total_wtax := total_wtax + (line->>'withholdingTax')::numeric;
    total_er_contrib := total_er_contrib
      + (line->>'sssER')::numeric + (line->>'philhealthER')::numeric + (line->>'pagibigER')::numeric;

    insert into payroll_run_lines (
      tenant_id, payroll_run_id, employee_id, gross, sss_ee, sss_er,
      philhealth_ee, philhealth_er, pagibig_ee, pagibig_er, withholding_tax, net_pay
    ) values (
      target_tenant, new_run_id, (line->>'employeeId')::uuid, (line->>'gross')::numeric,
      (line->>'sssEE')::numeric, (line->>'sssER')::numeric,
      (line->>'philhealthEE')::numeric, (line->>'philhealthER')::numeric,
      (line->>'pagibigEE')::numeric, (line->>'pagibigER')::numeric,
      (line->>'withholdingTax')::numeric, (line->>'netPay')::numeric
    );
  end loop;

  update payroll_runs set total = round(total_gross, 2), headcount = headcount where id = new_run_id;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, run_date, 'Payroll run (PH statutory)', auth.uid()) returning id into je_id;

  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, acc_payroll_exp, round(total_gross, 2), 0),
    (je_id, acc_payroll_tax_exp, round(total_er_contrib, 2), 0),
    (je_id, acc_cash, 0, round(total_net, 2)),
    (je_id, acc_sss, 0, round(total_sss, 2)),
    (je_id, acc_philhealth, 0, round(total_philhealth, 2)),
    (je_id, acc_pagibig, 0, round(total_pagibig, 2)),
    (je_id, acc_wtax, 0, round(total_wtax, 2));

  return new_run_id;
end;
$$ language plpgsql security definer;

-- ---------- New default accounts (bank, fixed assets, statutory payables) ----------
-- Seed these for tenants that already exist, so nothing built earlier breaks.

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '1590', 'Accumulated Depreciation', 'asset', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '1590');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '1500', 'Fixed Assets', 'asset', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '1500');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '2100', 'SSS Payable', 'liability', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '2100');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '2110', 'PhilHealth Payable', 'liability', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '2110');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '2120', 'Pag-IBIG Payable', 'liability', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '2120');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '2130', 'Withholding Tax Payable', 'liability', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '2130');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '5310', 'Payroll Tax Expense (Employer Share)', 'expense', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '5310');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '5400', 'Depreciation Expense', 'expense', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '5400');

-- Update create_tenant() so every NEW company gets these accounts from day one.
create or replace function create_tenant(tenant_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  insert into tenants (name, owner_id) values (tenant_name, auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    (new_id, '1000', 'Cash', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
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
    (new_id, '5400', 'Depreciation Expense', 'expense', false);

  update profiles set tenant_id = new_id where id = auth.uid();
  return new_id;
end;
$$ language plpgsql security definer;
