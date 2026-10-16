-- ============================================================
-- Classroom ERP — migration 0024 (Manufacturing ERP, Phase 1, part 2)
--
-- ADDITIVE ONLY. Needs 0023.
--
--   mfg_account_determination  which GL account each posting type uses, per company
--                              (no posting function will hard-code an account number)
--   mfg_account(tenant, key)   looks one up
--   create_mfg_company(...)    what the setup wizard calls: creates the company, seeds the
--                              manufacturing chart of accounts and the determination table
--
-- The manufacturing chart KEEPS the Standard codes (1000, 1100, 1150, 1160, 1200, 2000, 2100–2130,
-- 2200, 3000, 4000, 5000, 5100, 5200, 5300, 5310, 5320, 5400, 1500, 1590) because the reused
-- Standard functions (payments, payroll, depreciation, invoices) look those codes up. It adds 19.
--
-- ROLLBACK:
--   drop function if exists create_mfg_company(text, date, text);
--   drop function if exists mfg_account(uuid, text);
--   drop table if exists mfg_account_determination;
-- ============================================================

create table if not exists mfg_account_determination (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  key        text not null,
  account_id uuid not null references accounts(id) on delete cascade,
  primary key (tenant_id, key)
);
create index if not exists mfg_account_determination_account_idx on mfg_account_determination (account_id);

alter table mfg_account_determination enable row level security;
drop policy if exists "mfg determination read" on mfg_account_determination;
create policy "mfg determination read" on mfg_account_determination for select using (
  (tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING'
);
-- Changes arrive in Phase 2 (a teacher-only screen); until then the seeded defaults stand.

create or replace function mfg_account(tid uuid, determination_key text)
returns uuid as $$
declare
  acc uuid;
begin
  select account_id into acc from mfg_account_determination where tenant_id = tid and key = determination_key;
  if acc is null then
    raise exception 'No account is set up for "%" in this company.', determination_key;
  end if;
  return acc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function create_mfg_company(company_name text, fiscal_year_start date, costing_method text)
returns uuid as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers don''t own companies — students create them.'; end if;
  if coalesce(trim(company_name), '') = '' then raise exception 'Enter a company name.'; end if;
  if costing_method not in ('STANDARD', 'ACTUAL') then raise exception 'Choose standard or actual costing.'; end if;
  if fiscal_year_start is null then raise exception 'Choose the date your fiscal year starts.'; end if;
  if coalesce((select enabled from edition_settings where edition = 'MANUFACTURING'), false) = false then
    raise exception 'The Manufacturing ERP has not been opened by your teacher yet.';
  end if;
  if exists (select 1 from tenant_editions where owner_id = auth.uid() and edition = 'MANUFACTURING') then
    raise exception 'You already have a Manufacturing company.';
  end if;

  insert into tenants (name, owner_id) values (trim(company_name), auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    -- the Standard codes, unchanged (1200 is renamed for what it holds here)
    (new_id, '1000', 'Cash', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
    (new_id, '1150', 'Employee Loans Receivable', 'asset', false),
    (new_id, '1160', 'Input Tax (VAT)', 'asset', false),
    (new_id, '1200', 'Raw Materials Inventory', 'asset', false),
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
    (new_id, '5400', 'Depreciation Expense', 'expense', false),
    -- manufacturing additions
    (new_id, '1210', 'Work in Process', 'asset', false),
    (new_id, '1220', 'Finished Goods Inventory', 'asset', false),
    (new_id, '1230', 'Packaging & Supplies', 'asset', false),
    (new_id, '2050', 'Goods Received / Invoice Received (GR/IR)', 'liability', false),
    (new_id, '4100', 'By-product & Scrap Sales', 'revenue', false),
    (new_id, '5500', 'Purchase Price Variance', 'expense', false),
    (new_id, '5510', 'Material Usage Variance', 'expense', false),
    (new_id, '5520', 'Labor Efficiency Variance', 'expense', false),
    (new_id, '5530', 'Labor Rate Variance', 'expense', false),
    (new_id, '5540', 'Machine / Variable Overhead Variance', 'expense', false),
    (new_id, '5550', 'Fixed Overhead Volume Variance', 'expense', false),
    (new_id, '5560', 'Scrap & Rework Loss', 'expense', false),
    (new_id, '5570', 'Lot-size & Mix Variance', 'expense', false),
    (new_id, '5580', 'Inventory Revaluation', 'expense', false),
    (new_id, '5590', 'Rounding Differences', 'expense', false),
    (new_id, '5600', 'Cost of Poor Quality', 'expense', false),
    (new_id, '5700', 'Applied Direct Labor', 'expense', false),
    (new_id, '5710', 'Applied Machine Overhead', 'expense', false),
    (new_id, '5720', 'Applied Fixed Overhead', 'expense', false);

  insert into mfg_account_determination (tenant_id, key, account_id)
  select new_id, m.key, a.id
    from (values
      ('RM_INVENTORY', '1200'), ('WIP', '1210'), ('FG_INVENTORY', '1220'), ('PACKAGING_INVENTORY', '1230'),
      ('GR_IR', '2050'), ('PPV', '5500'),
      ('APPLIED_LABOR', '5700'), ('APPLIED_MACHINE', '5710'), ('APPLIED_FIXED_OH', '5720'),
      ('MATERIAL_USAGE_VAR', '5510'), ('LABOR_EFF_VAR', '5520'), ('LABOR_RATE_VAR', '5530'),
      ('MACHINE_OH_VAR', '5540'), ('FIXED_OH_VAR', '5550'), ('SCRAP_VAR', '5560'),
      ('LOT_SIZE_VAR', '5570'), ('MIX_VAR', '5570'), ('REVALUATION', '5580'), ('ROUNDING', '5590'),
      ('COGS', '5000'), ('SCRAP_LOSS', '5560'), ('COPQ', '5600'), ('PAYROLL_EXPENSE', '5300')
    ) as m(key, code)
    join accounts a on a.tenant_id = new_id and a.code = m.code;

  insert into tenant_editions (tenant_id, edition, owner_id) values (new_id, 'MANUFACTURING', auth.uid());
  insert into mfg_company_settings (tenant_id, costing_method, fiscal_year_start)
    values (new_id, costing_method, fiscal_year_start);
  insert into memberships (user_id, tenant_id) values (auth.uid(), new_id) on conflict do nothing;
  update profiles set tenant_id = new_id where id = auth.uid();
  insert into edition_last_used (user_id, edition, tenant_id) values (auth.uid(), 'MANUFACTURING', new_id)
    on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = now();
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
    values (new_id, 'company_created', jsonb_build_object('costing_method', costing_method, 'fiscal_year_start', fiscal_year_start), auth.uid());

  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_account(uuid, text) from public, anon;
revoke execute on function create_mfg_company(text, date, text) from public, anon;
grant execute on function mfg_account(uuid, text) to authenticated;
grant execute on function create_mfg_company(text, date, text) to authenticated;
