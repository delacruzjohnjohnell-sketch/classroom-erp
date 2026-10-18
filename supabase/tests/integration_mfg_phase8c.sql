-- ============================================================
-- Manufacturing ERP — Phase 8c integration test (migration 0043: change history, machine upkeep, standard-cost drift).
--
-- Run it AFTER 0029–0043 are applied, or paste it after migration 0043 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the demo company. The Finishing work centre is given a service plan and a fixed asset; two confirmations of 0.4 machine hours
-- each are posted with a service between them. Then the Finishing rates are doubled: the change history shows it, and the cost-drift report shows
-- that the varnish jar now costs more to make than its standard says.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; c2 int; n numeric; n2 numeric; st text; h text; rc int;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  i_var uuid; i_jam uuid; wc uuid; asset uuid; b uuid; rt uuid; est uuid; oj uuid; cmp uuid; svc uuid;
  tot0 numeric; use0 numeric; est_before int;
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
    'mfg_log_changes','mfg__wc_machine_hours','mfg_set_work_center_upkeep','mfg_log_maintenance','mfg_work_center_usage','mfg_cost_drift'];
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
  res := res || case when has_function_privilege('authenticated', 'mfg_work_center_usage(uuid, date, date)', 'execute') and not has_function_privilege('anon', 'mfg_cost_drift()', 'execute')
                      and not has_function_privilege('authenticated', 'mfg_log_changes()', 'execute') and not has_function_privilege('authenticated', 'mfg__wc_machine_hours(uuid, uuid, date)', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z5 only signed-in users may call the new functions; the helpers and the trigger function are not callable' || E'\n';

  ---------------------------------------------------------------- A. the demo company, and what the history already knows
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase8c Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();
  select m.item_id into i_var from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'VAR-GL';
  select id into wc from mfg_work_centers where tenant_id = mfg and name = 'Finishing';

  select string_agg(table_name || '=' || cnt, ', ' order by table_name) into st from (
    select table_name, count(*) cnt from mfg_change_log where tenant_id = mfg and action = 'CREATE' and table_name in ('mfg_item_master', 'mfg_boms', 'mfg_routings', 'mfg_work_centers') group by 1) q;
  res := res || case when st like '%mfg_boms=%' and st like '%mfg_item_master=%' and st like '%mfg_routings=%' and st like '%mfg_work_centers=%' then 'PASS ' else 'FAIL ' end
                 || 'A1 loading the demo company is on the record (creations by kind): ' || coalesce(st, 'none') || E'\n';
  select count(*) into c from mfg_change_log where tenant_id = mfg and table_name = 'mfg_item_master' and action = 'CHANGE' and field = 'standard_cost';
  res := res || case when c > 0 then 'PASS ' else 'FAIL ' end || 'A2 releasing cost estimates is recorded as changes of the standard cost (' || c || E' lines)\n';

  ---------------------------------------------------------------- B. change history
  select count(*) into c from mfg_change_log where tenant_id = mfg;
  update mfg_work_centers set active = active where id = wc;
  select count(*) into c2 from mfg_change_log where tenant_id = mfg;
  res := res || case when c = c2 then 'PASS ' else 'FAIL ' end || 'B1 saving a record without changing anything writes nothing (' || c || '→' || c2 || E')\n';
  update mfg_work_centers set shifts = 2 where id = wc;
  select old_value || '→' || new_value || ' by ' || (changed_by = s1)::text into st from mfg_change_log
   where tenant_id = mfg and table_name = 'mfg_work_centers' and record_id = wc and field = 'shifts' and action = 'CHANGE';
  res := res || case when st = '1→2 by true' then 'PASS ' else 'FAIL ' end || 'B2 a change of shifts shows the old and the new value and who made it: ' || coalesce(st, 'none') || E'\n';
  select record_label into st from mfg_change_log where tenant_id = mfg and table_name = 'mfg_work_centers' and record_id = wc and field = 'shifts';
  res := res || case when st = 'Finishing' then 'PASS ' else 'FAIL ' end || 'B3 the line names the record in words: ' || coalesce(st, 'none') || E'\n';
  update mfg_work_centers set shifts = 1 where id = wc;
  select count(*) into c from mfg_change_log where tenant_id = mfg and table_name = 'mfg_work_centers' and record_id = wc and field = 'shifts';
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'B4 putting it back is a second change, not an erasure (' || c || E' lines)\n';
  begin
    delete from mfg_change_log where tenant_id = mfg; get diagnostics rc = row_count;
    res := res || case when rc = 0 then 'PASS ' else 'FAIL ' end || 'B5 the history cannot be deleted by the student (rows deleted=' || rc || E')\n';
  exception when others then res := res || E'PASS B5 the history cannot be deleted by the student (refused)\n'; end;
  begin
    update mfg_change_log set new_value = 'x' where tenant_id = mfg; get diagnostics rc = row_count;
    res := res || case when rc = 0 then 'PASS ' else 'FAIL ' end || 'B6 the history cannot be edited by the student (rows changed=' || rc || E')\n';
  exception when others then res := res || E'PASS B6 the history cannot be edited by the student (refused)\n'; end;
  begin
    insert into mfg_change_log (tenant_id, table_name, action) values (mfg, 'mfg_boms', 'CREATE');
    res := res || E'FAIL B7 the student wrote a history line by hand\n';
  exception when others then res := res || E'PASS B7 the student cannot write a history line by hand\n'; end;

  ---------------------------------------------------------------- C. a service plan, a fixed asset, and hours on the machine
  insert into fixed_assets (tenant_id, name, purchase_date, cost, salvage_value, useful_life_months, accumulated_depreciation)
  values (mfg, 'Finishing line sprayer', '2026-01-02', 100000, 10000, 60, 20000) returning id into asset;
  begin perform mfg_set_work_center_upkeep(wc, gen_random_uuid(), 10); res := res || E'FAIL C1 a stranger''s asset was accepted\n';
  exception when others then res := res || case when sqlerrm like '%fixed assets%' then 'PASS ' else 'FAIL ' end || 'C1 an asset that is not this company''s is refused: ' || left(sqlerrm, 60) || E'\n'; end;
  begin perform mfg_set_work_center_upkeep(wc, asset, 0); res := res || E'FAIL C2 a zero interval was accepted\n';
  exception when others then res := res || E'PASS C2 a zero-hour interval is refused\n'; end;
  perform mfg_set_work_center_upkeep(wc, asset, 50);

  select u.total_machine_h, u.machine_h into tot0, use0 from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;

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
  perform mfg_post_confirmation(oj, 10, 5, 0, null, 0, 0.4, 0.4, false, current_date, null);

  select (u.total_machine_h - tot0)::text || '/' || (u.machine_h - use0)::text into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = '0.40/0.40' then 'PASS ' else 'FAIL ' end || 'C3 the first confirmation adds 0.4 machine hours, in total and in the period: ' || st || E'\n';
  select (u.utilization_pct = round((u.setup_h + u.machine_h) * 100 / u.available_h, 1) and u.available_h > 0)::text into h from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when h = 'true' then 'PASS ' else 'FAIL ' end || 'C4 utilisation = (setup + machine hours) ÷ available hours' || E'\n';
  select u.asset_name || ' ' || trim_scale(u.asset_cost)::text || '/' || trim_scale(u.accumulated_depreciation)::text || '/' || trim_scale(u.book_value)::text into st
    from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = 'Finishing line sprayer 100000/20000/80000' then 'PASS ' else 'FAIL ' end || 'C5 the linked asset: cost, depreciation to date, book value: ' || st || E'\n';

  svc := mfg_log_maintenance(wc, current_date, 'PREVENTIVE', 'Cleaned the nozzles');
  perform mfg_post_confirmation(oj, 10, 5, 0, null, 0, 0.4, 0.4, true, current_date, null);
  select trim_scale(u.hours_since_service)::text || ' ' || u.service_status into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = '0.4 OK' then 'PASS ' else 'FAIL ' end || 'C6 0.4 hours since the service, interval 50: ' || st || E'\n';
  perform mfg_set_work_center_upkeep(wc, asset, 0.42);
  select u.service_status into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = 'DUE_SOON' then 'PASS ' else 'FAIL ' end || 'C7 at 0.4 of 0.42 hours the service is due soon: ' || st || E'\n';
  perform mfg_set_work_center_upkeep(wc, asset, 0.4);
  select u.service_status into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = 'OVERDUE' then 'PASS ' else 'FAIL ' end || 'C8 at 0.4 of 0.4 hours the service is overdue: ' || st || E'\n';
  perform mfg_log_maintenance(wc, current_date, 'REPAIR', 'Replaced a hose');
  select u.service_status into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = 'OVERDUE' then 'PASS ' else 'FAIL ' end || 'C9 a repair does not reset the preventive-service count: ' || st || E'\n';
  perform mfg_log_maintenance(wc, current_date, 'PREVENTIVE', 'Second service');
  select trim_scale(u.hours_since_service)::text || ' ' || u.service_status into st from mfg_work_center_usage(mfg, current_date - 30, current_date) u where u.work_center_id = wc;
  res := res || case when st = '0 OK' then 'PASS ' else 'FAIL ' end || 'C10 a preventive service starts the count again: ' || st || E'\n';
  begin perform mfg_log_maintenance(wc, current_date + 5, 'PREVENTIVE', null); res := res || E'FAIL C11 a future service was accepted\n';
  exception when others then res := res || E'PASS C11 a service dated in the future is refused\n'; end;
  begin perform mfg_log_maintenance(wc, current_date, 'WASH', null); res := res || E'FAIL C12 an unknown kind was accepted\n';
  exception when others then res := res || E'PASS C12 only preventive service or repair\n'; end;
  select count(*) into c from mfg_change_log where tenant_id = mfg and table_name = 'mfg_work_centers' and record_id = wc and field = 'maint_interval_hours';
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'C13 each change of the service interval is on the record (' || c || E' lines: 50, 0.42, 0.4)\n';

  ---------------------------------------------------------------- D. cost drift
  select count(*) into est_before from mfg_cost_estimates where tenant_id = mfg;
  select abs(d.difference) into n from mfg_cost_drift() d where d.item_id = i_jam;
  res := res || case when n is not null and n < 0.001 then 'PASS ' else 'FAIL ' end || 'D1 right after its estimate was released the jar''s roll-up equals its standard (difference ' || coalesce(n::text, 'none') || E')\n';
  update mfg_activity_rates set rate = rate * 2 where tenant_id = mfg and work_center_id = wc;
  get diagnostics rc = row_count;
  select count(*) into c from mfg_change_log where tenant_id = mfg and table_name = 'mfg_activity_rates' and action = 'CHANGE' and field = 'rate';
  res := res || case when rc > 0 and c = rc then 'PASS ' else 'FAIL ' end || 'D2 doubling the Finishing rates is on the record (' || rc || ' rates, ' || c || E' lines)\n';
  select (d.difference > 0 and d.difference_pct > 0)::text, trim_scale(d.difference_pct)::text into h, st from mfg_cost_drift() d where d.item_id = i_jam;
  res := res || case when h = 'true' then 'PASS ' else 'FAIL ' end || 'D3 the jar now costs more to make than its standard says (' || st || E' %)\n';
  select count(*) into c from mfg_cost_estimates where tenant_id = mfg;
  res := res || case when c = est_before then 'PASS ' else 'FAIL ' end || 'D4 the report saved nothing (estimates ' || est_before || '→' || c || E')\n';
  select count(*) into c from mfg_cost_drift() d where d.kind = 'BUY' and d.current_basis is not null and d.basis_note is not null;
  res := res || case when c > 0 then 'PASS ' else 'FAIL ' end || 'D5 bought items are compared with the latest price paid or the planned price (' || c || E' items)\n';
  select count(*) into c from mfg_cost_drift() d where d.kind = 'MAKE' and d.basis_note like 'Not costed%';
  res := res || 'INFO D6 made items that could not be rolled up: ' || c || E'\n';

  ---------------------------------------------------------------- E. who may look
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_change_log where tenant_id = mfg;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E1 another student sees none of this company''s history (' || c || E' lines)\n';
  select count(*) into c from mfg_maintenance_log where tenant_id = mfg;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E2 nor its service log (' || c || E')\n';
  begin perform * from mfg_work_center_usage(mfg, current_date - 30, current_date); res := res || E'FAIL E3 another student read the usage\n';
  exception when others then res := res || E'PASS E3 another student cannot read the work-centre usage\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_change_log where tenant_id = mfg;
  select count(*) into c2 from mfg_work_center_usage(mfg, current_date - 30, current_date);
  res := res || case when c > 0 and c2 > 0 then 'PASS ' else 'FAIL ' end || 'E4 the teacher can read the history (' || c || ') and the usage (' || c2 || E' work centres)\n';
  begin perform * from mfg_cost_drift(); res := res || E'FAIL E5 the teacher ran the cost-drift report\n';
  exception when others then res := res || E'PASS E5 the cost-drift report is the student''s own\n'; end;
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg; select count(*) into c2 from mfg_change_log where tenant_id = mfg;
    res := res || case when c = 0 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'F1 the teacher deleted the company with its history (company left=' || c || ', history left=' || c2 || E')\n';
  exception when others then res := res || 'FAIL F1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 8c — failures: %\n%', n, res;
end $$;
