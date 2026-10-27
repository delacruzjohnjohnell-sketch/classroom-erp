-- ============================================================
-- Classroom ERP — migration 0054 (Manufacturing ERP, Phase 11b: the answer key follows the screens exactly)
--
-- Needs 0050–0053. Found in the pilot (a student following the handout in the browser): the Confirm production screen has no employee field, so
-- a student's confirmations never carry an employee. The answer key (0053) posted them WITH employees, which changes the month-end labor
-- restatement (account 5300/5000 differ). This redefines mfg__load_activity_1 to post exactly what the screens post (no employees), and
-- updates the stored practice-set figures to match (cost of goods sold 36,013.55; applied direct labor 5,236.00; no payroll expense balance).
-- Net profit is unchanged at 10,105.95. The pilot company, done entirely through the screens, produced these figures.
--
-- ROLLBACK: re-run the definition of mfg__load_activity_1 in 0053 and the insert in 0052.
-- ============================================================

create or replace function mfg__load_activity_1(p_tenant uuid)
returns jsonb as $$
declare
  v_t uuid := p_tenant;
  m date := '2026-11-01';
  i_pole uuid; i_rat uuid; i_lac uuid; i_ctn uuid; i_bsk uuid; i_std uuid;
  wc_w uuid; wc_f uuid; b uuid; rt uuid; est uuid;
  vend1 uuid; vend2 uuid; cust1 uuid; cust2 uuid;
  po1 uuid; po2 uuid; l_pole uuid; l_rat uuid; l_ctn uuid; l_lac uuid; oa uuid; ob uuid;
  so1 uuid; so2 uuid; sl1 uuid; sl2 uuid; sl3 uuid; inv uuid; v uuid;
begin
  insert into vendors (tenant_id, name) values (v_t, 'Laguna Bamboo Traders') returning id into vend1;
  insert into vendors (tenant_id, name) values (v_t, 'Pasig Packaging Supply') returning id into vend2;
  insert into customers (tenant_id, name) values (v_t, 'Greenleaf Home Store') returning id into cust1;
  insert into customers (tenant_id, name) values (v_t, 'Cebu Gift Shop') returning id into cust2;

  i_pole := mfg_save_item(null, jsonb_build_object('sku','BAM-POLE','name','Bamboo pole','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',45,'procurement_lead_days',5));
  i_rat  := mfg_save_item(null, jsonb_build_object('sku','RAT-STR','name','Rattan strip','item_type','RAW','make_or_buy','BUY','base_uom','KG','planned_price',160,'procurement_lead_days',5));
  i_lac  := mfg_save_item(null, jsonb_build_object('sku','LAC-CL','name','Clear lacquer','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',280,'procurement_lead_days',3));
  i_ctn  := mfg_save_item(null, jsonb_build_object('sku','CTN-GB','name','Gift carton','item_type','PACKAGING','make_or_buy','BUY','base_uom','PC','planned_price',30,'procurement_lead_days',3));
  i_bsk  := mfg_save_item(null, jsonb_build_object('sku','BSK-LD','name','Laundry basket','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_std  := mfg_save_item(null, jsonb_build_object('sku','STD-PL','name','Plant stand','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));

  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (v_t, 'Weaving', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_w;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (v_t, 'Finishing', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_f;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select v_t, w.id, a.id, m, case a.kind when 'LABOR' then 80 else case w.id when wc_w then 25 else 40 end end
      from mfg_activity_types a cross join (select wc_w as id union all select wc_f) w
     where a.tenant_id = v_t and a.kind in ('LABOR', 'MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 30 where tenant_id = v_t and kind = 'FIXED';

  b := mfg_save_bom(null, jsonb_build_object('item_id', i_bsk, 'valid_from', m, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_pole, 'qty', 4, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 1.5, 'uom', 'KG'),
    jsonb_build_object('component_item_id', i_lac, 'qty', 0.1, 'uom', 'L'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_std, 'valid_from', m, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_pole, 'qty', 6, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 0.5, 'uom', 'KG'),
    jsonb_build_object('component_item_id', i_lac, 'qty', 0.25, 'uom', 'L'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_bsk, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Weave the basket', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 42, 'labor_min_per_unit', 42, 'machine_min_per_unit', 12),
    jsonb_build_object('op_no', 20, 'description', 'Lacquer and pack', 'work_center_id', wc_f, 'setup_min', 15, 'run_min_per_unit', 15, 'labor_min_per_unit', 15, 'machine_min_per_unit', 15))));
  perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_std, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Cut and assemble the stand', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 24),
    jsonb_build_object('op_no', 20, 'description', 'Lacquer and pack', 'work_center_id', wc_f, 'setup_min', 12, 'run_min_per_unit', 18, 'labor_min_per_unit', 18, 'machine_min_per_unit', 18))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_bsk, 50, '2026-11-02'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-11-02');
  est := mfg_create_cost_estimate(i_std, 20, '2026-11-02'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-11-02');

  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-02', 'jv_type', 'GENERAL', 'reference', 'Capital', 'particulars', 'Owner puts in the starting cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '1000'), 'debit', 100000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '3000'), 'credit', 100000))));
  perform mfg_submit_voucher(v);

  po1 := mfg_create_po(vend1, '2026-11-03', '2026-11-06', jsonb_build_array(
    jsonb_build_object('item_id', i_pole, 'qty', 400, 'unit_price', 47), jsonb_build_object('item_id', i_rat, 'qty', 120, 'unit_price', 165)));
  po2 := mfg_create_po(vend2, '2026-11-03', '2026-11-09', jsonb_build_array(
    jsonb_build_object('item_id', i_ctn, 'qty', 100, 'unit_price', 30), jsonb_build_object('item_id', i_lac, 'qty', 30, 'unit_price', 290)));
  select l.id into l_pole from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_pole;
  select l.id into l_rat  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_rat;
  select l.id into l_ctn  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_ctn;
  select l.id into l_lac  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_lac;
  perform mfg_post_goods_receipt(po1, '2026-11-06', jsonb_build_array(jsonb_build_object('po_line_id', l_pole, 'qty', 400), jsonb_build_object('po_line_id', l_rat, 'qty', 120)));
  perform mfg_post_goods_receipt(po2, '2026-11-09', jsonb_build_array(jsonb_build_object('po_line_id', l_ctn, 'qty', 100), jsonb_build_object('po_line_id', l_lac, 'qty', 30)));
  perform mfg_post_vendor_invoice(po2, 'PPS-4471', '2026-11-10', '2026-12-10', 12, jsonb_build_array(
    jsonb_build_object('po_line_id', l_ctn, 'qty', 100, 'unit_price', 30), jsonb_build_object('po_line_id', l_lac, 'qty', 30, 'unit_price', 290)));

  oa := mfg_create_order(i_bsk, 50, '2026-11-11', '2026-11-18');
  perform mfg_release_order(oa);
  perform mfg_post_material_issue(oa, (
    select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', case when c.item_id = i_rat then 78 else c.qty_required end))
      from mfg_prod_components c where c.order_id = oa), '2026-11-12');
  perform mfg_post_confirmation(oa, 10, 50, 0, null, 0.5, 35, 10, false, '2026-11-14', null);
  perform mfg_post_confirmation(oa, 20, 48, 2, 'Lacquer blistered two baskets', 0.25, 13, 12, true, '2026-11-17', null);
  perform mfg_post_fg_receipt(oa, 48, null, null, null, '2026-11-18');
  perform mfg_settle_order(oa, '2026-11-25');
  ob := mfg_create_order(i_std, 20, '2026-11-12', '2026-11-19');
  perform mfg_release_order(ob);
  perform mfg_post_material_issue(ob, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = ob), '2026-11-13');
  perform mfg_post_confirmation(ob, 10, 20, 0, null, 0.5, 10, 8, false, '2026-11-16', null);
  perform mfg_post_confirmation(ob, 20, 20, 0, null, 0.2, 6, 6, true, '2026-11-18', null);
  perform mfg_post_fg_receipt(ob, 20, null, null, null, '2026-11-19');
  perform mfg_settle_order(ob, '2026-11-25');

  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust1, '2026-11-19', 'draft', 35728, 12, 3828) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_bsk, 'Laundry basket', 30, 780) returning id into sl1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_std, 'Plant stand', 10, 850) returning id into sl2;
  update sales_orders set status = 'confirmed' where id = so1;
  perform mfg_post_delivery(so1, '2026-11-20', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30), jsonb_build_object('so_line_id', sl2, 'qty', 10)));
  inv := mfg_create_invoice_from_so(so1, '2026-12-21', '2026-11-21'); perform post_invoice(inv);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust2, '2026-11-25', 'draft', 13272, 12, 1422) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_bsk, 'Laundry basket', 15, 790) returning id into sl3;
  update sales_orders set status = 'confirmed' where id = so2;
  perform mfg_post_delivery(so2, '2026-11-26', jsonb_build_array(jsonb_build_object('so_line_id', sl3, 'qty', 15)));
  inv := mfg_create_invoice_from_so(so2, '2026-12-27', '2026-11-27'); perform post_invoice(inv);

  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-28', 'jv_type', 'GENERAL', 'reference', 'Workshop rent', 'particulars', 'Workshop rent for November paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '5100'), 'debit', 6000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '1000'), 'credit', 6000))));
  perform mfg_submit_voucher(v);
  perform mfg_settle_period(m);
  perform mfg_close_period(m);

  insert into mfg_audit_log (tenant_id, event, detail, created_by) values (v_t, 'activity_key_loaded', jsonb_build_object('activity', 'activity-1-manufacturing'), auth.uid());
  return jsonb_build_object('activity', 'activity-1-manufacturing', 'month', '2026-11', 'items', 6, 'orders', 2, 'invoices', 2);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg__load_activity_1(uuid) from public, anon, authenticated;

update mfg_practice_sets set definition = '{"id": "bamboo-nov-2026", "name": "Activity 1 Manufacturing — Bamboo Basket Works, November 2026 (solo company)", "summary": "Standard costing. One month: set up, buy, make, sell, a manual voucher, then settle and close November. Ends in a net profit of ₱10,105.95.", "vendors": ["Laguna Bamboo Traders", "Pasig Packaging Supply"], "customers": ["Cebu Gift Shop", "Greenleaf Home Store"], "employees": [], "workCenters": ["Finishing", "Weaving"], "rates": [{"workCenter": "Weaving", "kind": "LABOR", "rate": 80}, {"workCenter": "Weaving", "kind": "MACHINE", "rate": 25}, {"workCenter": "Finishing", "kind": "LABOR", "rate": 80}, {"workCenter": "Finishing", "kind": "MACHINE", "rate": 40}], "ohRate": 30, "items": [{"sku": "BAM-POLE", "name": "Bamboo pole", "type": "RAW", "uom": "PC", "plannedPrice": 45, "qty": 80}, {"sku": "RAT-STR", "name": "Rattan strip", "type": "RAW", "uom": "KG", "plannedPrice": 160, "qty": 32}, {"sku": "LAC-CL", "name": "Clear lacquer", "type": "RAW", "uom": "L", "plannedPrice": 280, "qty": 20}, {"sku": "CTN-GB", "name": "Gift carton", "type": "PACKAGING", "uom": "PC", "plannedPrice": 30, "qty": 30}, {"sku": "BSK-LD", "name": "Laundry basket", "type": "FINISHED", "uom": "PC", "standardCost": 599.15, "qty": 3}, {"sku": "STD-PL", "name": "Plant stand", "type": "FINISHED", "uom": "PC", "standardCost": 563.85, "qty": 10}], "boms": [{"item": "BSK-LD", "lines": [{"sku": "BAM-POLE", "qty": 4}, {"sku": "CTN-GB", "qty": 1}, {"sku": "LAC-CL", "qty": 0.1}, {"sku": "RAT-STR", "qty": 1.5}]}, {"item": "STD-PL", "lines": [{"sku": "BAM-POLE", "qty": 6}, {"sku": "CTN-GB", "qty": 1}, {"sku": "LAC-CL", "qty": 0.25}, {"sku": "RAT-STR", "qty": 0.5}]}], "routings": [{"item": "BSK-LD", "ops": [{"op": 10, "workCenter": "Weaving", "setup": 30, "run": 42, "labor": 42, "machine": 12}, {"op": 20, "workCenter": "Finishing", "setup": 15, "run": 15, "labor": 15, "machine": 15}]}, {"item": "STD-PL", "ops": [{"op": 10, "workCenter": "Weaving", "setup": 30, "run": 30, "labor": 30, "machine": 24}, {"op": 20, "workCenter": "Finishing", "setup": 12, "run": 18, "labor": 18, "machine": 18}]}], "purchaseOrders": [{"vendor": "Laguna Bamboo Traders", "total": 38600}, {"vendor": "Pasig Packaging Supply", "total": 11700}], "vendorInvoices": [{"total": 13104, "invoiceDate": "2026-11-10", "due": "2026-12-10"}], "orders": [{"item": "BSK-LD", "planned": 50, "good": 48, "scrap": 2}, {"item": "STD-PL", "planned": 20, "good": 20, "scrap": 0}], "invoices": [{"total": 35728, "date": "2026-11-21", "due": "2026-12-21"}, {"total": 13272, "date": "2026-11-27", "due": "2026-12-27"}], "balances": [{"code": "1000", "amount": 94000, "hint": "Cash is the 100,000 capital less the 6,000 rent. No payments are made in this set, so nothing else touches Cash."}, {"code": "1100", "amount": 49000, "hint": "Both invoices stay unpaid, including 12% VAT. Check the quantities, prices and that each invoice was posted once."}, {"code": "1160", "amount": 1404, "hint": "12% input VAT on the one vendor invoice only."}, {"code": "1200", "amount": 14320, "hint": "Raw materials left after the two production orders, valued at standard cost. Check receipts, issues (including the extra rattan on the basket order) and quantities."}, {"code": "1220", "amount": 7435.95, "hint": "Finished goods left after the deliveries, at standard cost. Check receipts (48 baskets, 20 stands) and deliveries (45 baskets, 10 stands)."}, {"code": "1230", "amount": 900, "hint": "Gift cartons left, at standard cost."}, {"code": "2000", "amount": -13104, "hint": "The one vendor invoice, including 12% VAT, and no payment."}, {"code": "2050", "amount": -38600, "hint": "The bamboo and rattan receipt that was never invoiced, at purchase-order prices."}, {"code": "2200", "amount": -5250, "hint": "12% output VAT on the two invoices."}, {"code": "3000", "amount": -100000, "hint": "The 100,000 capital voucher."}, {"code": "4000", "amount": -43750, "hint": "Sales before VAT on both invoices."}, {"code": "5000", "amount": 36013.55, "hint": "Cost of goods sold at standard cost, plus the variances that Period End closes into it."}, {"code": "5100", "amount": 6000, "hint": "The 6,000 November rent only."}, {"code": "5700", "amount": -5236, "hint": "Direct labor applied to production at the standard labor rate (the two confirmed orders), after the month-end variance close. Payroll is not run in this set."}, {"code": "5710", "amount": -1170, "hint": "Machine overhead applied at the standard machine rate; the settled balance after variances."}, {"code": "5720", "amount": -1963.5, "hint": "Fixed overhead applied at the standard overhead rate; the settled balance after variances."}], "manualVouchers": {"count": 2, "totalDebit": 106000}, "month": "2026-11"}'::jsonb where id = 'bamboo-nov-2026';
