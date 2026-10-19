-- ============================================================
-- Manufacturing ERP — Phase 10 integration test (migration 0048: machine cost at the real depreciation).
--
-- Run it AFTER 0029–0048 are applied, or paste it after migrations 0046, 0047 and 0048 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: the demo company with no machine linked settles exactly as before. A saw (fixed asset) is linked to the work center that
-- confirmed machine hours last month; settling warns until its depreciation is recorded; then settling posts Dr Applied Machine Overhead,
-- Dr/Cr Machine overhead variance, Cr Depreciation Expense, closes the variance with the others, keeps the books tied, and can be undone.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; std uuid; c int; c2 int; n numeric; n2 numeric; st text; h text; j jsonb;
  a_opex uuid; a_sss uuid; a_rm uuid; a_cash uuid; v1 uuid; v2 uuid; v3 uuid; v4 uuid; rv uuid; i_lum uuid; vend1 uuid; po uuid; pl uuid; doc uuid; vno text; je uuid;
  q text; m1 date := (date_trunc('month', current_date) - interval '1 month')::date; wc uuid; asset uuid; app numeric; hrs numeric; base_total numeric; dep0 numeric; mach0 numeric; pid uuid; pl2 jsonb; n3 numeric;
  before5100 numeric; new_fns text[] := array['joinable_companies','create_mfg_company','mfg__my_tenant','mfg_assign_number','mfg_wc_number','mfg_seed_master_data','mfg_convert_qty',
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
    'mfg_account_balances','mfg_stock_card','mfg_wip_report','mfg_grir_aging','mfg_scrap_report','mfg_match_exceptions','mfg_inventory_schedule','mfg_integrity_check',
    'mfg__next_jv','mfg__voucher_type','mfg_register_voucher','mfg__is_control_account','mfg__voucher_check','mfg__post_voucher','mfg_save_voucher','mfg_delete_voucher',
    'mfg_submit_voucher','mfg_approve_voucher','mfg_reject_voucher','mfg_reverse_voucher','mfg_voucher_register','mfg_voucher_view','mfg_open_items','mfg_audit_trail','mfg_machine_cost'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr',
    'mfg_downtime','mfg_order_priority','mfg_periods','mfg_period_adjust','mfg_change_log','mfg_maintenance_log','mfg_vouchers','mfg_voucher_lines'];
begin
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard', 'trg_mfg_items_guard', 'trg_mfg_bills_guard', 'trg_mfg_payment_qc_guard', 'trg_mfg_log_company_settings', 'trg_mfg_register_voucher');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the scoped ones (' || h || E')\n';

  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  res := res || case when has_function_privilege('authenticated', 'mfg_machine_cost(uuid, date, date)', 'execute') and not has_function_privilege('anon', 'mfg_machine_cost(uuid, date, date)', 'execute')
                      and not has_function_privilege('authenticated', 'mfg__period_plan(uuid, date)', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z5 the machine-cost report is for signed-in users and the plan helper is not callable' || E'\n';

  q := 'select coalesce(sum(jl.debit - jl.credit), 0) from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = %L and a.code = %L';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase10 Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();

  ---------------------------------------------------------------- A. nothing linked: nothing changes
  pl2 := mfg_period_preview(mfg, m1);
  base_total := (pl2->>'to_wip')::numeric + (pl2->>'to_fg')::numeric + (pl2->>'to_cogs')::numeric;
  res := res || case when jsonb_array_length(pl2->'machine_lines') = 0 and (pl2->'machine'->>'actual')::numeric = 0 and (pl2->'machine'->>'applied')::numeric = 0 then 'PASS ' else 'FAIL ' end
                 || 'A1 with no machine linked to a work center the month end has no machine lines (variances closed=' || base_total || E')\n';
  select count(*) into c from mfg_machine_cost(mfg, m1, (m1 + interval '1 month - 1 day')::date);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'A2 the machine-cost report lists only linked machines (' || c || E')\n';

  ---------------------------------------------------------------- B. link a saw to the work center that ran last month
  select o.work_center_id into wc from mfg_prod_operations o join mfg_confirmations cf on cf.order_id = o.order_id and cf.op_no = o.op_no
   where cf.tenant_id = mfg and cf.machine_cost <> 0 order by cf.posting_date limit 1;
  insert into fixed_assets (tenant_id, name, purchase_date, cost, salvage_value, useful_life_months) values (mfg, 'zz Saw', m1, 120000, 0, 60) returning id into asset;
  perform mfg_set_work_center_upkeep(wc, asset, 200);
  select r.applied, r.machine_h into app, hrs from mfg_machine_cost(mfg, m1, (m1 + interval '1 month - 1 day')::date) r;
  res := res || case when app > 0 and hrs > 0 then 'PASS ' else 'FAIL ' end || 'B1 the linked saw shows the machine cost applied (' || app || ') over its machine hours (' || hrs || E')\n';
  select count(*) into c from mfg_period_checks(mfg, m1) where code = 'DEPRECIATION_MISSING';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'B2 settling warns that the saw worked and no depreciation was recorded' || E'\n';
  perform record_depreciation(asset, 2000, m1 + 20);
  select count(*) into c from mfg_period_checks(mfg, m1) where code = 'DEPRECIATION_MISSING';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B3 the warning goes once the depreciation is recorded' || E'\n';
  select r.depreciation, r.difference, r.actual_rate into n, n2, n3 from mfg_machine_cost(mfg, m1, (m1 + interval '1 month - 1 day')::date) r;
  res := res || case when n = 2000 and n2 = round(2000 - app, 2) and n3 = round(2000 / hrs, 2) then 'PASS ' else 'FAIL ' end
                 || 'B4 the report: depreciation ' || n || ', difference ' || n2 || ', the real rate per machine hour ' || n3 || E'\n';
  select voucher_type || ' ' || status into st from mfg_vouchers where tenant_id = mfg and particulars = 'Depreciation, zz Saw';
  res := res || case when st = 'Depreciation Voucher POSTED' then 'PASS ' else 'FAIL ' end || 'B5 Standard''s depreciation posting is typed as a Depreciation Voucher: ' || coalesce(st, '?') || E'\n';

  ---------------------------------------------------------------- C. the preview
  pl2 := mfg_period_preview(mfg, m1);
  res := res || case when jsonb_array_length(pl2->'machine_lines') = 3 and (pl2->'machine'->>'actual')::numeric = 2000 and (pl2->'machine'->>'applied')::numeric = app
                      and (pl2->'machine'->>'variance')::numeric = round(2000 - app, 2) then 'PASS ' else 'FAIL ' end
                 || 'C1 the plan has three machine lines: applied ' || app || ', real ' || 2000 || ', variance ' || (pl2->'machine'->>'variance') || E'\n';
  select count(*) into c from jsonb_array_elements(pl2->'display') x where x->>'entry' = 'machine';
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'C2 the preview shows them as the machine entry (' || c || E' lines)\n';
  n := (pl2->>'to_wip')::numeric + (pl2->>'to_fg')::numeric + (pl2->>'to_cogs')::numeric;
  res := res || case when abs(n - base_total - (2000 - app)) < 0.011 then 'PASS ' else 'FAIL ' end
                 || 'C3 the machine variance is closed with the other overhead variances (' || base_total || ' → ' || n || ', change ' || (2000 - app) || E')\n';

  ---------------------------------------------------------------- D. settle
  execute format(q, mfg, '5710') into mach0; execute format(q, mfg, '5400') into dep0;
  pid := mfg_settle_period(m1);
  execute format(q, mfg, '5400') into n; execute format(q, mfg, '5710') into n2; execute format(q, mfg, '5540') into n3;
  res := res || case when dep0 = 2000 and n = 0 and abs(n2 - (mach0 + app)) < 0.011 and n3 = 0 then 'PASS ' else 'FAIL ' end
                 || 'D1 depreciation expense is taken out (' || dep0 || ' → ' || n || '), applied machine overhead is cleared by ' || app || ' (' || mach0 || ' → ' || n2 || '), the variance account is closed (' || n3 || E')\n';
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  select coalesce(sum(closing), 0) into n from mfg_account_balances(mfg, null, current_date);
  res := res || case when c = 0 and abs(n) < 0.01 then 'PASS ' else 'FAIL ' end || 'D2 the books check still ties (areas off=' || c || ') and the trial balance nets to zero (' || n || E')\n';
  j := mfg_cogm(mfg, m1, (m1 + interval '1 month - 1 day')::date);
  select string_agg((l->>'key') || '=' || trim_scale((l->>'diff')::numeric), ', ' order by ord) into st from jsonb_array_elements(j->'checks') with ordinality t(l, ord);
  res := res || case when st = 'materials=0, wip=0, received=0' then 'PASS ' else 'FAIL ' end || 'D3 the statement of cost of goods manufactured still ties out: ' || st || E'\n';
  select count(*) into c from mfg_vouchers where tenant_id = mfg and source_table = 'mfg_periods' and source_id = pid and voucher_type = 'Period-End Voucher';
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'D4 the month end has its two numbered vouchers (' || c || E')\n';
  select count(*) into c from mfg_integrity_check(mfg) where status = 'FAIL';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'D5 the integrity check has no failure (' || c || E')\n';
  select (detail->>'machine_variance')::numeric into n from mfg_audit_log where tenant_id = mfg and event = 'period_settled' order by created_at desc limit 1;
  res := res || case when n = round(2000 - app, 2) then 'PASS ' else 'FAIL ' end || 'D6 the audit log records the machine variance (' || n || E')\n';

  ---------------------------------------------------------------- E. undo and settle again
  perform mfg_undo_period_settlement(m1, 'Check the machine rate');
  execute format(q, mfg, '5400') into n; execute format(q, mfg, '5710') into n2;
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.01;
  res := res || case when n = 2000 and abs(n2 - mach0) < 0.011 and c = 0 then 'PASS ' else 'FAIL ' end || 'E1 undoing the month puts depreciation (' || n || ') and applied machine overhead (' || n2 || ') back' || E'\n';
  pid := mfg_settle_period(m1);
  execute format(q, mfg, '5400') into n;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'E2 it settles again the same way' || E'\n';

  ---------------------------------------------------------------- F. who may look
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from mfg_machine_cost(mfg, m1, current_date); res := res || E'FAIL F1 another student read the machine cost\n';
  exception when others then res := res || E'PASS F1 another student cannot read the machine cost\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_machine_cost(mfg, m1, current_date);
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'F2 the teacher can read it (' || c || E')\n';
  begin perform delete_company(mfg); exception when others then res := res || 'FAIL F3 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  select count(*) into c from regexp_matches(res, '(^|\n)FAIL ', 'g');
  raise exception E'MFG PHASE 10 — failures: %\n%', c, res;
end $$;
