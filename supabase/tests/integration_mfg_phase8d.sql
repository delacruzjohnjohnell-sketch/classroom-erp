-- ============================================================
-- Manufacturing ERP — Phase 8d integration test (migration 0044: the data behind the standard-format reports).
--
-- Run it AFTER 0029–0044 are applied, or paste it after migration 0044 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the demo company. Every report is drawn from the same books and each one is tied back to them: the trial balance nets to zero, the
-- stock card ends on the quantity in the store, work in process adds up to the ledger, goods received not invoiced add up to the GR/IR account.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; c2 int; n numeric; n2 numeric; st text; h text;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  i_lum uuid; i_var uuid; i_jam uuid; vend1 uuid; po uuid; pl uuid; vi uuid; wc uuid; b uuid; rt uuid; est uuid; oj uuid; cmp uuid; acc uuid[];
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
    'mfg_reservations','mfg_stock_availability','mfg_set_purchase_uom','mfg_lot_trace','mfg_expiry_report','mfg_dead_stock','mfg_payment_qc_guard',
    'mfg_log_changes','mfg__wc_machine_hours','mfg_set_work_center_upkeep','mfg_log_maintenance','mfg_work_center_usage','mfg_cost_drift',
    'mfg_account_balances','mfg_stock_card','mfg_wip_report','mfg_grir_aging','mfg_scrap_report','mfg_match_exceptions','mfg_inventory_schedule'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr',
    'mfg_downtime','mfg_order_priority','mfg_periods','mfg_period_adjust','mfg_change_log','mfg_maintenance_log'];
begin
  ---------------------------------------------------------------- Z. nothing Standard changed
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard', 'trg_mfg_items_guard', 'trg_mfg_bills_guard', 'trg_mfg_payment_qc_guard', 'trg_mfg_log_company_settings');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the scoped ones (' || h || E')\n';
  select count(*) into c from pg_proc where proname in ('mfg_account_balances', 'mfg_stock_card', 'mfg_wip_report', 'mfg_grir_aging', 'mfg_scrap_report', 'mfg_match_exceptions', 'mfg_inventory_schedule')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 7 then 'PASS ' else 'FAIL ' end || 'Z5 all seven report functions are for signed-in users only (' || c || E'/7)\n';

  ---------------------------------------------------------------- A. the demo company and the trial balance
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase8d Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();
  select m.item_id into i_lum from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'LUM-NARRA';
  select m.item_id into i_var from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'VAR-GL';
  select id into vend1 from vendors where tenant_id = mfg and name like 'Cabanatuan%';
  select id into wc from mfg_work_centers where tenant_id = mfg and name = 'Finishing';

  select coalesce(sum(closing), 0), count(*) into n, c from mfg_account_balances(mfg, null, current_date);
  res := res || case when abs(n) < 0.01 and c >= 30 then 'PASS ' else 'FAIL ' end || 'A1 the trial balance: debits equal credits over ' || c || ' accounts (net ' || n || E')\n';
  select count(*) into c from mfg_account_balances(mfg, m1 + 10, current_date) where abs(opening + debit - credit - closing) > 0.005;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A2 for a period, opening + debits − credits = closing on every account (' || c || E' off)\n';
  select coalesce(sum(opening), 0), coalesce(sum(debit - credit), 0) into n, n2 from mfg_account_balances(mfg, m1 + 10, current_date);
  res := res || case when abs(n) < 0.01 and abs(n2) < 0.01 then 'PASS ' else 'FAIL ' end || 'A3 the opening balances net to zero and so does the period''s activity (' || n || ' / ' || n2 || E')\n';
  select closing into n from mfg_account_balances(mfg, null, current_date) where code = '1200';
  res := res || case when n = (select round(coalesce(sum(jl.debit - jl.credit), 0), 2) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = mfg and a.code = '1200') and n > 0 then 'PASS ' else 'FAIL ' end || 'A4 raw materials per the report agree with the ledger balance function (' || n || E')\n';
  select coalesce(sum(closing), 0) into n from mfg_account_balances(mfg, null, m1 + 3);
  res := res || case when abs(n) < 0.01 then 'PASS ' else 'FAIL ' end || 'A5 an earlier date nets to zero as well (' || n || E')\n';
  select count(*) into c from mfg_account_balances(mfg, null, null);
  res := res || case when c >= 30 then 'PASS ' else 'FAIL ' end || 'A6 no dates means everything to date (' || c || E' accounts)\n';

  ---------------------------------------------------------------- B. the stock card
  select balance_qty into n from mfg_stock_card(mfg, i_lum, m1 - 5, current_date) where row_kind = 'CLOSING';
  select coalesce(sum(s.qty), 0) into n2 from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id where s.tenant_id = mfg and s.item_id = i_lum and sl.kind <> 'WIP';
  res := res || case when n = n2 and n > 0 then 'PASS ' else 'FAIL ' end || 'B1 the lumber card ends on the quantity in the store (' || n || ' vs ' || n2 || E')\n';
  select count(*) into c from (
    select balance_qty, lag(balance_qty) over (order by seq) pb, coalesce(qty_in, 0) - coalesce(qty_out, 0) mv, row_kind
      from mfg_stock_card(mfg, i_lum, m1 - 5, current_date)) q where row_kind = 'MOVE' and abs(balance_qty - (pb + mv)) > 0.000001;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B2 every running balance is the one before plus the movement (' || c || E' breaks)\n';
  select balance_qty into n from mfg_stock_card(mfg, i_lum, m1 + 5, current_date) where row_kind = 'OPENING';
  select coalesce(sum(coalesce(qty_in, 0) - coalesce(qty_out, 0)), 0) into n2 from mfg_stock_card(mfg, i_lum, m1 + 5, current_date) where row_kind = 'MOVE';
  select balance_qty::text into st from mfg_stock_card(mfg, i_lum, m1 + 5, current_date) where row_kind = 'CLOSING';
  res := res || case when n + n2 = st::numeric then 'PASS ' else 'FAIL ' end || 'B3 opening + receipts − issues = closing for a part-period (' || n || ' + ' || n2 || ' = ' || st || E')\n';
  select count(*) into c from mfg_stock_card(mfg, i_lum, m1 - 5, m1 - 4);
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'B4 a quiet period shows just the opening and closing lines (' || c || E')\n';
  begin perform * from mfg_stock_card(mfg, gen_random_uuid(), m1, current_date); res := res || E'FAIL B5 a stranger''s item was accepted\n';
  exception when others then res := res || E'PASS B5 an item that is not the company''s is refused\n'; end;

  ---------------------------------------------------------------- C. work in process
  i_jam := mfg_save_item(null, jsonb_build_object('sku', 'JAM-FG', 'name', 'Varnish jar', 'item_type', 'FINISHED', 'make_or_buy', 'MAKE', 'base_uom', 'PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_jam, 'valid_from', m1, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_var, 'qty', 0.5, 'uom', 'L'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_jam, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Fill', 'work_center_id', wc, 'setup_min', 0, 'run_min_per_unit', 5, 'labor_min_per_unit', 5, 'machine_min_per_unit', 5))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_jam, 10, m1 + 1); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, m1 + 1);
  oj := mfg_create_order(i_jam, 10, current_date, current_date + 3);
  perform mfg_release_order(oj);
  select id into cmp from mfg_prod_components where order_id = oj and item_id = i_var;
  perform mfg_post_material_issue(oj, jsonb_build_array(jsonb_build_object('component_id', cmp, 'qty', 5)), current_date);
  perform mfg_post_confirmation(oj, 10, 5, 1, 'Spilled varnish', 0, 0.4, 0.4, false, current_date, null);

  select w.wip, w.material into n, n2 from mfg_wip_report(mfg, current_date) w where w.order_id = oj;
  res := res || case when n = (select round(sum(amount), 2) from mfg_order_costs where order_id = oj) and n > 0 and n2 > 0 then 'PASS ' else 'FAIL ' end || 'C1 the open order is on the WIP report with its own cost: ' || n || ' (materials ' || n2 || E')\n';
  select coalesce(sum(w.wip), 0) into n from mfg_wip_report(mfg, current_date) w;
  res := res || case when abs(n - (select round(coalesce(sum(jl.debit - jl.credit), 0), 2) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = mfg and a.code = '1210')) < 0.10 then 'PASS ' else 'FAIL ' end
                 || 'C2 the WIP report adds up to the work-in-process account: ' || n || ' vs ' || (select round(coalesce(sum(jl.debit - jl.credit), 0), 2) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = mfg and a.code = '1210') || E'\n';
  select w.age_days::text || ' ' || w.bucket into st from mfg_wip_report(mfg, current_date + 40) w where w.order_id = oj;
  res := res || case when st = '40 31-60' then 'PASS ' else 'FAIL ' end || 'C3 forty days later the order is 40 days old, in the 31–60 bucket: ' || coalesce(st, 'none') || E'\n';
  select count(*) into c from mfg_wip_report(mfg, m1 - 30);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'C4 before anything was issued there is no work in process (' || c || E' orders)\n';

  ---------------------------------------------------------------- D. goods received, not invoiced
  po := mfg_create_po(vend1, current_date, current_date + 3, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 100)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po;
  perform mfg_post_goods_receipt(po, current_date, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 60)));
  select g.uninvoiced::text || '/' || g.value::text into st from mfg_grir_aging(mfg, current_date) g where g.po_line_id = pl;
  res := res || case when st = '60.000000/6000.00' then 'PASS ' else 'FAIL ' end || 'D1 60 received and not invoiced is worth 6000: ' || coalesce(st, 'none') || E'\n';
  vi := mfg_post_vendor_invoice(po, 'V-8D-1', current_date, current_date + 30, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 40, 'unit_price', 100)));
  select g.uninvoiced::text || '/' || g.value::text into st from mfg_grir_aging(mfg, current_date) g where g.po_line_id = pl;
  res := res || case when st = '20.000000/2000.00' then 'PASS ' else 'FAIL ' end || 'D2 after invoicing 40, 20 remain uninvoiced, worth 2000: ' || coalesce(st, 'none') || E'\n';
  select g.age_days::text || ' ' || g.bucket into st from mfg_grir_aging(mfg, current_date + 45) g where g.po_line_id = pl;
  res := res || case when st = '45 31-60' then 'PASS ' else 'FAIL ' end || 'D3 forty-five days on they are 45 days old, in the 31–60 bucket: ' || coalesce(st, 'none') || E'\n';
  select coalesce(sum(g.value), 0) into n from mfg_grir_aging(mfg, current_date) g;
  res := res || case when abs(n + (select round(coalesce(sum(jl.debit - jl.credit), 0), 2) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = mfg and a.code = '2050')) < 0.10 then 'PASS ' else 'FAIL ' end
                 || 'D4 the report adds up to the GR/IR account: ' || n || ' vs ' || -(select round(coalesce(sum(jl.debit - jl.credit), 0), 2) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = mfg and a.code = '2050') || E'\n';
  select count(*) into c from mfg_grir_aging(mfg, m1 - 30);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'D5 before any receipt there is nothing to report (' || c || E')\n';

  ---------------------------------------------------------------- E. scrap in pesos
  select r.scrap_qty::text || '/' || r.scrap_pct::text || '/' || r.reason into st from mfg_scrap_report(mfg, m1, current_date) r where r.item_id = i_jam;
  res := res || case when st = '1.000000/16.67/Spilled varnish' then 'PASS ' else 'FAIL ' end || 'E1 1 of 6 jars spilled: 16.67 %: ' || coalesce(st, 'none') || E'\n';
  select r.scrap_value, r.unit_cost into n, n2 from mfg_scrap_report(mfg, m1, current_date) r where r.item_id = i_jam;
  res := res || case when n = round(n2 * 1, 2) and n > 0 then 'PASS ' else 'FAIL ' end || 'E2 the loss in pesos is the scrapped quantity at the cost of one jar (' || n || ' = 1 × ' || n2 || E')\n';
  select count(*) into c from mfg_scrap_report(mfg, m1 - 60, m1 - 30);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E3 a period with no confirmations reports no scrap (' || c || E')\n';

  ---------------------------------------------------------------- F. three-way match exceptions
  perform mfg_post_goods_receipt(po, current_date, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 20)));
  vi := mfg_post_vendor_invoice(po, 'V-8D-2', current_date, current_date + 30, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 20, 'unit_price', 125)));
  select e.status || '/' || e.worst_price_var_pct::text || '/' || (e.reason is not null)::text into st from mfg_match_exceptions(mfg, current_date - 1, current_date) e where e.vendor_ref = 'V-8D-2';
  res := res || case when st = 'HELD/25.00/true' then 'PASS ' else 'FAIL ' end || 'F1 an invoice 25 % over the order price is held, with its reason: ' || coalesce(st, 'none') || E'\n';
  select count(*) into c from mfg_match_exceptions(mfg, current_date - 1, current_date) e where e.vendor_ref = 'V-8D-1';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F2 an invoice that matched is not an exception (' || c || E')\n';
  select count(*) into c from mfg_match_exceptions(mfg, m1 - 90, m1 - 60);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F3 another period has none (' || c || E')\n';

  ---------------------------------------------------------------- G. the inventory note (PAS 2)
  select count(*) into c from mfg_inventory_schedule(mfg, current_date, m1) where section = 'CARRYING';
  select coalesce(sum(ledger), 0) into n from mfg_inventory_schedule(mfg, current_date, m1) where section = 'CARRYING';
  select coalesce(sum(closing), 0) into n2 from mfg_account_balances(mfg, null, current_date) where code in ('1200', '1210', '1220', '1230');
  res := res || case when c = 4 and abs(n - n2) < 0.01 then 'PASS ' else 'FAIL ' end || 'G1 four classes whose total is the inventory accounts of the trial balance (' || n || ' = ' || n2 || E')\n';
  select count(*) into c from mfg_inventory_schedule(mfg, current_date, m1) where section = 'CARRYING' and abs(difference) >= 0.10;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G2 the stock records agree with the ledger in every class (' || c || E' differ)\n';
  select count(*) into c from mfg_inventory_schedule(mfg, current_date - 1, m1) where section = 'CARRYING' and subledger is not null;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G3 for a past date only the ledger is shown (' || c || E' tied)\n';
  select ledger into n from mfg_inventory_schedule(mfg, current_date, m1) where section = 'EXPENSE';
  select debit - credit into n2 from mfg_account_balances(mfg, m1, current_date) where code = '5000';
  res := res || case when n = n2 then 'PASS ' else 'FAIL ' end || 'G4 cost recognised as an expense = the cost-of-goods-sold activity (' || n || E')\n';
  select count(*) into c from mfg_inventory_schedule(mfg, current_date, m1) where section = 'WRITEDOWN';
  res := res || case when c >= 1 then 'PASS ' else 'FAIL ' end || 'G5 write-down accounts are listed (' || c || E')\n';

  ---------------------------------------------------------------- H. who may look
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from mfg_account_balances(mfg, null, null); res := res || E'FAIL H1 another student read the trial balance\n';
  exception when others then res := res || E'PASS H1 another student cannot read the trial balance\n'; end;
  begin perform * from mfg_wip_report(mfg, current_date); res := res || E'FAIL H2 another student read the WIP report\n';
  exception when others then res := res || E'PASS H2 another student cannot read the WIP report\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_account_balances(mfg, null, null);
  select count(*) into c2 from mfg_inventory_schedule(mfg, current_date, m1);
  res := res || case when c >= 30 and c2 > 0 then 'PASS ' else 'FAIL ' end || 'H3 the teacher can read the reports (' || c || ' accounts, ' || c2 || E' schedule lines)\n';
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I1 the teacher deleted the company (left=' || c || E')\n';
  exception when others then res := res || 'FAIL I1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 8d — failures: %\n%', n, res;
end $$;
