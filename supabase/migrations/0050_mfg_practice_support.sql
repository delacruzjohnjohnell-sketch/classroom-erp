-- ============================================================
-- Classroom ERP — migration 0050 (Manufacturing ERP, Phase 11b: practice-set support)
--
-- Needs 0023–0049. ADDITIVE: one new read-only function, and one of our own Manufacturing functions gains an optional argument.
-- No Standard table, function, policy or trigger is changed.
--
--   mfg_practice_snapshot(p_tenant)   The teacher's "Check" reads one Manufacturing company as a single JSON document: master data,
--                                     stock, purchase and production documents, invoices, ledger balances by account code, vouchers and
--                                     months. The comparison with the practice set happens in the app (src/lib/mfgPracticeCheck.ts).
--                                     Teacher only; writes nothing.
--   mfg_create_invoice_from_so        Gains p_date (the invoice date). Until now an invoice created from a sales order was always dated
--                                     today, so a practice set for a past or future month could not date its invoices. Omitted = today,
--                                     exactly as before. The role check ('sales' area, from 0049) is kept.
--
-- ROLLBACK:
--   drop function if exists mfg_practice_snapshot(uuid);
--   drop function if exists mfg_create_invoice_from_so(uuid, date, date);   -- then re-run the definition in 0032 and the 0049 loop
-- ============================================================

create or replace function mfg_practice_snapshot(p_tenant uuid)
returns jsonb as $$
declare
  r jsonb;
begin
  if not is_teacher() then raise exception 'Only the teacher can check a practice set.'; end if;
  if tenant_edition(p_tenant) <> 'MANUFACTURING' then raise exception 'That is not a Manufacturing company.'; end if;

  select jsonb_build_object(
    'company', (select name from tenants where id = p_tenant),
    'vendors', coalesce((select jsonb_agg(name order by name) from vendors where tenant_id = p_tenant), '[]'),
    'customers', coalesce((select jsonb_agg(name order by name) from customers where tenant_id = p_tenant), '[]'),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'pay_type', pay_type, 'hourly_rate', hourly_rate) order by name) from employees where tenant_id = p_tenant), '[]'),
    'work_centers', coalesce((select jsonb_agg(name order by name) from mfg_work_centers where tenant_id = p_tenant), '[]'),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('work_center', w.name, 'kind', a.kind, 'rate', ar.rate) order by w.name, a.kind)
                         from mfg_activity_rates ar join mfg_work_centers w on w.id = ar.work_center_id join mfg_activity_types a on a.id = ar.activity_type_id
                        where ar.tenant_id = p_tenant), '[]'),
    'oh_rate', (select oh_rate_per_hour from mfg_costing_sheet where tenant_id = p_tenant and kind = 'FIXED' limit 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('sku', i.sku, 'name', i.name, 'type', m.item_type, 'make_or_buy', m.make_or_buy, 'uom', m.base_uom,
                         'planned_price', m.planned_price, 'standard_cost', m.standard_cost, 'qty', coalesce(s.q, 0)) order by i.sku)
                         from items i join mfg_item_master m on m.item_id = i.id
                         left join (select item_id, sum(qty) q from mfg_stock where tenant_id = p_tenant group by item_id) s on s.item_id = i.id
                        where i.tenant_id = p_tenant), '[]'),
    'boms', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'lines', (
                         select jsonb_agg(jsonb_build_object('sku', ci.sku, 'qty', bi.qty) order by ci.sku) from mfg_bom_items bi join items ci on ci.id = bi.component_item_id where bi.bom_id = b.id)) order by i.sku)
                         from mfg_boms b join items i on i.id = b.item_id where b.tenant_id = p_tenant and b.status = 'ACTIVE'), '[]'),
    'routings', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'ops', (
                         select jsonb_agg(jsonb_build_object('op_no', o.op_no, 'work_center', w.name, 'setup_min', o.setup_min, 'run_min', o.run_min_per_unit,
                                                             'labor_min', o.labor_min_per_unit, 'machine_min', o.machine_min_per_unit) order by o.op_no)
                           from mfg_routing_ops o join mfg_work_centers w on w.id = o.work_center_id where o.routing_id = rt.id)) order by i.sku)
                         from mfg_routings rt join items i on i.id = rt.item_id where rt.tenant_id = p_tenant and rt.status = 'ACTIVE'), '[]'),
    'estimates_released', coalesce((select jsonb_agg(i.sku order by i.sku) from mfg_cost_estimates e join items i on i.id = e.item_id where e.tenant_id = p_tenant and e.status = 'RELEASED'), '[]'),
    'purchase_orders', coalesce((select jsonb_agg(jsonb_build_object('vendor', v.name, 'total', po.total, 'status', po.status) order by po.document_number)
                         from purchase_orders po join vendors v on v.id = po.vendor_id where po.tenant_id = p_tenant), '[]'),
    'vendor_invoices', coalesce((select jsonb_agg(jsonb_build_object('total', total, 'due_date', due_date, 'status', status, 'invoice_date', invoice_date) order by document_number)
                         from mfg_vendor_invoices where tenant_id = p_tenant), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'planned', o.qty_planned, 'good', o.qty_good, 'scrap', o.qty_scrap, 'received', o.qty_received, 'status', o.status) order by o.document_number)
                         from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = p_tenant), '[]'),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('total', total, 'date', order_date, 'due_date', due_date, 'status', status) order by document_number)
                         from invoices where tenant_id = p_tenant), '[]'),
    'gl', coalesce((select jsonb_object_agg(code, bal) from (
                         select a.code, round(sum(jl.debit - jl.credit), 2) bal
                           from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id
                          where e.tenant_id = p_tenant group by a.code having round(sum(jl.debit - jl.credit), 2) <> 0) g), '{}'),
    'vouchers', jsonb_build_object(
      'manual_posted', (select count(*) from mfg_vouchers where tenant_id = p_tenant and kind = 'MANUAL' and status = 'POSTED'),
      'total_manual_amount', coalesce((select sum(l.debit) from mfg_vouchers v join mfg_voucher_lines l on l.voucher_id = v.id where v.tenant_id = p_tenant and v.kind = 'MANUAL' and v.status = 'POSTED'), 0)),
    'periods', coalesce((select jsonb_agg(jsonb_build_object('period', to_char(period_start, 'YYYY-MM'), 'status', status) order by period_start) from mfg_periods where tenant_id = p_tenant), '[]')
  ) into r;
  return r;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function mfg_practice_snapshot(uuid) from public, anon;
grant execute on function mfg_practice_snapshot(uuid) to authenticated;

-- ---------- the invoice date ----------
do $do$
declare
  d text; n text;
begin
  d := pg_get_functiondef('mfg_create_invoice_from_so(uuid, date)'::regprocedure);
  n := replace(d, 'p_due date DEFAULT NULL::date)', 'p_due date DEFAULT NULL::date, p_date date DEFAULT NULL::date)');
  n := replace(n, 'so.customer_id, current_date, p_due', 'so.customer_id, coalesce(p_date, current_date), p_due');
  if n = d or position('coalesce(p_date, current_date)' in n) = 0 then raise exception 'mfg_create_invoice_from_so did not look as expected; nothing changed.'; end if;
  drop function mfg_create_invoice_from_so(uuid, date);
  execute n;
end $do$;

revoke execute on function mfg_create_invoice_from_so(uuid, date, date) from public, anon;
grant execute on function mfg_create_invoice_from_so(uuid, date, date) to authenticated;
