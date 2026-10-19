-- ============================================================
-- Manufacturing ERP — Phase 9 integration test (migrations 0046–0047: journal vouchers, ageing, audit trail).
--
-- Run it AFTER 0029–0047 are applied, or paste it after migrations 0046 and 0047 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the demo company. Every journal entry already has a voucher number. A student prepares an accrual, is stopped by an unbalanced
-- form and by a control account, posts a balanced one, overrides a control account with a reason and waits for the teacher, is sent back,
-- is approved, reverses a voucher, and cannot reverse it twice. A stock receipt's voucher is read back with its source document.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; std uuid; c int; c2 int; n numeric; n2 numeric; st text; h text; j jsonb;
  a_opex uuid; a_sss uuid; a_rm uuid; a_cash uuid; v1 uuid; v2 uuid; v3 uuid; v4 uuid; rv uuid; i_lum uuid; vend1 uuid; po uuid; pl uuid; doc uuid; vno text; je uuid;
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
    'mfg_submit_voucher','mfg_approve_voucher','mfg_reject_voucher','mfg_reverse_voucher','mfg_voucher_register','mfg_voucher_view','mfg_open_items','mfg_audit_trail'];
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard', 'trg_mfg_items_guard', 'trg_mfg_bills_guard', 'trg_mfg_payment_qc_guard', 'trg_mfg_log_company_settings', 'trg_mfg_register_voucher');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the scoped ones (' || h || E')\n';
  select count(*) into c from pg_proc where proname in ('mfg_save_voucher', 'mfg_submit_voucher', 'mfg_approve_voucher', 'mfg_reverse_voucher', 'mfg_voucher_view', 'mfg_voucher_register', 'mfg_open_items', 'mfg_audit_trail')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute');
  select count(*) into c2 from pg_proc where proname in ('mfg__post_voucher', 'mfg__voucher_check', 'mfg__next_jv', 'mfg_register_voucher') and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'));
  res := res || case when c = 8 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'Z5 the voucher functions are for signed-in users and the internal ones are not callable (' || c || '/8, ' || c2 || E' exposed)\n';

  ---------------------------------------------------------------- A. every entry has a numbered voucher
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase9 Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();
  select count(*) into c from journal_entries e where e.tenant_id = mfg;
  select count(*) into c2 from mfg_vouchers v where v.tenant_id = mfg and v.kind = 'SYSTEM' and v.status = 'POSTED' and v.journal_entry_id is not null;
  res := res || case when c = c2 and c > 20 then 'PASS ' else 'FAIL ' end || 'A1 every journal entry of the demo company has a system voucher (' || c || ' entries, ' || c2 || E' vouchers)\n';
  select count(*) into c from mfg_vouchers where tenant_id = mfg and voucher_no !~ '^JV-[0-9]{4}-[0-9]{5}$';
  select count(distinct voucher_no) into c2 from mfg_vouchers where tenant_id = mfg;
  select count(*) into n from mfg_vouchers where tenant_id = mfg;
  res := res || case when c = 0 and c2 = n then 'PASS ' else 'FAIL ' end || 'A2 numbers look like JV-2026-00001 and none repeats (' || c || ' malformed, ' || c2 || '/' || n || E' distinct)\n';
  select string_agg(distinct voucher_type, ', ' order by voucher_type) into st from mfg_vouchers where tenant_id = mfg;
  res := res || case when st like '%AR Voucher%' and st like '%Inventory Voucher%' and st like '%WIP Voucher%' then 'PASS ' else 'FAIL ' end || 'A3 the vouchers are typed by what posted them: ' || st || E'\n';

  select id into a_opex from accounts where tenant_id = mfg and code = '5100';
  select id into a_sss from accounts where tenant_id = mfg and code = '2100';
  select id into a_rm from accounts where tenant_id = mfg and code = '1200';
  select id into a_cash from accounts where tenant_id = mfg and code = '1000';
  select coalesce(sum(jl.debit - jl.credit), 0) into before5100 from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and jl.account_id = a_opex;

  ---------------------------------------------------------------- B. a manual voucher
  v1 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'jv_type', 'ACCRUAL', 'reference', 'Payroll cut-off', 'particulars', 'Accrue the employer share of SSS',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 1000, 'description', 'SSS employer'), jsonb_build_object('account_id', a_sss, 'credit', 600))));
  select status || ' ' || voucher_no into st from mfg_vouchers where id = v1;
  res := res || case when st like 'DRAFT JV-%' then 'PASS ' else 'FAIL ' end || 'B1 an unbalanced form can still be saved as a draft: ' || st || E'\n';
  begin perform mfg_submit_voucher(v1); res := res || E'FAIL B2 an unbalanced voucher was submitted\n';
  exception when others then res := res || case when sqlerrm like '%differ by 400%' then 'PASS ' else 'FAIL ' end || 'B2 an unbalanced voucher is refused: ' || left(sqlerrm, 80) || E'\n'; end;
  v1 := mfg_save_voucher(v1, jsonb_build_object('voucher_date', current_date, 'jv_type', 'ACCRUAL', 'reference', 'Payroll cut-off', 'particulars', 'Accrue the employer share of SSS',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 1000, 'description', 'SSS employer'), jsonb_build_object('account_id', a_sss, 'credit', 1000))));
  v3 := mfg_save_voucher(null, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 5))));
  begin perform mfg_submit_voucher(v3); res := res || E'FAIL B3 a one-line voucher was submitted\n';
  exception when others then res := res || case when sqlerrm like '%at least two lines%' then 'PASS ' else 'FAIL ' end || 'B3 a voucher needs two lines: ' || left(sqlerrm, 70) || E'\n'; end;
  perform mfg_delete_voucher(v3);
  select mfg_submit_voucher(v1) into st;
  res := res || case when st = 'POSTED' then 'PASS ' else 'FAIL ' end || 'B4 a balanced voucher below the approval threshold posts at once: ' || st || E'\n';
  select journal_entry_id, voucher_no into je, vno from mfg_vouchers where id = v1;
  select count(*) || '/' || sum(debit) || '/' || sum(credit) into st from journal_lines where journal_entry_id = je;
  res := res || case when st = '2/1000.00/1000.00' then 'PASS ' else 'FAIL ' end || 'B5 the journal entry has the same two lines and amounts: ' || st || E'\n';
  select source_table || ' ' || (memo like vno || '%')::text into st from journal_entries where id = je;
  res := res || case when st = 'mfg_vouchers true' then 'PASS ' else 'FAIL ' end || 'B6 the entry is tied to its voucher and carries its number: ' || st || E'\n';
  select count(*) into c from mfg_vouchers where journal_entry_id = je;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'B7 posting a voucher did not also create a second, system voucher (' || c || E')\n';
  select coalesce(sum(closing), 0) into n from mfg_account_balances(mfg, null, current_date);
  res := res || case when abs(n) < 0.01 then 'PASS ' else 'FAIL ' end || 'B8 the trial balance still nets to zero (' || n || E')\n';

  v2 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Move stock by hand',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_rm, 'debit', 500), jsonb_build_object('account_id', a_cash, 'credit', 500))));
  begin perform mfg_submit_voucher(v2); res := res || E'FAIL B9 a manual line on a control account was accepted\n';
  exception when others then res := res || case when sqlerrm like '%control account%' then 'PASS ' else 'FAIL ' end || 'B9 a control account is refused without an override: ' || left(sqlerrm, 60) || E'\n'; end;
  v2 := mfg_save_voucher(v2, jsonb_build_object('voucher_date', current_date, 'particulars', 'Count adjustment found by audit', 'override', true, 'override_reason', 'short',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_rm, 'debit', 500), jsonb_build_object('account_id', a_cash, 'credit', 500))));
  begin perform mfg_submit_voucher(v2); res := res || E'FAIL B10 an override without a reason was accepted\n';
  exception when others then res := res || case when sqlerrm like '%ten characters%' then 'PASS ' else 'FAIL ' end || 'B10 an override needs a real reason: ' || left(sqlerrm, 60) || E'\n'; end;
  v2 := mfg_save_voucher(v2, jsonb_build_object('voucher_date', current_date, 'particulars', 'Count adjustment found by audit', 'override', true, 'override_reason', 'Auditor found a count difference on the stock sheet',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_rm, 'debit', 500), jsonb_build_object('account_id', a_cash, 'credit', 500))));
  select mfg_submit_voucher(v2) into st;
  res := res || case when st = 'PENDING_APPROVAL' then 'PASS ' else 'FAIL ' end || 'B11 an override always waits for the teacher: ' || st || E'\n';
  begin perform mfg_approve_voucher(v2); res := res || E'FAIL B12 a student approved a voucher\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'B12 a student cannot approve: ' || left(sqlerrm, 50) || E'\n'; end;
  begin perform mfg_save_voucher(v2, jsonb_build_object('lines', '[]'::jsonb)); res := res || E'FAIL B13 a voucher waiting for approval was edited\n';
  exception when others then res := res || E'PASS B13 a voucher waiting for approval cannot be edited\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_reject_voucher(v2, 'Attach the count sheet and name the item');
  select status || '/' || reject_note into st from mfg_vouchers where id = v2;
  res := res || case when st = 'DRAFT/Attach the count sheet and name the item' then 'PASS ' else 'FAIL ' end || 'B14 the teacher sends it back with a note: ' || st || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select mfg_submit_voucher(v2) into st;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_approve_voucher(v2);
  select status || '/' || (approved_by = teach)::text || '/' || (reviewed_by = teach)::text || '/' || (journal_entry_id is not null)::text into st from mfg_vouchers where id = v2;
  res := res || case when st = 'POSTED/true/true/true' then 'PASS ' else 'FAIL ' end || 'B15 resubmitted and approved by the teacher it posts, with the teacher as reviewer and approver: ' || st || E'\n';
  select (reject_note is null)::text into h from mfg_vouchers where id = v2;
  res := res || case when h = 'true' then 'PASS ' else 'FAIL ' end || 'B16 the send-back note is cleared once it is resubmitted' || E'\n';
  begin perform mfg_save_voucher(null, jsonb_build_object('lines', '[]'::jsonb)); res := res || E'FAIL B17 the teacher created a voucher\n';
  exception when others then res := res || E'PASS B17 the teacher can approve but not prepare vouchers\n'; end;

  execute 'reset role';
  update tenants set approval_threshold = 500 where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v3 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Large accrual',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 900), jsonb_build_object('account_id', a_sss, 'credit', 900))));
  select mfg_submit_voucher(v3) into st;
  v4 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Small accrual',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 100), jsonb_build_object('account_id', a_sss, 'credit', 100))));
  select st || '/' || mfg_submit_voucher(v4) into st;
  res := res || case when st = 'PENDING_APPROVAL/POSTED' then 'PASS ' else 'FAIL ' end || 'B18 above the company threshold (500) it waits; below it posts (900, 100): ' || st || E'\n';
  execute 'reset role';
  update tenants set approval_threshold = null where id = mfg;

  update tenants set books_locked_through = current_date where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v3 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Late entry',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 10), jsonb_build_object('account_id', a_sss, 'credit', 10))));
  begin perform mfg_submit_voucher(v3); res := res || E'FAIL B19 a voucher dated in a closed month was posted\n';
  exception when others then res := res || case when sqlerrm like '%closed through%' then 'PASS ' else 'FAIL ' end || 'B19 a closed month refuses the voucher: ' || left(sqlerrm, 60) || E'\n'; end;
  execute 'reset role';
  update tenants set books_locked_through = null where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_delete_voucher(v3);
  select count(*) into c from mfg_vouchers where id = v3;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B20 a draft can be deleted' || E'\n';
  begin perform mfg_delete_voucher(v1); res := res || E'FAIL B21 a posted voucher was deleted\n';
  exception when others then res := res || E'PASS B21 a posted voucher cannot be deleted\n'; end;

  ---------------------------------------------------------------- C. reversal
  begin perform mfg_reverse_voucher(v1, current_date - 1, 'Wrong date'); res := res || E'FAIL C1 a reversal dated before the voucher was accepted\n';
  exception when others then res := res || E'PASS C1 a reversal can''t be dated before the voucher\n'; end;
  rv := mfg_reverse_voucher(v1, current_date, 'Accrued twice by mistake');
  select o.status || '/' || r.jv_type || '/' || r.status || '/' || (r.reverses_voucher_id = o.id)::text || '/' || (o.reversed_by_voucher_id = r.id)::text into st
    from mfg_vouchers o join mfg_vouchers r on r.id = rv where o.id = v1;
  res := res || case when st = 'REVERSED/REVERSING/POSTED/true/true' then 'PASS ' else 'FAIL ' end || 'C2 the original is REVERSED and a linked reversing voucher is POSTED: ' || st || E'\n';
  select coalesce(sum(jl.debit - jl.credit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and jl.account_id = a_opex;
  res := res || case when n = before5100 + 100 then 'PASS ' else 'FAIL ' end || 'C3 the operating-expense account is back where it was plus the 100 small accrual (' || n || ' vs ' || (before5100 + 100) || E')\n';
  begin perform mfg_reverse_voucher(v1, current_date, 'Again'); res := res || E'FAIL C4 a voucher was reversed twice\n';
  exception when others then res := res || case when sqlerrm like '%already been reversed%' then 'PASS ' else 'FAIL ' end || 'C4 it cannot be reversed twice: ' || left(sqlerrm, 50) || E'\n'; end;
  begin perform mfg_reverse_voucher(rv, current_date, 'Undo the undo'); res := res || E'FAIL C5 a reversing voucher was reversed\n';
  exception when others then res := res || E'PASS C5 a reversing voucher cannot itself be reversed\n'; end;
  select id into v3 from mfg_vouchers where tenant_id = mfg and source_table = 'mfg_material_documents' limit 1;
  begin perform mfg_reverse_voucher(v3, current_date, 'Try'); res := res || E'FAIL C6 a document''s voucher was reversed on its own\n';
  exception when others then res := res || case when sqlerrm like '%Reverse that document%' then 'PASS ' else 'FAIL ' end || 'C6 a stock document''s voucher points to the document instead: ' || left(sqlerrm, 60) || E'\n'; end;

  select m.item_id into i_lum from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'LUM-NARRA';
  select id into vend1 from vendors where tenant_id = mfg and name like 'Cabanatuan%';
  po := mfg_create_po(vend1, current_date, current_date + 3, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 10, 'unit_price', 100)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po;
  doc := mfg_post_goods_receipt(po, current_date, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 10)));
  select id into v3 from mfg_vouchers where tenant_id = mfg and source_id = doc and status = 'POSTED' limit 1;
  res := res || case when v3 is not null then 'PASS ' else 'FAIL ' end || 'C7 the goods receipt posted a voucher' || E'\n';
  perform mfg_reverse_document(doc, current_date, 'Wrong delivery');
  select status || '/' || (reversed_by_voucher_id is not null)::text into st from mfg_vouchers where id = v3;
  res := res || case when st = 'REVERSED/true' then 'PASS ' else 'FAIL ' end || 'C8 reversing the document marks its voucher REVERSED and links the reversal: ' || st || E'\n';

  ---------------------------------------------------------------- D. the viewer and the register
  j := mfg_voucher_view(v1);
  res := res || case when jsonb_array_length(j->'lines') = 2 and (j->>'debit')::numeric = 1000 and (j->>'credit')::numeric = 1000 and j->>'status' = 'REVERSED'
                      and (j->'reversed_by'->>'no') = (select voucher_no from mfg_vouchers where id = rv) and (j->'signoff'->'prepared'->>'at') is not null and (j->>'can_reverse') = 'false' then 'PASS ' else 'FAIL ' end
                 || 'D1 the viewer data for a manual voucher: lines, totals, who prepared it, the reversal link, no second reverse' || E'\n';
  j := mfg_voucher_view(v3);
  res := res || case when (j->'source'->>'label') = 'Stock document' and (j->'source'->>'number') is not null and jsonb_array_length(j->'lines') >= 2 and (j->>'debit') = (j->>'credit')
                      and (j->'source'->>'path') = '/mfg/inventory?tab=documents' then 'PASS ' else 'FAIL ' end
                 || 'D2 the viewer data for a receipt names its source document: ' || coalesce(j->'source'->>'label', '?') || ' ' || coalesce(j->'source'->>'number', '?') || E'\n';
  select total into n from mfg_voucher_register(mfg, current_date, current_date) where id = v1;
  res := res || case when n = 1000 then 'PASS ' else 'FAIL ' end || 'D3 the register shows the voucher''s total (' || n || E')\n';
  select count(*) into c from mfg_voucher_register(mfg, null, null);
  select count(*) into c2 from mfg_vouchers where tenant_id = mfg;
  res := res || case when c = c2 then 'PASS ' else 'FAIL ' end || 'D4 the register lists every voucher (' || c || '/' || c2 || E')\n';
  select count(*) into c from mfg_vouchers where source_id = doc;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'D5 a document''s voucher can be found by the document (' || c || E')\n';

  ---------------------------------------------------------------- E. books, ageing, audit trail
  select count(*), count(*) filter (where status = 'FAIL' and title not like 'Raw materials%') into c, c2 from mfg_integrity_check(mfg);
  select count(*) into n from mfg_integrity_check(mfg) where status = 'FAIL' and title like 'Raw materials%';
  res := res || case when c2 = 0 and n = 1 and c >= 20 then 'PASS ' else 'FAIL ' end || 'E1 the integrity check passes its two new checks and catches the one thing that is wrong: the 500 audit adjustment on raw materials that no stock document explains (' || c || ' checks, ' || c2 || ' other failures, raw-materials failures ' || n || E')\n';
  select coalesce(sum(balance), 0) into n from mfg_open_items(mfg, current_date) where side = 'AR';
  select coalesce(sum(closing), 0) into n2 from mfg_account_balances(mfg, null, current_date) where code = '1100';
  res := res || case when abs(n - n2) < 0.10 then 'PASS ' else 'FAIL ' end || 'E2 receivables ageing adds up to account 1100 (' || n || ' vs ' || n2 || E')\n';
  select coalesce(sum(balance), 0) into n from mfg_open_items(mfg, current_date) where side = 'AP';
  select coalesce(-sum(closing), 0) into n2 from mfg_account_balances(mfg, null, current_date) where code = '2000';
  res := res || case when abs(n - n2) < 0.10 then 'PASS ' else 'FAIL ' end || 'E3 payables ageing adds up to account 2000 (' || n || ' vs ' || n2 || E')\n';
  select count(*) into c from mfg_open_items(mfg, current_date) where bucket not in ('Current', '1-30', '31-60', '61-90', 'Over 90');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E4 every open item is in a known bucket' || E'\n';
  select count(*) into c from mfg_audit_trail(mfg, current_date - 1, current_date) where kind = 'Control event' and what like 'voucher%';
  select count(*) into c2 from mfg_audit_trail(mfg, current_date - 1, current_date) where kind = 'Master data';
  res := res || case when c >= 5 and c2 > 0 then 'PASS ' else 'FAIL ' end || 'E5 the audit trail shows the vouchers posted, sent back and reversed (' || c || ') and master-data changes (' || c2 || E')\n';

  ---------------------------------------------------------------- F. a Standard company has no vouchers
  std := create_tenant('zz Phase9 standard');
  insert into journal_entries (tenant_id, entry_date, memo) values (std, current_date, 'zz standard entry');
  select count(*) into c from mfg_vouchers where tenant_id = std;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F1 a Standard company''s journal entries are not turned into vouchers (' || c || E')\n';
  perform switch_tenant(mfg);

  ---------------------------------------------------------------- G. who may look
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_vouchers where tenant_id = mfg;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G1 another student sees none of the vouchers (' || c || E')\n';
  begin perform mfg_voucher_view(v1); res := res || E'FAIL G2 another student viewed a voucher\n';
  exception when others then res := res || E'PASS G2 another student cannot view a voucher\n'; end;
  begin perform * from mfg_voucher_register(mfg, null, null); res := res || E'FAIL G3 another student read the register\n';
  exception when others then res := res || E'PASS G3 another student cannot read the register\n'; end;
  begin perform mfg_reverse_voucher(v4, current_date, 'Not mine'); res := res || E'FAIL G4 another student reversed a voucher\n';
  exception when others then res := res || E'PASS G4 another student cannot reverse a voucher\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_voucher_register(mfg, null, null);
  res := res || case when c > 20 then 'PASS ' else 'FAIL ' end || 'G5 the teacher can read the register (' || c || E' vouchers)\n';
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg; select count(*) into c2 from mfg_vouchers where tenant_id = mfg;
    res := res || case when c = 0 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'H1 the teacher deleted the company with its vouchers (company left=' || c || ', vouchers left=' || c2 || E')\n';
  exception when others then res := res || 'FAIL H1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  begin perform delete_company(std); exception when others then null; end;
  execute 'reset role';

  select count(*) into c from regexp_matches(res, '(^|\n)FAIL ', 'g');
  raise exception E'MFG PHASE 9 — failures: %\n%', c, res;
end $$;
