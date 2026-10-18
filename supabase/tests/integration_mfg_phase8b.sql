-- ============================================================
-- Manufacturing ERP — Phase 8b integration test (migration 0042: reservations, purchasing units, lot genealogy, QC hold on payment).
--
-- Run it AFTER 0029–0042 are applied, or paste it after migration 0042 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the demo company. Order 3 (60 chairs) holds 90 board feet of lumber for itself; a new order for 60 tables is short of lumber by
-- 58 once that is taken into account. Lumber that arrives under inspection is quarantined and cannot be counted, and the invoice for it cannot be
-- paid until the lot is decided. A new batch-tracked product is made from a varnish lot, part of it is sold, and the lot is traced both ways.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; c2 int; n numeric; st text; h text;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  i_lum uuid; i_scr uuid; i_var uuid; i_table uuid; i_ply uuid; i_jam uuid; loc_rm uuid; loc_q uuid; vend1 uuid; vend2 uuid; cust uuid;
  po uuid; pl uuid; vi uuid; bill uuid; lot uuid; ot uuid; oj uuid; b uuid; rt uuid; est uuid; wc uuid; cmp uuid; so uuid; sl uuid; bj uuid; bv uuid;
  new_fns text[] := array['joinable_companies','create_mfg_company','mfg__my_tenant','mfg_assign_number','mfg_wc_number','mfg_seed_master_data','mfg_convert_qty',
    'mfg_save_item','mfg_delete_item','mfg_set_account','mfg_activity_rate','mfg_reaches','mfg_bom_cycle_guard','mfg_recalc_low_level',
    'mfg_save_bom','mfg_copy_bom','mfg_activate_bom','mfg_obsolete_bom','mfg_delete_bom','mfg_active_bom','mfg__explode','mfg_explode_bom',
    'mfg_where_used','mfg_compare_boms','mfg_save_routing','mfg_copy_routing','mfg_activate_routing','mfg_obsolete_routing',
    'mfg_delete_routing','mfg_routing_load','mfg_wc_available_hours',
    'mfg__cost_warn','mfg__cost_line','mfg__cost_bom','mfg__cost_item','mfg_create_cost_estimate','mfg_release_lines',
    'mfg_mark_cost_estimate','mfg_release_cost_estimate','mfg_moving_average',
    'mfg_yield_factor','mfg_seed_extra','set_mfg_negative_stock','check_journal_balanced','guard_mfg_control_accounts',
    'mfg_block_mutation','mfg_stock_guard','mfg__method','mfg__inv_key','mfg__item_cost','mfg__post_entry','mfg__batch','mfg__doc','mfg__move','mfg__pick',
    'mfg_create_po','mfg_delete_po','mfg_post_goods_receipt','mfg_post_stock_adjustment','mfg_transfer_stock',
    'mfg__order_components','mfg_create_order','mfg_release_order','mfg_approve_order','mfg_cancel_order','mfg_set_component_backflush',
    'mfg_order_wip','mfg_order_availability','mfg__issue_components','mfg_post_material_issue','mfg_post_confirmation','mfg_post_fg_receipt','mfg_reconciliation',
    'mfg__avg_after','mfg__move_so','mfg__refresh_order_status','mfg__reverse_entry','mfg__reverse_doc','mfg_reverse_document','mfg_reverse_confirmation',
    'mfg__variance_split','mfg_order_variances','mfg_settle_order','mfg_reverse_settlement','mfg_close_order','mfg_post_output_receipt',
    'mfg_post_delivery','mfg_create_invoice_from_so','guard_mfg_invoice_lines',
    'set_mfg_match_tolerance','mfg_po_match','mfg__vi_post','mfg_post_vendor_invoice','mfg_approve_held_invoice','mfg_reject_held_invoice',
    'mfg_void_vendor_invoice','mfg_post_landed_cost','mfg_void_landed_cost',
    'mfg__bucket','mfg__lot_qty','mfg__mrp_supply','mfg__mrp_exc','mfg_save_forecast','mfg_run_mrp','mfg_create_planned_order',
    'mfg_delete_planned_order','mfg_delete_requisition','mfg_convert_planned_order','mfg_convert_requisitions',
    'mfg_capacity_load','mfg_capacity_orders','mfg_convert_planned_orders','mfg_reschedule_planned_order','mfg_reschedule_order',
    'mfg__qc_quarantine','mfg__qc_line','mfg__qc_close_guard','mfg__qc_rev_guard','mfg_save_item_quality','mfg_save_inspection_plan',
    'mfg_record_inspection','mfg_decide_inspection_lot','mfg_close_ncr',
    'mfg_log_downtime','mfg_void_downtime','mfg_set_order_priority','mfg_dispatch_list','mfg_oee',
    'mfg__bal','mfg__acc_keys','mfg__line','mfg__period_plan','mfg_period_checks','mfg_period_list','mfg_period_preview','mfg_settle_period',
    'mfg__period_reverse','mfg_undo_period_settlement','mfg_close_period','mfg_reopen_period','mfg_cogm',
    'mfg__var_map','mfg__variance_net','mfg_profitability','mfg_variance_trend','mfg_inventory_analysis','mfg_supplier_performance',
    'mfg_production_kpis','mfg_lot_size_curve','mfg_class_comparison','mfg_load_demo','mfg_items_guard','mfg_bills_guard',
    'mfg_reservations','mfg_stock_availability','mfg_set_purchase_uom','mfg_lot_trace','mfg_expiry_report','mfg_dead_stock','mfg_payment_qc_guard'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr',
    'mfg_downtime','mfg_order_priority','mfg_periods','mfg_period_adjust'];
begin
  ---------------------------------------------------------------- Z. nothing Standard changed except the three scoped triggers
  select md5(string_agg(md5(pg_get_functiondef(p.oid)), '' order by p.oid::regprocedure::text)) into h
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> all(new_fns);
  res := res || case when h = '380f461235f530dc097fb7c054daaca9' then 'PASS ' else 'FAIL ' end || 'Z1 existing functions unchanged (' || h || E')\n';
  select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, column_name)) into h
    from information_schema.columns where table_schema = 'public' and table_name <> all(new_tabs)
     and not (table_name = 'mfg_company_settings' and column_name in ('allow_negative_stock', 'match_tolerance_pct'));
  res := res || case when h = 'e196786d70dc1f528bbb391b54f3c9fc' then 'PASS ' else 'FAIL ' end || 'Z2 existing columns unchanged (' || h || E')\n';
  select md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)) into h
    from pg_policies where schemaname = 'public' and tablename <> all(new_tabs);
  res := res || case when h = '568551cc4cc49b77c48fb07ce4591d61' then 'PASS ' else 'FAIL ' end || 'Z3 existing policies unchanged (' || h || E')\n';
  select md5(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, tgname)) into h
    from pg_trigger t where not tgisinternal and t.tgrelid::regclass::text !~ '^(auth|storage|realtime)\.' and t.tgrelid::regclass::text <> all(new_tabs)
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard', 'trg_mfg_items_guard', 'trg_mfg_bills_guard', 'trg_mfg_payment_qc_guard');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the three scoped ones (' || h || E')\n';
  res := res || case when has_function_privilege('authenticated', 'mfg_lot_trace(uuid, uuid, text)', 'execute') and not has_function_privilege('anon', 'mfg_lot_trace(uuid, uuid, text)', 'execute')
                      and not has_function_privilege('anon', 'mfg_stock_availability(uuid)', 'execute') and not has_function_privilege('authenticated', 'mfg_payment_qc_guard()', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z5 only signed-in users may call the new functions; the trigger function is not callable' || E'\n';

  ---------------------------------------------------------------- A. the demo company
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase8b Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();
  select m.item_id into i_lum from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'LUM-NARRA';
  select m.item_id into i_scr from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'SCR-WD';
  select m.item_id into i_var from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'VAR-GL';
  select m.item_id into i_ply from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'PLY-34';
  select m.item_id into i_table from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'TABLE-S';
  select id into loc_rm from mfg_storage_locations where tenant_id = mfg and code = 'RM-STORE';
  select id into loc_q from mfg_storage_locations where tenant_id = mfg and kind = 'QUARANTINE' limit 1;
  select id into vend1 from vendors where tenant_id = mfg and name like 'Cabanatuan%';
  select id into vend2 from vendors where tenant_id = mfg and name like 'Gapan%';
  select id into cust from customers where tenant_id = mfg and name like 'Casa Muebles%';

  ---------------------------------------------------------------- B. reservations
  select string_agg(i.sku || ' ' || trim_scale(r.reserved) || '/' || r.orders, '; ' order by i.sku) into st from mfg_reservations(mfg) r join items i on i.id = r.item_id;
  res := res || case when st = 'LUM-NARRA 90/1; SCR-WD 240/1; SND-SH 30/1; VAR-GL 12/1' then 'PASS ' else 'FAIL ' end || 'B1 what the released chair order still needs and has therefore reserved: ' || st || E'\n';
  select trim_scale(usable) || '/' || trim_scale(quarantine) || '/' || trim_scale(reserved) || '/' || trim_scale(available) || '/' || trim_scale(on_order) || '/' || trim_scale(projected) into st
    from mfg_stock_availability(mfg) where item_id = i_lum;
  res := res || case when st = '392/0/90/302/500/802' then 'PASS ' else 'FAIL ' end || 'B2 lumber usable/quarantine/reserved/available/on order/projected: ' || st || E'\n';
  ot := mfg_create_order(i_table, 60, current_date, current_date + 10);
  perform mfg_release_order(ot);
  select string_agg(item_name || ' ' || trim_scale(short), '; ' order by item_name) into st from mfg_order_availability(ot) where short > 0;
  res := res || case when st = 'Carton box 15; Marine plywood 3/4" 48; Narra lumber 58; Varnish 16.75' then 'PASS ' else 'FAIL ' end
                 || 'B3 60 tables are short of lumber by 58 because 90 are promised to the chair order (the old check said 0): ' || st || E'\n';
  select trim_scale(reserved_by_others) into st from mfg_order_availability(ot) where item_id = i_lum;
  res := res || case when st = '90' then 'PASS ' else 'FAIL ' end || 'B4 the lumber reserved by other orders=' || st || E'\n';

  ---------------------------------------------------------------- C. quarantine, and no payment until the lot is decided
  perform mfg_save_item_quality(i_lum, true, false);
  po := mfg_create_po(vend1, current_date, current_date + 3, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 100)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po;
  perform mfg_post_goods_receipt(po, current_date, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'location_id', loc_q)));
  select trim_scale(usable) || '/' || trim_scale(quarantine) into st from mfg_stock_availability(mfg) where item_id = i_lum;
  res := res || case when st = '392/100' then 'PASS ' else 'FAIL ' end || 'C1 the 100 board feet under inspection are not counted as usable (usable/quarantine): ' || st || E'\n';
  select short into n from mfg_order_availability(ot) where item_id = i_lum;
  res := res || case when n = 58 then 'PASS ' else 'FAIL ' end || 'C2 the tables are still short of lumber by 58 (quarantined stock does not help)=' || n || E'\n';
  vi := mfg_post_vendor_invoice(po, 'V-QC-1', current_date, current_date + 30, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 100)));
  select bill_id into bill from mfg_vendor_invoices where id = vi;
  begin perform record_bill_payment(bill, 1000, current_date, 'cash'); res := res || E'FAIL C3 an invoice for goods still under inspection was paid\n';
  exception when others then res := res || case when sqlerrm like '%Payment is on hold%' then 'PASS ' else 'FAIL ' end || 'C3 payment is held while the lot is undecided: ' || left(sqlerrm, 90) || E'\n'; end;
  select id into lot from mfg_inspection_lots where tenant_id = mfg and status in ('CREATED', 'IN_INSPECTION') limit 1;
  perform mfg_decide_inspection_lot(lot, 100, 0, 0, 0, null, null, current_date);
  perform record_bill_payment(bill, 1000, current_date, 'cash');
  select coalesce(sum(amount), 0) into n from bill_payments where bill_id = bill;
  res := res || case when n = 1000 then 'PASS ' else 'FAIL ' end || 'C4 once the lot is accepted the invoice can be paid=' || n || E'\n';
  select trim_scale(usable) || '/' || trim_scale(quarantine) into st from mfg_stock_availability(mfg) where item_id = i_lum;
  res := res || case when st = '492/0' then 'PASS ' else 'FAIL ' end || 'C5 and the accepted lumber becomes usable (usable/quarantine): ' || st || E'\n';

  ---------------------------------------------------------------- D. purchasing unit
  insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, i_scr, 'BOX', 'PC', 100);
  perform mfg_set_purchase_uom(i_scr, 'BOX');
  select purchase_uom into st from mfg_item_master where item_id = i_scr;
  res := res || case when st = 'BOX' then 'PASS ' else 'FAIL ' end || 'D1 the purchasing unit of the screws is a box: ' || st || E'\n';
  po := mfg_create_po(vend2, current_date, current_date + 5, jsonb_build_array(jsonb_build_object('item_id', i_scr, 'qty', 5, 'uom', 'BOX', 'unit_price', 80)));
  select trim_scale(l.qty) || ' PC @ ' || trim_scale(l.unit_cost) || ' | ordered ' || trim_scale(li.pur_qty) || ' ' || li.pur_uom || ' @ ' || trim_scale(li.pur_price) || ' | total ' || trim_scale(p.total)
    into st from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id join purchase_orders p on p.id = l.purchase_order_id where l.purchase_order_id = po;
  res := res || case when st = '500 PC @ 0.8 | ordered 5 BOX @ 80 | total 400' then 'PASS ' else 'FAIL ' end || 'D2 5 boxes at 80 become 500 pieces at 0.80: ' || st || E'\n';
  po := mfg_create_po(vend2, current_date, current_date + 5, jsonb_build_array(jsonb_build_object('item_id', i_scr, 'qty', 300, 'uom', 'PC', 'unit_price', 0.8)));
  select (li.pur_qty is null)::text || '/' || trim_scale(l.qty) into st from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po;
  res := res || case when st = 'true/300' then 'PASS ' else 'FAIL ' end || 'D3 a line ordered in the stocking unit keeps no purchasing-unit record: ' || st || E'\n';
  begin perform mfg_create_po(vend2, current_date, current_date + 5, jsonb_build_array(jsonb_build_object('item_id', i_scr, 'qty', 1, 'uom', 'KG', 'unit_price', 1)));
    res := res || E'FAIL D4 a unit with no conversion was accepted\n';
  exception when others then res := res || case when sqlerrm like '%no unit conversion%' then 'PASS ' else 'FAIL ' end || 'D4 a unit with no conversion is refused: ' || left(sqlerrm, 70) || E'\n'; end;
  begin perform mfg_set_purchase_uom(i_lum, 'DOZ'); res := res || E'FAIL D5 a purchasing unit with no conversion was saved\n';
  exception when others then res := res || E'PASS D5 a purchasing unit needs a conversion to the stocking unit\n'; end;
  perform mfg_set_purchase_uom(i_scr, null);
  select purchase_uom into st from mfg_item_master where item_id = i_scr;
  res := res || case when st is null then 'PASS ' else 'FAIL ' end || 'D6 clearing it puts the stocking unit back' || E'\n';

  ---------------------------------------------------------------- E. lot genealogy
  i_jam := mfg_save_item(null, jsonb_build_object('sku', 'JAM-FG', 'name', 'Varnish jar', 'item_type', 'FINISHED', 'make_or_buy', 'MAKE', 'base_uom', 'PC', 'batch_tracked', true));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_jam, 'valid_from', m1, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_var, 'qty', 0.5, 'uom', 'L'))));
  perform mfg_activate_bom(b);
  select id into wc from mfg_work_centers where tenant_id = mfg and name = 'Finishing';
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_jam, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Fill', 'work_center_id', wc, 'setup_min', 0, 'run_min_per_unit', 5, 'labor_min_per_unit', 5, 'machine_min_per_unit', 5))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_jam, 10, m1 + 1); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, m1 + 1);
  oj := mfg_create_order(i_jam, 10, current_date, current_date + 3);
  perform mfg_release_order(oj);
  select id into cmp from mfg_prod_components where order_id = oj and item_id = i_var;
  perform mfg_post_material_issue(oj, jsonb_build_array(jsonb_build_object('component_id', cmp, 'qty', 5)), current_date);
  perform mfg_post_confirmation(oj, 10, 10, 0, null, 0, 0.8, 0.8, true, current_date, null);
  perform mfg_post_fg_receipt(oj, 10, null, 'JAM-B1', current_date + 20, current_date);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust, current_date, 'draft', 560, 12, 60) returning id into so;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so, i_jam, 'Varnish jar', 4, 125) returning id into sl;
  update sales_orders set status = 'confirmed' where id = so;
  perform mfg_post_delivery(so, current_date, jsonb_build_array(jsonb_build_object('so_line_id', sl, 'qty', 4)));
  select id into bj from mfg_batches where tenant_id = mfg and batch_no = 'JAM-B1';
  select id into bv from mfg_batches where tenant_id = mfg and batch_no = 'VRN-' || to_char(m1, 'YYMM');
  select string_agg(kind, ',' order by level, ref_no) into st from mfg_lot_trace(mfg, bj, 'BACKWARD');
  res := res || case when st = 'LOT,PRODUCED,ORDER,INPUT,SUPPLIER' then 'PASS ' else 'FAIL ' end || 'E1 where the jar lot came from: ' || st || E'\n';
  select trim_scale(qty) || ' ' || batch_no || ' from ' || party into st from mfg_lot_trace(mfg, bj, 'BACKWARD') where kind = 'SUPPLIER';
  res := res || case when st = '30 VRN-' || to_char(m1, 'YYMM') || ' from Gapan Hardware & Finishes' then 'PASS ' else 'FAIL ' end || 'E2 the supplier of the varnish that went into it: ' || st || E'\n';
  select trim_scale(qty) into st from mfg_lot_trace(mfg, bj, 'BACKWARD') where kind = 'INPUT';
  res := res || case when st = '5' then 'PASS ' else 'FAIL ' end || 'E3 the varnish consumed by the order=' || st || E' litres\n';
  select string_agg(trim_scale(qty)::text, '; ' order by qty) into st from mfg_lot_trace(mfg, bv, 'FORWARD') where kind = 'USED_IN';
  res := res || case when st = '5; 5.25; 8.5' then 'PASS ' else 'FAIL ' end || 'E4 the three orders that used the varnish lot (litres): ' || st || E'\n';
  select count(*) || '/' || coalesce(max(trim_scale(qty))::text, '') || '/' || coalesce(max(party), '') into st from mfg_lot_trace(mfg, bv, 'FORWARD') where kind = 'DELIVERED';
  res := res || case when st = '1/4/Casa Muebles Manila' then 'PASS ' else 'FAIL ' end || 'E5 forward to the customer who got jars made from it (rows/qty/customer): ' || st || E'\n';
  select count(*) into c from mfg_lot_trace(mfg, bv, 'FORWARD') where kind = 'OUTPUT';
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'E6 what those orders produced: ' || c || E' receipts (chair, table, jar)\n';
  begin perform * from mfg_lot_trace(mfg, bv, 'SIDEWAYS'); res := res || E'FAIL E7 a bad direction was accepted\n';
  exception when others then res := res || E'PASS E7 only BACKWARD or FORWARD\n'; end;

  ---------------------------------------------------------------- F. expiry and dead stock
  perform mfg_post_stock_adjustment(i_var, loc_rm, 2, 320, 'OPENING', current_date, 'VRN-EXP', current_date - 3);
  select string_agg(batch_no || '=' || bucket, '; ' order by expiry_date) into st from mfg_expiry_report(mfg);
  res := res || case when st = 'VRN-EXP=EXPIRED; JAM-B1=DUE_30; VRN-' || to_char(m1, 'YYMM') || '=LATER' then 'PASS ' else 'FAIL ' end || 'F1 lots by expiry bucket: ' || st || E'\n';
  select days_left into c from mfg_expiry_report(mfg) where batch_no = 'VRN-EXP';
  res := res || case when c = -3 then 'PASS ' else 'FAIL ' end || 'F2 the expired lot is 3 days past=' || c || E'\n';
  select count(*) into c from mfg_dead_stock(mfg, 100000);
  select count(*) into n from (select s.item_id from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id where s.tenant_id = mfg and sl.kind <> 'WIP' group by s.item_id having sum(s.qty) > 0) q;
  select count(*) into c2 from mfg_dead_stock(mfg, 0);
  res := res || case when c = 0 and c2 = n then 'PASS ' else 'FAIL ' end || 'F3 nothing is dead after 100000 idle days; with 0 days every stocked item (' || n || ') is listed: ' || c || '/' || c2 || E'\n';
  select idle_days into c from mfg_dead_stock(mfg, 0) where item_id = i_ply;
  res := res || case when c = current_date - (m1 + 11) then 'PASS ' else 'FAIL ' end || 'F4 the plywood has been idle since the table order took it (' || c || E' days)\n';

  ---------------------------------------------------------------- G. who may look
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.10;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G1 the books check still ties after all of it (' || c || E' off)\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from mfg_lot_trace(mfg, bj, 'BACKWARD'); res := res || E'FAIL G2 another student traced a lot\n';
  exception when others then res := res || E'PASS G2 another student cannot trace the lot\n'; end;
  begin perform * from mfg_stock_availability(mfg); res := res || E'FAIL G3 another student read the availability\n';
  exception when others then res := res || E'PASS G3 another student cannot read the availability\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_stock_availability(mfg);
  select count(*) into c2 from mfg_expiry_report(mfg);
  res := res || case when c > 0 and c2 = 3 then 'PASS ' else 'FAIL ' end || 'G4 the teacher can read availability (' || c || ') and expiry (' || c2 || E')\n';
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'H1 the teacher deleted the company (left=' || c || E')\n';
  exception when others then res := res || 'FAIL H1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 8b — failures: %\n%', n, res;
end $$;
