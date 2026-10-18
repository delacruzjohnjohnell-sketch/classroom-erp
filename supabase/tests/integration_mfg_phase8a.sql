-- ============================================================
-- Manufacturing ERP — Phase 8a integration test (migration 0041: integrity and controls).
--
-- Run it AFTER 0029–0041 are applied, or paste it after migration 0041 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The audit found three ways round the books in a Manufacturing company: typing stock or cost on the item, a manual journal line on a
-- control account that merely names a source document, and the Standard bill functions. Each is tried here as a student, and the
-- ordinary flows (the demo company, the month end, voiding a vendor invoice) are shown to be unaffected. regression_standard.sql proves
-- the Standard ERP is unchanged.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; n numeric; st text; h text; j jsonb; je uuid;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  i_lum uuid; a_inv uuid; a_cash uuid; a_exp uuid; loc_rm uuid; inv uuid; bill uuid; vend uuid; pid uuid; it uuid;
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
    'mfg_production_kpis','mfg_lot_size_curve','mfg_class_comparison','mfg_load_demo','mfg_items_guard','mfg_bills_guard'];
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
  ---------------------------------------------------------------- Z. nothing Standard changed except the two scoped triggers
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard', 'trg_mfg_items_guard', 'trg_mfg_bills_guard');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the two new scoped ones (' || h || E')\n';
  select count(*) into c from pg_trigger where not tgisinternal and tgname in ('trg_mfg_items_guard', 'trg_mfg_bills_guard');
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'Z5 exactly the two new triggers exist on items and bills (' || c || E')\n';
  res := res || case when not has_function_privilege('authenticated', 'mfg_order_wip(uuid)', 'execute') and not has_function_privilege('authenticated', 'mfg_account(uuid, text)', 'execute')
                      and not has_function_privilege('anon', 'guard_mfg_membership()', 'execute') and not has_function_privilege('authenticated', 'guard_mfg_membership()', 'execute')
                      and has_function_privilege('authenticated', 'mfg_void_vendor_invoice(uuid, date, text)', 'execute') then 'PASS ' else 'FAIL ' end
                 || 'Z6 clients can no longer call the two unguarded definer functions; the void functions are still callable' || E'\n';
  select count(*) into c from pg_proc where pronamespace = 'public'::regnamespace and proname in ('mfg__inv_key', 'mfg__avg_after', 'mfg__bucket', 'mfg__lot_qty', 'mfg_moving_average')
     and (proconfig is null or proconfig::text not like '%search_path%');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'Z7 the five helper functions have a fixed search path (without=' || c || E')\n';

  ---------------------------------------------------------------- A. ordinary flows still work with the new guards
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase8a Co', '2026-01-01', 'STANDARD');
  j := mfg_load_demo();
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.10;
  res := res || case when (j->>'items')::int = 8 and c = 0 then 'PASS ' else 'FAIL ' end || 'A1 the whole demo (receipts, invoice, production, settlement, delivery, invoicing, MRP) still posts and the books check ties (' || c || E' off)\n';
  select id into it from items where tenant_id = mfg and sku = 'LUM-NARRA';
  select id into a_inv from accounts where tenant_id = mfg and code = '1200';
  select id into a_cash from accounts where tenant_id = mfg and code = '1000';
  select id into a_exp from accounts where tenant_id = mfg and code = '5100';
  select id into loc_rm from mfg_storage_locations where tenant_id = mfg and code = 'RM-STORE';

  ---------------------------------------------------------------- B. R1 — stock and cost on the item
  begin update items set qty_on_hand = qty_on_hand + 1000 where id = it; res := res || E'FAIL B1 a student typed a new stock quantity on the item\n';
  exception when others then res := res || case when sqlerrm like '%stock documents%' then 'PASS ' else 'FAIL ' end || 'B1 typing a stock quantity on the item is refused: ' || left(sqlerrm, 80) || E'\n'; end;
  begin update items set unit_cost = 1 where id = it; res := res || E'FAIL B2 a student typed a new unit cost on the item\n';
  exception when others then res := res || E'PASS B2 typing a unit cost on the item is refused\n'; end;
  begin update items set reorder_point = 77 where id = it; select reorder_point into n from items where id = it;
    res := res || case when n = 77 then 'PASS ' else 'FAIL ' end || 'B3 other fields (the reorder point) can still be edited=' || n || E'\n';
  exception when others then res := res || 'FAIL B3 reorder point edit refused: ' || sqlerrm || E'\n'; end;
  begin insert into items (tenant_id, sku, name, qty_on_hand, unit_cost) values (mfg, 'ZZ-TYPED', 'typed stock', 10, 5); res := res || E'FAIL B4 an item was created with stock typed on it\n';
  exception when others then res := res || E'PASS B4 creating an item with a quantity on it is refused\n'; end;
  begin insert into items (tenant_id, sku, name) values (mfg, 'ZZ-EMPTY', 'no stock'); res := res || E'PASS B5 creating an item with no quantity or cost is allowed\n';
  exception when others then res := res || 'FAIL B5 an empty item was refused: ' || sqlerrm || E'\n'; end;
  perform mfg_post_stock_adjustment(it, loc_rm, 5, 95, 'OPENING', current_date);
  select qty_on_hand into n from items where id = it;
  res := res || case when n = 397 then 'PASS ' else 'FAIL ' end || 'B6 a stock document still moves the quantity (392 + 5 = 397): ' || n || E'\n';

  ---------------------------------------------------------------- C. R2 — control accounts
  begin
    insert into journal_entries (tenant_id, entry_date, memo, source_table, source_id) values (mfg, current_date, 'manual, claims a source', 'mfg_material_documents', gen_random_uuid()) returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_inv, 500, 0), (je, a_cash, 0, 500);
    res := res || E'FAIL C1 a manual line on Raw Materials Inventory that names a source was accepted\n';
  exception when others then res := res || case when sqlerrm like '%run by the system%' then 'PASS ' else 'FAIL ' end || 'C1 a manual line on inventory that merely names a source_table is now refused' || E'\n'; end;
  begin
    insert into journal_entries (tenant_id, entry_date, memo) values (mfg, current_date, 'manual, no source') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_inv, 500, 0), (je, a_cash, 0, 500);
    res := res || E'FAIL C2 a manual line on inventory with no source was accepted\n';
  exception when others then res := res || E'PASS C2 a manual line on inventory with no source is still refused\n'; end;
  begin
    insert into journal_entries (tenant_id, entry_date, memo) values (mfg, current_date, 'a genuine manual entry') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_exp, 120, 0), (je, a_cash, 0, 120);
    res := res || E'PASS C3 an ordinary manual entry between expense and cash is still allowed\n';
  exception when others then res := res || 'FAIL C3 an ordinary manual entry was refused: ' || sqlerrm || E'\n'; end;
  pid := mfg_settle_period(m1);
  perform mfg_close_period(m1);
  res := res || E'PASS C4 the month end (system postings to WIP, inventory and applied accounts) still settles and closes under the stricter guard\n';

  ---------------------------------------------------------------- D. R3 — the Standard bill functions
  select i.id, i.bill_id into inv, bill from mfg_vendor_invoices i where i.tenant_id = mfg and i.status = 'POSTED' limit 1;
  begin perform void_bill(bill, current_date); res := res || E'FAIL D1 the Standard void_bill voided a Manufacturing vendor invoice''s bill\n';
  exception when others then res := res || case when sqlerrm like '%Void a Manufacturing vendor invoice%' or sqlerrm like '%run by the system%' then 'PASS ' else 'FAIL ' end || 'D1 void_bill on a vendor-invoice bill is refused: ' || left(sqlerrm, 70) || E'\n'; end;
  select vendor_id into vend from bills where id = bill;
  insert into bills (tenant_id, vendor_id, order_date, due_date, total, status) values (mfg, vend, current_date, current_date + 30, 100, 'draft') returning id into inv;
  begin perform post_bill(inv); res := res || E'FAIL D2 the Standard post_bill posted a Manufacturing bill\n';
  exception when others then res := res || case when sqlerrm like '%Vendor invoice%' then 'PASS ' else 'FAIL ' end || 'D2 post_bill on a Manufacturing company''s bill is refused: ' || left(sqlerrm, 80) || E'\n'; end;
  select i.id into inv from mfg_vendor_invoices i where i.tenant_id = mfg and i.status = 'POSTED' limit 1;
  -- last month is closed, so the void is dated in the open month
  perform mfg_void_vendor_invoice(inv, current_date, 'Void to prove the Manufacturing void still works');
  select i.status || '/' || b.status into st from mfg_vendor_invoices i join bills b on b.id = i.bill_id where i.id = inv;
  select count(*) into c from mfg_reconciliation(mfg) where abs(difference) >= 0.10;
  res := res || case when st = 'VOID/void' and c = 0 then 'PASS ' else 'FAIL ' end || 'D3 the Manufacturing void still works and the books check ties: ' || st || ', areas off=' || c || E'\n';

  ---------------------------------------------------------------- E. the Standard ERP is not affected
  perform switch_tenant(t1);
  begin insert into items (tenant_id, sku, name, qty_on_hand, unit_cost) values (t1, 'ZZ-STD-8A', 'standard item', 5, 10) returning id into it;
    update items set qty_on_hand = 9, unit_cost = 12 where id = it;
    select qty_on_hand into n from items where id = it;
    res := res || case when n = 9 then 'PASS ' else 'FAIL ' end || 'E1 in a Standard company a student can still type stock and cost on an item=' || n || E'\n';
  exception when others then res := res || 'FAIL E1 a Standard item edit was refused: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  ---------------------------------------------------------------- F. cleanup
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F1 the teacher deleted the company (left=' || c || E')\n';
  exception when others then res := res || 'FAIL F1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 8a — failures: %\n%', n, res;
end $$;
