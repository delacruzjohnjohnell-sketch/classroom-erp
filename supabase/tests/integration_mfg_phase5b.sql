-- ============================================================
-- Manufacturing ERP — Phase 5b integration test (migration 0035).
--
-- Run it AFTER 0029–0035 are applied, or paste it after migration 0035 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: one work centre works Monday to Friday, 8 hours a day, and 25 Nov is a holiday. A chair order of 35 (60 minutes of
-- set-up + 30 minutes each = 18.5 hours) runs 23–30 Nov, so it is spread over the five working days (3.7 hours a day). A planned
-- order of 8 (5 hours) is spread over the six working days from 7 to 14 Dec. A one-day order of 200 overloads the work centre.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; n numeric; st text; h text; rt uuid; b uuid;
  i_chair uuid; i_leg uuid; wc1 uuid; o_a uuid; o_over uuid; o_hol uuid; o_late uuid; o_cancel uuid; p_a uuid; p_b uuid; p_c uuid; ids uuid[];
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
    'mfg_capacity_load','mfg_capacity_orders','mfg_convert_planned_orders','mfg_reschedule_planned_order','mfg_reschedule_order'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging'];
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
  res := res || case when has_function_privilege('authenticated', 'mfg_capacity_load(uuid, date, int, int)', 'execute') and not has_function_privilege('anon', 'mfg_capacity_load(uuid, date, int, int)', 'execute')
                      and not has_function_privilege('anon', 'mfg_reschedule_order(uuid, date, date)', 'execute') then 'PASS ' else 'FAIL ' end || 'Z5 only signed-in users may call the new functions' || E'\n';

  ---------------------------------------------------------------- set-up
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase5b Co', '2026-01-01', 'ACTUAL');
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_leg := mfg_save_item(null, jsonb_build_object('sku','LEG','name','Leg','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2026-01-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_leg, 'qty', 4, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (mfg, 'Chair line', 1, 8, 100, 100, '{1,2,3,4,5}') returning id into wc1;
  insert into mfg_holidays (tenant_id, holiday_date, name) values (mfg, '2026-11-25', 'Company day');
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Build', 'work_center_id', wc1, 'setup_min', 60, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30))));
  perform mfg_activate_routing(rt);

  ---------------------------------------------------------------- A. the load of an order and of a planned order
  o_a := mfg_create_order(i_chair, 35, '2026-11-23', '2026-11-30', 1, 1, false);
  p_a := mfg_create_planned_order(i_chair, 8, '2026-12-07', '2026-12-14');
  select count(*) into c from mfg_capacity_load(mfg, '2026-11-02', 84, 7);
  res := res || case when c = 12 then 'PASS ' else 'FAIL ' end || 'A1 one work centre, 12 weekly columns=' || c || E'\n';
  select string_agg(bucket_no || ':' || trim_scale(available_h)::text || '/' || trim_scale(required_h)::text || '=' || trim_scale(load_pct)::text, ', ' order by bucket_no) into st
    from mfg_capacity_load(mfg, '2026-11-02', 84, 7) where bucket_no between 3 and 6;
  res := res || case when st = '3:32/14.8=46.3, 4:40/3.7=9.3, 5:40/4.17=10.4, 6:40/0.83=2.1' then 'PASS ' else 'FAIL ' end
             || 'A2 hours spread over working days only (the 25th is a holiday, so the 23rd week has 4 days = 32 h): ' || st || E'\n';
  select sum(required_h) into n from mfg_capacity_load(mfg, '2026-11-02', 84, 7);
  res := res || case when n = 23.5 then 'PASS ' else 'FAIL ' end || 'A3 nothing lost or added: 18.5 h + 5 h = ' || n || E'\n';
  select sum(open_h) || '/' || sum(planned_h) into st from mfg_capacity_load(mfg, '2026-11-02', 84, 7);
  res := res || case when st = '18.50/5.00' then 'PASS ' else 'FAIL ' end || 'A4 open orders and planned orders are kept apart: ' || st || E'\n';
  select string_agg(kind || ' ' || trim_scale(hours)::text || ' ' || start_date || '>' || finish_date, '; ' order by start_date) into st from mfg_capacity_orders(mfg, wc1, '2026-11-02', 84);
  res := res || case when st = 'open 18.5 2026-11-23>2026-11-30; planned 5 2026-12-07>2026-12-14' then 'PASS ' else 'FAIL ' end || 'A5 what makes up the load: ' || st || E'\n';

  ---------------------------------------------------------------- B. overload, a span with no working day, work that is already late
  o_over := mfg_create_order(i_chair, 200, '2026-12-01', '2026-12-01', 1, 1, false);
  o_hol := mfg_create_order(i_chair, 2, '2026-11-25', '2026-11-25', 1, 1, false);
  o_late := mfg_create_order(i_chair, 10, '2026-10-26', '2026-10-30', 1, 1, false);
  select string_agg(bucket_no || ':' || trim_scale(required_h)::text || '=' || coalesce(trim_scale(load_pct)::text, 'none'), ', ' order by bucket_no) into st
    from mfg_capacity_load(mfg, '2026-11-02', 84, 7) where bucket_no in (0, 3, 4);
  res := res || case when st = '0:6=15, 3:16.8=52.5, 4:104.7=261.8' then 'PASS ' else 'FAIL ' end
             || 'B1 late work lands in the first column (6 h), a holiday-only order still shows (2 h), one day with 101 h is overloaded: ' || st || E'\n';

  ---------------------------------------------------------------- C. a work centre with no hours at all
  update mfg_work_centers set working_days = '{}' where id = wc1;
  select count(*) filter (where load_pct is null) || '/' || coalesce(sum(required_h), 0) into st from mfg_capacity_load(mfg, '2026-11-02', 84, 7);
  res := res || case when st like '12/%' then 'PASS ' else 'FAIL ' end || 'C1 no working days: every column has no percentage instead of dividing by zero: ' || st || E'\n';
  update mfg_work_centers set working_days = '{1,2,3,4,5}' where id = wc1;

  ---------------------------------------------------------------- D. several planned orders at once
  p_b := mfg_create_planned_order(i_chair, 1, '2026-12-21', '2026-12-28');
  p_c := mfg_create_planned_order(i_chair, 2, '2026-12-21', '2026-12-28');
  begin perform mfg_convert_planned_orders(array[p_b, p_a, p_a]); res := res || E'FAIL D1 the same planned order twice was accepted\n';
  exception when others then res := res || case when sqlerrm like '%listed twice%' then 'PASS ' else 'FAIL ' end || 'D1 the same planned order twice is refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_convert_planned_orders('{}'::uuid[]); res := res || E'FAIL D2 nothing chosen was accepted\n';
  exception when others then res := res || E'PASS D2 choosing nothing is refused\n'; end;
  ids := mfg_convert_planned_orders(array[p_b, p_c], false);
  select count(*) into c from mfg_planned_orders where id in (p_b, p_c) and status = 'CONVERTED' and converted_to_id = any (ids);
  res := res || case when cardinality(ids) = 2 and c = 2 then 'PASS ' else 'FAIL ' end || 'D3 two planned orders became two production orders in one step=' || cardinality(ids) || '/' || c || E'\n';
  begin
    perform mfg_convert_planned_orders(array[p_a, p_b]);
    res := res || E'FAIL D4 an already converted order was accepted in a batch\n';
  exception when others then
    select status into st from mfg_planned_orders where id = p_a;
    res := res || case when st = 'OPEN' and sqlerrm like '%already converted%' then 'PASS ' else 'FAIL ' end || 'D4 one bad order stops the whole batch and the good one stays open: ' || st || ' — ' || sqlerrm || E'\n';
  end;

  ---------------------------------------------------------------- E. moving dates
  perform mfg_reschedule_planned_order(p_a, '2027-01-04', '2027-01-11');
  select start_date || '>' || finish_date || '/' || firm into st from mfg_planned_orders where id = p_a;
  res := res || case when st = '2027-01-04>2027-01-11/true' then 'PASS ' else 'FAIL ' end || 'E1 a planned order moved and became firm: ' || st || E'\n';
  begin perform mfg_reschedule_planned_order(p_b, '2027-01-04', '2027-01-11'); res := res || E'FAIL E2 a converted planned order was moved\n';
  exception when others then res := res || E'PASS E2 a converted planned order cannot be moved\n'; end;
  begin perform mfg_reschedule_planned_order(p_a, '2027-01-11', '2027-01-04'); res := res || E'FAIL E3 finish before start\n';
  exception when others then res := res || E'PASS E3 finish can''t be before start\n'; end;
  perform mfg_reschedule_order(o_a, '2026-11-30', '2026-12-04');
  select planned_start || '>' || planned_end into st from mfg_production_orders where id = o_a;
  res := res || case when st = '2026-11-30>2026-12-04' then 'PASS ' else 'FAIL ' end || 'E4 a production order that has not started was moved: ' || st || E'\n';
  select count(*) into c from mfg_audit_log where tenant_id = mfg and event = 'order_rescheduled';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'E5 the move is in the audit log' || E'\n';
  o_cancel := mfg_create_order(i_chair, 1, '2026-12-01', '2026-12-02', 1, 1, false);
  perform mfg_cancel_order(o_cancel);
  begin perform mfg_reschedule_order(o_cancel, '2026-12-05', '2026-12-06'); res := res || E'FAIL E6 a cancelled order was moved\n';
  exception when others then res := res || case when sqlerrm like '%has not started%' then 'PASS ' else 'FAIL ' end || 'E6 only an order that has not started can be moved: ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_capacity_orders(mfg, wc1, '2026-11-02', 84) where doc_no = (select document_number from mfg_production_orders where id = o_cancel);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E7 a cancelled order puts no load on the work centre' || E'\n';

  ---------------------------------------------------------------- F. limits and who may do what
  begin perform * from mfg_capacity_load(mfg, '2026-11-02', 365, 1); res := res || E'FAIL F1 365 daily columns were accepted\n';
  exception when others then res := res || case when sqlerrm like '%columns%' then 'PASS ' else 'FAIL ' end || 'F1 too many columns is refused: ' || sqlerrm || E'\n'; end;
  begin perform * from mfg_capacity_load(mfg, '2026-11-02', 84, 5); res := res || E'FAIL F2 a 5-day column was accepted\n';
  exception when others then res := res || E'PASS F2 only 1, 7, 14 or 30-day columns\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from mfg_capacity_load(mfg, '2026-11-02', 84, 7); res := res || E'FAIL F3 another company read this load\n';
  exception when others then res := res || E'PASS F3 another company cannot read this load\n'; end;
  begin perform mfg_reschedule_order(o_a, '2026-12-05', '2026-12-06'); res := res || E'FAIL F4 another student moved this order\n';
  exception when others then res := res || E'PASS F4 another student cannot move this company''s order\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_capacity_load(mfg, '2026-11-02', 84, 7);
  res := res || case when c = 12 then 'PASS ' else 'FAIL ' end || 'F5 the teacher can read the load=' || c || E'\n';
  begin perform mfg_reschedule_order(o_a, '2026-12-05', '2026-12-06'); res := res || E'FAIL F6 the teacher moved a student''s order\n';
  exception when others then res := res || E'PASS F6 the teacher cannot move a student''s order\n'; end;
  begin perform mfg_convert_planned_orders(array[p_a]); res := res || E'FAIL F7 the teacher converted a student''s planned order\n';
  exception when others then res := res || E'PASS F7 the teacher cannot convert a student''s planned order\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 5b — failures: %\n%', n, res;
end $$;
