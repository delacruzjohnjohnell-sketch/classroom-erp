-- ============================================================
-- Classroom ERP — migration 0044 (Manufacturing ERP, Phase 8d: the data behind the standard-format reports)
--
-- Needs 0023–0043. Seven new READ-ONLY functions; no table, column, trigger or Standard object is touched.
--
--   mfg_account_balances   Every account with its opening balance, the period's debits and credits, and the closing balance, from the journal.
--                          The trial balance, the statement of financial position (PAS 1) and the statement of comprehensive income are all
--                          drawn from this one source, so they cannot disagree with each other or with the books.
--   mfg_stock_card         One item's movements with a running quantity and value (the "kardex"), with the opening balance first.
--   mfg_wip_report         Production orders that still hold cost in work in process at a date, by element and age.
--   mfg_grir_aging         Goods received but not yet invoiced, by purchase-order line, with age.
--   mfg_scrap_report       Scrap by item and reason, valued in pesos, with the scrap rate.
--   mfg_match_exceptions   Vendor invoices that failed the three-way match, why, and what was decided.
--   mfg_inventory_schedule The note a financial statement carries for inventories (PAS 2): carrying amount by class, tied to the stock records,
--                          and the cost recognised as an expense and the write-downs for the period.
--
-- ROLLBACK:
--   drop function if exists mfg_inventory_schedule(uuid, date, date), mfg_match_exceptions(uuid, date, date), mfg_scrap_report(uuid, date, date),
--     mfg_grir_aging(uuid, date), mfg_wip_report(uuid, date), mfg_stock_card(uuid, uuid, date, date, boolean), mfg_account_balances(uuid, date, date);
-- ============================================================

create or replace function mfg_account_balances(p_tenant uuid, p_from date, p_to date)
returns table (account_id uuid, code text, name text, type text, opening numeric, debit numeric, credit numeric, closing numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is not null and p_to is not null and p_to < p_from then raise exception 'The end date can''t be before the start date.'; end if;
  return query
  with l as (
    select jl.account_id as aid, e.entry_date as d, jl.debit as dr, jl.credit as cr
      from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id
     where e.tenant_id = p_tenant and (p_to is null or e.entry_date <= p_to)
  )
  select a.id, a.code, a.name, a.type,
         round(coalesce(sum(l.dr - l.cr) filter (where p_from is not null and l.d < p_from), 0), 2),
         round(coalesce(sum(l.dr) filter (where p_from is null or l.d >= p_from), 0), 2),
         round(coalesce(sum(l.cr) filter (where p_from is null or l.d >= p_from), 0), 2),
         round(coalesce(sum(l.dr - l.cr), 0), 2)
    from accounts a left join l on l.aid = a.id
   where a.tenant_id = p_tenant
   group by a.id, a.code, a.name, a.type
   order by a.code;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_stock_card(p_tenant uuid, p_item uuid, p_from date, p_to date, p_include_wip boolean default false)
returns table (seq int, row_kind text, posting_date date, document_number text, doc_type text, memo text, location text,
               qty_in numeric, qty_out numeric, unit_cost numeric, value_in numeric, value_out numeric, balance_qty numeric, balance_value numeric) as $$
declare
  oq numeric; ov numeric;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a period (from, to).'; end if;
  if not exists (select 1 from mfg_item_master where item_id = p_item and tenant_id = p_tenant) then raise exception 'Choose one of the company''s items.'; end if;
  select coalesce(sum(dl.qty_change), 0), coalesce(sum(dl.total_cost), 0) into oq, ov
    from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id join mfg_storage_locations sl on sl.id = dl.location_id
   where dl.tenant_id = p_tenant and dl.item_id = p_item and d.posting_date < p_from and (p_include_wip or sl.kind <> 'WIP');
  return query
  with m as (
    select d.posting_date as pd, d.document_number as dno, d.doc_type as dt, d.memo as mm, sl.name as ln_, dl.qty_change as q, dl.unit_cost as uc, dl.total_cost as tc,
           row_number() over (order by d.posting_date, d.created_at, dl.line_no) as rn
      from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id join mfg_storage_locations sl on sl.id = dl.location_id
     where dl.tenant_id = p_tenant and dl.item_id = p_item and d.posting_date between p_from and p_to and (p_include_wip or sl.kind <> 'WIP')
  ), run as (
    select m.*, oq + sum(q) over (order by rn) as bq, ov + sum(tc) over (order by rn) as bv from m
  )
  select 0, 'OPENING'::text, p_from, null::text, null::text, 'Balance brought forward'::text, null::text, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, round(oq, 6), round(ov, 2)
  union all
  select run.rn::int, 'MOVE'::text, run.pd, run.dno, run.dt, run.mm, run.ln_,
         case when run.q > 0 then round(run.q, 6) end, case when run.q < 0 then round(-run.q, 6) end, round(run.uc, 6),
         case when run.tc > 0 then round(run.tc, 2) end, case when run.tc < 0 then round(-run.tc, 2) end, round(run.bq, 6), round(run.bv, 2)
    from run
  union all
  select 2147483647, 'CLOSING'::text, p_to, null::text, null::text, 'Balance carried forward'::text, null::text, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
         round(oq + coalesce((select sum(m.q) from m), 0), 6), round(ov + coalesce((select sum(m.tc) from m), 0), 2)
  order by 1;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_wip_report(p_tenant uuid, p_as_of date)
returns table (order_id uuid, order_no text, item_id uuid, status text, started_on date, age_days int, bucket text, qty_planned numeric, qty_good numeric,
               material numeric, labor numeric, machine numeric, overhead numeric, relieved numeric, wip numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_as_of is null then raise exception 'Choose the date.'; end if;
  return query
  with c as (
    select oc.order_id as oid, min(oc.posting_date) as first_d,
           sum(oc.amount) filter (where oc.element = 'MATERIAL') as mat, sum(oc.amount) filter (where oc.element = 'LABOR') as lab,
           sum(oc.amount) filter (where oc.element = 'MACHINE') as mach, sum(oc.amount) filter (where oc.element in ('VAR_OH', 'FIX_OH')) as oh,
           sum(oc.amount) filter (where oc.element in ('RELIEF', 'VARIANCE')) as rel, sum(oc.amount) as tot
      from mfg_order_costs oc where oc.tenant_id = p_tenant and oc.posting_date <= p_as_of group by oc.order_id
  )
  select o.id, o.document_number, o.item_id, o.status, c.first_d, (p_as_of - c.first_d)::int,
         case when p_as_of - c.first_d <= 30 then '0-30' when p_as_of - c.first_d <= 60 then '31-60' when p_as_of - c.first_d <= 90 then '61-90' else 'Over 90' end,
         o.qty_planned, o.qty_good, round(coalesce(c.mat, 0), 2), round(coalesce(c.lab, 0), 2), round(coalesce(c.mach, 0), 2), round(coalesce(c.oh, 0), 2),
         round(coalesce(c.rel, 0), 2), round(c.tot, 2)
    from mfg_production_orders o join c on c.oid = o.id
   where o.tenant_id = p_tenant and abs(c.tot) >= 0.005
   order by (p_as_of - c.first_d) desc, o.document_number;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_grir_aging(p_tenant uuid, p_as_of date)
returns table (po_no text, vendor text, item_id uuid, po_line_id uuid, ordered numeric, received numeric, invoiced numeric, uninvoiced numeric, unit_cost numeric,
               value numeric, first_receipt date, age_days int, bucket text) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_as_of is null then raise exception 'Choose the date.'; end if;
  return query
  with g as (
    select dl.po_line_id as plid, sum(dl.qty_change) as rq, min(d.posting_date) filter (where dl.qty_change > 0) as first_gr
      from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id
     where dl.tenant_id = p_tenant and dl.po_line_id is not null and d.posting_date <= p_as_of group by 1
  ), v as (
    select vl.po_line_id as plid, sum(vl.qty) as iq
      from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id
     where vl.tenant_id = p_tenant and vi.status = 'POSTED' and vi.invoice_date <= p_as_of group by 1
  )
  select po.document_number, ve.name, li.item_id, pl.id, pl.qty, round(coalesce(g.rq, 0), 6), round(coalesce(v.iq, 0), 6),
         round(coalesce(g.rq, 0) - coalesce(v.iq, 0), 6), pl.unit_cost, round((coalesce(g.rq, 0) - coalesce(v.iq, 0)) * pl.unit_cost, 2),
         g.first_gr, case when g.first_gr is null then null else (p_as_of - g.first_gr)::int end,
         case when g.first_gr is null then 'Invoice only' when p_as_of - g.first_gr <= 30 then '0-30' when p_as_of - g.first_gr <= 60 then '31-60'
              when p_as_of - g.first_gr <= 90 then '61-90' else 'Over 90' end
    from purchase_order_lines pl join purchase_orders po on po.id = pl.purchase_order_id join mfg_po_line_items li on li.po_line_id = pl.id
    left join vendors ve on ve.id = po.vendor_id left join g on g.plid = pl.id left join v on v.plid = pl.id
   where po.tenant_id = p_tenant and abs(coalesce(g.rq, 0) - coalesce(v.iq, 0)) > 0.000001
   order by g.first_gr nulls last, po.document_number;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_scrap_report(p_tenant uuid, p_from date, p_to date)
returns table (item_id uuid, reason text, orders int, good_qty numeric, scrap_qty numeric, scrap_pct numeric, unit_cost numeric, scrap_value numeric) as $$
declare
  v_method text;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a period (from, to).'; end if;
  select costing_method into v_method from mfg_company_settings where tenant_id = p_tenant;
  return query
  select o.item_id, coalesce(c.scrap_reason, 'No reason given'), count(distinct o.id)::int, round(sum(c.yield_qty), 6), round(sum(c.scrap_qty), 6),
         case when sum(c.yield_qty) + sum(c.scrap_qty) > 0 then round(sum(c.scrap_qty) * 100 / (sum(c.yield_qty) + sum(c.scrap_qty)), 2) else 0 end,
         round(max(coalesce(nullif(o.std_unit_cost, 0), case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end)), 6),
         round(sum(c.scrap_qty * coalesce(nullif(o.std_unit_cost, 0), case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end)), 2)
    from mfg_confirmations c join mfg_production_orders o on o.id = c.order_id join mfg_item_master m on m.item_id = o.item_id
   where c.tenant_id = p_tenant and c.posting_date between p_from and p_to
   group by o.item_id, coalesce(c.scrap_reason, 'No reason given')
  having abs(sum(c.scrap_qty)) > 0.000001
   order by 8 desc, 1;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_match_exceptions(p_tenant uuid, p_from date, p_to date)
returns table (invoice_no text, vendor text, vendor_ref text, invoice_date date, total numeric, status text, reason text, worst_qty_var_pct numeric, worst_price_var_pct numeric,
               tolerance_pct numeric, decided_by text, decided_at timestamptz) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a period (from, to).'; end if;
  return query
  select vi.document_number, ve.name, vi.vendor_ref, vi.invoice_date, vi.total, vi.status, vi.hold_reason,
         (select max(abs(l.qty_var_pct)) from mfg_vendor_invoice_lines l where l.invoice_id = vi.id),
         (select max(abs(l.price_var_pct)) from mfg_vendor_invoice_lines l where l.invoice_id = vi.id),
         vi.tolerance_pct, p.full_name, vi.approved_at
    from mfg_vendor_invoices vi left join vendors ve on ve.id = vi.vendor_id left join profiles p on p.id = vi.approved_by
   where vi.tenant_id = p_tenant and vi.hold_reason is not null and vi.invoice_date between p_from and p_to
   order by vi.invoice_date desc, vi.document_number;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_inventory_schedule(p_tenant uuid, p_as_of date, p_from date)
returns table (section text, line_no int, label text, account_code text, ledger numeric, subledger numeric, difference numeric, note text) as $$
declare
  v_method text;
  v_accs uuid[]; v_code text; v_led numeric; v_sub numeric; n int := 0;
  rec record;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_as_of is null or p_from is null or p_as_of < p_from then raise exception 'Choose a period (from, to).'; end if;
  select costing_method into v_method from mfg_company_settings where tenant_id = p_tenant;
  -- carrying amounts at the end of the period: the ledger is the figure in the financial statements; the stock records tie to it as of today
  for rec in select * from (values (1, 'Raw materials', 'RM_INVENTORY'), (2, 'Packaging and supplies', 'PACKAGING_INVENTORY'), (3, 'Work in process', 'WIP'), (4, 'Finished goods', 'FG_INVENTORY')) as x(o, lbl, key)
  loop
    v_accs := mfg__acc_keys(p_tenant, array[rec.key]);
    select a.code into v_code from accounts a where a.id = v_accs[1];
    v_led := round(mfg__bal(p_tenant, v_accs, null, p_as_of), 2);
    v_sub := null;
    if p_as_of >= current_date then
      if rec.key = 'WIP' then
        select round(coalesce(sum(amount), 0), 2) into v_sub from mfg_order_costs where tenant_id = p_tenant;
      else
        select round(coalesce(sum(s.qty * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end), 0), 2) into v_sub
          from mfg_stock s join mfg_item_master m on m.item_id = s.item_id where s.tenant_id = p_tenant and mfg__inv_key(m.item_type) = rec.key;
      end if;
    end if;
    section := 'CARRYING'; line_no := rec.o; label := rec.lbl; account_code := v_code; ledger := v_led; subledger := v_sub;
    difference := case when v_sub is null then null else round(v_sub - v_led, 2) end;
    note := case when v_sub is null then 'The stock records are tied to the ledger for today''s date only.' end;
    return next;
  end loop;
  -- expense recognised and write-downs, for the period
  n := 10;
  for rec in select a.code as c, a.name as nm, a.id as aid from accounts a where a.tenant_id = p_tenant and a.code in ('5000', '5560', '5600', '5610', '5580') order by a.code
  loop
    n := n + 1;
    section := case when rec.c = '5000' then 'EXPENSE' else 'WRITEDOWN' end; line_no := n;
    label := case when rec.c = '5000' then 'Cost of inventories recognised as an expense' else rec.nm end;
    account_code := rec.c; ledger := round(mfg__bal(p_tenant, array[rec.aid], p_from, p_as_of), 2); subledger := null; difference := null; note := null;
    return next;
  end loop;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_account_balances(uuid, date, date) from public, anon;
revoke execute on function mfg_stock_card(uuid, uuid, date, date, boolean) from public, anon;
revoke execute on function mfg_wip_report(uuid, date) from public, anon;
revoke execute on function mfg_grir_aging(uuid, date) from public, anon;
revoke execute on function mfg_scrap_report(uuid, date, date) from public, anon;
revoke execute on function mfg_match_exceptions(uuid, date, date) from public, anon;
revoke execute on function mfg_inventory_schedule(uuid, date, date) from public, anon;
grant execute on function mfg_account_balances(uuid, date, date) to authenticated;
grant execute on function mfg_stock_card(uuid, uuid, date, date, boolean) to authenticated;
grant execute on function mfg_wip_report(uuid, date) to authenticated;
grant execute on function mfg_grir_aging(uuid, date) to authenticated;
grant execute on function mfg_scrap_report(uuid, date, date) to authenticated;
grant execute on function mfg_match_exceptions(uuid, date, date) to authenticated;
grant execute on function mfg_inventory_schedule(uuid, date, date) to authenticated;
