-- ============================================================
-- Classroom ERP — migration 0025 (Manufacturing ERP, Phase 2, part 1: master data)
--
-- ADDITIVE ONLY — no Standard object is altered. Needs 0023 and 0024.
-- The one existing object replaced is create_mfg_company() (created in Phase 1, Manufacturing only):
-- same signature, it now also seeds the master-data defaults.
--
-- New tables (all in public, prefix mfg_, all with tenant_id → tenants on delete cascade):
--   mfg_uom, mfg_uom_conversions        units of measure and conversions
--   mfg_storage_locations               RM store, shop floor (WIP), FG store, quarantine
--   mfg_item_master                     Manufacturing attributes of an `items` row (1:1)
--   mfg_cost_centers, mfg_work_centers, mfg_holidays
--   mfg_activity_types, mfg_activity_rates   planned rates per work center, activity and period
--   mfg_costing_sheet                   overhead surcharges used by the cost roll-up (Phase 3)
--   mfg_boms, mfg_bom_items             bills of materials     (written only by functions, see 0026)
--   mfg_routings, mfg_routing_ops       routings               (written only by functions, see 0026)
-- New functions: mfg__my_tenant, mfg_assign_number, mfg_wc_number, mfg_seed_master_data, mfg_convert_qty,
--   mfg_save_item, mfg_delete_item, mfg_set_account, mfg_activity_rate.
--
-- ROLLBACK (drops only what this file created; Standard objects are never touched):
--   drop function if exists mfg_activity_rate(uuid, uuid, date);
--   drop function if exists mfg_set_account(uuid, text, uuid);
--   drop function if exists mfg_delete_item(uuid);
--   drop function if exists mfg_save_item(uuid, jsonb);
--   drop function if exists mfg_convert_qty(uuid, uuid, numeric, text, text);
--   drop function if exists mfg_seed_master_data(uuid);
--   drop function if exists mfg_assign_number();
--   drop function if exists mfg_wc_number();
--   drop function if exists mfg__my_tenant();
--   drop table if exists mfg_routing_ops, mfg_routings, mfg_bom_items, mfg_boms, mfg_costing_sheet,
--     mfg_activity_rates, mfg_activity_types, mfg_holidays, mfg_work_centers, mfg_cost_centers,
--     mfg_item_master, mfg_storage_locations, mfg_uom_conversions, mfg_uom;
--   (then restore create_mfg_company() from migration 0024)
-- ============================================================

-- ---------- small helpers ----------
-- The company a Manufacturing student is working in. Teachers look but do not change a student's data.
create or replace function mfg__my_tenant()
returns uuid as $$
declare
  t uuid := my_tenant_id();
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers can look at a student''s master data but not change it.'; end if;
  if t is null then raise exception 'Choose a company first.'; end if;
  perform assert_mfg_tenant(t);
  return t;
end;
$$ language plpgsql stable security definer set search_path = public;

-- Row-level security for a Manufacturing table: the owner reads (and optionally writes) their own
-- company, the teacher reads everything, and only in a Manufacturing company. Dropped again below.
create or replace function mfg__enable_rls(p_table text, p_client_writable boolean)
returns void as $$
begin
  execute format('alter table %I enable row level security', p_table);
  execute format('drop policy if exists "mfg read" on %I', p_table);
  execute format($f$create policy "mfg read" on %I for select
    using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, p_table);
  if p_client_writable then
    execute format('drop policy if exists "mfg write" on %I', p_table);
    execute format($f$create policy "mfg write" on %I for all
      using (tenant_id = my_tenant_id() and not is_teacher() and tenant_edition(tenant_id) = 'MANUFACTURING')
      with check (tenant_id = my_tenant_id() and not is_teacher() and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, p_table);
  end if;
end;
$$ language plpgsql set search_path = public;

-- ---------- units of measure ----------
create table if not exists mfg_uom (
  tenant_id uuid not null references tenants(id) on delete cascade,
  code      text not null check (code = upper(code) and length(code) between 1 and 12),
  name      text not null,
  primary key (tenant_id, code)
);
select mfg__enable_rls('mfg_uom', true);

create table if not exists mfg_uom_conversions (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id   uuid references items(id) on delete cascade,           -- null = applies to every item
  from_uom  text not null,
  to_uom    text not null,
  factor    numeric(18, 6) not null check (factor > 0),            -- 1 from_uom = factor to_uom
  check (from_uom <> to_uom),
  foreign key (tenant_id, from_uom) references mfg_uom (tenant_id, code),
  foreign key (tenant_id, to_uom) references mfg_uom (tenant_id, code)
);
create unique index if not exists mfg_uom_conversions_unique
  on mfg_uom_conversions (tenant_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), from_uom, to_uom);
select mfg__enable_rls('mfg_uom_conversions', true);

-- ---------- storage locations ----------
create table if not exists mfg_storage_locations (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code      text not null,
  name      text not null,
  kind      text not null check (kind in ('RM', 'WIP', 'FG', 'QUARANTINE')),
  unique (tenant_id, code)
);
select mfg__enable_rls('mfg_storage_locations', true);

-- ---------- item master (Manufacturing attributes of an `items` row) ----------
create table if not exists mfg_item_master (
  item_id               uuid primary key references items(id) on delete cascade,
  tenant_id             uuid not null references tenants(id) on delete cascade,
  item_type             text not null check (item_type in ('RAW', 'SEMI', 'FINISHED', 'PACKAGING', 'SERVICE')),
  make_or_buy           text not null check (make_or_buy in ('MAKE', 'BUY')),
  base_uom              text not null,
  procurement_lead_days int not null default 0 check (procurement_lead_days >= 0),
  production_lead_days  int not null default 0 check (production_lead_days >= 0),
  lot_rule              text not null default 'LOT_FOR_LOT' check (lot_rule in ('LOT_FOR_LOT', 'FIXED', 'EOQ', 'MIN_MAX', 'PERIODIC')),
  lot_size              numeric(18, 4) not null default 0 check (lot_size >= 0),
  min_lot               numeric(18, 4) not null default 0 check (min_lot >= 0),
  max_lot               numeric(18, 4) not null default 0 check (max_lot >= 0),
  safety_stock          numeric(18, 4) not null default 0 check (safety_stock >= 0),
  scrap_pct             numeric(7, 3) not null default 0 check (scrap_pct >= 0 and scrap_pct < 100),
  batch_tracked         boolean not null default false,
  default_location_id   uuid references mfg_storage_locations(id),
  low_level_code        int not null default 0,                      -- maintained by mfg_recalc_low_level() in 0026
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  foreign key (tenant_id, base_uom) references mfg_uom (tenant_id, code),
  check (lot_rule <> 'FIXED' or lot_size > 0),
  check (lot_rule <> 'MIN_MAX' or max_lot >= min_lot)
);
create index if not exists mfg_item_master_tenant_idx on mfg_item_master (tenant_id, item_type);
select mfg__enable_rls('mfg_item_master', false);   -- written by mfg_save_item() only

-- ---------- cost centers, work centers, calendar ----------
create table if not exists mfg_cost_centers (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code      text not null,
  name      text not null,
  unique (tenant_id, code)
);
select mfg__enable_rls('mfg_cost_centers', true);

create table if not exists mfg_work_centers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  document_number   text,                                            -- WC-0001, assigned automatically
  code              text,
  name              text not null,
  cost_center_id    uuid references mfg_cost_centers(id),
  shifts            int not null default 1 check (shifts between 1 and 3),
  hours_per_shift   numeric(5, 2) not null default 8 check (hours_per_shift > 0 and hours_per_shift <= 24),
  utilization_pct   numeric(6, 2) not null default 85 check (utilization_pct > 0 and utilization_pct <= 100),
  efficiency_pct    numeric(6, 2) not null default 100 check (efficiency_pct > 0 and efficiency_pct <= 200),
  working_days      int[] not null default '{1,2,3,4,5}',             -- 1 = Monday … 7 = Sunday
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  check (working_days <@ array[1,2,3,4,5,6,7])
);
create unique index if not exists mfg_work_centers_code_unique on mfg_work_centers (tenant_id, lower(code));
select mfg__enable_rls('mfg_work_centers', true);

create table if not exists mfg_holidays (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  holiday_date date not null,
  name         text not null,
  unique (tenant_id, holiday_date)
);
select mfg__enable_rls('mfg_holidays', true);

-- ---------- activity types and planned rates ----------
create table if not exists mfg_activity_types (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code      text not null,
  name      text not null,
  kind      text not null check (kind in ('LABOR', 'MACHINE', 'SETUP')),
  unique (tenant_id, code)
);
select mfg__enable_rls('mfg_activity_types', true);

create table if not exists mfg_activity_rates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  work_center_id   uuid not null references mfg_work_centers(id) on delete cascade,
  activity_type_id uuid not null references mfg_activity_types(id),
  period_start     date not null check (extract(day from period_start) = 1),   -- the first of a month
  rate             numeric(18, 6) not null check (rate >= 0),                  -- ₱ per hour
  unique (work_center_id, activity_type_id, period_start)
);
create index if not exists mfg_activity_rates_wc_idx on mfg_activity_rates (work_center_id);
select mfg__enable_rls('mfg_activity_rates', true);

-- ---------- overhead costing sheet ----------
create table if not exists mfg_costing_sheet (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  kind             text not null check (kind in ('VARIABLE', 'FIXED')),
  base             text not null check (base in ('MATERIAL', 'LABOR', 'BOTH')),
  oh_pct           numeric(8, 3) not null default 0 check (oh_pct >= 0 and oh_pct <= 1000),
  oh_rate_per_hour numeric(18, 6) not null default 0 check (oh_rate_per_hour >= 0),
  active           boolean not null default true,
  unique (tenant_id, name)
);
select mfg__enable_rls('mfg_costing_sheet', true);

-- ---------- bills of materials and routings (functions write these; see 0026) ----------
create table if not exists mfg_boms (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_number text,                                              -- BOM-0001
  item_id         uuid not null references items(id),
  version         int not null check (version >= 1),
  alt_no          int not null default 1 check (alt_no >= 1),
  base_qty        numeric(18, 4) not null default 1 check (base_qty > 0),
  valid_from      date not null default current_date,
  valid_to        date,
  status          text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'OBSOLETE')),
  description     text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (tenant_id, item_id, alt_no, version),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists mfg_boms_item_idx on mfg_boms (tenant_id, item_id, status);
select mfg__enable_rls('mfg_boms', false);

create table if not exists mfg_bom_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  bom_id            uuid not null references mfg_boms(id) on delete cascade,
  line_no           int not null check (line_no > 0),
  component_item_id uuid not null references items(id),
  qty               numeric(18, 4) not null check (qty > 0),
  uom               text not null,
  scrap_pct         numeric(7, 3) not null default 0 check (scrap_pct >= 0 and scrap_pct < 100),
  is_phantom        boolean not null default false,
  kind              text not null default 'COMPONENT' check (kind in ('COMPONENT', 'COPRODUCT', 'BYPRODUCT')),
  cost_share_pct    numeric(7, 3) not null default 0 check (cost_share_pct >= 0 and cost_share_pct <= 100),
  unique (bom_id, line_no),
  foreign key (tenant_id, uom) references mfg_uom (tenant_id, code)
);
create index if not exists mfg_bom_items_component_idx on mfg_bom_items (tenant_id, component_item_id);
create index if not exists mfg_bom_items_bom_idx on mfg_bom_items (bom_id);
select mfg__enable_rls('mfg_bom_items', false);

create table if not exists mfg_routings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_number text,                                              -- RTG-0001
  item_id         uuid not null references items(id),
  version         int not null check (version >= 1),
  alt_no          int not null default 1 check (alt_no >= 1),
  status          text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'OBSOLETE')),
  description     text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (tenant_id, item_id, alt_no, version)
);
-- only one active routing per item and alternative
create unique index if not exists mfg_routings_one_active
  on mfg_routings (tenant_id, item_id, alt_no) where status = 'ACTIVE';
select mfg__enable_rls('mfg_routings', false);

create table if not exists mfg_routing_ops (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  routing_id         uuid not null references mfg_routings(id) on delete cascade,
  op_no              int not null check (op_no > 0),
  description        text,
  work_center_id     uuid not null references mfg_work_centers(id),
  setup_min          numeric(12, 3) not null default 0 check (setup_min >= 0),
  run_min_per_unit   numeric(12, 4) not null default 0 check (run_min_per_unit >= 0),
  teardown_min       numeric(12, 3) not null default 0 check (teardown_min >= 0),
  queue_min          numeric(12, 3) not null default 0 check (queue_min >= 0),
  move_min           numeric(12, 3) not null default 0 check (move_min >= 0),
  control_key        text not null default 'PP01' check (control_key in ('PP01', 'PP02', 'PP03')),
  component_line_nos int[] not null default '{}',
  unique (routing_id, op_no)
);
create index if not exists mfg_routing_ops_wc_idx on mfg_routing_ops (work_center_id);
select mfg__enable_rls('mfg_routing_ops', false);

drop function mfg__enable_rls(text, boolean);

-- ---------- document numbers: BOM-, RTG-, WC- (reuses the Standard numbering function) ----------
create or replace function mfg_assign_number()
returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, tg_argv[0], tg_argv[1]);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_wc_number()
returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'work_center', 'WC');
  end if;
  if new.code is null or trim(new.code) = '' then new.code := new.document_number; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_bom_number on mfg_boms;
create trigger trg_mfg_bom_number before insert on mfg_boms
  for each row execute function mfg_assign_number('bom', 'BOM');
drop trigger if exists trg_mfg_routing_number on mfg_routings;
create trigger trg_mfg_routing_number before insert on mfg_routings
  for each row execute function mfg_assign_number('routing', 'RTG');
drop trigger if exists trg_mfg_wc_number on mfg_work_centers;
create trigger trg_mfg_wc_number before insert on mfg_work_centers
  for each row execute function mfg_wc_number();

-- ---------- defaults every Manufacturing company starts with ----------
create or replace function mfg_seed_master_data(tid uuid)
returns void as $$
begin
  insert into mfg_uom (tenant_id, code, name) values
    (tid, 'PC', 'Piece'), (tid, 'SET', 'Set'), (tid, 'BOX', 'Box'), (tid, 'PACK', 'Pack'), (tid, 'DOZ', 'Dozen'),
    (tid, 'KG', 'Kilogram'), (tid, 'G', 'Gram'), (tid, 'L', 'Liter'), (tid, 'ML', 'Milliliter'),
    (tid, 'M', 'Meter'), (tid, 'CM', 'Centimeter'), (tid, 'BF', 'Board foot'), (tid, 'SQM', 'Square meter'), (tid, 'HR', 'Hour')
  on conflict do nothing;
  insert into mfg_storage_locations (tenant_id, code, name, kind) values
    (tid, 'RM-STORE', 'Raw Material Store', 'RM'), (tid, 'SHOP-FLOOR', 'Shop Floor (WIP)', 'WIP'),
    (tid, 'FG-STORE', 'Finished Goods Store', 'FG'), (tid, 'QUARANTINE', 'Quarantine', 'QUARANTINE')
  on conflict do nothing;
  insert into mfg_activity_types (tenant_id, code, name, kind) values
    (tid, 'LABOR', 'Direct labor', 'LABOR'), (tid, 'MACHINE', 'Machine time', 'MACHINE'), (tid, 'SETUP', 'Setup', 'SETUP')
  on conflict do nothing;
  insert into mfg_cost_centers (tenant_id, code, name) values (tid, 'PROD', 'Production') on conflict do nothing;
  insert into mfg_costing_sheet (tenant_id, name, kind, base, oh_pct, oh_rate_per_hour) values
    (tid, 'Variable overhead', 'VARIABLE', 'MATERIAL', 0, 0),
    (tid, 'Fixed overhead', 'FIXED', 'LABOR', 0, 0)
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public;

-- Companies created before this migration get the same defaults.
do $$
declare r record;
begin
  for r in select tenant_id from tenant_editions where edition = 'MANUFACTURING' loop
    perform mfg_seed_master_data(r.tenant_id);
  end loop;
end $$;

-- create_mfg_company() (Phase 1, Manufacturing only): identical, plus the defaults above.
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

  perform mfg_seed_master_data(new_id);
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- unit conversion ----------
-- Converts p_qty of an item from one unit to another. An item-specific conversion wins over a general one,
-- and a conversion works in both directions. Same unit → unchanged. No conversion → a clear error.
create or replace function mfg_convert_qty(p_tenant uuid, p_item uuid, p_qty numeric, p_from text, p_to text)
returns numeric as $$
declare
  f numeric;
begin
  if p_from = p_to then return p_qty; end if;
  select factor into f from mfg_uom_conversions
   where tenant_id = p_tenant and from_uom = p_from and to_uom = p_to and (item_id = p_item or item_id is null)
   order by (item_id is null) limit 1;
  if f is not null then return p_qty * f; end if;
  select factor into f from mfg_uom_conversions
   where tenant_id = p_tenant and from_uom = p_to and to_uom = p_from and (item_id = p_item or item_id is null)
   order by (item_id is null) limit 1;
  if f is not null then return p_qty / f; end if;
  raise exception 'There is no unit conversion from % to % for this item. Add one under Master Data → Units of measure.', p_from, p_to;
end;
$$ language plpgsql stable set search_path = public;   -- runs as the caller, so row-level security applies

-- ---------- items ----------
-- Creates (p_item_id null) or updates an item and its Manufacturing attributes together.
-- The Standard `items` row keeps quantity and cost at 0 here: real stock lives in Manufacturing's own
-- stock tables (Phase 4) and is mirrored into `items` by the stock functions.
create or replace function mfg_save_item(p_item_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_name text := trim(coalesce(p_data->>'name', ''));
  v_sku text := trim(coalesce(p_data->>'sku', ''));
  v_uom text := coalesce(p_data->>'base_uom', '');
  v_type text := coalesce(p_data->>'item_type', '');
  v_mob text := coalesce(p_data->>'make_or_buy', '');
  v_rule text := coalesce(nullif(p_data->>'lot_rule', ''), 'LOT_FOR_LOT');
  v_lot numeric := coalesce(nullif(p_data->>'lot_size', '')::numeric, 0);
  v_min numeric := coalesce(nullif(p_data->>'min_lot', '')::numeric, 0);
  v_max numeric := coalesce(nullif(p_data->>'max_lot', '')::numeric, 0);
  v_loc uuid := nullif(p_data->>'default_location_id', '')::uuid;
  v_id uuid;
begin
  if v_name = '' then raise exception 'Give the item a name.'; end if;
  if v_sku = '' then raise exception 'Give the item a SKU or code.'; end if;
  if v_type not in ('RAW', 'SEMI', 'FINISHED', 'PACKAGING', 'SERVICE') then raise exception 'Choose an item type.'; end if;
  if v_mob not in ('MAKE', 'BUY') then raise exception 'Choose whether the item is made or bought.'; end if;
  if not exists (select 1 from mfg_uom where tenant_id = v_t and code = v_uom) then raise exception 'Choose a unit of measure.'; end if;
  if v_rule = 'FIXED' and v_lot <= 0 then raise exception 'A fixed lot size needs a lot size above zero.'; end if;
  if v_rule = 'MIN_MAX' and v_max < v_min then raise exception 'The maximum lot size can''t be below the minimum.'; end if;
  if v_loc is not null and not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t) then
    raise exception 'That storage location isn''t in your company.';
  end if;

  if p_item_id is null then
    if exists (select 1 from items where tenant_id = v_t and lower(sku) = lower(v_sku)) then raise exception 'An item with the SKU "%" already exists.', v_sku; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(name) = lower(v_name)) then raise exception 'An item named "%" already exists.', v_name; end if;
    insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point)
    values (v_t, v_sku, v_name, 0, 0, coalesce(nullif(p_data->>'reorder_point', '')::numeric, 0)) returning id into v_id;
    insert into mfg_item_master (item_id, tenant_id, item_type, make_or_buy, base_uom, procurement_lead_days, production_lead_days,
      lot_rule, lot_size, min_lot, max_lot, safety_stock, scrap_pct, batch_tracked, default_location_id)
    values (v_id, v_t, v_type, v_mob, v_uom,
      coalesce(nullif(p_data->>'procurement_lead_days', '')::int, 0), coalesce(nullif(p_data->>'production_lead_days', '')::int, 0),
      v_rule, v_lot, v_min, v_max, coalesce(nullif(p_data->>'safety_stock', '')::numeric, 0),
      coalesce(nullif(p_data->>'scrap_pct', '')::numeric, 0), coalesce((p_data->>'batch_tracked')::boolean, false), v_loc);
  else
    if not exists (select 1 from mfg_item_master where item_id = p_item_id and tenant_id = v_t) then raise exception 'That item was not found.'; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(sku) = lower(v_sku) and id <> p_item_id) then raise exception 'An item with the SKU "%" already exists.', v_sku; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(name) = lower(v_name) and id <> p_item_id) then raise exception 'An item named "%" already exists.', v_name; end if;
    v_id := p_item_id;
    update items set sku = v_sku, name = v_name, reorder_point = coalesce(nullif(p_data->>'reorder_point', '')::numeric, reorder_point) where id = v_id;
    update mfg_item_master set item_type = v_type, make_or_buy = v_mob, base_uom = v_uom,
      procurement_lead_days = coalesce(nullif(p_data->>'procurement_lead_days', '')::int, 0),
      production_lead_days = coalesce(nullif(p_data->>'production_lead_days', '')::int, 0),
      lot_rule = v_rule, lot_size = v_lot, min_lot = v_min, max_lot = v_max,
      safety_stock = coalesce(nullif(p_data->>'safety_stock', '')::numeric, 0),
      scrap_pct = coalesce(nullif(p_data->>'scrap_pct', '')::numeric, 0),
      batch_tracked = coalesce((p_data->>'batch_tracked')::boolean, false),
      default_location_id = v_loc,
      active = coalesce((p_data->>'active')::boolean, active)
    where item_id = v_id;
  end if;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- An item that appears on a BOM, a routing, stock or a sales document can't be deleted — make it inactive instead.
create or replace function mfg_delete_item(p_item_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_name text;
begin
  select i.name into v_name from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item_id and i.tenant_id = v_t;
  if v_name is null then raise exception 'That item was not found.'; end if;
  if exists (select 1 from mfg_boms where item_id = p_item_id) or exists (select 1 from mfg_bom_items where component_item_id = p_item_id) then
    raise exception '"%" is on a bill of materials, so it can''t be deleted. Mark it inactive instead.', v_name;
  end if;
  if exists (select 1 from mfg_routings where item_id = p_item_id) then
    raise exception '"%" has a routing, so it can''t be deleted. Mark it inactive instead.', v_name;
  end if;
  if exists (select 1 from items where id = p_item_id and qty_on_hand <> 0) then
    raise exception '"%" still has stock on hand, so it can''t be deleted.', v_name;
  end if;
  if exists (select 1 from invoice_lines where item_id = p_item_id) or exists (select 1 from quote_lines where item_id = p_item_id)
     or exists (select 1 from sales_order_lines where item_id = p_item_id) then
    raise exception '"%" is on a sales document, so it can''t be deleted. Mark it inactive instead.', v_name;
  end if;
  delete from items where id = p_item_id;     -- the item master row goes with it
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- account determination (teacher only) ----------
create or replace function mfg_set_account(p_tenant uuid, p_key text, p_account uuid)
returns void as $$
declare
  v_old uuid;
  v_type text;
  v_want text;
  v_acc_name text;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change which account a posting uses.'; end if;
  perform assert_mfg_tenant(p_tenant);
  select account_id into v_old from mfg_account_determination where tenant_id = p_tenant and key = p_key;
  if v_old is null then raise exception 'Unknown posting type "%".', p_key; end if;
  select type, code || ' ' || name into v_type, v_acc_name from accounts where id = p_account and tenant_id = p_tenant;
  if v_type is null then raise exception 'That account isn''t in this company.'; end if;

  v_want := case
    when p_key in ('RM_INVENTORY', 'WIP', 'FG_INVENTORY', 'PACKAGING_INVENTORY') then 'asset'
    when p_key = 'GR_IR' then 'liability'
    else 'expense' end;
  if v_type <> v_want then
    raise exception '"%" is % account, but % needs % account.', v_acc_name,
      case v_type when 'asset' then 'an asset' when 'expense' then 'an expense' else 'a ' || v_type end, p_key,
      case v_want when 'asset' then 'an asset' when 'expense' then 'an expense' else 'a ' || v_want end;
  end if;

  update mfg_account_determination set account_id = p_account where tenant_id = p_tenant and key = p_key;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'account_determination_changed',
          jsonb_build_object('key', p_key, 'from_account', v_old, 'to_account', p_account), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- planned activity rate for a date ----------
-- The rate in force on a date is the latest one whose period started on or before it.
create or replace function mfg_activity_rate(p_work_center uuid, p_activity uuid, p_date date)
returns numeric as $$
  select rate from mfg_activity_rates
   where work_center_id = p_work_center and activity_type_id = p_activity and period_start <= p_date
   order by period_start desc limit 1;
$$ language sql stable set search_path = public;   -- runs as the caller, so row-level security applies

-- ---------- who may call what ----------
revoke execute on function mfg__my_tenant() from public, anon;
revoke execute on function mfg_assign_number() from public, anon;
revoke execute on function mfg_wc_number() from public, anon;
revoke execute on function mfg_seed_master_data(uuid) from public, anon, authenticated;   -- internal: called by create_mfg_company
revoke execute on function mfg_convert_qty(uuid, uuid, numeric, text, text) from public, anon;
revoke execute on function mfg_save_item(uuid, jsonb) from public, anon;
revoke execute on function mfg_delete_item(uuid) from public, anon;
revoke execute on function mfg_set_account(uuid, text, uuid) from public, anon;
revoke execute on function mfg_activity_rate(uuid, uuid, date) from public, anon;
grant execute on function mfg__my_tenant() to authenticated;
grant execute on function mfg_convert_qty(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function mfg_save_item(uuid, jsonb) to authenticated;
grant execute on function mfg_delete_item(uuid) to authenticated;
grant execute on function mfg_set_account(uuid, text, uuid) to authenticated;
grant execute on function mfg_activity_rate(uuid, uuid, date) to authenticated;
revoke execute on function create_mfg_company(text, date, text) from public, anon;
grant execute on function create_mfg_company(text, date, text) to authenticated;
