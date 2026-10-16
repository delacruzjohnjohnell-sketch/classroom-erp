-- ============================================================
-- Manufacturing ERP — Phase 6a integration test (migration 0036).
--
-- Run it AFTER 0029–0036 are applied, or paste it after migration 0036 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story: lumber is inspected on receipt (moisture 8–12 %, length at least 100 mm). 100 pieces arrive in quarantine; one is measured out
-- of specification and the lot is split: 60 accepted, 10 scrapped, 20 returned to the vendor, 10 sent for rework (and accepted after a second
-- inspection). A second lot is invoiced by the vendor, so it cannot be returned. A receipt that is reversed cancels its open lot.
-- Then planks (finish 1–5) are inspected after production: the order cannot be closed until the lot is decided.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; n numeric; st text; h text; b uuid; x uuid; je uuid; k uuid;
  i_lum uuid; i_plank uuid; i_nut uuid; vend uuid; loc_q uuid; loc_rm uuid; loc_fg uuid;
  po1 uuid; po2 uuid; po3 uuid; po4 uuid; pl1 uuid; pl2 uuid; pl3 uuid; nut_pl uuid; gr1 uuid; gr2 uuid; gr3 uuid; grn uuid;
  lot1 uuid; lot2 uuid; lot3 uuid; lot4 uuid; lot5 uuid; lot6 uuid; ncr1 uuid; scrap_doc uuid; o1 uuid; o2 uuid; cm uuid; fg uuid;
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
    'mfg_record_inspection','mfg_decide_inspection_lot','mfg_close_ncr'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines',
    'mfg_forecasts','mfg_mrp_runs','mfg_planned_orders','mfg_purchase_reqs','mfg_mrp_demand','mfg_mrp_grid','mfg_mrp_exceptions','mfg_pegging',
    'mfg_item_quality','mfg_inspection_plans','mfg_inspection_lots','mfg_inspection_results','mfg_ncr'];
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
  select count(*) into c from pg_proc where proname in ('mfg__qc_line', 'mfg__qc_close_guard', 'mfg__qc_rev_guard', 'mfg__qc_quarantine') and has_function_privilege('authenticated', oid, 'execute');
  res := res || case when c = 0 and not has_function_privilege('anon', 'mfg_decide_inspection_lot(uuid, numeric, numeric, numeric, numeric, text, text, date)', 'execute')
                      and has_function_privilege('authenticated', 'mfg_decide_inspection_lot(uuid, numeric, numeric, numeric, numeric, text, text, date)', 'execute') then 'PASS ' else 'FAIL ' end
             || 'Z5 triggers and helpers are internal; decisions are for signed-in users only (callable internals=' || c || E')\n';

  ---------------------------------------------------------------- set-up
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase6a Co', '2026-01-01', 'ACTUAL');
  i_lum := mfg_save_item(null, jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',60));
  i_plank := mfg_save_item(null, jsonb_build_object('sku','PLK','name','Plank','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  i_nut := mfg_save_item(null, jsonb_build_object('sku','NUT','name','Nut','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',2));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_plank, 'valid_from', '2026-01-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_lum, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  select id into loc_q from mfg_storage_locations where kind = 'QUARANTINE' limit 1;
  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  select id into loc_fg from mfg_storage_locations where code = 'FG-STORE';
  insert into vendors (tenant_id, name) values (mfg, 'zz Lumber Co') returning id into vend;

  ---------------------------------------------------------------- A. the plan and the flags
  begin perform mfg_save_inspection_plan(i_lum, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'spec_min', 12, 'spec_max', 8))); res := res || E'FAIL A1 a minimum above the maximum was saved\n';
  exception when others then res := res || case when sqlerrm like '%minimum can''t be above%' then 'PASS ' else 'FAIL ' end || 'A1 minimum above maximum is refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_inspection_plan(i_lum, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'spec_min', 8), jsonb_build_object('characteristic', 'moisture', 'spec_max', 12))); res := res || E'FAIL A2 a duplicate characteristic was saved\n';
  exception when others then res := res || case when sqlerrm like '%listed twice%' then 'PASS ' else 'FAIL ' end || 'A2 the same characteristic twice is refused (any capitals): ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_inspection_plan(i_lum, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture'))); res := res || E'FAIL A3 no specification was accepted\n';
  exception when others then res := res || E'PASS A3 a characteristic needs a minimum or a maximum\n'; end;
  perform mfg_save_inspection_plan(i_lum, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'unit', '%', 'spec_min', 8, 'spec_max', 12), jsonb_build_object('characteristic', 'Length', 'unit', 'mm', 'spec_min', 100)));
  perform mfg_save_inspection_plan(i_plank, jsonb_build_array(jsonb_build_object('characteristic', 'Finish', 'spec_min', 1, 'spec_max', 5)));
  perform mfg_save_item_quality(i_lum, true, false);
  perform mfg_save_item_quality(i_plank, false, true);
  select count(*) into c from mfg_inspection_plans where tenant_id = mfg;
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'A4 plans saved (3 characteristics)=' || c || E'\n';

  ---------------------------------------------------------------- B. goods arrive: they must go to quarantine
  po1 := mfg_create_po(vend, '2026-11-02', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 60)));
  select l.id into pl1 from purchase_order_lines l where l.purchase_order_id = po1;
  begin perform mfg_post_goods_receipt(po1, '2026-11-03', jsonb_build_array(jsonb_build_object('po_line_id', pl1, 'qty', 100))); res := res || E'FAIL B1 inspected goods were received into the normal store\n';
  exception when others then res := res || case when sqlerrm like '%must be received into the quarantine store%' then 'PASS ' else 'FAIL ' end || 'B1 inspected goods can''t go into the normal store: ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_inspection_lots where tenant_id = mfg;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B2 the refused receipt left nothing behind=' || c || E'\n';
  gr1 := mfg_post_goods_receipt(po1, '2026-11-03', jsonb_build_array(jsonb_build_object('po_line_id', pl1, 'qty', 100, 'location_id', loc_q)));
  select id into lot1 from mfg_inspection_lots where tenant_id = mfg and source_doc_id = gr1;
  select document_number || '/' || source || '/' || status || '/' || trim_scale(qty) into st from mfg_inspection_lots where id = lot1;
  res := res || case when st = 'QI-0001/GR/CREATED/100' then 'PASS ' else 'FAIL ' end || 'B3 the receipt made an inspection lot: ' || st || E'\n';
  select coalesce(sum(qty) filter (where location_id = loc_q), 0) || '/' || coalesce(sum(qty) filter (where location_id = loc_rm), 0) into st from mfg_stock where tenant_id = mfg and item_id = i_lum;
  res := res || case when st = '100.000000/0' or st = '100.000000/0.000000' then 'PASS ' else 'FAIL ' end || 'B4 the goods sit in quarantine, none in the normal store: ' || st || E'\n';
  po2 := mfg_create_po(vend, '2026-11-03', null, jsonb_build_array(jsonb_build_object('item_id', i_nut, 'qty', 50, 'unit_price', 2)));
  select l.id into nut_pl from purchase_order_lines l where l.purchase_order_id = po2;
  perform mfg_post_goods_receipt(po2, '2026-11-03', jsonb_build_array(jsonb_build_object('po_line_id', nut_pl, 'qty', 50)));
  select count(*) into c from mfg_inspection_lots where tenant_id = mfg and item_id = i_nut;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B5 an item that is not flagged is received as before, with no lot=' || c || E'\n';

  ---------------------------------------------------------------- C. measuring and deciding
  begin perform mfg_decide_inspection_lot(lot1, 100, 0, 0, 0, null, null, '2026-11-04'); res := res || E'FAIL C1 decided before measuring\n';
  exception when others then res := res || case when sqlerrm like '%Record the result of every characteristic%' then 'PASS ' else 'FAIL ' end || 'C1 every characteristic must be measured first: ' || sqlerrm || E'\n'; end;
  begin perform mfg_record_inspection(lot1, jsonb_build_array(jsonb_build_object('characteristic', 'Weight', 'value', 5))); res := res || E'FAIL C2 an unknown characteristic was recorded\n';
  exception when others then res := res || case when sqlerrm like '%not on this item''s inspection plan%' then 'PASS ' else 'FAIL ' end || 'C2 only planned characteristics can be recorded: ' || sqlerrm || E'\n'; end;
  perform mfg_record_inspection(lot1, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'value', 9.5)));
  select status into st from mfg_inspection_lots where id = lot1;
  res := res || case when st = 'IN_INSPECTION' then 'PASS ' else 'FAIL ' end || 'C3 measuring starts the inspection: ' || st || E'\n';
  begin perform mfg_decide_inspection_lot(lot1, 100, 0, 0, 0, null, null, '2026-11-04'); res := res || E'FAIL C4 decided with a result missing\n';
  exception when others then res := res || case when sqlerrm like '%1 still missing%' then 'PASS ' else 'FAIL ' end || 'C4 one result still missing blocks the decision: ' || sqlerrm || E'\n'; end;
  perform mfg_record_inspection(lot1, jsonb_build_array(jsonb_build_object('characteristic', 'Length', 'value', 98)));
  select count(*) filter (where in_spec) || '/' || count(*) filter (where not in_spec) into st from mfg_inspection_results where lot_id = lot1;
  res := res || case when st = '1/1' then 'PASS ' else 'FAIL ' end || 'C5 moisture 9.5 is in specification, length 98 is not: in/out=' || st || E'\n';
  begin perform mfg_decide_inspection_lot(lot1, 100, 0, 0, 0, null, null, '2026-11-04'); res := res || E'FAIL C6 out-of-specification goods were accepted without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why you accept%' then 'PASS ' else 'FAIL ' end || 'C6 accepting out-of-specification goods needs a reason: ' || sqlerrm || E'\n'; end;
  begin perform mfg_decide_inspection_lot(lot1, 50, 0, 0, 0, null, 'ok', '2026-11-04'); res := res || E'FAIL C7 quantities that do not add up were accepted\n';
  exception when others then res := res || case when sqlerrm like '%add up to the whole lot%' then 'PASS ' else 'FAIL ' end || 'C7 the quantities must add up to the lot: ' || sqlerrm || E'\n'; end;
  begin perform mfg_decide_inspection_lot(lot1, 60, 10, 20, 10, null, 'Length short', '2026-11-04'); res := res || E'FAIL C8 a rejection without a root cause was accepted\n';
  exception when others then res := res || case when sqlerrm like '%root cause%' then 'PASS ' else 'FAIL ' end || 'C8 a rejection needs a root cause: ' || sqlerrm || E'\n'; end;

  perform mfg_decide_inspection_lot(lot1, 60, 10, 20, 10, 'MATERIAL', 'Length short on part of the delivery', '2026-11-04');
  select status || '/' || decision || '/' || trim_scale(qty_accept) || '/' || trim_scale(qty_scrap) || '/' || trim_scale(qty_return) || '/' || trim_scale(qty_rework) into st from mfg_inspection_lots where id = lot1;
  res := res || case when st = 'DECIDED/SPLIT/60/10/20/10' then 'PASS ' else 'FAIL ' end || 'D1 the lot was split: ' || st || E'\n';
  select coalesce(sum(qty) filter (where location_id = loc_q), 0) || '/' || coalesce(sum(qty) filter (where location_id = loc_rm), 0) into st from mfg_stock where tenant_id = mfg and item_id = i_lum;
  res := res || case when st like '10%/60%' then 'PASS ' else 'FAIL ' end || 'D2 60 released to the store, 10 still in quarantine for rework: ' || st || E'\n';
  select d.id, d.journal_entry_id into scrap_doc, je from mfg_material_documents d where d.reference_id = lot1 and d.memo like 'Scrapped%';
  select coalesce(sum(jl.debit) filter (where jl.account_id = (select account_id from mfg_account_determination where tenant_id = mfg and key = 'SCRAP_LOSS')), 0)
         || '/' || coalesce(sum(jl.credit) filter (where jl.account_id = (select account_id from mfg_account_determination where tenant_id = mfg and key = 'RM_INVENTORY')), 0) into st
    from journal_lines jl where jl.journal_entry_id = je;
  res := res || case when st = '600.00/600.00' or st = '600/600' then 'PASS ' else 'FAIL ' end || 'D3 scrap: Dr Scrap & Rework Loss 600 / Cr Raw materials 600 (10 × 60): ' || st || E'\n';
  select d.journal_entry_id into je from mfg_material_documents d where d.reference_id = lot1 and d.memo like 'Returned%';
  select coalesce(sum(jl.debit) filter (where jl.account_id = (select account_id from mfg_account_determination where tenant_id = mfg and key = 'GR_IR')), 0)
         || '/' || coalesce(sum(jl.credit) filter (where jl.account_id = (select account_id from mfg_account_determination where tenant_id = mfg and key = 'RM_INVENTORY')), 0) into st
    from journal_lines jl where jl.journal_entry_id = je;
  res := res || case when st = '1200.00/1200.00' or st = '1200/1200' then 'PASS ' else 'FAIL ' end || 'D4 return: Dr GR/IR 1,200 / Cr Raw materials 1,200 (20 × 60): ' || st || E'\n';
  select status into st from purchase_orders where id = po1;
  res := res || case when st = 'sent' then 'PASS ' else 'FAIL ' end || 'D5 the purchase order is open again for the 20 returned: ' || st || E'\n';
  select id, document_number || '/' || root_cause || '/' || trim_scale(qty) || '/' || trim_scale(cost) || '/' || disposition || '/' || status into ncr1, st from mfg_ncr where lot_id = lot1;
  res := res || case when st = 'NCR-0001/MATERIAL/40/600/Scrap 10; Return 20; Rework 10/OPEN' then 'PASS ' else 'FAIL ' end || 'D6 the non-conformance report: ' || st || E'\n';
  select id, document_number || '/' || source || '/' || status || '/' || trim_scale(qty) || '/' || (parent_lot_id = lot1) into lot2, st from mfg_inspection_lots where parent_lot_id = lot1;
  res := res || case when st = 'QI-0002/REWORK/CREATED/10/true' then 'PASS ' else 'FAIL ' end || 'D7 the rework quantity is a new lot to inspect again: ' || st || E'\n';
  select coalesce(sum(abs(difference)), 0) into n from mfg_reconciliation();
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'D8 stock and books agree after scrap and return (total difference)=' || n || E'\n';
  begin perform mfg_decide_inspection_lot(lot1, 100, 0, 0, 0, null, 'again', '2026-11-05'); res := res || E'FAIL D9 a decided lot was decided again\n';
  exception when others then res := res || case when sqlerrm like '%already decided%' then 'PASS ' else 'FAIL ' end || 'D9 a lot is decided once: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reverse_document(scrap_doc, '2026-11-06', 'oops'); res := res || E'FAIL D10 an inspection posting was reversed from the stock screen\n';
  exception when others then res := res || case when sqlerrm like '%made by an inspection decision%' then 'PASS ' else 'FAIL ' end || 'D10 a quality posting can''t be reversed from the stock screen: ' || sqlerrm || E'\n'; end;
  begin perform mfg_close_ncr(ncr1, ''); res := res || E'FAIL D11 a report was closed without a corrective action\n';
  exception when others then res := res || E'PASS D11 closing a report needs a corrective action\n'; end;
  perform mfg_close_ncr(ncr1, 'Vendor told; next delivery to be measured on arrival');
  select status into st from mfg_ncr where id = ncr1;
  res := res || case when st = 'CLOSED' then 'PASS ' else 'FAIL ' end || 'D12 the report is closed: ' || st || E'\n';

  ---------------------------------------------------------------- E. the rework lot is inspected again
  perform mfg_record_inspection(lot2, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'value', 9), jsonb_build_object('characteristic', 'Length', 'value', 101)));
  perform mfg_decide_inspection_lot(lot2, 10, 0, 0, 0, null, null, '2026-11-08');
  select count(*) into c from mfg_ncr where tenant_id = mfg;
  select coalesce(sum(qty) filter (where location_id = loc_q), 0) || '/' || coalesce(sum(qty) filter (where location_id = loc_rm), 0) into st from mfg_stock where tenant_id = mfg and item_id = i_lum;
  res := res || case when c = 1 and st like '0%/70%' then 'PASS ' else 'FAIL ' end || 'E1 reworked goods accepted: no new report (' || c || '), store holds 70: ' || st || E'\n';

  ---------------------------------------------------------------- F. a vendor invoice stops a return; reversing a receipt cancels an open lot
  po3 := mfg_create_po(vend, '2026-11-09', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 60)));
  select l.id into pl2 from purchase_order_lines l where l.purchase_order_id = po3;
  gr2 := mfg_post_goods_receipt(po3, '2026-11-09', jsonb_build_array(jsonb_build_object('po_line_id', pl2, 'qty', 100, 'location_id', loc_q)));
  select id into lot3 from mfg_inspection_lots where source_doc_id = gr2;
  perform mfg_post_vendor_invoice(po3, 'V-9001', '2026-11-10', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl2, 'qty', 100, 'unit_price', 60)), 'vi-6a');
  select status into st from mfg_vendor_invoices where vendor_ref = 'V-9001' and tenant_id = mfg;
  perform mfg_record_inspection(lot3, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'value', 10), jsonb_build_object('characteristic', 'Length', 'value', 105)));
  begin perform mfg_decide_inspection_lot(lot3, 90, 0, 10, 0, 'SUPPLIER', 'Cracked', '2026-11-11'); res := res || E'FAIL F1 goods covered by a posted vendor invoice were returned\n';
  exception when others then res := res || case when st = 'POSTED' and sqlerrm like '%vendor invoice already covers%' then 'PASS ' else 'FAIL ' end || 'F1 an invoiced receipt can''t be returned (invoice ' || st || '): ' || sqlerrm || E'\n'; end;
  perform mfg_decide_inspection_lot(lot3, 100, 0, 0, 0, null, null, '2026-11-11');
  po4 := mfg_create_po(vend, '2026-11-12', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 50, 'unit_price', 60)));
  select l.id into pl3 from purchase_order_lines l where l.purchase_order_id = po4;
  gr3 := mfg_post_goods_receipt(po4, '2026-11-12', jsonb_build_array(jsonb_build_object('po_line_id', pl3, 'qty', 50, 'location_id', loc_q)));
  select id into lot4 from mfg_inspection_lots where source_doc_id = gr3;
  perform mfg_reverse_document(gr3, '2026-11-12', 'wrong delivery');
  select status into st from mfg_inspection_lots where id = lot4;
  res := res || case when st = 'CANCELLED' then 'PASS ' else 'FAIL ' end || 'F2 reversing the receipt cancelled its open lot: ' || st || E'\n';
  begin perform mfg_decide_inspection_lot(lot4, 50, 0, 0, 0, null, null, '2026-11-13'); res := res || E'FAIL F3 a cancelled lot was decided\n';
  exception when others then res := res || case when sqlerrm like '%already cancelled%' then 'PASS ' else 'FAIL ' end || 'F3 a cancelled lot can''t be decided: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- G. production: finished goods are inspected, and the order waits for the decision
  o1 := mfg_create_order(i_plank, 10, '2026-11-16', '2026-11-30');
  perform mfg_release_order(o1);
  select id into cm from mfg_prod_components where order_id = o1;
  perform mfg_post_material_issue(o1, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 10)), '2026-11-16');
  perform mfg_post_confirmation(o1, null, 10, 0, null, 0, 0, 0, true, '2026-11-20');
  begin perform mfg_post_fg_receipt(o1, 10, null, null, null, '2026-11-22'); res := res || E'FAIL G1 inspected finished goods went to the normal store\n';
  exception when others then res := res || case when sqlerrm like '%must be received into the quarantine store%' then 'PASS ' else 'FAIL ' end || 'G1 finished goods to be inspected must go to quarantine: ' || sqlerrm || E'\n'; end;
  fg := mfg_post_fg_receipt(o1, 10, loc_q, null, null, '2026-11-22');
  select id into lot5 from mfg_inspection_lots where source_doc_id = fg;
  select source || '/' || (order_id = o1) || '/' || trim_scale(qty) into st from mfg_inspection_lots where id = lot5;
  res := res || case when st = 'PRODUCTION/true/10' then 'PASS ' else 'FAIL ' end || 'G2 the finished-goods receipt made a production lot tied to the order: ' || st || E'\n';
  x := mfg_settle_order(o1, '2026-11-30');
  begin perform mfg_close_order(o1); res := res || E'FAIL G3 an order with an undecided lot was closed\n';
  exception when others then res := res || case when sqlerrm like '%inspection lot%waiting for a decision%' then 'PASS ' else 'FAIL ' end || 'G3 the order can''t be closed while its lot is undecided: ' || sqlerrm || E'\n'; end;
  perform mfg_record_inspection(lot5, jsonb_build_array(jsonb_build_object('characteristic', 'Finish', 'value', 6)));
  begin perform mfg_decide_inspection_lot(lot5, 8, 2, 0, 0, 'MACHINE', null, '2026-12-01'); res := res || E'FAIL G4 out-of-specification planks were accepted without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why you accept%' then 'PASS ' else 'FAIL ' end || 'G4 accepting out-of-specification planks needs a reason: ' || sqlerrm || E'\n'; end;
  perform mfg_decide_inspection_lot(lot5, 8, 2, 0, 0, 'MACHINE', 'Cosmetic only; sold as second grade', '2026-12-01');
  select trim_scale(cost) || '/' || trim_scale(qty) into st from mfg_ncr where lot_id = lot5;
  res := res || case when st = '120/2' then 'PASS ' else 'FAIL ' end || 'G5 two scrapped planks at 60 cost 120: ' || st || E'\n';
  select coalesce(sum(qty) filter (where location_id = loc_fg), 0) || '/' || coalesce(sum(qty) filter (where location_id = loc_q), 0) into st from mfg_stock where tenant_id = mfg and item_id = i_plank;
  res := res || case when st like '8%/0%' then 'PASS ' else 'FAIL ' end || 'G6 8 planks now in the finished-goods store: ' || st || E'\n';
  perform mfg_close_order(o1);
  select status into st from mfg_production_orders where id = o1;
  res := res || case when st = 'CLOSED' then 'PASS ' else 'FAIL ' end || 'G7 once the lot is decided the order closes: ' || st || E'\n';

  o2 := mfg_create_order(i_plank, 1, '2026-12-02', '2026-12-03');
  perform mfg_release_order(o2);
  select id into cm from mfg_prod_components where order_id = o2;
  perform mfg_post_material_issue(o2, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 1)), '2026-12-02');
  perform mfg_post_confirmation(o2, null, 1, 0, null, 0, 0, 0, true, '2026-12-03');
  fg := mfg_post_fg_receipt(o2, 1, loc_q, null, null, '2026-12-03');
  select id into lot6 from mfg_inspection_lots where source_doc_id = fg;
  perform mfg_record_inspection(lot6, jsonb_build_array(jsonb_build_object('characteristic', 'Finish', 'value', 3)));
  begin perform mfg_decide_inspection_lot(lot6, 0, 0, 1, 0, 'PEOPLE', 'x', '2026-12-04'); res := res || E'FAIL G8 made goods were returned to a vendor\n';
  exception when others then res := res || case when sqlerrm like '%Only goods bought from a vendor%' then 'PASS ' else 'FAIL ' end || 'G8 goods we made can''t be returned to a vendor: ' || sqlerrm || E'\n'; end;
  perform mfg_decide_inspection_lot(lot6, 1, 0, 0, 0, null, null, '2026-12-04');
  select coalesce(sum(abs(difference)), 0) into n from mfg_reconciliation();
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'G9 stock and books still agree (total difference)=' || n || E'\n';

  ---------------------------------------------------------------- H. who may do what
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_inspection_lots) + (select count(*) from mfg_ncr) + (select count(*) from mfg_inspection_plans) + (select count(*) from mfg_inspection_results) + (select count(*) from mfg_item_quality) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'H1 another company sees none of it (rows=' || c || E')\n';
  begin perform mfg_record_inspection(lot2, jsonb_build_array(jsonb_build_object('characteristic', 'Length', 'value', 1))); res := res || E'FAIL H2 another student recorded results here\n';
  exception when others then res := res || E'PASS H2 another student cannot record results for this company\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_inspection_lots where tenant_id = mfg;
  res := res || case when c >= 6 then 'PASS ' else 'FAIL ' end || 'H3 the teacher can read the lots=' || c || E'\n';
  begin perform mfg_decide_inspection_lot(lot6, 1, 0, 0, 0, null, null, '2026-12-04'); res := res || E'FAIL H4 the teacher decided a student''s lot\n';
  exception when others then res := res || E'PASS H4 the teacher cannot decide a student''s lot\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into mfg_inspection_lots (tenant_id, item_id, source, qty, location_id) values (mfg, i_lum, 'GR', 1, loc_q); res := res || E'FAIL H5 a student wrote a lot directly\n';
  exception when others then res := res || E'PASS H5 lots can''t be written directly\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  ---------------------------------------------------------------- I. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_inspection_lots where tenant_id = mfg) + (select count(*) from mfg_inspection_results where tenant_id = mfg)
         + (select count(*) from mfg_ncr where tenant_id = mfg) + (select count(*) from mfg_inspection_plans where tenant_id = mfg) + (select count(*) from mfg_item_quality where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I1 the teacher deleted the company with its quality records (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL I1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 6a — failures: %\n%', n, res;
end $$;
