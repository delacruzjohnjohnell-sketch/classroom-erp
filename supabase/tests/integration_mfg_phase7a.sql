-- ============================================================
-- Manufacturing ERP — Phase 7a integration test (migration 0038: period-end close and the cost of goods manufactured).
--
-- Run it AFTER 0029–0038 are applied, or paste it after migration 0038 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the plan's Dining Chair (standard costing) carried through November 2026:
--   100 chairs, 98 good + 2 scrap, made by a welder paid 82 an hour against a planned 80 → 160 h: applied 12,800, real wage 13,120.
--   Purchase price variance 1,000; settlement variances 1,076 + 1,040 + 300 + 520. At the month end the labor rate variance of 320
--   joins them: 1,000 + 1,076 + 1,040 + 300 + 520 + 320 = 4,256, closed to cost of goods sold (or prorated).
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; q text;
  mfg uuid; c int; n numeric; n2 numeric; x_num numeric; st text; h text; je uuid; je2 uuid; x uuid; pid uuid; j jsonb;
  i_lum uuid; i_scr uuid; i_var uuid; i_chair uuid; wc1 uuid; b uuid; rt uuid; est uuid; vend uuid; po uuid; pl_lum uuid; pl_scr uuid; pl_var uuid;
  loc_rm uuid; o1 uuid; o2 uuid; cm_lum uuid; cm_scr uuid; cm_var uuid; emp uuid; cust uuid; so1 uuid; sl1 uuid; a_pay uuid; a_cash uuid;
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
    'mfg__period_reverse','mfg_undo_period_settlement','mfg_close_period','mfg_reopen_period','mfg_cogm'];
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
  res := res || case when has_function_privilege('authenticated', 'mfg_settle_period(date, text)', 'execute') and not has_function_privilege('anon', 'mfg_settle_period(date, text)', 'execute')
                      and not has_function_privilege('anon', 'mfg_cogm(uuid, date, date)', 'execute')
                      and not has_function_privilege('authenticated', 'mfg__period_plan(uuid, date)', 'execute')
                      and not has_function_privilege('authenticated', 'mfg__bal(uuid, uuid[], date, date)', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z5 only signed-in users may call the new functions, and the helpers are not callable at all' || E'\n';

  ---------------------------------------------------------------- set-up: the Dining Chair order, settled
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase7a Co', '2026-01-01', 'STANDARD');

  i_lum := mfg_save_item(null, jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',60));
  i_scr := mfg_save_item(null, jsonb_build_object('sku','SCR','name','Screw','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1));
  i_var := mfg_save_item(null, jsonb_build_object('sku','VAR','name','Varnish','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',250,'batch_tracked',true));
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Dining chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  insert into mfg_work_centers (tenant_id, name) values (mfg, 'Chair line') returning id into wc1;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select mfg, wc1, id, '2026-10-01'::date, case kind when 'LABOR' then 80 when 'MACHINE' then 100 else 0 end from mfg_activity_types where kind in ('LABOR','MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 40 where kind = 'FIXED';
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lum, 'qty', 3, 'uom', 'BF'), jsonb_build_object('component_item_id', i_scr, 'qty', 8, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_var, 'qty', 0.2, 'uom', 'L'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Build', 'work_center_id', wc1, 'run_min_per_unit', 90, 'labor_min_per_unit', 90, 'machine_min_per_unit', 30))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_chair, 1, '2026-11-15');
  perform mfg_mark_cost_estimate(est);
  perform mfg_release_cost_estimate(est, '2026-11-15');
  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (mfg, 'zz welder', 'welder', 0, 'hourly', 82) returning id into emp;

  perform mfg_post_stock_adjustment(i_lum, loc_rm, 150, null, 'OPENING', '2026-11-05');
  insert into vendors (tenant_id, name) values (mfg, 'zz Lumber Co') returning id into vend;
  po := mfg_create_po(vend, '2026-11-10', '2026-11-12', jsonb_build_array(
    jsonb_build_object('item_id', i_lum, 'qty', 200, 'unit_price', 65), jsonb_build_object('item_id', i_scr, 'qty', 1000, 'unit_price', 1),
    jsonb_build_object('item_id', i_var, 'qty', 25, 'unit_price', 250)));
  select l.id into pl_lum from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_lum;
  select l.id into pl_scr from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_scr;
  select l.id into pl_var from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_var;
  perform mfg_post_goods_receipt(po, '2026-11-12', jsonb_build_array(
    jsonb_build_object('po_line_id', pl_lum, 'qty', 200), jsonb_build_object('po_line_id', pl_scr, 'qty', 1000),
    jsonb_build_object('po_line_id', pl_var, 'qty', 25, 'batch_no', 'V1', 'expiry', '2027-06-30')));
  o1 := mfg_create_order(i_chair, 100, '2026-11-16', '2026-11-30');
  perform mfg_release_order(o1);
  select id into cm_lum from mfg_prod_components where order_id = o1 and item_id = i_lum;
  select id into cm_scr from mfg_prod_components where order_id = o1 and item_id = i_scr;
  select id into cm_var from mfg_prod_components where order_id = o1 and item_id = i_var;
  perform mfg_post_material_issue(o1, jsonb_build_array(
    jsonb_build_object('component_id', cm_lum, 'qty', 310), jsonb_build_object('component_id', cm_scr, 'qty', 800), jsonb_build_object('component_id', cm_var, 'qty', 20)), '2026-11-16');
  perform mfg_post_confirmation(o1, 10, 98, 2, 'Cracked in the press', 0, 160, 52, true, '2026-11-20', emp);
  perform mfg_post_fg_receipt(o1, 98, null, null, null, '2026-11-22');
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A1 the books check ties before the month end (areas that do not tie=' || c || E')\n';

  ---------------------------------------------------------------- A. checks before settling
  select string_agg(code || ':' || severity, ',' order by code) into st from mfg_period_checks(mfg, '2026-11-01') where severity in ('block', 'warn');
  res := res || case when st = 'ORDERS_NOT_SETTLED:warn,WAGES_NOT_POSTED:warn' then 'PASS ' else 'FAIL ' end || 'A2 a finished order is not settled and the wages were never posted: ' || st || E'\n';
  -- payroll posted by hand (what the payroll run would have done): Dr Payroll Expense 13,120, Cr Cash
  execute 'reset role';
  select id into a_pay from accounts where tenant_id = mfg and code = '5300';
  select id into a_cash from accounts where tenant_id = mfg and code = '1000';
  insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-11-30', 'zz payroll for production') returning id into je;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_pay, 13120, 0), (je, a_cash, 0, 13120);
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  x := mfg_settle_order(o1, '2026-11-30');
  select count(*) into c from mfg_period_checks(mfg, '2026-11-01') where severity in ('block', 'warn');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A3 order settled and payroll posted: no blocks or warnings left (' || c || E')\n';
  select count(*) into c from mfg_period_checks(mfg, '2026-11-01') where code = 'GRIR' and severity = 'info';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'A4 goods received and not invoiced are mentioned as information' || E'\n';

  ---------------------------------------------------------------- B. preview and settle
  j := mfg_period_preview(mfg, '2026-11-15');
  res := res || case when (j->'labor'->>'hours')::numeric = 160 and (j->'labor'->>'applied')::numeric = 12800
                      and (j->'labor'->>'actual')::numeric = 13120 and (j->'labor'->>'variance')::numeric = 320 then 'PASS ' else 'FAIL ' end
                 || 'B1 preview: 160 h, applied 12,800, real wage 13,120, labor rate variance 320: ' || (j->'labor')::text || E'\n';
  select sum((v->>'amount')::numeric) into n from jsonb_array_elements(j->'variances') v;
  res := res || case when n = 4256 and (j->>'to_cogs')::numeric = 4256 and jsonb_array_length(j->'display') = 10 then 'PASS ' else 'FAIL ' end
                 || 'B2 preview: variances to close=' || n || ' (expect 4,256), all to cost of goods sold, ' || jsonb_array_length(j->'display') || E' lines shown (expect 10)\n';
  pid := mfg_settle_period('2026-11-15', 'first close');
  select labor_je, close_je into je, je2 from mfg_periods where id = pid;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '5300 Dr 0.00 Cr 13120.00; 5530 Dr 320.00 Cr 0.00; 5700 Dr 12800.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'B3 labor entry: ' || st || E'\n';
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je2;
  res := res || case when st = '5000 Dr 4256.00 Cr 0.00; 5500 Dr 0.00 Cr 1000.00; 5510 Dr 0.00 Cr 1076.00; 5520 Dr 0.00 Cr 1040.00; 5530 Dr 0.00 Cr 320.00; 5540 Dr 0.00 Cr 300.00; 5550 Dr 0.00 Cr 520.00' then 'PASS ' else 'FAIL ' end
                 || 'B4 variance close: ' || st || E'\n';
  select coalesce(sum(jl.debit - jl.credit), 0) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id
   where e.tenant_id = mfg and a.code in ('5500', '5510', '5520', '5530', '5540', '5550', '5700', '5300');
  execute format(q, mfg, '5000') into n2;
  res := res || case when n = 0 and n2 = 4256 then 'PASS ' else 'FAIL ' end || 'B5 variance, applied-labor and payroll accounts net to ' || n || ' (expect 0); cost of goods sold=' || n2 || E' (expect 4,256)\n';
  begin perform mfg_settle_period('2026-11-01'); res := res || E'FAIL B6 a month was settled twice\n';
  exception when others then res := res || case when sqlerrm like '%already settled%' then 'PASS ' else 'FAIL ' end || 'B6 a settled month can''t be settled again: ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B7 the books check still ties after the month end (' || c || E')\n';
  begin perform mfg_undo_period_settlement('2026-11-01', ''); res := res || E'FAIL B8 undone without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'B8 a reason is required to undo: ' || sqlerrm || E'\n'; end;
  perform mfg_undo_period_settlement('2026-11-20', 'Wrong method chosen');
  execute format(q, mfg, '5510') into n; execute format(q, mfg, '5000') into n2; execute format(q, mfg, '5300') into x_num;
  select count(*) into c from mfg_periods where tenant_id = mfg;
  res := res || case when n = 1076 and n2 = 0 and x_num = 13120 and c = 0 then 'PASS ' else 'FAIL ' end
                 || 'B9 undone: usage variance back to ' || n || ', cost of goods sold ' || n2 || ', payroll ' || x_num || ', month records ' || c || E'\n';
  pid := mfg_settle_period('2026-11-01');
  select status into st from mfg_periods where id = pid;
  res := res || case when st = 'SETTLED' then 'PASS ' else 'FAIL ' end || 'B10 settled again: ' || st || E'\n';

  ---------------------------------------------------------------- C. the statement of cost of goods manufactured
  j := mfg_cogm(mfg, '2026-11-01', '2026-11-30');
  select string_agg((l->>'key') || '=' || trim_scale((l->>'amount')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'lines') with ordinality t(l, ord);
  res := res || case when st = 'rm_beg=0, purch=28250, rm_end=-3850, used=24400, labor=12800, mach=5200, fix=6400, total=48800, wip_beg=0, wip_end=0, cogm=48800, written=-2936, to_fg=45864'
                then 'PASS ' else 'FAIL ' end || 'C1 statement: ' || st || E'\n';
  select string_agg((l->>'key') || '=' || trim_scale((l->>'diff')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'checks') with ordinality t(l, ord);
  res := res || case when st = 'materials=0, wip=0, received=0' then 'PASS ' else 'FAIL ' end || 'C2 the ledger and the production documents agree: ' || st || E'\n';
  select string_agg((l->>'key') || '=' || trim_scale((l->>'amount')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'cogs') with ordinality t(l, ord);
  res := res || case when st = 'fg_beg=0, fg_in=45864, fg_end=-45864, derived=0, other=0, cogs_pre=0, close=4256, cogs=4256' then 'PASS ' else 'FAIL ' end || 'C3 cost of goods sold block: ' || st || E'\n';
  begin perform mfg_cogm(mfg, '2026-11-30', '2026-11-01'); res := res || E'FAIL C4 backwards dates were accepted\n';
  exception when others then res := res || E'PASS C4 backwards dates are refused\n'; end;

  ---------------------------------------------------------------- D. close, lock, re-open
  perform mfg_close_period('2026-11-01');
  select to_char(books_locked_through, 'YYYY-MM-DD') into st from tenants where id = mfg;
  res := res || case when st = '2026-11-30' then 'PASS ' else 'FAIL ' end || 'D1 the books are locked through ' || st || E'\n';
  begin perform mfg_post_stock_adjustment(i_lum, loc_rm, 1, null, 'COUNT', '2026-11-29'); res := res || E'FAIL D2 an entry was posted into a closed month\n';
  exception when others then res := res || case when sqlerrm like '%locked%' then 'PASS ' else 'FAIL ' end || 'D2 nothing can be posted into a closed month: ' || sqlerrm || E'\n'; end;
  begin perform mfg_close_period('2026-11-01'); res := res || E'FAIL D3 closed twice\n';
  exception when others then res := res || case when sqlerrm like '%already closed%' then 'PASS ' else 'FAIL ' end || 'D3 a closed month can''t be closed again: ' || sqlerrm || E'\n'; end;
  begin perform mfg_undo_period_settlement('2026-11-01', 'oops'); res := res || E'FAIL D4 a student undid a closed month\n';
  exception when others then res := res || case when sqlerrm like '%teacher%' then 'PASS ' else 'FAIL ' end || 'D4 a student can''t undo a closed month: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reopen_period(mfg, '2026-11-01', 'please'); res := res || E'FAIL D5 a student re-opened a month\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'D5 a student can''t re-open: ' || sqlerrm || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform mfg_reopen_period(mfg, '2026-11-01', ''); res := res || E'FAIL D6 re-opened without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'D6 the teacher must give a reason: ' || sqlerrm || E'\n'; end;
  begin perform mfg_settle_period('2026-12-01'); res := res || E'FAIL D7 the teacher settled a student''s month\n';
  exception when others then res := res || E'PASS D7 the teacher can''t settle a student''s month\n'; end;
  perform mfg_reopen_period(mfg, '2026-11-15', 'Teacher check');
  select coalesce(to_char(books_locked_through, 'YYYY-MM-DD'), 'none') into st from tenants where id = mfg;
  execute format(q, mfg, '5510') into n; execute format(q, mfg, '5000') into n2;
  select count(*) into c from mfg_periods where tenant_id = mfg;
  res := res || case when st = 'none' and n = 1076 and n2 = 0 and c = 0 then 'PASS ' else 'FAIL ' end
                 || 'D8 re-opened: lock ' || st || ', usage variance ' || n || ', cost of goods sold ' || n2 || ', month records ' || c || E'\n';
  select count(*) into c from mfg_audit_log where tenant_id = mfg and event in ('period_settled', 'period_closed', 'period_reopened');
  res := res || case when c = 5 then 'PASS ' else 'FAIL ' end || 'D9 every step left an audit-log row (' || c || E' of 5: settled, undone, settled, closed, re-opened)\n';

  ---------------------------------------------------------------- E. months are closed in order
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_post_stock_adjustment(i_lum, loc_rm, 100, null, 'OPENING', '2026-12-02');
  select string_agg(code || ':' || severity, ',' order by code) into st from mfg_period_checks(mfg, '2026-12-01') where severity = 'block';
  res := res || case when st = 'EARLIER_OPEN:block' then 'PASS ' else 'FAIL ' end || 'E1 December can''t be closed while November is open: ' || st || E'\n';
  begin perform mfg_settle_period('2026-12-01'); res := res || E'FAIL E2 December was settled before November\n';
  exception when others then res := res || case when sqlerrm like '%earlier month%' then 'PASS ' else 'FAIL ' end || 'E2 settling is refused: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- F. proration: more activity in November, then close with PRORATE
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform update_mfg_settings(mfg, null, 'PRORATE', 'COGS', null);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into customers (tenant_id, name) values (mfg, 'zz Casa Muebles') returning id into cust;
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-11-25', 'draft', 56000, 12, 6000) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_chair, 'Dining chair', 50, 1000) returning id into sl1;
  update sales_orders set status = 'confirmed' where id = so1;
  perform mfg_post_delivery(so1, '2026-11-26', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 50)));
  o2 := mfg_create_order(i_chair, 10, '2026-11-25', '2026-11-30');
  perform mfg_release_order(o2);
  select id into cm_lum from mfg_prod_components where order_id = o2 and item_id = i_lum;
  perform mfg_post_material_issue(o2, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 30)), '2026-11-25');
  j := mfg_period_preview(mfg, '2026-11-01');
  res := res || case when (j->'bases'->>'wip')::numeric = 1800 and (j->'bases'->>'fg')::numeric = 22464 and (j->'bases'->>'cogs')::numeric = 23400 then 'PASS ' else 'FAIL ' end
                 || 'F1 balances to prorate over (work in process / finished goods / cost of goods sold): ' || (j->'bases')::text || E' (expect 1,800 / 22,464 / 23,400)\n';
  select string_agg((v->>'code') || ':' || (v->>'method') || ':' || trim_scale((v->>'wip')::numeric) || '/' || trim_scale((v->>'fg')::numeric) || '/' || trim_scale((v->>'cogs')::numeric), '; ' order by v->>'code') into st from jsonb_array_elements(j->'variances') v;
  res := res || case when st = '5500:PRORATE:37.76/471.3/490.94; 5510:PRORATE:40.63/507.12/528.25; 5520:PRORATE:39.27/490.15/510.58; 5530:PRORATE:12.08/150.82/157.1; 5540:COGS:0/0/300; 5550:COGS:0/0/520'
                then 'PASS ' else 'FAIL ' end || 'F2 each variance split by the balances (the overhead variances follow their own method): ' || st || E'\n';
  pid := mfg_settle_period('2026-11-01');
  select trim_scale((detail->>'to_wip')::numeric) || '/' || trim_scale((detail->>'to_fg')::numeric) || '/' || trim_scale((detail->>'to_cogs')::numeric) into st from mfg_periods where id = pid;
  res := res || case when st = '129.74/1619.39/2506.87' then 'PASS ' else 'FAIL ' end || 'F3 allocated to work in process / finished goods / cost of goods sold: ' || st || E' (adds up to 4,256)\n';
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F4 the books check still ties with variance sitting in inventory (' || c || E' areas off)\n';
  j := mfg_cogm(mfg, '2026-11-01', '2026-11-30');
  select string_agg((l->>'key') || '=' || trim_scale((l->>'diff')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'checks') with ordinality t(l, ord);
  select string_agg((l->>'key') || '=' || trim_scale((l->>'amount')::numeric), ', ' order by ord) into h from jsonb_array_elements(j->'lines') with ordinality t(l, ord);
  res := res || case when st = 'materials=0, wip=0, received=0'
                      and h = 'rm_beg=0, purch=28250, rm_end=-2050, used=26200, labor=12800, mach=5200, fix=6400, total=50600, wip_beg=0, wip_end=-1800, cogm=48800, written=-2936, to_fg=45864'
                then 'PASS ' else 'FAIL ' end || 'F5 statement ties out with open work in process: ' || h || ' | ' || st || E'\n';
  select string_agg((l->>'key') || '=' || trim_scale((l->>'amount')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'cogs') with ordinality t(l, ord);
  res := res || case when st = 'fg_beg=0, fg_in=45864, fg_end=-22464, derived=23400, other=0, cogs_pre=23400, close=2506.87, cogs=25906.87' then 'PASS ' else 'FAIL ' end || 'F6 cost of goods sold block: ' || st || E'\n';
  select string_agg(code || ':' || severity, ',' order by code) into st from mfg_period_checks(mfg, '2026-11-01') where severity in ('block', 'warn');
  res := res || case when st = 'ALREADY:block' then 'PASS ' else 'FAIL ' end || 'F7 the settled month says so: ' || st || E'\n';
  perform mfg_close_period('2026-11-01');
  pid := mfg_settle_period('2026-12-01');
  perform mfg_close_period('2026-12-01');
  select string_agg(status, ',' order by period_start desc) into st from mfg_period_list(mfg) where period_start >= '2026-11-01';
  select to_char(books_locked_through, 'YYYY-MM-DD') into h from tenants where id = mfg;
  res := res || case when st = 'CLOSED,CLOSED' and h = '2026-12-31' then 'PASS ' else 'FAIL ' end || 'F8 December settled and closed after November: ' || st || ', locked through ' || h || E'\n';
  select count(*) into c from journal_entries where tenant_id = mfg and source_table = 'mfg_periods';
  res := res || case when c = 10 then 'PASS ' else 'FAIL ' end || 'F9 the journal keeps every month-end entry, including the reversed ones (' || c || E' of 10)\n';

  ---------------------------------------------------------------- G. who may do what
  begin insert into mfg_periods (tenant_id, period_start, period_end, status) values (mfg, '2027-01-01', '2027-01-31', 'CLOSED'); res := res || E'FAIL G1 a student wrote a month record directly\n';
  exception when others then res := res || E'PASS G1 month records can''t be written directly\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_periods) + (select count(*) from mfg_period_adjust) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G2 another company sees none of it (rows=' || c || E')\n';
  begin perform * from mfg_period_list(mfg); res := res || E'FAIL G3 another company read the months\n';
  exception when others then res := res || E'PASS G3 another company cannot read the months\n'; end;
  begin perform mfg_cogm(mfg, '2026-11-01', '2026-11-30'); res := res || E'FAIL G4 another company read the statement\n';
  exception when others then res := res || E'PASS G4 another company cannot read the statement\n'; end;
  begin perform * from mfg_period_checks(mfg, '2026-11-01'); res := res || E'FAIL G5 another company read the checks\n';
  exception when others then res := res || E'PASS G5 another company cannot read the checks\n'; end;
  begin perform mfg_settle_period('2027-01-01'); res := res || E'FAIL G6 a student with no Manufacturing company settled a month\n';
  exception when others then res := res || E'PASS G6 settling needs your own Manufacturing company\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_period_list(mfg);
  j := mfg_cogm(mfg, '2026-11-01', '2026-11-30');
  res := res || case when c >= 2 and (j->'lines') is not null then 'PASS ' else 'FAIL ' end || 'G7 the teacher can read the months (' || c || ') and the statement' || E'\n';

  ---------------------------------------------------------------- H. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_periods where tenant_id = mfg) + (select count(*) from mfg_period_adjust where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'H1 the teacher deleted the company with its month records (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL H1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 7a — failures: %\n%', n, res;
end $$;
