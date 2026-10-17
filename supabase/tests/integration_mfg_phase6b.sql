-- ============================================================
-- Manufacturing ERP — Phase 6b integration test (migration 0037).
--
-- Run it AFTER 0029–0037 are applied, or paste it after migration 0037 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: a chair is made in two steps, sawing (work centre 1) then painting (work centre 2). Four orders are released or waiting.
-- The dispatch list orders them by priority, then due date; partial confirmations make units READY for the painting step.
-- In the week of Mon 9 Nov the saw works 5 days × 8 h = 40 h; 1 h is a planned stop, 3 h are breakdown/no-material downtime and 1 h set-up.
-- It ran 13 machine hours and made 22 chairs (20 good, 2 scrap) that should have taken 11 hours: availability 89.7 %, performance 84.6 %,
-- quality 90.9 %, OEE 69.0 %.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; n numeric; st text; h text; b uuid; rt uuid;
  i_chair uuid; i_leg uuid; wc1 uuid; wc2 uuid; loc_rm uuid; oa uuid; ob uuid; oc uuid; od uuid; cf_a uuid; dt1 uuid; dt2 uuid; dt3 uuid; x int;
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
    'mfg_log_downtime','mfg_void_downtime','mfg_set_order_priority','mfg_dispatch_list','mfg_oee'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr',
    'mfg_downtime','mfg_order_priority'];
begin
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
  res := res || case when has_function_privilege('authenticated', 'mfg_oee(uuid, date, int, int)', 'execute') and not has_function_privilege('anon', 'mfg_oee(uuid, date, int, int)', 'execute')
                      and not has_function_privilege('anon', 'mfg_log_downtime(uuid, date, numeric, text, text)', 'execute') then 'PASS ' else 'FAIL ' end || 'Z5 only signed-in users may call the new functions' || E'\n';

  ---------------------------------------------------------------- set-up
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase6b Co', '2026-01-01', 'ACTUAL');
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_leg := mfg_save_item(null, jsonb_build_object('sku','LEG','name','Leg','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2019-01-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_leg, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (mfg, 'Saw', 1, 8, 100, 100, '{1,2,3,4,5}') returning id into wc1;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (mfg, 'Paint', 1, 8, 100, 100, '{1,2,3,4,5}') returning id into wc2;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select mfg, w.id, a.id, '2026-10-01'::date, case a.kind when 'LABOR' then 80 else 100 end
      from mfg_activity_types a cross join (select wc1 as id union all select wc2) w where a.kind in ('LABOR', 'MACHINE');
  insert into mfg_holidays (tenant_id, holiday_date, name) values (mfg, '2026-11-25', 'Company day');
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Saw', 'work_center_id', wc1, 'setup_min', 60, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30),
    jsonb_build_object('op_no', 20, 'description', 'Paint', 'work_center_id', wc2, 'run_min_per_unit', 10, 'labor_min_per_unit', 10, 'machine_min_per_unit', 10))));
  perform mfg_activate_routing(rt);
  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  perform mfg_post_stock_adjustment(i_leg, loc_rm, 500, 1, 'OPENING', '2026-11-01');

  oa := mfg_create_order(i_chair, 20, '2026-11-16', '2026-11-20');
  ob := mfg_create_order(i_chair, 10, '2026-11-10', '2026-11-12');
  oc := mfg_create_order(i_chair, 5, '2026-11-23', '2026-11-27');
  od := mfg_create_order(i_chair, 3, '2020-01-06', '2020-01-10');
  perform mfg_release_order(oa);
  perform mfg_release_order(ob);
  perform mfg_release_order(od);

  ---------------------------------------------------------------- A. the dispatch list
  select string_agg(order_no || '/' || op_no || case when late then '/late' else '' end, '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc1) d) q;
  res := res || case when st = 'PRD-0004/10/late; PRD-0002/10; PRD-0001/10' then 'PASS ' else 'FAIL ' end || 'A1 the saw''s list: earliest due date first, an overdue order marked late: ' || st || E'\n';
  select count(*) into c from mfg_dispatch_list(mfg) where order_no = 'PRD-0003';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A2 an order that is not released is not on the list=' || c || E'\n';
  select count(*) into c from mfg_dispatch_list(mfg);
  res := res || case when c = 6 then 'PASS ' else 'FAIL ' end || 'A3 all work centres: 3 orders × 2 operations=' || c || E'\n';
  select string_agg(order_no || ' ready ' || trim_scale(qty_ready), '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc2) d) q;
  res := res || case when st = 'PRD-0004 ready 0; PRD-0002 ready 0; PRD-0001 ready 0' then 'PASS ' else 'FAIL ' end || 'A4 nothing is ready for painting before sawing: ' || st || E'\n';
  begin perform mfg_set_order_priority(oa, 0); res := res || E'FAIL A5 priority 0 was accepted\n';
  exception when others then res := res || E'PASS A5 priority 0 is refused\n'; end;
  begin perform mfg_set_order_priority(oa, 10); res := res || E'FAIL A6 priority 10 was accepted\n';
  exception when others then res := res || E'PASS A6 priority 10 is refused\n'; end;
  perform mfg_set_order_priority(oa, 1);
  select string_agg(order_no || '/' || priority, '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc1) d) q;
  res := res || case when st = 'PRD-0001/1; PRD-0004/5; PRD-0002/5' then 'PASS ' else 'FAIL ' end || 'A7 priority 1 puts the order first: ' || st || E'\n';

  ---------------------------------------------------------------- B. partial confirmations make units ready for the next step
  perform mfg_post_confirmation(ob, 10, 8, 2, 'Cracked', 1, 5, 5, false, '2026-11-10');
  perform mfg_post_confirmation(oa, 10, 12, 0, null, 0, 8, 8, false, '2026-11-11');
  select string_agg(order_no || ' rem ' || trim_scale(qty_planned - qty_done) || ' h ' || trim_scale(remaining_h), '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc1) d) q;
  res := res || case when st = 'PRD-0001 rem 8 h 4; PRD-0004 rem 3 h 2.5; PRD-0002 rem 2 h 1' then 'PASS ' else 'FAIL ' end || 'B1 what is left on the saw (set-up is done once units are confirmed): ' || st || E'\n';
  select string_agg(order_no || ' ready ' || trim_scale(qty_ready), '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc2) d) q;
  res := res || case when st = 'PRD-0001 ready 12; PRD-0004 ready 0; PRD-0002 ready 8' then 'PASS ' else 'FAIL ' end || 'B2 painting can start on what sawing has finished: ' || st || E'\n';

  ---------------------------------------------------------------- C. downtime
  dt1 := mfg_log_downtime(wc1, '2026-11-10', 2, 'BREAKDOWN', 'Blade snapped');
  dt2 := mfg_log_downtime(wc1, '2026-11-11', 1, 'PLANNED_STOP', 'Maintenance');
  dt3 := mfg_log_downtime(wc1, '2026-11-12', 1, 'NO_MATERIAL', null);
  begin perform mfg_log_downtime(wc1, '2026-11-12', 0, 'OTHER', null); res := res || E'FAIL C1 zero hours were logged\n';
  exception when others then res := res || E'PASS C1 zero hours are refused\n'; end;
  begin perform mfg_log_downtime(wc1, '2026-11-12', 25, 'OTHER', null); res := res || E'FAIL C2 25 hours were logged\n';
  exception when others then res := res || E'PASS C2 more than 24 hours is refused\n'; end;
  begin perform mfg_log_downtime(wc1, '2026-11-12', 1, 'COFFEE', null); res := res || E'FAIL C3 an unknown reason was accepted\n';
  exception when others then res := res || E'PASS C3 an unknown reason is refused\n'; end;
  perform mfg_log_downtime(wc2, '2026-11-14', 23, 'OTHER', null);
  begin perform mfg_log_downtime(wc2, '2026-11-14', 2, 'OTHER', null); res := res || E'FAIL C4 more than 24 hours on one day was logged\n';
  exception when others then res := res || case when sqlerrm like '%only has 24%' then 'PASS ' else 'FAIL ' end || 'C4 one day can''t hold more than 24 hours of downtime: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- D. OEE
  select trim_scale(scheduled_h) || '/' || trim_scale(planned_stop_h) || '/' || trim_scale(planned_h) || '/' || trim_scale(downtime_h) || '/' || trim_scale(setup_h) || '/' ||
         trim_scale(run_h) || '/' || trim_scale(ideal_h) || '/' || trim_scale(good_qty) || '/' || trim_scale(scrap_qty) into st
    from mfg_oee(mfg, '2026-11-09', 7, 7) where work_center_id = wc1;
  res := res || case when st = '40/1/39/3/1/13/11/20/2' then 'PASS ' else 'FAIL ' end || 'D1 the saw''s week (scheduled/planned stop/planned/downtime/set-up/run/ideal/good/scrap): ' || st || E'\n';
  select round((planned_h - downtime_h - setup_h) / planned_h * 100, 1) || '/' || round(ideal_h / run_h * 100, 1) || '/' || round(good_qty / (good_qty + scrap_qty) * 100, 1) || '/' ||
         round((planned_h - downtime_h - setup_h) / planned_h * (ideal_h / run_h) * (good_qty / (good_qty + scrap_qty)) * 100, 1) into st
    from mfg_oee(mfg, '2026-11-09', 7, 7) where work_center_id = wc1;
  res := res || case when st = '89.7/84.6/90.9/69.0' then 'PASS ' else 'FAIL ' end || 'D2 availability/performance/quality/OEE %: ' || st || E'\n';
  select trim_scale(scheduled_h) || '/' || trim_scale(downtime_h) || '/' || trim_scale(run_h) || '/' || trim_scale(good_qty) into st from mfg_oee(mfg, '2026-11-09', 7, 7) where work_center_id = wc2;
  res := res || case when st = '40/23/0/0' then 'PASS ' else 'FAIL ' end || 'D3 painting: 40 h scheduled, 23 h downtime, nothing made: ' || st || E'\n';
  select count(*) into c from mfg_oee(mfg, '2026-11-02', 28, 7);
  select trim_scale(scheduled_h) into st from mfg_oee(mfg, '2026-11-23', 7, 7) where work_center_id = wc1;
  res := res || case when c = 8 and st = '32' then 'PASS ' else 'FAIL ' end || 'D4 4 weekly columns × 2 work centres=' || c || '; the holiday week schedules 4 days = ' || st || E' h\n';

  select id into cf_a from mfg_confirmations where order_id = oa and op_no = 10 and reversal_of is null;
  perform mfg_reverse_confirmation(cf_a, '2026-11-12', 'wrong count');
  select trim_scale(setup_h) || '/' || trim_scale(run_h) || '/' || trim_scale(ideal_h) || '/' || trim_scale(good_qty) || '/' || trim_scale(scrap_qty) into st
    from mfg_oee(mfg, '2026-11-09', 7, 7) where work_center_id = wc1;
  res := res || case when st = '1/5/5/8/2' then 'PASS ' else 'FAIL ' end || 'D5 a reversed confirmation takes its hours and units back out (set-up/run/ideal/good/scrap): ' || st || E'\n';
  select string_agg(order_no || ' rem ' || trim_scale(qty_planned - qty_done) || ' h ' || trim_scale(remaining_h), '; ' order by ord) into st
    from (select d.*, row_number() over () as ord from mfg_dispatch_list(mfg, wc1) d) q where order_no = 'PRD-0001';
  res := res || case when st = 'PRD-0001 rem 20 h 11' then 'PASS ' else 'FAIL ' end || 'D6 and the saw has all 20 chairs to do again, with set-up: ' || st || E'\n';

  perform mfg_void_downtime(dt1, 'Logged on the wrong day');
  select trim_scale(downtime_h) || '/' || trim_scale(planned_stop_h) into st from mfg_oee(mfg, '2026-11-09', 7, 7) where work_center_id = wc1;
  res := res || case when st = '1/1' then 'PASS ' else 'FAIL ' end || 'D7 a voided entry no longer counts (downtime/planned stop): ' || st || E'\n';
  begin perform mfg_void_downtime(dt1, 'again'); res := res || E'FAIL D8 an entry was voided twice\n';
  exception when others then res := res || case when sqlerrm like '%already voided%' then 'PASS ' else 'FAIL ' end || 'D8 voided once, not twice: ' || sqlerrm || E'\n'; end;
  begin perform mfg_void_downtime(dt3, ''); res := res || E'FAIL D9 voided without a reason\n';
  exception when others then res := res || E'PASS D9 a reason is needed to void\n'; end;
  begin perform * from mfg_oee(mfg, '2026-11-09', 365, 1); res := res || E'FAIL D10 365 daily columns were accepted\n';
  exception when others then res := res || E'PASS D10 too many columns is refused\n'; end;
  begin perform * from mfg_oee(mfg, '2026-11-09', 7, 5); res := res || E'FAIL D11 a 5-day column was accepted\n';
  exception when others then res := res || E'PASS D11 only 1, 7, 14 or 30-day columns\n'; end;

  ---------------------------------------------------------------- E. who may do what
  begin insert into mfg_downtime (tenant_id, work_center_id, event_date, hours, category) values (mfg, wc1, '2026-11-12', 1, 'OTHER'); res := res || E'FAIL E1 a student wrote downtime directly\n';
  exception when others then res := res || E'PASS E1 downtime can''t be written directly\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_downtime) + (select count(*) from mfg_order_priority) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E2 another company sees none of it (rows=' || c || E')\n';
  begin perform * from mfg_oee(mfg, '2026-11-09', 7, 7); res := res || E'FAIL E3 another company read the OEE\n';
  exception when others then res := res || E'PASS E3 another company cannot read the OEE\n'; end;
  begin perform * from mfg_dispatch_list(mfg); res := res || E'FAIL E4 another company read the dispatch list\n';
  exception when others then res := res || E'PASS E4 another company cannot read the dispatch list\n'; end;
  begin perform mfg_log_downtime(wc1, '2026-11-12', 1, 'OTHER', null); res := res || E'FAIL E5 another student logged downtime here\n';
  exception when others then res := res || E'PASS E5 another student cannot log downtime for this company\n'; end;
  begin perform mfg_set_order_priority(oa, 2); res := res || E'FAIL E6 another student set a priority here\n';
  exception when others then res := res || E'PASS E6 another student cannot set priorities here\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_dispatch_list(mfg);
  select count(*) into x from mfg_oee(mfg, '2026-11-09', 7, 7);
  res := res || case when c = 6 and x = 2 then 'PASS ' else 'FAIL ' end || 'E7 the teacher can read the list (' || c || ') and the OEE (' || x || E' rows)\n';
  begin perform mfg_log_downtime(wc1, '2026-11-12', 1, 'OTHER', null); res := res || E'FAIL E8 the teacher logged downtime for a student\n';
  exception when others then res := res || E'PASS E8 the teacher cannot log downtime for a student\n'; end;
  begin perform mfg_set_order_priority(oa, 2); res := res || E'FAIL E9 the teacher set a student''s priority\n';
  exception when others then res := res || E'PASS E9 the teacher cannot set a student''s priority\n'; end;

  ---------------------------------------------------------------- F. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_downtime where tenant_id = mfg) + (select count(*) from mfg_order_priority where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F1 the teacher deleted the company with its downtime and priorities (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL F1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 6b — failures: %\n%', n, res;
end $$;
