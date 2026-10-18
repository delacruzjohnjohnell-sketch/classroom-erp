-- ============================================================
-- Manufacturing ERP — Phase 7b integration test (migrations 0039 analytics and the class comparison, 0040 the demo company).
--
-- Run it AFTER 0029–0040 are applied, or paste it after migrations 0039 and 0040 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: a student loads the demo company (standard costing). Last month: two orders made and settled (38 chairs good + 2 scrap, 15 tables),
-- 35 chairs and 8 tables delivered for 98,850 of sales; purchase price variance from dearer lumber, plywood and varnish; the plywood
-- arrives 5 days late. This month: an order of 60 chairs part-way, an open purchase order, a sales order waiting. Then the analytics are
-- read, last month is settled, and a second student loads the demo under actual costing so the teacher can compare the two.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; q text;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  mfg uuid; mfg2 uuid; c int; c2 int; n numeric; n2 numeric; st text; h text; j jsonb; pid uuid;
  i_chair uuid; i_table uuid; i_lum uuid;
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
    'mfg_production_kpis','mfg_lot_size_curve','mfg_class_comparison','mfg_load_demo'];
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
  q := 'select coalesce(sum(jl.debit - jl.credit), 0) from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = %L and a.code = %L';

  ---------------------------------------------------------------- Z. nothing that existed was changed
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged (' || h || E')\n';
  res := res || case when has_function_privilege('authenticated', 'mfg_load_demo()', 'execute') and not has_function_privilege('anon', 'mfg_load_demo()', 'execute')
                      and not has_function_privilege('anon', 'mfg_class_comparison()', 'execute')
                      and not has_function_privilege('anon', 'mfg_profitability(uuid, date, date)', 'execute')
                      and not has_function_privilege('authenticated', 'mfg__var_map(uuid)', 'execute')
                      and not has_function_privilege('authenticated', 'mfg__variance_net(uuid)', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z5 only signed-in users may call the new functions, and the helpers are not callable at all' || E'\n';

  ---------------------------------------------------------------- A. the demo company
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  begin perform mfg_load_demo(); res := res || E'FAIL A0 the teacher loaded a demo\n';
  exception when others then res := res || E'PASS A0 the teacher can''t load a demo\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase7b Co', '2026-01-01', 'STANDARD');
  j := mfg_load_demo();
  res := res || case when j->>'last_month' = to_char(m1, 'YYYY-MM') and (j->>'items')::int = 8 then 'PASS ' else 'FAIL ' end || 'A1 the demo loaded: ' || j::text || E'\n';
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A2 the books check ties after the whole demo (areas off=' || c || E')\n';
  select string_agg(document_number || ':' || status, ', ' order by document_number) into st from mfg_production_orders where tenant_id = mfg;
  res := res || case when st = 'PRD-0001:TECHNICALLY_COMPLETE, PRD-0002:TECHNICALLY_COMPLETE, PRD-0003:PARTIALLY_CONFIRMED' then 'PASS ' else 'FAIL ' end || 'A3 orders: ' || st || E'\n';
  execute format(q, mfg, '4000') into n; execute format(q, mfg, '5000') into n2;
  res := res || case when n = -98850 and n2 = 46608.71 then 'PASS ' else 'FAIL ' end || 'A4 sales ' || (-n) || ', cost of goods sold ' || n2 || E' (expect 98,850 and 46,608.71)\n';
  select string_agg(code || ':' || severity, ',' order by code) into st from mfg_period_checks(mfg, m1);
  res := res || case when st = 'GRIR:info,WAGES_NOT_POSTED:warn' then 'PASS ' else 'FAIL ' end || 'A5 last month is ready to settle; the unposted wages are flagged: ' || st || E'\n';
  select count(*) into c from mfg_planned_orders where tenant_id = mfg;
  select count(*) into c2 from mfg_purchase_reqs where tenant_id = mfg;
  res := res || case when c >= 1 then 'PASS ' else 'FAIL ' end || 'A6 the MRP run on the waiting sales order left planned orders (' || c || ') and requisitions (' || c2 || E')\n';
  begin perform mfg_load_demo(); res := res || E'FAIL A7 the demo was loaded twice\n';
  exception when others then res := res || case when sqlerrm like '%needs an empty company%' then 'PASS ' else 'FAIL ' end || 'A7 a company that is not empty refuses it: ' || sqlerrm || E'\n'; end;
  select m.item_id into i_chair from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'CHAIR-D';
  select m.item_id into i_table from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'TABLE-S';
  select m.item_id into i_lum from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'LUM-NARRA';

  ---------------------------------------------------------------- B. profitability
  select string_agg(trim_scale(delivered_qty) || '/' || trim_scale(revenue), '; ' order by revenue) into st from mfg_profitability(mfg, m1, current_date);
  res := res || case when st = '8/33600; 35/65250' then 'PASS ' else 'FAIL ' end || 'B1 delivered units/revenue (table; chair): ' || st || E'\n';
  select sum(cost), sum(margin) into n, n2 from mfg_profitability(mfg, m1, current_date);
  res := res || case when abs(n - 46608.71) <= 0.05 and abs(n2 - (98850 - 46608.71)) <= 0.05 then 'PASS ' else 'FAIL ' end || 'B2 the cost adds up to the ledger''s cost of goods sold (within a centavo of rounding): ' || n || ', margin ' || n2 || E'\n';
  select count(*) into c from mfg_profitability(mfg, current_date, current_date);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B3 a range with no deliveries is empty' || E'\n';
  begin perform * from mfg_profitability(mfg, current_date, m1); res := res || E'FAIL B4 backwards dates accepted\n';
  exception when others then res := res || E'PASS B4 backwards dates refused\n'; end;

  ---------------------------------------------------------------- C. variance trend
  select string_agg(bucket || '=' || trim_scale(amount), ', ' order by bucket) into st from mfg_variance_trend(mfg, current_date, 3) where month_start = m1 and amount <> 0;
  res := res || case when st = 'FIXED_OH=379.07, LABOR_EFF=805.52, MACHINE_OH=353.33, MATERIAL=1650.8, PPV=3050' then 'PASS ' else 'FAIL ' end || 'C1 what arose last month: ' || st || E'\n';
  select count(distinct month_start) into c from mfg_variance_trend(mfg, current_date, 3);
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'C2 three months are returned (' || c || E')\n';

  ---------------------------------------------------------------- D. inventory
  select sum(value) into n from mfg_inventory_analysis(mfg, 90);
  select (select coalesce(sum(jl.debit - jl.credit), 0) from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
           where e.tenant_id = mfg and a.code in ('1200', '1220', '1230')) into n2;
  res := res || case when n = n2 then 'PASS ' else 'FAIL ' end || 'D1 the stock values add up to the inventory accounts: ' || n || ' vs ' || n2 || E'\n';
  select trim_scale(qty) || '/' || trim_scale(used_qty) into st from mfg_inventory_analysis(mfg, 90) where item_id = i_lum;
  res := res || case when st = '392/308' then 'PASS ' else 'FAIL ' end || 'D2 lumber on hand / used in 90 days: ' || st || E' (700 bought − 308 issued)\n';
  select (select abc from mfg_inventory_analysis(mfg, 90) order by value desc limit 1) || '/' || (select trim_scale(max(cum_pct)) from mfg_inventory_analysis(mfg, 90)) || '/' ||
         (select count(*) from mfg_inventory_analysis(mfg, 90) where abc not in ('A', 'B', 'C')) into st;
  res := res || case when st = 'A/100/0' then 'PASS ' else 'FAIL ' end || 'D3 the most valuable item is class A, the running share ends at 100 %: ' || st || E'\n';
  select days_cover into n from mfg_inventory_analysis(mfg, 90) where item_id = i_lum;
  res := res || case when n = round(392 / (308 / 90.0), 1) then 'PASS ' else 'FAIL ' end || 'D4 days of cover for lumber=' || n || E'\n';
  begin perform * from mfg_inventory_analysis(mfg, 3); res := res || E'FAIL D5 a 3-day look-back was accepted\n';
  exception when others then res := res || E'PASS D5 look-back must be 7 to 365 days\n'; end;

  ---------------------------------------------------------------- E. suppliers
  select string_agg(vendor_name || ': po ' || po_count || ', ordered ' || trim_scale(qty_ordered) || ', received ' || trim_scale(qty_received) || ', on time ' || lines_on_time || ', late ' || lines_late ||
                    ', days late ' || coalesce(trim_scale(avg_days_late)::text, '-') || ', ppv ' || trim_scale(ppv) || ', rejected ' || trim_scale(rejected_qty), E'\n' order by vendor_name) into st
    from mfg_supplier_performance(mfg, m1, current_date);
  res := res || case when st = E'Cabanatuan Timber Supply: po 2, ordered 915, received 415, on time 1, late 1, days late 5, ppv 2750, rejected 0\nGapan Hardware & Finishes: po 1, ordered 4390, received 4390, on time 4, late 0, days late -, ppv 300, rejected 0'
                then 'PASS ' else 'FAIL ' end || E'E1 supplier scorecard:\n' || st || E'\n';

  ---------------------------------------------------------------- F. production
  select string_agg((select i.sku from items i where i.id = k.item_id) || ': ' || orders || ' order, good ' || trim_scale(qty_good) || ', scrap ' || trim_scale(qty_scrap) || ' (' || trim_scale(scrap_pct) || ' %), on time ' || on_time ||
                    ', late ' || late || ', lead ' || trim_scale(avg_lead_days) || ' d', E'\n' order by (select i.sku from items i where i.id = k.item_id)) into st from mfg_production_kpis(mfg, m1, current_date) k;
  res := res || case when st = E'CHAIR-D: 1 order, good 38, scrap 2 (5 %), on time 1, late 0, lead 9 d\nTABLE-S: 1 order, good 15, scrap 0 (0 %), on time 1, late 0, lead 11 d'
                then 'PASS ' else 'FAIL ' end || E'F1 production figures:\n' || st || E'\n';
  select actual_unit_cost - std_unit_cost into n from mfg_production_kpis(mfg, m1, current_date) where item_id = i_chair;
  select actual_unit_cost - std_unit_cost into n2 from mfg_production_kpis(mfg, m1, current_date) where item_id = i_table;
  res := res || case when n > 0 and abs(n2) < abs(n) then 'PASS ' else 'FAIL ' end || 'F2 the chair cost more than its standard (+' || round(n, 2) || ') and the table came out near it (' || round(n2, 2) || E')\n';

  ---------------------------------------------------------------- G. cost by lot size
  select count(*) into c from mfg_cost_estimates where tenant_id = mfg;
  select string_agg(trim_scale(lot_size) || '=' || round(unit_cost, 2), ', ' order by lot_size) into st from mfg_lot_size_curve(i_chair, array[1, 10, 100, 1000], m1 + 10);
  select count(*) into c2 from mfg_cost_estimates where tenant_id = mfg;
  res := res || case when c = c2 then 'PASS ' else 'FAIL ' end || 'G1 the curve wrote no estimates (' || c || ' before, ' || c2 || E' after)\n';
  select ((select unit_cost from mfg_lot_size_curve(i_chair, array[1], m1 + 10)) > (select unit_cost from mfg_lot_size_curve(i_chair, array[10], m1 + 10))
     and (select unit_cost from mfg_lot_size_curve(i_chair, array[10], m1 + 10)) > (select unit_cost from mfg_lot_size_curve(i_chair, array[100], m1 + 10))
     and (select unit_cost from mfg_lot_size_curve(i_chair, array[100], m1 + 10)) > (select unit_cost from mfg_lot_size_curve(i_chair, array[1000], m1 + 10)))::int into c;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'G2 the unit cost falls as the lot grows: ' || st || E'\n';
  select count(distinct material) into c from mfg_lot_size_curve(i_chair, array[1, 10, 100, 1000], m1 + 10);
  select material into n from mfg_lot_size_curve(i_chair, array[10], m1 + 10);
  res := res || case when c = 1 and n = 361.4 then 'PASS ' else 'FAIL ' end || 'G3 material per chair is the same at every lot size (' || n || E', 3×95 + 8×0.8 + 0.2×320 + 0.5×12)\n';
  begin perform * from mfg_lot_size_curve(i_chair, array[0], m1 + 10); res := res || E'FAIL G4 a zero lot size was accepted\n';
  exception when others then res := res || E'PASS G4 lot sizes must be above zero\n'; end;
  begin perform * from mfg_lot_size_curve(i_chair, array[]::numeric[], m1 + 10); res := res || E'FAIL G5 an empty list was accepted\n';
  exception when others then res := res || E'PASS G5 at least one lot size is needed\n'; end;

  ---------------------------------------------------------------- H. month end on the demo, and the analytics still read right
  pid := mfg_settle_period(m1);
  select (detail->'labor'->>'variance')::numeric into n from mfg_periods where id = pid;
  res := res || case when abs(n - 481.25) < 0.1 then 'PASS ' else 'FAIL ' end || 'H1 the carpenter is paid 90 against a planned 85: labor rate variance=' || n || E' (expect about 481.25)\n';
  select string_agg(bucket || '=' || trim_scale(amount), ', ' order by bucket) into st from mfg_variance_trend(mfg, current_date, 3) where month_start = m1 and amount <> 0 and bucket <> 'LABOR_RATE';
  select amount into n2 from mfg_variance_trend(mfg, current_date, 3) where month_start = m1 and bucket = 'LABOR_RATE';
  res := res || case when st = 'FIXED_OH=379.07, LABOR_EFF=805.52, MACHINE_OH=353.33, MATERIAL=1650.8, PPV=3050' and abs(n2 - 481.25) < 0.1 then 'PASS ' else 'FAIL ' end
                 || 'H2 closing the variances does not make them vanish from the trend (labor rate ' || n2 || '): ' || st || E'\n';
  execute format(q, mfg, '5510') into n;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'H3 while the usage variance account itself is closed to ' || n || E'\n';
  j := mfg_cogm(mfg, m1, (m1 + interval '1 month - 1 day')::date);
  select string_agg((l->>'key') || '=' || trim_scale((l->>'diff')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'checks') with ordinality t(l, ord);
  res := res || case when st = 'materials=0, wip=0, received=0' then 'PASS ' else 'FAIL ' end || 'H4 last month''s statement of cost of goods manufactured ties out: ' || st || E'\n';
  perform mfg_close_period(m1);

  ---------------------------------------------------------------- I. a second student loads the demo under actual costing; the teacher compares
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg2 := create_mfg_company('zz Phase7b Actual Co', '2026-01-01', 'ACTUAL');
  j := mfg_load_demo();
  select count(*) into c from mfg_reconciliation(mfg2) where abs(difference) >= 0.10;
  res := res || case when c = 0 and (j->>'items')::int = 8 then 'PASS ' else 'FAIL ' end || 'I1 the demo also loads under actual costing and the books check ties to within a few centavos (areas off by 10 centavos or more=' || c || E')\n';
  begin perform * from mfg_profitability(mfg, m1, current_date); res := res || E'FAIL I2 another student read the first company''s profitability\n';
  exception when others then res := res || E'PASS I2 another student cannot read it\n'; end;
  begin perform * from mfg_class_comparison(); res := res || E'FAIL I3 a student read the class comparison\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'I3 the class comparison is the teacher''s: ' || sqlerrm || E'\n'; end;
  begin perform * from mfg_lot_size_curve(i_chair, array[10], m1 + 10); res := res || E'FAIL I4 another student priced the first company''s product\n';
  exception when others then res := res || E'PASS I4 another student cannot use the lot-size curve on it\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select string_agg(company || '|' || costing_method || '|' || trim_scale(revenue) || '|' || trim_scale(cogs) || '|' || trim_scale(gross_margin) || '|' || trim_scale(inventory_value) || '|' || orders_made || '|' || trim_scale(good_qty) || '|' ||
                    coalesce(trim_scale(scrap_pct)::text, '-') || '|' || trim_scale(variances) || '|' || months_closed || '|' || books_tie, E'\n' order by company) into st
    from mfg_class_comparison() where company like 'zz Phase7b%';
  res := res || E'INFO the class comparison:\n' || st || E'\n';
  select revenue, cogs, months_closed, books_tie::int into n, n2, c, c2 from mfg_class_comparison() where company = 'zz Phase7b Co';
  res := res || case when n = 98850 and n2 = 53328.68 and c = 1 and c2 = 1 then 'PASS ' else 'FAIL ' end || 'I5 the teacher sees the first company (cost of goods sold 46,608.71 + 6,719.97 of closed variances): revenue ' || n || ', cost ' || n2 || ', months closed ' || c || E'\n';
  select count(*) into c from mfg_class_comparison() where company like 'zz Phase7b%' and books_tie and orders_made = 2 and good_qty = 53;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'I6 both companies made 2 orders / 53 good units and their books tie (' || c || E' of 2)\n';
  select count(*) into c from mfg_profitability(mfg2, m1, current_date);
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'I7 the teacher can read any company''s analytics (' || c || E' products)\n';

  ---------------------------------------------------------------- J. the teacher deletes both companies
  begin
    perform delete_company(mfg); perform delete_company(mfg2);
    select count(*) into c from tenants where id in (mfg, mfg2);
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J1 both demo companies deleted (left=' || c || E')\n';
  exception when others then res := res || 'FAIL J1 deleting failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 7b — failures: %\n%', n, res;
end $$;
