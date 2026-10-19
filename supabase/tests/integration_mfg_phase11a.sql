-- ============================================================
-- Manufacturing ERP — Phase 11a integration test (migration 0049: team companies and roles).
--
-- Run it AFTER 0029–0049 are applied, or paste it after migration 0049 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: only the teacher creates a team company and adds students with roles. A warehouse clerk cannot raise a purchase order, a
-- purchasing officer cannot post a goods receipt, only the finance manager closes the month, nobody approves a voucher they prepared, and a
-- student's own solo company works exactly as before (the demo company loads and the books tie).
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; std uuid; c int; c2 int; n numeric; n2 numeric; st text; h text; j jsonb;
  a_opex uuid; a_sss uuid; a_rm uuid; a_cash uuid; v1 uuid; v2 uuid; v3 uuid; v4 uuid; rv uuid; i_lum uuid; vend1 uuid; po uuid; pl uuid; doc uuid; vno text; je uuid;
  team uuid; solo uuid; tp0 uuid; tp1 uuid; k int; q text; m1 date := (date_trunc('month', current_date) - interval '1 month')::date; wc uuid; asset uuid; app numeric; hrs numeric; base_total numeric; dep0 numeric; mach0 numeric; pid uuid; pl2 jsonb; n3 numeric;
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
    'mfg_submit_voucher','mfg_approve_voucher','mfg_reject_voucher','mfg_reverse_voucher','mfg_voucher_register','mfg_voucher_view','mfg_open_items','mfg_audit_trail','mfg_machine_cost','mfg_role_label','mfg_area_label','mfg__role_areas','mfg__can','mfg__my_tenant','mfg_create_team_company','mfg_class_students','mfg_teams_list','mfg_team_roster','mfg_team_set_member','mfg_team_remove_member','mfg_my_roles','mfg_can_approve_voucher'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr',
    'mfg_downtime','mfg_order_priority','mfg_periods','mfg_period_adjust','mfg_change_log','mfg_maintenance_log','mfg_vouchers','mfg_voucher_lines','mfg_teams','mfg_company_roles'];
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
  select count(*) into c from pg_proc where proname in ('mfg_create_team_company', 'mfg_team_set_member', 'mfg_team_remove_member', 'mfg_teams_list', 'mfg_team_roster', 'mfg_class_students', 'mfg_my_roles', 'mfg_can_approve_voucher')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute');
  select count(*) into c2 from pg_proc where (proname in ('mfg__can', 'mfg__role_areas') or (proname = 'mfg__my_tenant' and pronargs = 1))
     and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'));
  res := res || case when c = 8 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'Z5 the team functions are for signed-in users and the permission helpers are not callable (' || c || '/8, ' || c2 || E' exposed)\n';
  select count(*) into c from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%mfg__my_tenant(''%';
  select count(*) into c2 from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%mfg__my_tenant()%' and proname not in ('mfg__my_tenant', 'mfg_cost_drift', 'mfg_lot_size_curve');
  res := res || case when c >= 60 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'Z6 the student write functions ask for their area (' || c || ' do) and none uses the plain door (' || c2 || E' left)\n';
  select profiles.tenant_id into tp0 from profiles where id = teach;

  ---------------------------------------------------------------- A. only the teacher creates a team company
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform mfg_create_team_company('zz Sneaky Team', '2026-01-01', 'STANDARD'); res := res || E'FAIL A1 a student created a team company\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'A1 a student cannot create a team company: ' || left(sqlerrm, 60) || E'\n'; end;
  solo := create_mfg_company('zz Solo Co', '2026-01-01', 'STANDARD');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  team := mfg_create_team_company('zz Team Co', '2026-01-01', 'STANDARD');
  select profiles.tenant_id into tp1 from profiles where id = teach;
  select (tenant_edition(team) = 'MANUFACTURING')::text || '/' || (select count(*) from mfg_teams where tenant_id = team) || '/' || (select count(*) from tenant_editions where tenant_id = team and owner_id is null)
         || '/' || (select count(*) from memberships where tenant_id = team) into st;
  res := res || case when st = 'true/1/1/0' and tp0 is not distinct from tp1 then 'PASS ' else 'FAIL ' end || 'A2 the teacher made a Manufacturing team company with no owner and no member, and stayed where they were: ' || st || E'\n';
  select count(*) into c from accounts where tenant_id = team; select count(*) into c2 from accounts where tenant_id = solo;
  select count(*) into k from mfg_account_determination where tenant_id = team;
  res := res || case when c = c2 and c > 40 and k = (select count(*) from mfg_account_determination where tenant_id = solo) then 'PASS ' else 'FAIL ' end || 'A3 it has the same chart of accounts and account settings as a solo company (' || c || '/' || c2 || ' accounts, ' || k || E' settings)\n';
  select count(*) into c from mfg_uom where tenant_id = team; select count(*) into c2 from mfg_uom where tenant_id = solo;
  select count(*) into k from mfg_storage_locations where tenant_id = team;
  res := res || case when c = c2 and c > 5 and k = (select count(*) from mfg_storage_locations where tenant_id = solo) then 'PASS ' else 'FAIL ' end || 'A4 and the same master data (' || c || ' units, ' || k || E' locations)\n';
  select count(*) into c from mfg_class_students();
  res := res || case when c >= 2 then 'PASS ' else 'FAIL ' end || 'A5 the teacher can list the class (' || c || E')\n';

  ---------------------------------------------------------------- B. nobody joins by themselves
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from accounts where tenant_id = team;
  begin perform switch_tenant(team); res := res || E'FAIL B1 a student switched into a team company they were not added to\n';
  exception when others then res := res || case when c = 0 and sqlerrm like '%not a member%' then 'PASS ' else 'FAIL ' end || 'B1 before being added a student sees nothing of the team company and cannot switch into it (' || c || E' accounts)\n'; end;
  begin perform mfg_team_set_member(team, s2, array['WAREHOUSE']); res := res || E'FAIL B2 a student added themselves\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'B2 a student cannot add team members: ' || left(sqlerrm, 60) || E'\n'; end;
  begin perform * from mfg_team_roster(team); res := res || E'FAIL B3 a non-member read the roster\n';
  exception when others then res := res || E'PASS B3 a non-member cannot read the roster\n'; end;

  ---------------------------------------------------------------- C. the teacher builds the team
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_team_set_member(team, s1, array['ACCOUNTANT', 'PURCHASING', 'PRODUCTION']);
  perform mfg_team_set_member(team, s2, array['WAREHOUSE', 'FINANCE_MANAGER']);
  begin perform mfg_team_set_member(team, s1, array['BOSS']); res := res || E'FAIL C1 an unknown role was accepted\n';
  exception when others then res := res || case when sqlerrm like 'Unknown role%' then 'PASS ' else 'FAIL ' end || 'C1 an unknown role is refused' || E'\n'; end;
  begin perform mfg_team_set_member(team, teach, array['AUDITOR']); res := res || E'FAIL C2 the teacher was added as a member\n';
  exception when others then res := res || E'PASS C2 only students can be members\n'; end;
  select string_agg(coalesce(full_name, '?') || ':' || array_to_string(roles, '+'), ' | ' order by array_to_string(roles, '+')) into st from mfg_team_roster(team);
  select count(*) into c from mfg_team_roster(team);
  res := res || case when c = 2 and st like '%ACCOUNTANT+PRODUCTION+PURCHASING%' and st like '%FINANCE_MANAGER+WAREHOUSE%' then 'PASS ' else 'FAIL ' end || 'C3 the roster shows both students with their roles: ' || st || E'\n';
  select members into c from mfg_teams_list() where tenant_id = team;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'C4 the teacher''s list of teams counts the members (' || c || E')\n';

  ---------------------------------------------------------------- D. each role does only its own work
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(team);
  select count(*) into c from accounts where tenant_id = team;
  res := res || case when c > 40 then 'PASS ' else 'FAIL ' end || 'D1 once added, a member sees the whole company (' || c || E' accounts)\n';
  begin perform mfg_post_goods_receipt(null::uuid, current_date, '[]'::jsonb); res := res || E'FAIL D2 a purchasing officer posted a goods receipt\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' and sqlerrm like '%Accountant%' then 'PASS ' else 'FAIL ' end || 'D2 without a warehouse role you cannot post stock: ' || left(sqlerrm, 110) || E'\n'; end;
  begin perform mfg_create_po(null::uuid, current_date, null::date, '[]'::jsonb); res := res || E'PASS D3 the purchasing officer is let through to the purchase order\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' then 'FAIL ' else 'PASS ' end || 'D3 the purchasing officer is let through to the purchase order (it stops later: ' || left(sqlerrm, 50) || E')\n'; end;
  begin perform mfg_load_demo(); res := res || E'FAIL D4 a member loaded the demo into a team company\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' then 'PASS ' else 'FAIL ' end || 'D4 nobody loads the demo into a team company: ' || left(sqlerrm, 60) || E'\n'; end;
  begin perform mfg_close_period(date_trunc('month', current_date)::date); res := res || E'FAIL D5 an accountant closed the month\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' and sqlerrm like '%close the month%' then 'PASS ' else 'FAIL ' end || 'D5 an accountant cannot close the month: ' || left(sqlerrm, 100) || E'\n'; end;
  select roles into st from (select array_to_string(roles, '+') as roles, is_team from mfg_my_roles()) x where is_team;
  res := res || case when st = 'ACCOUNTANT+PRODUCTION+PURCHASING' then 'PASS ' else 'FAIL ' end || 'D6 the member can ask what roles they hold: ' || coalesce(st, '?') || E'\n';

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(team);
  begin perform mfg_create_po(null::uuid, current_date, null::date, '[]'::jsonb); res := res || E'FAIL D7 a warehouse clerk raised a purchase order\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' and sqlerrm like '%Warehouse clerk%' then 'PASS ' else 'FAIL ' end || 'D7 a warehouse clerk cannot raise a purchase order: ' || left(sqlerrm, 110) || E'\n'; end;
  begin perform mfg_reverse_document(null::uuid, current_date, 'x'); res := res || E'PASS D8 the warehouse clerk is let through to stock documents\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' then 'FAIL ' else 'PASS ' end || 'D8 the warehouse clerk is let through to stock documents (it stops later: ' || left(sqlerrm, 50) || E')\n'; end;
  begin perform mfg_close_period(date_trunc('month', current_date)::date); res := res || E'FAIL D9 closing an unsettled month worked\n';
  exception when others then res := res || case when sqlerrm like 'In this team company your role%' then 'FAIL ' else 'PASS ' end || 'D9 the finance manager is let through to closing (it stops later: ' || left(sqlerrm, 60) || E')\n'; end;

  ---------------------------------------------------------------- E. vouchers: prepared by one, approved by another
  execute 'reset role';
  update tenants set approval_threshold = 500 where id = team;
  select id into a_opex from accounts where tenant_id = team and code = '5100';
  select id into a_sss from accounts where tenant_id = team and code = '2100';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v1 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Team accrual',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 900), jsonb_build_object('account_id', a_sss, 'credit', 900))));
  select mfg_submit_voucher(v1) into st;
  res := res || case when st = 'PENDING_APPROVAL' then 'PASS ' else 'FAIL ' end || 'E1 the accountant''s large voucher waits for approval: ' || st || E'\n';
  res := res || case when mfg_can_approve_voucher(v1) = false then 'PASS ' else 'FAIL ' end || 'E2 the person who prepared it cannot approve it' || E'\n';
  begin perform mfg_approve_voucher(v1); res := res || E'FAIL E3 the preparer approved their own voucher\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher can approve%' then 'PASS ' else 'FAIL ' end || 'E3 and is refused: ' || left(sqlerrm, 70) || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := res || case when mfg_can_approve_voucher(v1) then 'PASS ' else 'FAIL ' end || 'E4 the finance manager can approve it' || E'\n';
  perform mfg_approve_voucher(v1);
  select status || '/' || (approved_by = s2)::text || '/' || (prepared_by = s1)::text into st from mfg_vouchers where id = v1;
  res := res || case when st = 'POSTED/true/true' then 'PASS ' else 'FAIL ' end || 'E5 approved by the finance manager, prepared by the accountant, posted: ' || st || E'\n';
  v2 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Finance manager accrual',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 800), jsonb_build_object('account_id', a_sss, 'credit', 800))));
  select mfg_submit_voucher(v2) into st;
  begin perform mfg_approve_voucher(v2); res := res || E'FAIL E6 the finance manager approved their own voucher\n';
  exception when others then res := res || case when sqlerrm like '%You prepared this voucher%' then 'PASS ' else 'FAIL ' end || 'E6 a finance manager cannot approve their own voucher either: ' || left(sqlerrm, 70) || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform mfg_approve_voucher(v2); res := res || E'FAIL E7 an accountant approved a voucher\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher can approve%' then 'PASS ' else 'FAIL ' end || 'E7 an accountant cannot approve someone else''s voucher: ' || left(sqlerrm, 60) || E'\n'; end;
  v3 := mfg_save_voucher(null, jsonb_build_object('voucher_date', current_date, 'particulars', 'Accrual to send back',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opex, 'debit', 700), jsonb_build_object('account_id', a_sss, 'credit', 700))));
  select mfg_submit_voucher(v3) into st;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_reject_voucher(v3, 'Name the payroll period');
  select status || '/' || reject_note into st from mfg_vouchers where id = v3;
  res := res || case when st = 'DRAFT/Name the payroll period' then 'PASS ' else 'FAIL ' end || 'E8 the finance manager sends it back with a note: ' || st || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_approve_voucher(v2);
  select status into st from mfg_vouchers where id = v2;
  res := res || case when st = 'POSTED' then 'PASS ' else 'FAIL ' end || 'E9 the teacher can still approve anything: ' || st || E'\n';
  begin perform mfg_save_voucher(null, jsonb_build_object('lines', '[]'::jsonb)); res := res || E'FAIL E10 the teacher prepared a voucher in a team company\n';
  exception when others then res := res || E'PASS E10 the teacher approves but does not prepare\n'; end;

  ---------------------------------------------------------------- F. a solo company is untouched
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(solo);
  select is_team::text into st from mfg_my_roles();
  res := res || case when st = 'false' then 'PASS ' else 'FAIL ' end || 'F1 the same student''s own company is not a team company' || E'\n';
  perform mfg_load_demo();
  select count(*) into c from mfg_reconciliation(solo) where abs(difference) >= 0.01;
  select count(*) into c2 from mfg_vouchers where tenant_id = solo;
  res := res || case when c = 0 and c2 > 20 then 'PASS ' else 'FAIL ' end || 'F2 in a solo company the owner does everything: the demo loads, the books tie (areas off=' || c || '), ' || c2 || E' vouchers\n';
  begin perform mfg_approve_voucher(v1); res := res || E'FAIL F3 a solo owner approved a team voucher\n';
  exception when others then res := res || E'PASS F3 and cannot touch the team company''s vouchers from there\n'; end;

  ---------------------------------------------------------------- G. removing a member
  perform switch_tenant(team);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_team_remove_member(team, s2);
  select count(*) into c from memberships where tenant_id = team and user_id = s2;
  select count(*) into c2 from mfg_company_roles where tenant_id = team and user_id = s2;
  select profiles.tenant_id into tp1 from profiles where id = s2;
  res := res || case when c = 0 and c2 = 0 and tp1 is not null and tp1 <> team and exists (select 1 from memberships where user_id = s2 and tenant_id = tp1) then 'PASS ' else 'FAIL ' end || 'G1 removing a member takes away their access and roles and puts them back in another company of theirs (' || c || '/' || c2 || E')\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform switch_tenant(team); res := res || E'FAIL G2 a removed member switched back in\n';
  exception when others then res := res || E'PASS G2 and cannot switch back\n'; end;

  ---------------------------------------------------------------- H. deleting the team company
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform delete_company(team); perform delete_company(solo);
    select count(*) into c from mfg_teams where tenant_id = team; select count(*) into c2 from mfg_company_roles where tenant_id = team;
    res := res || case when c = 0 and c2 = 0 then 'PASS ' else 'FAIL ' end || 'H1 the teacher deleted the team company with its roster (' || c || '/' || c2 || E')\n';
  exception when others then res := res || 'FAIL H1 deleting failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  select count(*) into c from regexp_matches(res, '(^|\n)FAIL ', 'g');
  raise exception E'MFG PHASE 11A — failures: %\n%', c, res;
end $$;
