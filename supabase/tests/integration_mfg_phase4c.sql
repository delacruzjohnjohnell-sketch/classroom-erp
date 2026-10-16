-- ============================================================
-- Manufacturing ERP — Phase 4c integration test (migration 0033).
--
-- Run it AFTER 0029–0033 are applied, or paste it after the migrations in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id.
--
-- The story: lumber bought at 65 against a 60 standard is received, then the vendor's invoice is matched three ways
-- (order, receipt, invoice). An exact invoice posts (Dr GR/IR, Dr input VAT, Cr accounts payable); a small price difference
-- posts with a purchase price variance; a big one is held until the teacher releases it. Then freight is spread over the
-- receipts (landed cost), invoices are paid and voided, and the stock sub-ledger and payables agree with the books.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; n2 numeric; st text; h text; je uuid; x uuid; bill uuid;
  i_lum uuid; i_scr uuid; i_log2 uuid; i_log3 uuid; vend uuid; vend2 uuid; loc_rm uuid;
  po1 uuid; po2 uuid; po3 uuid; po4 uuid; po5 uuid; po6 uuid; po7 uuid; po8 uuid; po9 uuid; po10 uuid;
  pl1_lum uuid; pl1_scr uuid; pl uuid; gr1 uuid; gr2 uuid; gr8 uuid; gr9 uuid; gr10 uuid;
  dl_lum uuid; dl_scr uuid; dl_lum2 uuid; vi1 uuid; vi2 uuid; vi3 uuid; vi4 uuid; vi5 uuid; vi6 uuid; vi7 uuid; vi8 uuid; vi9 uuid; lc1 uuid; lc2 uuid; lc3 uuid; lc4 uuid;
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
    'mfg_void_vendor_invoice','mfg_post_landed_cost','mfg_void_landed_cost'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links',
    'mfg_vendor_invoices','mfg_vendor_invoice_lines','mfg_landed_cost_vouchers','mfg_landed_cost_lines'];
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
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the three approved ones (' || h || E')\n';

  ---------------------------------------------------------------- set-up: a company, lumber and screws, one purchase order received in full
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase4c Co', '2026-01-01', 'STANDARD');
  i_lum := mfg_save_item(null, jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',60));
  i_scr := mfg_save_item(null, jsonb_build_object('sku','SCR','name','Screw','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1));
  execute 'reset role';
  update mfg_item_master set standard_cost = 60 where item_id = i_lum;
  update mfg_item_master set standard_cost = 1 where item_id = i_scr;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  insert into vendors (tenant_id, name) values (mfg, 'zz Lumber Co') returning id into vend;
  insert into vendors (tenant_id, name) values (mfg, 'zz Freight Co') returning id into vend2;

  select match_tolerance_pct into n from mfg_company_settings where tenant_id = mfg;
  res := res || case when n = 2 then 'PASS ' else 'FAIL ' end || 'A1 the match tolerance starts at ' || n || E' percent\n';

  po1 := mfg_create_po(vend, '2026-12-01', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 200, 'unit_price', 65), jsonb_build_object('item_id', i_scr, 'qty', 1000, 'unit_price', 1)));
  select l.id into pl1_lum from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_lum;
  select l.id into pl1_scr from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_scr;
  begin perform mfg_post_vendor_invoice(po1, 'V-1001', '2026-12-05', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl1_lum, 'qty', 200, 'unit_price', 65)));
    select status, hold_reason into st, h from mfg_vendor_invoices where vendor_ref = 'V-1001' and tenant_id = mfg;
    res := res || case when st = 'HELD' and h like '%only 0%' then 'PASS ' else 'FAIL ' end || 'B0 an invoice for goods that have not arrived is held, not posted: ' || st || ' — ' || coalesce(h, '') || E'\n';
    perform mfg_reject_held_invoice((select id from mfg_vendor_invoices where vendor_ref = 'V-1001' and tenant_id = mfg), 'goods not delivered yet');
  exception when others then res := res || 'FAIL B0 ' || sqlerrm || E'\n'; end;
  gr1 := mfg_post_goods_receipt(po1, '2026-12-03', jsonb_build_array(jsonb_build_object('po_line_id', pl1_lum, 'qty', 200), jsonb_build_object('po_line_id', pl1_scr, 'qty', 1000)));
  select id into dl_lum from mfg_material_doc_lines where doc_id = gr1 and item_id = i_lum;
  select id into dl_scr from mfg_material_doc_lines where doc_id = gr1 and item_id = i_scr;

  select string_agg(description || ': ordered ' || ordered || ', received ' || received || ', open ' || open_to_invoice, '; ' order by description) into st from mfg_po_match(po1);
  res := res || case when st like '%ordered 200%received 200.000000, open 200.000000%' then 'PASS ' else 'FAIL ' end || 'B1 the match view before invoicing: ' || st || E'\n';

  ---------------------------------------------------------------- B. an exact invoice posts
  vi1 := mfg_post_vendor_invoice(po1, 'V-1001', '2026-12-05', '2027-01-04', 12,
    jsonb_build_array(jsonb_build_object('po_line_id', pl1_lum, 'qty', 200, 'unit_price', 65), jsonb_build_object('po_line_id', pl1_scr, 'qty', 1000, 'unit_price', 1)), 'vi-1');
  select status || '/' || total || '/' || document_number into st from mfg_vendor_invoices where id = vi1;
  res := res || case when st = 'POSTED/15680.00/VI-0002' then 'PASS ' else 'FAIL ' end || 'B2 matched invoice posted: ' || st || E' (13,000 + 1,000 + 12 % VAT 1,680; VI-0001 was the held one)\n';
  select journal_entry_id, bill_id into je, bill from mfg_vendor_invoices where id = vi1;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1160 Dr 1680.00 Cr 0.00; 2000 Dr 0.00 Cr 15680.00; 2050 Dr 14000.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'B3 clears GR/IR, books input VAT, owes the vendor: ' || st || E'\n';
  select status || '/' || total || '/' || tax_amount into st from bills where id = bill;
  res := res || case when st = 'received/15680/1680' or st = 'received/15680.00/1680.00' then 'PASS ' else 'FAIL ' end || 'B4 the existing bills table carries it for payables and payments: ' || st || E'\n';
  select count(*) into c from bill_lines where bill_id = bill;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'B5 bill lines=' || c || E'\n';
  x := mfg_post_vendor_invoice(po1, 'ignored', '2026-12-05', null, 12, '[]'::jsonb, 'vi-1') ;
  res := res || case when x = vi1 then 'PASS ' else 'FAIL ' end || 'B6 the same key enters nothing twice' || E'\n';
  begin perform mfg_post_vendor_invoice(po1, 'v-1001', '2026-12-06', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl1_scr, 'qty', 1, 'unit_price', 1))); res := res || E'FAIL B7 the same vendor invoice number was entered twice\n';
  exception when others then res := res || case when sqlerrm like '%already billed invoice number%' then 'PASS ' else 'FAIL ' end || 'B7 duplicate vendor invoice number refused (even in other capitals): ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_reconciliation();
  select coalesce(sum(abs(difference)), 0) into n from mfg_reconciliation();
  res := res || case when c = 6 and n = 0 then 'PASS ' else 'FAIL ' end || 'B8 reconciliation: ' || c || ' control accounts incl. payables, total difference ' || n || E'\n';

  -- billing more than was received is held
  vi2 := mfg_post_vendor_invoice(po1, 'V-1002', '2026-12-06', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl1_scr, 'qty', 10, 'unit_price', 1)));
  select status || '|' || hold_reason into st from mfg_vendor_invoices where id = vi2;
  res := res || case when st like 'HELD|%received and not yet invoiced%' then 'PASS ' else 'FAIL ' end || 'B9 billing what has already been invoiced is held: ' || st || E'\n';
  select count(*) into c from journal_entries where source_id = (select id from bills where id = (select bill_id from mfg_vendor_invoices where id = vi2));
  res := res || case when c = 0 and (select bill_id from mfg_vendor_invoices where id = vi2) is null then 'PASS ' else 'FAIL ' end || 'B10 a held invoice posts nothing and creates no bill' || E'\n';
  begin perform mfg_reject_held_invoice(vi2, ''); res := res || E'FAIL B11 rejected without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'B11 a reason is required to reject' || E'\n'; end;
  perform mfg_reject_held_invoice(vi2, 'duplicate of V-1001');
  select status into st from mfg_vendor_invoices where id = vi2;
  res := res || case when st = 'REJECTED' then 'PASS ' else 'FAIL ' end || 'B12 rejected: ' || st || E'\n';

  ---------------------------------------------------------------- C. price differences inside the tolerance
  po2 := mfg_create_po(vend, '2026-12-07', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po2;
  gr2 := mfg_post_goods_receipt(po2, '2026-12-08', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100)));
  select id into dl_lum2 from mfg_material_doc_lines where doc_id = gr2;
  vi3 := mfg_post_vendor_invoice(po2, 'V-1003', '2026-12-09', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 66)));
  select journal_entry_id into je from mfg_vendor_invoices where id = vi3;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1160 Dr 792.00 Cr 0.00; 2000 Dr 0.00 Cr 7392.00; 2050 Dr 6500.00 Cr 0.00; 5500 Dr 100.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'C1 66 against an order price of 65 (1.5 %) posts with a 100 price variance: ' || st || E'\n';
  po3 := mfg_create_po(vend, '2026-12-10', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po3;
  perform mfg_post_goods_receipt(po3, '2026-12-10', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100)));
  vi4 := mfg_post_vendor_invoice(po3, 'V-1004', '2026-12-11', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 64)));
  select journal_entry_id into je from mfg_vendor_invoices where id = vi4;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1160 Dr 768.00 Cr 0.00; 2000 Dr 0.00 Cr 7168.00; 2050 Dr 6500.00 Cr 0.00; 5500 Dr 0.00 Cr 100.00' then 'PASS ' else 'FAIL ' end || 'C2 64 against 65 posts with a favourable variance: ' || st || E'\n';

  ---------------------------------------------------------------- D. outside the tolerance: held, then the teacher decides
  po4 := mfg_create_po(vend, '2026-12-12', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po4;
  perform mfg_post_goods_receipt(po4, '2026-12-12', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100)));
  vi5 := mfg_post_vendor_invoice(po4, 'V-1005', '2026-12-13', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 68)));
  select status || '|' || hold_reason into st from mfg_vendor_invoices where id = vi5;
  res := res || case when st like 'HELD|Lumber: the invoice price 68%differs from the order price 65%by 4.62%' then 'PASS ' else 'FAIL ' end || 'D1 68 against 65 (4.6 %) is held with the reason: ' || st || E'\n';
  begin perform mfg_approve_held_invoice(vi5); res := res || E'FAIL D2 a student released a held invoice\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'D2 a student cannot release it: ' || sqlerrm || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_approve_held_invoice(vi5);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select journal_entry_id, status || '|' || (approved_by = teach) into je, st from mfg_vendor_invoices where id = vi5;
  res := res || case when st = 'POSTED|true' then 'PASS ' else 'FAIL ' end || 'D3 the teacher released it: ' || st || E'\n';
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1160 Dr 816.00 Cr 0.00; 2000 Dr 0.00 Cr 7616.00; 2050 Dr 6500.00 Cr 0.00; 5500 Dr 300.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'D4 posted with the 300 variance: ' || st || E'\n';

  -- the teacher's tolerance
  begin perform set_mfg_match_tolerance(mfg, 5); res := res || E'FAIL D5 a student changed the tolerance\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'D5 a student cannot change the tolerance' || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform set_mfg_match_tolerance(mfg, 60); res := res || E'FAIL D6 a tolerance of 60 percent was accepted\n';
  exception when others then res := res || case when sqlerrm like '%between 0 and 50%' then 'PASS ' else 'FAIL ' end || 'D6 the tolerance must be 0–50' || E'\n'; end;
  perform set_mfg_match_tolerance(mfg, 5);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  po5 := mfg_create_po(vend, '2026-12-14', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po5;
  perform mfg_post_goods_receipt(po5, '2026-12-14', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100)));
  vi6 := mfg_post_vendor_invoice(po5, 'V-1006', '2026-12-15', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 68)));
  select status || '/' || tolerance_pct into st from mfg_vendor_invoices where id = vi6;
  res := res || case when st = 'POSTED/5.00' then 'PASS ' else 'FAIL ' end || 'D7 with the tolerance at 5 % the same 4.6 % difference posts at once: ' || st || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_mfg_match_tolerance(mfg, 2);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- partial receipts and partial invoices
  po6 := mfg_create_po(vend, '2026-12-16', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po6;
  perform mfg_post_goods_receipt(po6, '2026-12-16', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 60)));
  vi7 := mfg_post_vendor_invoice(po6, 'V-1007', '2026-12-17', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 65)));
  select status || '|' || hold_reason into st from mfg_vendor_invoices where id = vi7;
  res := res || case when st like 'HELD|%only 60%' then 'PASS ' else 'FAIL ' end || 'E1 billing 100 when 60 arrived is held: ' || st || E'\n';
  perform mfg_reject_held_invoice(vi7, 'bill only what arrived');
  vi7 := mfg_post_vendor_invoice(po6, 'V-1007A', '2026-12-17', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 60, 'unit_price', 65)));
  select status into st from mfg_vendor_invoices where id = vi7;
  perform mfg_post_goods_receipt(po6, '2026-12-18', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 40)));
  select open_to_invoice into n from mfg_po_match(po6);
  perform mfg_post_vendor_invoice(po6, 'V-1007B', '2026-12-19', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 40, 'unit_price', 65)));
  select open_to_invoice into n2 from mfg_po_match(po6);
  res := res || case when st = 'POSTED' and n = 40 and n2 = 0 then 'PASS ' else 'FAIL ' end || 'E2 60 invoiced, then the other 40 after it arrived: first ' || st || ', open before the second ' || n || ', open after ' || n2 || E'\n';

  -- the approval limit
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  update tenants set approval_threshold = 5000 where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  po7 := mfg_create_po(vend, '2026-12-20', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 65)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po7;
  perform mfg_post_goods_receipt(po7, '2026-12-20', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100)));
  vi8 := mfg_post_vendor_invoice(po7, 'V-1008', '2026-12-21', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 100, 'unit_price', 65)));
  select status || '|' || hold_reason into st from mfg_vendor_invoices where id = vi8;
  res := res || case when st like 'HELD|%approval limit%' then 'PASS ' else 'FAIL ' end || 'E3 a perfect match above the company''s approval limit still waits for the teacher: ' || st || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  update tenants set approval_threshold = null where id = mfg;
  execute 'set local role authenticated';
  perform mfg_approve_held_invoice(vi8);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  ---------------------------------------------------------------- F. paying and voiding
  select bill_id into bill from mfg_vendor_invoices where id = vi1;
  perform record_bill_payment(bill, 5000, '2026-12-22', 'transfer');
  begin perform mfg_void_vendor_invoice(vi1, '2026-12-23', 'wrong vendor'); res := res || E'FAIL F1 a part-paid invoice was voided\n';
  exception when others then res := res || case when sqlerrm like '%payment of 5000%' then 'PASS ' else 'FAIL ' end || 'F1 a paid invoice cannot be voided: ' || sqlerrm || E'\n'; end;
  select coalesce(sum(abs(difference)), 0) into n from mfg_reconciliation();
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'F2 after a payment the payables sub-ledger still agrees with the books (difference ' || n || E')\n';
  begin perform mfg_void_vendor_invoice(vi4, '2026-12-23', ''); res := res || E'FAIL F3 voided without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'F3 a reason is required to void' || E'\n'; end;
  perform mfg_void_vendor_invoice(vi4, '2026-12-23', 'billed at the wrong price');
  select (select status from mfg_vendor_invoices where id = vi4) || '/' || (select status from bills where id = (select bill_id from mfg_vendor_invoices where id = vi4)) into st;
  res := res || case when st = 'VOID/void' then 'PASS ' else 'FAIL ' end || 'F4 voided unpaid invoice and its bill: ' || st || E'\n';
  select coalesce(sum(abs(difference)), 0) into n from mfg_reconciliation();
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'F5 the void restored GR/IR and payables exactly (difference ' || n || E')\n';
  vi9 := mfg_post_vendor_invoice(po3, 'V-1004', '2026-12-24', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', (select l.id from purchase_order_lines l where l.purchase_order_id = po3), 'qty', 100, 'unit_price', 65)));
  select status into st from mfg_vendor_invoices where id = vi9;
  res := res || case when st = 'POSTED' then 'PASS ' else 'FAIL ' end || 'F6 the same vendor number can be entered again once the first was voided: ' || st || E'\n';

  ---------------------------------------------------------------- G. landed cost, standard costing
  lc1 := mfg_post_landed_cost(vend2, 'F-2001', '2026-12-25', '2027-01-24', 'VALUE', 1300, 12, 'Sea freight', jsonb_build_array(jsonb_build_object('doc_line_id', dl_lum), jsonb_build_object('doc_line_id', dl_scr)), 'lc-1');
  select string_agg(alloc_amount::text, ' / ' order by line_no) into st from mfg_landed_cost_lines where voucher_id = lc1;
  res := res || case when st = '1200.00 / 100.00' then 'PASS ' else 'FAIL ' end || 'G1 1,300 of freight spread by value over lumber (12,000) and screws (1,000): ' || st || E'\n';
  select journal_entry_id into je from mfg_landed_cost_vouchers where id = lc1;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1160 Dr 156.00 Cr 0.00; 2000 Dr 0.00 Cr 1456.00; 5500 Dr 1300.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'G2 under standard costing the freight is a purchase price variance (stock stays at standard): ' || st || E'\n';
  select count(*) into c from bills where id = (select bill_id from mfg_landed_cost_vouchers where id = lc1) and status = 'received';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'G3 the freight invoice is a bill to pay=' || c || E'\n';
  lc2 := mfg_post_landed_cost(vend2, 'F-2002', '2026-12-26', null, 'WEIGHT', 1000, 0, 'Customs', jsonb_build_array(
    jsonb_build_object('doc_line_id', dl_lum, 'weight', 1), jsonb_build_object('doc_line_id', dl_scr, 'weight', 1), jsonb_build_object('doc_line_id', dl_lum2, 'weight', 1)));
  select string_agg(alloc_amount::text, ' / ' order by line_no), sum(alloc_amount)::text into st, h from mfg_landed_cost_lines where voucher_id = lc2;
  res := res || case when st = '333.34 / 333.33 / 333.33' and h = '1000.00' then 'PASS ' else 'FAIL ' end || 'G4 a third each: the leftover centavo goes to the first big line and the parts add up to the invoice: ' || st || ' = ' || h || E'\n';
  begin perform mfg_post_landed_cost(vend2, 'F-2003', '2026-12-26', null, 'WEIGHT', 500, 0, 'x', jsonb_build_array(jsonb_build_object('doc_line_id', dl_lum))); res := res || E'FAIL G5 spread by weight with no weight\n';
  exception when others then res := res || case when sqlerrm like '%nothing to spread the cost by%' then 'PASS ' else 'FAIL ' end || 'G5 weights are needed to spread by weight: ' || sqlerrm || E'\n'; end;
  begin perform mfg_post_landed_cost(vend, 'V-1001', '2026-12-26', null, 'QTY', 500, 0, 'x', jsonb_build_array(jsonb_build_object('doc_line_id', dl_lum))); res := res || E'FAIL G6 reused a vendor invoice number\n';
  exception when others then res := res || case when sqlerrm like '%already billed invoice number%' then 'PASS ' else 'FAIL ' end || 'G6 the duplicate check covers freight invoices too' || E'\n'; end;
  perform mfg_void_landed_cost(lc2, '2026-12-27', 'entered twice');
  select status into st from mfg_landed_cost_vouchers where id = lc2;
  res := res || case when st = 'VOID' then 'PASS ' else 'FAIL ' end || 'G7 landed cost voided: ' || st || E'\n';
  begin perform mfg_void_landed_cost(lc2, '2026-12-27', 'again'); res := res || E'FAIL G8 voided twice\n';
  exception when others then res := res || E'PASS G8 cannot be voided twice\n'; end;
  po8 := mfg_create_po(vend, '2026-12-28', null, jsonb_build_array(jsonb_build_object('item_id', i_scr, 'qty', 10, 'unit_price', 1)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po8;
  gr8 := mfg_post_goods_receipt(po8, '2026-12-28', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 10)));
  perform mfg_reverse_document(gr8, '2026-12-28', 'wrong delivery');
  begin perform mfg_post_landed_cost(vend2, 'F-2004', '2026-12-29', null, 'QTY', 50, 0, 'x', jsonb_build_array(jsonb_build_object('doc_line_id', (select id from mfg_material_doc_lines where doc_id = gr8)))); res := res || E'FAIL G9 freight was spread over a reversed receipt\n';
  exception when others then res := res || case when sqlerrm like '%may have been reversed%' then 'PASS ' else 'FAIL ' end || 'G9 a reversed receipt cannot take freight: ' || sqlerrm || E'\n'; end;

  select coalesce(sum(abs(difference)), 0), count(*) into n, c from mfg_reconciliation();
  select string_agg(area || '=' || subledger, ', ' order by area) into st from mfg_reconciliation();
  res := res || case when n = 0 and c = 6 then 'PASS ' else 'FAIL ' end || 'G10 stock, work in process, GR/IR and payables all agree with the books: ' || st || E'\n';
  select sum(jl.debit) - sum(jl.credit) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'G11 the trial balance nets to ' || n || E'\n';

  ---------------------------------------------------------------- H. actual costing: freight joins the cost of the stock on hand
  execute 'reset role';
  update mfg_company_settings set costing_method = 'ACTUAL' where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  i_log2 := mfg_save_item(null, jsonb_build_object('sku','LOG2','name','Log B','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',100));
  i_log3 := mfg_save_item(null, jsonb_build_object('sku','LOG3','name','Log C','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',50));
  perform mfg_post_stock_adjustment(i_log2, loc_rm, 100, 100, 'OPENING', '2027-01-02');
  po9 := mfg_create_po(vend, '2027-01-03', null, jsonb_build_array(jsonb_build_object('item_id', i_log2, 'qty', 50, 'unit_price', 100)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po9;
  gr9 := mfg_post_goods_receipt(po9, '2027-01-03', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 50)));
  x := mfg_post_vendor_invoice(po9, 'V-2001', '2027-01-04', null, 0, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 50, 'unit_price', 101)));
  select journal_entry_id into je from mfg_vendor_invoices where id = x;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '2000 Dr 0.00 Cr 5050.00; 2050 Dr 5000.00 Cr 0.00; 5500 Dr 50.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'H1 under actual costing an invoice price difference still goes to the price variance account: ' || st || E'\n';
  lc3 := mfg_post_landed_cost(vend2, 'F-3001', '2027-01-05', null, 'QTY', 300, 0, 'Trucking', jsonb_build_array(jsonb_build_object('doc_line_id', (select id from mfg_material_doc_lines where doc_id = gr9))));
  select moving_avg_cost into n from mfg_item_master where item_id = i_log2;
  select journal_entry_id into je from mfg_landed_cost_vouchers where id = lc3;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when n = 102 and st = '1200 Dr 300.00 Cr 0.00; 2000 Dr 0.00 Cr 300.00' then 'PASS ' else 'FAIL ' end || 'H2 300 of freight on 150 logs on hand lifts the average from 100 to ' || n || ': ' || st || E'\n';
  perform mfg_void_landed_cost(lc3, '2027-01-06', 'freight belongs to another shipment');
  select moving_avg_cost into n from mfg_item_master where item_id = i_log2;
  res := res || case when n = 100 then 'PASS ' else 'FAIL ' end || 'H3 voiding it takes the average back to ' || n || E'\n';
  po10 := mfg_create_po(vend, '2027-01-07', null, jsonb_build_array(jsonb_build_object('item_id', i_log3, 'qty', 10, 'unit_price', 50)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po10;
  gr10 := mfg_post_goods_receipt(po10, '2027-01-07', jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 10)));
  perform mfg_post_stock_adjustment(i_log3, loc_rm, -10, null, 'COUNT', '2027-01-08');
  lc4 := mfg_post_landed_cost(vend2, 'F-3002', '2027-01-09', null, 'VALUE', 100, 0, 'Late freight', jsonb_build_array(jsonb_build_object('doc_line_id', (select id from mfg_material_doc_lines where doc_id = gr10))));
  select journal_entry_id into je from mfg_landed_cost_vouchers where id = lc4;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '2000 Dr 0.00 Cr 100.00; 5500 Dr 100.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'H4 freight for goods no longer in stock cannot raise their cost, so it is a variance: ' || st || E'\n';

  ---------------------------------------------------------------- I. who may do what
  begin insert into mfg_vendor_invoices (tenant_id, vendor_id, po_id, vendor_ref, invoice_date, tolerance_pct) values (mfg, vend, po1, 'X', '2027-01-01', 2); res := res || E'FAIL I1 a student wrote an invoice directly\n';
  exception when others then res := res || E'PASS I1 vendor invoices can only be written by the invoice function\n'; end;
  execute 'reset role';
  begin update mfg_vendor_invoice_lines set qty = 1 where invoice_id = vi1; res := res || E'FAIL I2 an invoice line was edited\n';
  exception when others then res := res || E'PASS I2 invoice lines cannot be edited, even by the database owner\n'; end;
  begin update mfg_landed_cost_lines set alloc_amount = 1 where voucher_id = lc1; res := res || E'FAIL I3 a landed cost line was edited\n';
  exception when others then res := res || E'PASS I3 landed cost lines cannot be edited, even by the database owner\n'; end;
  select count(*) into c from pg_proc where proname = 'mfg__vi_post' and has_function_privilege('authenticated', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I4 the internal posting function cannot be called from the browser=' || c || E'\n';
  select count(*) into c from pg_proc where proname in ('set_mfg_match_tolerance', 'mfg_po_match', 'mfg_post_vendor_invoice', 'mfg_approve_held_invoice', 'mfg_reject_held_invoice',
    'mfg_void_vendor_invoice', 'mfg_post_landed_cost', 'mfg_void_landed_cost', 'mfg_reconciliation') and has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I5 not-signed-in users cannot run any of them=' || c || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_vendor_invoices) + (select count(*) from mfg_vendor_invoice_lines) + (select count(*) from mfg_landed_cost_vouchers) + (select count(*) from mfg_landed_cost_lines) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I6 another student sees none of it=' || c || E'\n';
  begin perform mfg_void_vendor_invoice(vi5, '2027-01-20', 'not mine'); res := res || E'FAIL I7 another student voided an invoice\n';
  exception when others then res := res || E'PASS I7 another student cannot void this company''s invoice\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_vendor_invoices where tenant_id = mfg;
  res := res || case when c >= 9 then 'PASS ' else 'FAIL ' end || 'I8 the teacher can read the student''s invoices=' || c || E'\n';
  begin perform mfg_post_vendor_invoice(po1, 'T-1', '2027-01-20', null, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl1_scr, 'qty', 1, 'unit_price', 1))); res := res || E'FAIL I9 the teacher entered an invoice for a student\n';
  exception when others then res := res || E'PASS I9 the teacher cannot post for a student\n'; end;
  select count(*) into c from mfg_po_match(po1);
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'I10 the teacher can see the match view=' || c || E'\n';

  ---------------------------------------------------------------- J. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_vendor_invoices where tenant_id = mfg) + (select count(*) from mfg_vendor_invoice_lines where tenant_id = mfg)
         + (select count(*) from mfg_landed_cost_vouchers where tenant_id = mfg) + (select count(*) from mfg_landed_cost_lines where tenant_id = mfg)
         + (select count(*) from bills where tenant_id = mfg) + (select count(*) from journal_entries where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J1 the teacher deleted the company with its invoices, freight, bills and entries (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL J1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 4c — failures: %\n%', n, res;
end $$;
