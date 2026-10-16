-- ============================================================
-- Classroom ERP — migration 0029 (Manufacturing ERP, before Phase 4a: yield fix and two database guards)
--
-- Needs 0023–0028. Everything here is additive EXCEPT two triggers on the existing table journal_lines, which the
-- user approved (decisions Q-A and Q-B in MANUFACTURING_RECONCILIATION.md §8). Both were checked against the live
-- ledger first: 638 entries, 0 unbalanced, 0 without lines, 0 negative amounts.
--
--  A. One quantity rule for BOM explosion and costing
--     * mfg_boms.yield_pct (recipe-level expected yield, default 100)
--     * mfg_yield_factor(bom) = (1 − item scrap %) × yield %; start quantity = good quantity ÷ factor
--     * mfg__explode, mfg__cost_item, mfg__cost_bom (phantom branch) and mfg_save_bom / mfg_copy_bom now all use it
--       (before this, explosion ignored the item's own scrap % and costing applied it)
--  B. Q-A  Every journal entry must balance. A deferred constraint trigger on journal_lines checks the entry's
--     debit and credit totals when the transaction commits. Tolerance is half a centavo, because amounts that
--     reach the database from the browser can carry floating-point dust; Manufacturing postings go through
--     mfg__post_entry (migration 0030), which is exact to the centavo.
--  C. Q-B  Manufacturing companies refuse MANUAL journal lines on control accounts (inventory, WIP, GR/IR,
--     applied labor/overhead). A manual entry is one with no source document. Standard companies are untouched.
--  D. Extra posting keys: OPENING_EQUITY (3000) and INVENTORY_DIFF (new account 5610 Inventory Count Differences),
--     and the company setting allow_negative_stock (teacher-set).
--
-- ROLLBACK:
--   drop trigger if exists trg_mfg_control_accounts on journal_lines;
--   drop trigger if exists trg_journal_balanced on journal_lines;
--   drop function if exists guard_mfg_control_accounts(), check_journal_balanced(), set_mfg_negative_stock(uuid, boolean),
--     mfg_seed_extra(uuid), mfg_yield_factor(uuid);
--   alter table mfg_company_settings drop column allow_negative_stock;
--   alter table mfg_boms drop column yield_pct;
--   (then restore mfg__explode, mfg__cost_item, mfg__cost_bom, mfg_save_bom, mfg_copy_bom, mfg_set_account and
--    mfg_seed_master_data from migrations 0025, 0026 and 0028)
-- ============================================================

-- ---------- A. yield ----------
alter table mfg_boms add column if not exists yield_pct numeric(7, 3) not null default 100 check (yield_pct > 0 and yield_pct <= 100);

create or replace function mfg_yield_factor(p_bom uuid)
returns numeric as $$
  select round((1 - m.scrap_pct / 100) * (b.yield_pct / 100), 12)
    from mfg_boms b join mfg_item_master m on m.item_id = b.item_id
   where b.id = p_bom;
$$ language sql stable set search_path = public;

create or replace function mfg__explode(
  p_tenant uuid, p_bom uuid, p_qty numeric, p_date date, p_level int, p_path text, p_ancestors uuid[], p_max int,
  out o_level int, out o_path text, out o_item_id uuid, out o_parent_item_id uuid, out o_line_no int,
  out o_qty numeric, out o_uom text, out o_base_qty numeric, out o_base_uom text, out o_scrap_pct numeric,
  out o_is_phantom boolean, out o_has_bom boolean, out o_bom_id uuid)
returns setof record as $$
declare
  v_parent uuid;
  v_base numeric;
  v_start numeric;
  l record;
  v_child_bom uuid;
begin
  select item_id, base_qty into v_parent, v_base from mfg_boms where id = p_bom;
  v_start := round(p_qty / mfg_yield_factor(p_bom), 6);      -- good quantity ÷ yield = quantity to start
  for l in select bi.*, m.base_uom as comp_uom from mfg_bom_items bi
             join mfg_item_master m on m.item_id = bi.component_item_id
            where bi.bom_id = p_bom and bi.kind = 'COMPONENT' order by bi.line_no loop
    if l.component_item_id = any (p_ancestors) then
      raise exception 'This structure loops back on itself at one of its components.';
    end if;
    o_level := p_level;
    o_path := case when p_path = '' then l.line_no::text else p_path || '.' || l.line_no end;
    o_item_id := l.component_item_id;
    o_parent_item_id := v_parent;
    o_line_no := l.line_no;
    o_qty := round(v_start / v_base * l.qty * (1 + l.scrap_pct / 100), 6);          -- in the line's own unit
    o_uom := l.uom;
    o_base_qty := round(mfg_convert_qty(p_tenant, l.component_item_id, o_qty, l.uom, l.comp_uom), 6);
    o_base_uom := l.comp_uom;
    o_scrap_pct := l.scrap_pct;
    o_is_phantom := l.is_phantom;
    v_child_bom := mfg_active_bom(p_tenant, l.component_item_id, p_date, 1);
    o_has_bom := v_child_bom is not null;
    o_bom_id := v_child_bom;
    if l.is_phantom and v_child_bom is null then
      raise exception 'A phantom component has no active bill of materials to pass through.';
    end if;
    return next;
    if v_child_bom is not null and p_level < p_max then
      return query select * from mfg__explode(p_tenant, v_child_bom, o_base_qty, p_date, p_level + 1, o_path,
                                              p_ancestors || l.component_item_id, p_max);
    end if;
  end loop;
end;
$$ language plpgsql stable set search_path = public;

create or replace function mfg__cost_bom(
  p_est uuid, p_tenant uuid, p_owner uuid, p_bom uuid, p_qty numeric, p_date date, p_level int, p_ancestors uuid[],
  out o_mat numeric, out o_sub numeric)
as $$
declare
  v_base numeric;
  l record;
  r record;
  v_need numeric;
  v_comp_bom uuid;
  v_price numeric;
  v_amount numeric;
begin
  o_mat := 0; o_sub := 0;
  select base_qty into v_base from mfg_boms where id = p_bom;
  for l in select bi.*, m.base_uom as comp_uom, m.make_or_buy, m.planned_price, m.price_unit, i.name as comp_name
             from mfg_bom_items bi
             join mfg_item_master m on m.item_id = bi.component_item_id
             join items i on i.id = bi.component_item_id
            where bi.bom_id = p_bom and bi.kind = 'COMPONENT' order by bi.line_no loop
    if l.component_item_id = any (p_ancestors) then
      raise exception 'This structure loops back on itself at "%".', l.comp_name;
    end if;
    v_need := round(mfg_convert_qty(p_tenant, l.component_item_id, p_qty / v_base * l.qty * (1 + l.scrap_pct / 100), l.uom, l.comp_uom), 6);
    v_comp_bom := mfg_active_bom(p_tenant, l.component_item_id, p_date, 1);

    if l.is_phantom then
      if v_comp_bom is null then
        perform mfg__cost_warn(p_est, 'The phantom "' || l.comp_name || '" has no active bill of materials, so its parts are not costed.');
      else
        select * into r from mfg__cost_bom(p_est, p_tenant, p_owner, v_comp_bom, round(v_need / mfg_yield_factor(v_comp_bom), 6),
                                           p_date, p_level, p_ancestors || l.component_item_id);
        o_mat := o_mat + r.o_mat; o_sub := o_sub + r.o_sub;
      end if;
    elsif l.make_or_buy = 'MAKE' and v_comp_bom is not null then
      o_sub := o_sub + mfg__cost_item(p_est, p_tenant, l.component_item_id, v_need, p_date, p_level + 1, 1, 1, p_ancestors || l.component_item_id);
    else
      if l.make_or_buy = 'MAKE' then
        perform mfg__cost_warn(p_est, '"' || l.comp_name || '" is made in-house but has no active bill of materials on this date, so it is costed at its planned price.');
      end if;
      if l.planned_price = 0 then
        perform mfg__cost_warn(p_est, '"' || l.comp_name || '" has no planned price, so it costs nothing in this estimate.');
      end if;
      v_price := l.planned_price / l.price_unit;
      v_amount := round(v_need * v_price, 6);
      perform mfg__cost_line(p_est, p_tenant, p_level, p_owner, l.component_item_id, null, null, 'MATERIAL', l.comp_name, v_need, l.comp_uom, v_price, v_amount);
      o_mat := o_mat + v_amount;
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg__cost_item(
  p_est uuid, p_tenant uuid, p_item uuid, p_qty numeric, p_date date, p_level int, p_bom_alt int, p_rt_alt int, p_ancestors uuid[])
returns numeric as $$
declare
  v_name text;
  v_bom uuid;
  v_rt uuid;
  v_start numeric;
  r record;
  op record;
  cs record;
  v_mat numeric; v_sub numeric;
  v_lab numeric := 0; v_mach numeric := 0; v_oh numeric := 0;
  v_lab_h numeric := 0; v_mach_h numeric := 0; v_setup_h numeric := 0;
  at_labor uuid; at_machine uuid; at_setup uuid;
  rate_l numeric; rate_m numeric; rate_s numeric;
  h numeric; amt numeric; base_amt numeric; hrs numeric;
  v_total numeric;
begin
  select i.name into v_name from items i where i.id = p_item;
  v_bom := mfg_active_bom(p_tenant, p_item, p_date, p_bom_alt);
  if v_bom is null then
    raise exception 'There is no active bill of materials for "%" on %.', v_name, to_char(p_date, 'Mon DD, YYYY');
  end if;
  v_start := round(p_qty / mfg_yield_factor(v_bom), 6);

  select * into r from mfg__cost_bom(p_est, p_tenant, p_item, v_bom, v_start, p_date, p_level, p_ancestors);
  v_mat := r.o_mat; v_sub := r.o_sub;

  select id into at_labor from mfg_activity_types where tenant_id = p_tenant and kind = 'LABOR' order by code limit 1;
  select id into at_machine from mfg_activity_types where tenant_id = p_tenant and kind = 'MACHINE' order by code limit 1;
  select id into at_setup from mfg_activity_types where tenant_id = p_tenant and kind = 'SETUP' order by code limit 1;

  select id into v_rt from mfg_routings where tenant_id = p_tenant and item_id = p_item and alt_no = p_rt_alt and status = 'ACTIVE';
  if v_rt is null then
    perform mfg__cost_warn(p_est, '"' || v_name || '" has no active routing, so no labor or machine cost is included for it.');
  else
    for op in select o.*, w.name as wc_name from mfg_routing_ops o join mfg_work_centers w on w.id = o.work_center_id
               where o.routing_id = v_rt order by o.op_no loop
      h := coalesce(op.labor_min_per_unit, case when op.machine_min_per_unit is null then op.run_min_per_unit else 0 end) * v_start / 60;
      hrs := coalesce(op.machine_min_per_unit, 0) * v_start / 60;
      rate_l := mfg_activity_rate(op.work_center_id, at_labor, p_date);
      rate_m := mfg_activity_rate(op.work_center_id, at_machine, p_date);
      rate_s := coalesce(mfg_activity_rate(op.work_center_id, at_setup, p_date), rate_l);

      if h > 0 then
        if rate_l is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned labor rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        amt := round(h * coalesce(rate_l, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'LABOR',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — labor', h, 'HR', coalesce(rate_l, 0), amt);
        v_lab := v_lab + amt; v_lab_h := v_lab_h + h;
      end if;
      if (op.setup_min + op.teardown_min) > 0 then
        if rate_s is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned setup or labor rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        h := (op.setup_min + op.teardown_min) / 60;
        amt := round(h * coalesce(rate_s, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'LABOR',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — setup and teardown', h, 'HR', coalesce(rate_s, 0), amt);
        v_lab := v_lab + amt; v_setup_h := v_setup_h + h;
      end if;
      if hrs > 0 then
        if rate_m is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned machine rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        amt := round(hrs * coalesce(rate_m, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'MACHINE',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — machine', hrs, 'HR', coalesce(rate_m, 0), amt);
        v_mach := v_mach + amt; v_mach_h := v_mach_h + hrs;
      end if;
    end loop;
  end if;

  for cs in select * from mfg_costing_sheet where tenant_id = p_tenant and active order by kind, name loop
    base_amt := case cs.base when 'MATERIAL' then v_mat when 'LABOR' then v_lab else v_mat + v_lab end;
    hrs := case cs.hour_basis when 'LABOR' then v_lab_h + v_setup_h else v_mach_h end;
    amt := round(base_amt * cs.oh_pct / 100 + hrs * cs.oh_rate_per_hour, 6);
    if amt <> 0 then
      perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, null, null, case cs.kind when 'FIXED' then 'FIX_OH' else 'VAR_OH' end,
        cs.name, case when cs.oh_rate_per_hour <> 0 then hrs else base_amt end, case when cs.oh_rate_per_hour <> 0 then 'HR' else null end,
        case when cs.oh_rate_per_hour <> 0 then cs.oh_rate_per_hour else cs.oh_pct end, amt);
      v_oh := v_oh + amt;
    end if;
  end loop;

  v_total := v_mat + v_sub + v_lab + v_mach + v_oh;
  insert into mfg_cost_estimate_items (estimate_id, tenant_id, item_id, level, qty, total_cost, unit_cost)
  values (p_est, p_tenant, p_item, p_level, p_qty, v_total, round(v_total / p_qty, 6))
  on conflict (estimate_id, item_id) do update
    set qty = mfg_cost_estimate_items.qty + excluded.qty,
        total_cost = mfg_cost_estimate_items.total_cost + excluded.total_cost,
        unit_cost = round((mfg_cost_estimate_items.total_cost + excluded.total_cost) / (mfg_cost_estimate_items.qty + excluded.qty), 6),
        level = greatest(mfg_cost_estimate_items.level, excluded.level);
  return v_total;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_save_bom(p_bom_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_item uuid; v_alt int; v_base numeric; v_from date; v_to date; v_desc text; v_yield numeric;
  v_id uuid; v_ver int; v_status text;
  v_line jsonb; v_n int := 0; v_components int := 0; v_share numeric := 0;
  v_comp uuid; v_qty numeric; v_uom text; v_kind text; v_cshare numeric; v_cbase text; v_cactive boolean; v_cname text;
begin
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') = 0 then
    raise exception 'Add at least one line to the bill of materials.';
  end if;

  if p_bom_id is null then
    v_item := nullif(p_data->>'item_id', '')::uuid;
    v_alt := coalesce(nullif(p_data->>'alt_no', '')::int, 1);
  else
    select item_id, alt_no, status into v_item, v_alt, v_status from mfg_boms where id = p_bom_id and tenant_id = v_t;
    if v_item is null then raise exception 'That bill of materials was not found.'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft can be edited. Copy this one to a new version first.'; end if;
  end if;
  if v_alt < 1 then raise exception 'The alternative number must be 1 or higher.'; end if;

  if not exists (select 1 from mfg_item_master where item_id = v_item and tenant_id = v_t and make_or_buy = 'MAKE') then
    raise exception 'Choose an item you make. Only items marked "Make" can have a bill of materials.';
  end if;
  v_base := coalesce(nullif(p_data->>'base_qty', '')::numeric, 1);
  if v_base <= 0 then raise exception 'The base quantity must be above zero.'; end if;
  v_yield := coalesce(nullif(p_data->>'yield_pct', '')::numeric, 100);
  if v_yield <= 0 or v_yield > 100 then raise exception 'The expected yield must be above 0 and at most 100 percent.'; end if;
  v_from := coalesce(nullif(p_data->>'valid_from', '')::date, current_date);
  v_to := nullif(p_data->>'valid_to', '')::date;
  if v_to is not null and v_to < v_from then raise exception 'The "valid to" date can''t be before the "valid from" date.'; end if;
  v_desc := nullif(trim(coalesce(p_data->>'description', '')), '');

  if p_bom_id is null then
    select coalesce(max(version), 0) + 1 into v_ver from mfg_boms where tenant_id = v_t and item_id = v_item and alt_no = v_alt;
    insert into mfg_boms (tenant_id, item_id, version, alt_no, base_qty, valid_from, valid_to, description, yield_pct)
    values (v_t, v_item, v_ver, v_alt, v_base, v_from, v_to, v_desc, v_yield) returning id into v_id;
  else
    v_id := p_bom_id;
    update mfg_boms set base_qty = v_base, valid_from = v_from, valid_to = v_to, description = v_desc, yield_pct = v_yield where id = v_id;
    delete from mfg_bom_items where bom_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_n := v_n + 1;
    v_comp := nullif(v_line->>'component_item_id', '')::uuid;
    v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    v_uom := coalesce(v_line->>'uom', '');
    v_kind := coalesce(nullif(v_line->>'kind', ''), 'COMPONENT');
    v_cshare := coalesce(nullif(v_line->>'cost_share_pct', '')::numeric, 0);
    if v_kind not in ('COMPONENT', 'COPRODUCT', 'BYPRODUCT') then raise exception 'Line %: choose component, co-product or by-product.', v_n; end if;
    select i.name, m.base_uom, m.active into v_cname, v_cbase, v_cactive
      from items i join mfg_item_master m on m.item_id = i.id where i.id = v_comp and i.tenant_id = v_t;
    if v_cname is null then raise exception 'Line %: choose an item from your company.', v_n; end if;
    if not v_cactive then raise exception 'Line %: "%" is inactive.', v_n, v_cname; end if;
    if v_qty <= 0 then raise exception 'Line %: the quantity of "%" must be above zero.', v_n, v_cname; end if;
    if not exists (select 1 from mfg_uom where tenant_id = v_t and code = v_uom) then raise exception 'Line %: choose a unit of measure.', v_n; end if;
    perform mfg_convert_qty(v_t, v_comp, 1, v_uom, v_cbase);
    if v_kind = 'COMPONENT' then
      v_components := v_components + 1;
      if v_comp = v_item then raise exception 'Line %: an item can''t be a component of itself.', v_n; end if;
    else
      v_share := v_share + v_cshare;
    end if;
    insert into mfg_bom_items (tenant_id, bom_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct)
    values (v_t, v_id, v_n, v_comp, v_qty, v_uom, coalesce(nullif(v_line->>'scrap_pct', '')::numeric, 0),
            coalesce((v_line->>'is_phantom')::boolean, false), v_kind, v_cshare);
  end loop;

  if v_components = 0 then raise exception 'A bill of materials needs at least one component.'; end if;
  if v_share > 100 then raise exception 'Co-product and by-product cost shares add up to % percent, which is more than 100.', v_share; end if;

  perform mfg_recalc_low_level(v_t);
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_copy_bom(p_bom_id uuid)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  b mfg_boms;
  v_id uuid;
begin
  select * into b from mfg_boms where id = p_bom_id and tenant_id = v_t;
  if b.id is null then raise exception 'That bill of materials was not found.'; end if;
  insert into mfg_boms (tenant_id, item_id, version, alt_no, base_qty, valid_from, valid_to, description, yield_pct)
  values (v_t, b.item_id, (select max(version) + 1 from mfg_boms where tenant_id = v_t and item_id = b.item_id and alt_no = b.alt_no),
          b.alt_no, b.base_qty, greatest(b.valid_from, current_date), null, b.description, b.yield_pct)
  returning id into v_id;
  insert into mfg_bom_items (tenant_id, bom_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct)
  select tenant_id, v_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct
    from mfg_bom_items where bom_id = p_bom_id;
  perform mfg_recalc_low_level(v_t);
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- B. Q-A: every journal entry must balance ----------
create or replace function check_journal_balanced()
returns trigger as $$
declare
  d numeric;
begin
  if new.journal_entry_id is null then return null; end if;
  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) into d from journal_lines where journal_entry_id = new.journal_entry_id;
  if abs(d) >= 0.005 then
    raise exception 'This journal entry does not balance: debits and credits differ by %. Every entry must balance before it can be saved.', round(abs(d), 4);
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_journal_balanced on journal_lines;
create constraint trigger trg_journal_balanced after insert or update on journal_lines
  deferrable initially deferred for each row execute function check_journal_balanced();

-- ---------- C. Q-B: control accounts take no manual lines in a Manufacturing company ----------
create or replace function guard_mfg_control_accounts()
returns trigger as $$
declare
  e record;
  k text;
begin
  select tenant_id, source_table into e from journal_entries where id = new.journal_entry_id;
  if e.tenant_id is null or e.source_table is not null then return new; end if;       -- an entry with a source document is a system posting
  if tenant_edition(e.tenant_id) <> 'MANUFACTURING' then return new; end if;
  select d.key into k from mfg_account_determination d
   where d.tenant_id = e.tenant_id and d.account_id = new.account_id
     and d.key in ('RM_INVENTORY', 'WIP', 'FG_INVENTORY', 'PACKAGING_INVENTORY', 'GR_IR', 'APPLIED_LABOR', 'APPLIED_MACHINE', 'APPLIED_FIXED_OH', 'LANDED_COST_CLEARING')
   limit 1;
  if k is not null then
    raise exception 'This account is run by the system, so it can''t take a manual journal line. Inventory, work in process, GR/IR and applied cost accounts change only through stock and production documents — use the Inventory, Purchasing or Production screens instead.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_control_accounts on journal_lines;
create trigger trg_mfg_control_accounts before insert on journal_lines
  for each row execute function guard_mfg_control_accounts();

-- ---------- D. extra posting keys and the negative-stock setting ----------
alter table mfg_company_settings add column if not exists allow_negative_stock boolean not null default false;

create or replace function mfg_seed_extra(tid uuid)
returns void as $$
begin
  insert into accounts (tenant_id, code, name, type, is_bank)
  select tid, '5610', 'Inventory Count Differences', 'expense', false
   where not exists (select 1 from accounts where tenant_id = tid and code = '5610');
  insert into mfg_account_determination (tenant_id, key, account_id)
  select tid, v.key, a.id from (values ('OPENING_EQUITY', '3000'), ('INVENTORY_DIFF', '5610')) v(key, code)
    join accounts a on a.tenant_id = tid and a.code = v.code
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public;

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
  insert into mfg_costing_sheet (tenant_id, name, kind, base, oh_pct, oh_rate_per_hour, hour_basis) values
    (tid, 'Variable overhead', 'VARIABLE', 'MATERIAL', 0, 0, 'MACHINE'),
    (tid, 'Fixed overhead', 'FIXED', 'LABOR', 0, 0, 'LABOR')
  on conflict do nothing;
  perform mfg_seed_extra(tid);
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare r record;
begin
  for r in select tenant_id from tenant_editions where edition = 'MANUFACTURING' loop
    perform mfg_seed_extra(r.tenant_id);
  end loop;
end $$;

-- the teacher's accounts screen: opening equity must be an equity account
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
    when p_key in ('GR_IR', 'LANDED_COST_CLEARING') then 'liability'
    when p_key = 'OPENING_EQUITY' then 'equity'
    else 'expense' end;
  if v_type <> v_want then
    raise exception '"%" is % account, but % needs % account.', v_acc_name,
      case v_type when 'asset' then 'an asset' when 'expense' then 'an expense' when 'equity' then 'an equity' else 'a ' || v_type end, p_key,
      case v_want when 'asset' then 'an asset' when 'expense' then 'an expense' when 'equity' then 'an equity' else 'a ' || v_want end;
  end if;

  update mfg_account_determination set account_id = p_account where tenant_id = p_tenant and key = p_key;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'account_determination_changed',
          jsonb_build_object('key', p_key, 'from_account', v_old, 'to_account', p_account), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_mfg_negative_stock(target_tenant uuid, allow boolean)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change this setting.'; end if;
  perform assert_mfg_tenant(target_tenant);
  update mfg_company_settings set allow_negative_stock = coalesce(allow, false) where tenant_id = target_tenant;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (target_tenant, 'negative_stock_setting_changed', jsonb_build_object('allow', coalesce(allow, false)), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_yield_factor(uuid) from public, anon;
revoke execute on function mfg__explode(uuid, uuid, numeric, date, int, text, uuid[], int) from public, anon;
revoke execute on function mfg__cost_bom(uuid, uuid, uuid, uuid, numeric, date, int, uuid[]) from public, anon, authenticated;
revoke execute on function mfg__cost_item(uuid, uuid, uuid, numeric, date, int, int, int, uuid[]) from public, anon, authenticated;
revoke execute on function mfg_save_bom(uuid, jsonb) from public, anon;
revoke execute on function mfg_copy_bom(uuid) from public, anon;
revoke execute on function mfg_seed_extra(uuid) from public, anon, authenticated;
revoke execute on function mfg_seed_master_data(uuid) from public, anon, authenticated;
revoke execute on function mfg_set_account(uuid, text, uuid) from public, anon;
revoke execute on function set_mfg_negative_stock(uuid, boolean) from public, anon;
revoke execute on function check_journal_balanced() from public, anon, authenticated;
revoke execute on function guard_mfg_control_accounts() from public, anon, authenticated;
grant execute on function mfg_yield_factor(uuid) to authenticated;
grant execute on function mfg__explode(uuid, uuid, numeric, date, int, text, uuid[], int) to authenticated;
grant execute on function mfg_save_bom(uuid, jsonb) to authenticated;
grant execute on function mfg_copy_bom(uuid) to authenticated;
grant execute on function mfg_set_account(uuid, text, uuid) to authenticated;
grant execute on function set_mfg_negative_stock(uuid, boolean) to authenticated;
