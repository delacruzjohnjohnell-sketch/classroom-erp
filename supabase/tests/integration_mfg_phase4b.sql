-- ============================================================
-- Manufacturing ERP — Phase 4b integration test (migration 0032).
--
-- Run it AFTER 0029–0032 are applied, or paste it after the migrations in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id.
--
-- The main story is the plan's Dining Chair (section 6.3/6.4) carried to the end: 100 chairs, 98 good + 2 scrap, 2,936 left
-- in work in process → settled into the four variance accounts → 50 chairs delivered (cost of goods sold 23,400) →
-- invoiced at 1,000 each + 12 % VAT → trial balance and income statement. Then reversals, co-/by-products, actual costing,
-- and who may do what.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; n2 numeric; n3 numeric; st text; h text; d uuid; d2 uuid; je uuid; x uuid;
  i_lum uuid; i_scr uuid; i_var uuid; i_chair uuid; i_log uuid; i_plank uuid; i_slab uuid; i_dust uuid; i_log2 uuid; i_plank2 uuid; i_slab2 uuid;
  wc1 uuid; b uuid; rt uuid; est uuid; vend uuid; po uuid; po2 uuid; pl_lum uuid; pl_scr uuid; pl_var uuid; pl2 uuid;
  loc_rm uuid; loc_fg uuid;
  o1 uuid; o2 uuid; o3 uuid; o5 uuid; o6 uuid; o7 uuid; o8 uuid; cm_lum uuid; cm_scr uuid; cm_var uuid; cm uuid; conf uuid; fg1 uuid; gi2 uuid;
  cust uuid; so1 uuid; so2 uuid; sl1 uuid; sl2 uuid; inv1 uuid; inv2 uuid; inv3 uuid; dl1 uuid; dl2 uuid; dl3 uuid; out_slab uuid; out_dust uuid;
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
    'mfg_post_delivery','mfg_create_invoice_from_so','guard_mfg_invoice_lines'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs',
    'mfg_prod_outputs','mfg_settlements','mfg_invoice_links'];
begin
  ---------------------------------------------------------------- Z. nothing that existed was changed
  select md5(string_agg(md5(pg_get_functiondef(p.oid)), '' order by p.oid::regprocedure::text)) into h
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> all(new_fns);
  res := res || case when h = '380f461235f530dc097fb7c054daaca9' then 'PASS ' else 'FAIL ' end || 'Z1 existing functions unchanged (' || h || E')\n';
  select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, column_name)) into h
    from information_schema.columns where table_schema = 'public' and table_name <> all(new_tabs) and not (table_name = 'mfg_company_settings' and column_name = 'allow_negative_stock');
  res := res || case when h = 'e196786d70dc1f528bbb391b54f3c9fc' then 'PASS ' else 'FAIL ' end || 'Z2 existing columns unchanged (' || h || E')\n';
  select md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)) into h
    from pg_policies where schemaname = 'public' and tablename <> all(new_tabs);
  res := res || case when h = '568551cc4cc49b77c48fb07ce4591d61' then 'PASS ' else 'FAIL ' end || 'Z3 existing policies unchanged (' || h || E')\n';
  select md5(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, tgname)) into h
    from pg_trigger t where not tgisinternal and t.tgrelid::regclass::text !~ '^(auth|storage|realtime)\.' and t.tgrelid::regclass::text <> all(new_tabs)
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts', 'trg_mfg_invoice_item_guard');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the three approved ones (' || h || E')\n';

  ---------------------------------------------------------------- set-up: company, items, released standard cost, stock, the Dining Chair order
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase4b Co', '2026-01-01', 'STANDARD');

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
  select id into loc_fg from mfg_storage_locations where code = 'FG-STORE';

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
  select sum(debit - credit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5500';
  res := res || case when n = 1000 then 'PASS ' else 'FAIL ' end || 'A1 purchase price variance on the lumber=' || n || E' (expect 1,000)\n';

  o1 := mfg_create_order(i_chair, 100, '2026-11-16', '2026-11-30');
  perform mfg_release_order(o1);
  select id into cm_lum from mfg_prod_components where order_id = o1 and item_id = i_lum;
  select id into cm_scr from mfg_prod_components where order_id = o1 and item_id = i_scr;
  select id into cm_var from mfg_prod_components where order_id = o1 and item_id = i_var;
  perform mfg_post_material_issue(o1, jsonb_build_array(
    jsonb_build_object('component_id', cm_lum, 'qty', 310), jsonb_build_object('component_id', cm_scr, 'qty', 800), jsonb_build_object('component_id', cm_var, 'qty', 20)), '2026-11-16');
  perform mfg_post_confirmation(o1, 10, 98, 2, 'Cracked in the press', 0, 160, 52, true, '2026-11-20');
  fg1 := mfg_post_fg_receipt(o1, 98, null, null, null, '2026-11-22');
  n := mfg_order_wip(o1);
  select status into st from mfg_production_orders where id = o1;
  res := res || case when n = 2936 and st = 'DELIVERED' then 'PASS ' else 'FAIL ' end || 'A2 the story so far: work in process left=' || n || ', order ' || st || E' (expect 2,936 and DELIVERED)\n';
  select std_mix::text into st from mfg_production_orders where id = o1;
  res := res || case when st like '%MATERIAL%' and st like '%FIX_OH%' then 'PASS ' else 'FAIL ' end || 'A3 the order remembers the element mix of its standard cost: ' || st || E'\n';

  ---------------------------------------------------------------- B. settlement of the 2,936
  select string_agg(bucket || '=' || round(variance, 2), ', ' order by bucket) into st from mfg_order_variances(o1);
  res := res || case when st = 'FIX_OH=520.00, LABOR=1040.00, MACHINE=300.00, MATERIAL=1076.00' then 'PASS ' else 'FAIL ' end || 'B1 where the 2,936 comes from: ' || st || E'\n';
  select sum(target) into n from mfg_order_variances(o1);
  res := res || case when n = 45864 then 'PASS ' else 'FAIL ' end || 'B2 the targets add up to what the 98 chairs were credited at (98 × 468)=' || n || E'\n';
  o2 := mfg_create_order(i_chair, 10, '2026-12-01');
  begin perform mfg_settle_order(o2, '2026-12-01'); res := res || E'FAIL B3 an order that has not been produced was settled\n';
  exception when others then res := res || case when sqlerrm like '%once production is finished%' then 'PASS ' else 'FAIL ' end || 'B3 only a finished order can be settled: ' || sqlerrm || E'\n'; end;
  begin perform mfg_close_order(o1); res := res || E'FAIL B4 an unsettled order was closed\n';
  exception when others then res := res || case when sqlerrm like '%Settle the order first%' then 'PASS ' else 'FAIL ' end || 'B4 cannot close before settling: ' || sqlerrm || E'\n'; end;
  x := mfg_settle_order(o1, '2026-11-30');
  select journal_entry_id into je from mfg_settlements where id = x;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1210 Dr 0.00 Cr 2936.00; 5510 Dr 1076.00 Cr 0.00; 5520 Dr 1040.00 Cr 0.00; 5540 Dr 300.00 Cr 0.00; 5550 Dr 520.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'B5 settlement: ' || st || E'\n';
  select status into st from mfg_production_orders where id = o1;
  n := mfg_order_wip(o1);
  select document_number into h from mfg_settlements where id = x;
  res := res || case when n = 0 and st = 'TECHNICALLY_COMPLETE' and h = 'SET-0001' then 'PASS ' else 'FAIL ' end || 'B6 work in process ' || n || ', order ' || st || ', ' || h || E'\n';
  begin perform mfg_settle_order(o1, '2026-11-30'); res := res || E'FAIL B7 an order was settled twice\n';
  exception when others then res := res || case when sqlerrm like '%once production is finished%' then 'PASS ' else 'FAIL ' end || 'B7 cannot settle twice: ' || sqlerrm || E'\n'; end;
  begin perform mfg_post_material_issue(o1, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 1)), '2026-12-01'); res := res || E'FAIL B8 material was issued to a settled order\n';
  exception when others then res := res || case when sqlerrm like '%released order%' then 'PASS ' else 'FAIL ' end || 'B8 nothing more can be issued to a settled order: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reverse_document(fg1, '2026-12-01', 'wrong count'); res := res || E'FAIL B9 a receipt on a settled order was reversed\n';
  exception when others then res := res || case when sqlerrm like '%reverse its settlement first%' then 'PASS ' else 'FAIL ' end || 'B9 a settled order''s documents are locked until the settlement is reversed: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reverse_settlement(o1, '2026-12-01', ''); res := res || E'FAIL B10 reversed without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'B10 a reason is required: ' || sqlerrm || E'\n'; end;
  d := mfg_reverse_settlement(o1, '2026-12-01', 'Wrong date');
  n := mfg_order_wip(o1);
  select status into st from mfg_production_orders where id = o1;
  select count(*) into c from mfg_settlements where order_id = o1;
  res := res || case when n = 2936 and st = 'DELIVERED' and c = 2 then 'PASS ' else 'FAIL ' end || 'B11 settlement reversed: work in process ' || n || ', order ' || st || ', settlement records ' || c || E'\n';
  select sum(debit - credit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code in ('5510', '5520', '5540', '5550');
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'B12 the variance accounts net to ' || n || E' after the reversal\n';
  x := mfg_settle_order(o1, '2026-12-01');
  perform mfg_close_order(o1);
  select status into st from mfg_production_orders where id = o1;
  res := res || case when st = 'CLOSED' then 'PASS ' else 'FAIL ' end || 'B13 settled again and closed: ' || st || E'\n';
  begin perform mfg_reverse_settlement(o1, '2026-12-02', 'too late'); res := res || E'FAIL B14 a closed order was re-opened\n';
  exception when others then res := res || case when sqlerrm like '%isn''t closed yet%' then 'PASS ' else 'FAIL ' end || 'B14 a closed order cannot be re-opened: ' || sqlerrm || E'\n'; end;
  begin perform mfg_cancel_order(o1); res := res || E'FAIL B15 a closed order was cancelled\n';
  exception when others then res := res || E'PASS B15 a closed order cannot be cancelled\n'; end;

  ---------------------------------------------------------------- C. delivery, cost of goods sold, invoice
  insert into customers (tenant_id, name) values (mfg, 'zz Casa Muebles') returning id into cust;
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-12-02', 'draft', 56000, 12, 6000) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_chair, 'Dining chair', 50, 1000) returning id into sl1;
  begin perform mfg_post_delivery(so1, '2026-12-03', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30))); res := res || E'FAIL C1 delivered against a draft order\n';
  exception when others then res := res || case when sqlerrm like '%Confirm the sales order%' then 'PASS ' else 'FAIL ' end || 'C1 no delivery on an unconfirmed order: ' || sqlerrm || E'\n'; end;
  update sales_orders set status = 'confirmed' where id = so1;
  dl1 := mfg_post_delivery(so1, '2026-12-03', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30)), 'dl-1');
  select journal_entry_id into je from mfg_material_documents where id = dl1;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1220 Dr 0.00 Cr 14040.00; 5000 Dr 14040.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'C2 first 30 chairs delivered: ' || st || E' (30 × 468)\n';
  d := mfg_post_delivery(so1, '2026-12-03', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30)), 'dl-1');
  select sum(qty) into n from mfg_stock where item_id = i_chair;
  res := res || case when d = dl1 and n = 68 then 'PASS ' else 'FAIL ' end || 'C3 the same key delivers nothing twice (chairs in stock ' || n || E')\n';
  begin perform mfg_post_delivery(so1, '2026-12-04', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 21))); res := res || E'FAIL C4 over-delivery accepted\n';
  exception when others then res := res || case when sqlerrm like '%only 20%' then 'PASS ' else 'FAIL ' end || 'C4 cannot deliver more than was ordered: ' || sqlerrm || E'\n'; end;
  dl2 := mfg_post_delivery(so1, '2026-12-04', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 20)));
  select sum(qty) into n from mfg_stock where item_id = i_chair;
  select qty_on_hand into n2 from items where id = i_chair;
  res := res || case when n = 48 and n2 = 48 then 'PASS ' else 'FAIL ' end || 'C5 chairs in stock ' || n || ', Standard-side ' || n2 || E' (expect 48)\n';
  select sum(debit - credit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5000';
  res := res || case when n = 23400 then 'PASS ' else 'FAIL ' end || 'C6 cost of goods sold=' || n || E' (expect 23,400 = 50 × 468)\n';

  inv1 := mfg_create_invoice_from_so(so1, '2027-01-02');
  select total || '/' || tax_amount || '/' || (select count(*) from invoice_lines where invoice_id = inv1 and item_id is null) || '/' || (select qty from invoice_lines where invoice_id = inv1) into st from invoices where id = inv1;
  res := res || case when st = '56000.00/6000.00/1/50.000000' then 'PASS ' else 'FAIL ' end || 'C7 invoice total/VAT/lines without an item/qty: ' || st || E'\n';
  select status into st from sales_orders where id = so1;
  res := res || case when st = 'invoiced' then 'PASS ' else 'FAIL ' end || 'C8 sales order ' || st || E'\n';
  perform post_invoice(inv1);
  select id into je from journal_entries where source_table = 'invoices' and source_id = inv1 and memo like 'Invoice%';
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1100 Dr 56000.00 Cr 0.00; 2200 Dr 0.00 Cr 6000.00; 4000 Dr 0.00 Cr 50000.00' then 'PASS ' else 'FAIL ' end || 'C9 the existing post_invoice posts revenue, receivable and VAT: ' || st || E'\n';
  select sum(debit - credit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5000';
  select sum(qty) into n2 from mfg_stock where item_id = i_chair;
  res := res || case when n = 23400 and n2 = 48 then 'PASS ' else 'FAIL ' end || 'C10 the invoice did not post cost or touch stock again (COGS ' || n || ', chairs ' || n2 || E')\n';
  begin perform mfg_reverse_document(dl2, '2026-12-05', 'customer cancelled'); res := res || E'FAIL C11 an invoiced delivery was reversed\n';
  exception when others then res := res || case when sqlerrm like '%already been invoiced%' then 'PASS ' else 'FAIL ' end || 'C11 an invoiced delivery cannot be reversed: ' || sqlerrm || E'\n'; end;
  begin perform mfg_create_invoice_from_so(so1); res := res || E'FAIL C12 invoiced a second time\n';
  exception when others then res := res || case when sqlerrm like '%Only a confirmed%' then 'PASS ' else 'FAIL ' end || 'C12 an invoiced order is not invoiced again: ' || sqlerrm || E'\n'; end;

  -- partial deliveries, a reversal before invoicing, and two invoices on one order
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-12-06', 'confirmed', 11200, 12, 1200) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_chair, 'Dining chair', 10, 1000) returning id into sl2;
  begin perform mfg_create_invoice_from_so(so2); res := res || E'FAIL C13 invoiced goods that were not delivered\n';
  exception when others then res := res || case when sqlerrm like '%Nothing to invoice%' then 'PASS ' else 'FAIL ' end || 'C13 nothing to invoice before delivery: ' || sqlerrm || E'\n'; end;
  dl3 := mfg_post_delivery(so2, '2026-12-07', jsonb_build_array(jsonb_build_object('so_line_id', sl2, 'qty', 4)));
  d := mfg_reverse_document(dl3, '2026-12-07', 'wrong chairs picked');
  select sum(qty) into n from mfg_stock where item_id = i_chair;
  select sum(debit - credit) into n2 from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5000';
  res := res || case when n = 48 and n2 = 23400 then 'PASS ' else 'FAIL ' end || 'C14 a reversed delivery gives the chairs and the cost back (chairs ' || n || ', COGS ' || n2 || E')\n';
  select document_number into st from mfg_material_documents where id = d;
  res := res || case when st ~ '^REV-[0-9]{4}$' then 'PASS ' else 'FAIL ' end || 'C15 the reversal is its own numbered document ' || st || E'\n';
  perform mfg_post_delivery(so2, '2026-12-08', jsonb_build_array(jsonb_build_object('so_line_id', sl2, 'qty', 4)));
  inv2 := mfg_create_invoice_from_so(so2, '2027-01-08');
  select total || '/' || tax_amount into st from invoices where id = inv2;
  select status into h from sales_orders where id = so2;
  res := res || case when (st = '4480.00/480.00' or st = '4480/480') and h = 'confirmed' then 'PASS ' else 'FAIL ' end || 'C16 first invoice for the 4 delivered: ' || st || ', order still ' || h || E'\n';
  perform post_invoice(inv2);
  perform mfg_post_delivery(so2, '2026-12-09', jsonb_build_array(jsonb_build_object('so_line_id', sl2, 'qty', 6)));
  inv3 := mfg_create_invoice_from_so(so2, '2027-01-09');
  select total into n from invoices where id = inv3;
  select status into h from sales_orders where id = so2;
  res := res || case when n = 6720 and h = 'invoiced' then 'PASS ' else 'FAIL ' end || 'C17 second invoice for the other 6: ' || n || ', order ' || h || E'\n';
  perform post_invoice(inv3);

  ---------------------------------------------------------------- D. trial balance and income statement
  select sum(jl.debit) - sum(jl.credit) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'D1 the trial balance nets to ' || n || E'\n';
  select coalesce(sum(jl.credit - jl.debit), 0) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '4000';
  select coalesce(sum(jl.debit - jl.credit), 0) into n2 from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5000';
  select coalesce(sum(jl.debit - jl.credit), 0) into n3 from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code in ('5500', '5510', '5520', '5540', '5550');
  res := res || case when n = 60000 and n2 = 28080 and n3 = 3936 then 'PASS ' else 'FAIL ' end || 'D2 sales ' || n || ', cost of goods sold ' || n2 || ', price and production variances ' || n3 || E' (expect 60,000 / 28,080 / 3,936 = 1,000 + 2,936)\n';

  ---------------------------------------------------------------- E. reversals of issues, confirmations, receipts, adjustments
  perform mfg_post_stock_adjustment(i_lum, loc_rm, 100, null, 'OPENING', '2026-12-10');
  perform mfg_release_order(o2);
  select id into cm_lum from mfg_prod_components where order_id = o2 and item_id = i_lum;
  select id into cm_scr from mfg_prod_components where order_id = o2 and item_id = i_scr;
  select id into cm_var from mfg_prod_components where order_id = o2 and item_id = i_var;
  gi2 := mfg_post_material_issue(o2, jsonb_build_array(
    jsonb_build_object('component_id', cm_lum, 'qty', 30), jsonb_build_object('component_id', cm_scr, 'qty', 80), jsonb_build_object('component_id', cm_var, 'qty', 2)), '2026-12-11');
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  begin perform mfg_reverse_document(gi2, '2026-12-11', ''); res := res || E'FAIL E1 reversed without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'E1 a reason is required: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reverse_document(gi2, '2026-12-01', 'too early'); res := res || E'FAIL E2 reversal dated before the document\n';
  exception when others then res := res || case when sqlerrm like '%before the document%' then 'PASS ' else 'FAIL ' end || 'E2 a reversal cannot be dated before the original: ' || sqlerrm || E'\n'; end;
  d := mfg_reverse_document(gi2, '2026-12-12', 'issued to the wrong order');
  select sum(qty) into n2 from mfg_stock where item_id = i_lum;
  select qty_issued into n3 from mfg_prod_components where id = cm_lum;
  res := res || case when n2 = n + 30 and n3 = 0 and mfg_order_wip(o2) = 0 then 'PASS ' else 'FAIL ' end || 'E3 reversed issue: lumber ' || n || ' → ' || n2 || ', issued on the order ' || n3 || ', work in process ' || mfg_order_wip(o2) || E'\n';
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 2380.00 Cr 0.00; 1210 Dr 0.00 Cr 2380.00' then 'PASS ' else 'FAIL ' end || 'E4 the reversal posts the opposite entry: ' || st || E'\n';
  begin perform mfg_reverse_document(gi2, '2026-12-12', 'again'); res := res || E'FAIL E5 reversed twice\n';
  exception when others then res := res || case when sqlerrm like '%already been reversed%' then 'PASS ' else 'FAIL ' end || 'E5 cannot be reversed twice: ' || sqlerrm || E'\n'; end;
  begin perform mfg_reverse_document(d, '2026-12-13', 'undo the undo'); res := res || E'FAIL E6 a reversal was reversed\n';
  exception when others then res := res || case when sqlerrm like '%can''t be reversed%' then 'PASS ' else 'FAIL ' end || 'E6 a reversal cannot be reversed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';
  begin update mfg_material_documents set memo = 'tampered' where id = d; res := res || E'FAIL E7 a reversal document was edited\n';
  exception when others then res := res || E'PASS E7 documents stay immutable, even for the database owner\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform mfg_post_material_issue(o2, jsonb_build_array(
    jsonb_build_object('component_id', cm_lum, 'qty', 30), jsonb_build_object('component_id', cm_scr, 'qty', 80), jsonb_build_object('component_id', cm_var, 'qty', 2)), '2026-12-13');
  conf := mfg_post_confirmation(o2, 10, 10, 0, null, 0, 15, 5, true, '2026-12-14');
  n := mfg_order_wip(o2);
  res := res || case when n = 4680 then 'PASS ' else 'FAIL ' end || 'E8 the small order is at its standard: work in process ' || n || E' (10 × 468)\n';
  begin perform mfg_reverse_confirmation(conf, '2026-12-14', ''); res := res || E'FAIL E9 confirmation reversed without a reason\n';
  exception when others then res := res || case when sqlerrm like '%Say why%' then 'PASS ' else 'FAIL ' end || 'E9 a reason is required for a confirmation too' || E'\n'; end;
  d := mfg_reverse_confirmation(conf, '2026-12-15', 'wrong hours entered');
  select status || '/' || qty_good into st from mfg_production_orders where id = o2;
  n := mfg_order_wip(o2);
  select labor_h_actual into n2 from mfg_prod_operations where order_id = o2;
  res := res || case when n = 2380 and st = 'RELEASED/0.000000' and n2 = 0 then 'PASS ' else 'FAIL ' end || 'E10 reversed confirmation: work in process ' || n || ' (material only), order ' || st || ', labor hours on the operation ' || n2 || E'\n';
  begin perform mfg_reverse_confirmation(conf, '2026-12-15', 'again'); res := res || E'FAIL E11 confirmation reversed twice\n';
  exception when others then res := res || case when sqlerrm like '%already been reversed%' then 'PASS ' else 'FAIL ' end || 'E11 cannot be reversed twice' || E'\n'; end;
  conf := mfg_post_confirmation(o2, 10, 10, 0, null, 0, 15, 5, true, '2026-12-16');
  d2 := mfg_post_fg_receipt(o2, 10, null, null, null, '2026-12-16');
  begin perform mfg_reverse_confirmation(conf, '2026-12-17', 'try'); res := res || E'FAIL E12 reversed a confirmation whose goods are in stock\n';
  exception when others then res := res || case when sqlerrm like '%already in stock%' then 'PASS ' else 'FAIL ' end || 'E12 goods already in stock block it: ' || sqlerrm || E'\n'; end;
  select sum(qty) into n from mfg_stock where item_id = i_chair;
  d := mfg_reverse_document(d2, '2026-12-17', 'received into the wrong store');
  select sum(qty) into n2 from mfg_stock where item_id = i_chair;
  select status || '/' || qty_received into st from mfg_production_orders where id = o2;
  res := res || case when n2 = n - 10 and st = 'CONFIRMED/0.000000' and mfg_order_wip(o2) = 4680 then 'PASS ' else 'FAIL ' end || 'E13 reversed finished goods receipt: chairs ' || n || ' → ' || n2 || ', order ' || st || ', work in process ' || mfg_order_wip(o2) || E'\n';
  perform mfg_post_fg_receipt(o2, 10, null, null, null, '2026-12-17');
  select status into st from mfg_production_orders where id = o2;
  res := res || case when st = 'DELIVERED' then 'PASS ' else 'FAIL ' end || 'E14 and it can be received again: ' || st || E'\n';

  -- backflush: the confirmation takes the materials out; reversing it puts them back
  o3 := mfg_create_order(i_chair, 10, '2026-12-18', null, 1, 1, true);
  perform mfg_release_order(o3);
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  conf := mfg_post_confirmation(o3, 10, 10, 0, null, 0, 15, 5, true, '2026-12-19');
  select sum(qty) into n2 from mfg_stock where item_id = i_lum;
  d := mfg_reverse_confirmation(conf, '2026-12-20', 'confirmed by mistake');
  select sum(qty) into n3 from mfg_stock where item_id = i_lum;
  res := res || case when n2 = n - 30 and n3 = n and mfg_order_wip(o3) = 0 then 'PASS ' else 'FAIL ' end || 'E15 backflush and its reversal: lumber ' || n || ' → ' || n2 || ' → ' || n3 || ', work in process ' || mfg_order_wip(o3) || E'\n';
  select count(*) into c from mfg_material_documents r join mfg_material_documents o on o.id = r.reversal_of where o.reference_id = o3 and o.doc_type = 'GI';
  select sum(qty_issued) into n from mfg_prod_components where order_id = o3;
  res := res || case when c = 1 and n = 0 then 'PASS ' else 'FAIL ' end || 'E16 the backflush issue was reversed with it (reversal documents ' || c || ', still marked issued ' || n || E')\n';

  -- goods receipt and stock adjustment
  po2 := mfg_create_po(vend, '2026-12-21', null, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 10, 'unit_price', 65)));
  select l.id into pl2 from purchase_order_lines l where l.purchase_order_id = po2;
  d := mfg_post_goods_receipt(po2, '2026-12-22', jsonb_build_array(jsonb_build_object('po_line_id', pl2, 'qty', 10)));
  select status into st from purchase_orders where id = po2;
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  res := res || case when st = 'closed' then 'PASS ' else 'FAIL ' end || 'E17 the PO closed on full receipt (' || st || E')\n';
  d2 := mfg_reverse_document(d, '2026-12-23', 'supplier delivered the wrong lot');
  select status into st from purchase_orders where id = po2;
  select sum(qty) into n2 from mfg_stock where item_id = i_lum;
  select sum(debit - credit) into n3 from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5500';
  res := res || case when st = 'sent' and n2 = n - 10 and n3 = 1000 then 'PASS ' else 'FAIL ' end || 'E18 reversed goods receipt: PO ' || st || ', lumber ' || n || ' → ' || n2 || ', price variance back to ' || n3 || E'\n';
  d := mfg_post_stock_adjustment(i_lum, loc_rm, -2, null, 'COUNT', '2026-12-24');
  d2 := mfg_reverse_document(d, '2026-12-24', 'miscounted');
  select sum(debit - credit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5610';
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'E19 a reversed stock count leaves the count-difference account at ' || n || E'\n';

  ---------------------------------------------------------------- F. co-products and by-products (standard costing)
  i_log := mfg_save_item(null, jsonb_build_object('sku','LOG','name','Log','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',100));
  i_plank := mfg_save_item(null, jsonb_build_object('sku','PLANK','name','Plank','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  i_slab := mfg_save_item(null, jsonb_build_object('sku','SLAB','name','Slab','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  i_dust := mfg_save_item(null, jsonb_build_object('sku','DUST','name','Sawdust','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_plank, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_log, 'qty', 1, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_slab, 'qty', 0.5, 'uom', 'PC', 'kind', 'COPRODUCT', 'cost_share_pct', 20),
    jsonb_build_object('component_item_id', i_dust, 'qty', 0.2, 'uom', 'PC', 'kind', 'BYPRODUCT', 'cost_share_pct', 0))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_plank, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Saw', 'work_center_id', wc1, 'run_min_per_unit', 6, 'labor_min_per_unit', 6, 'machine_min_per_unit', 0))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_plank, 10, '2026-12-01');
  perform mfg_mark_cost_estimate(est);
  perform mfg_release_cost_estimate(est, '2026-12-01');
  select standard_cost into n from mfg_item_master where item_id = i_plank;
  select standard_cost into n2 from mfg_item_master where item_id = i_slab;
  res := res || case when n = 89.6 and n2 = 44.8 then 'PASS ' else 'FAIL ' end || 'F1 standard cost: plank ' || n || ', slab ' || n2 || E' (a lot costs 1,120: 1,000 logs + 80 labor + 40 overhead; the plank keeps 80 %, the slab 20 %)\n';
  perform mfg_post_stock_adjustment(i_log, loc_rm, 100, null, 'OPENING', '2026-12-26');
  o5 := mfg_create_order(i_plank, 10, '2026-12-27');
  select count(*) into c from mfg_prod_outputs where order_id = o5;
  select id into out_slab from mfg_prod_outputs where order_id = o5 and item_id = i_slab;
  select id into out_dust from mfg_prod_outputs where order_id = o5 and item_id = i_dust;
  select qty_planned into n from mfg_prod_outputs where id = out_slab;
  select qty_planned into n2 from mfg_prod_outputs where id = out_dust;
  res := res || case when c = 2 and n = 5 and n2 = 2 then 'PASS ' else 'FAIL ' end || 'F2 the order expects ' || n || ' slabs and ' || n2 || E' sawdust\n';
  perform mfg_release_order(o5);
  select id into cm from mfg_prod_components where order_id = o5;
  perform mfg_post_material_issue(o5, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 10)), '2026-12-27');
  begin perform mfg_post_output_receipt(o5, out_slab, 5, null, null, null, '2026-12-28'); res := res || E'FAIL F3 a co-product was received before production\n';
  exception when others then res := res || case when sqlerrm like '%once production has been confirmed%' then 'PASS ' else 'FAIL ' end || 'F3 no co-product before the work is confirmed: ' || sqlerrm || E'\n'; end;
  perform mfg_post_confirmation(o5, 10, 10, 0, null, 0, 1, 0, true, '2026-12-28');
  n := mfg_order_wip(o5);
  res := res || case when n = 1120 then 'PASS ' else 'FAIL ' end || 'F4 the plank order has cost ' || n || E' (expect 1,120)\n';
  d := mfg_post_fg_receipt(o5, 10, null, null, null, '2026-12-28');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1210 Dr 0.00 Cr 896.00; 1220 Dr 896.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'F5 10 planks at 89.60: ' || st || E'\n';
  begin perform mfg_post_output_receipt(o5, out_slab, 6, null, null, null, '2026-12-28'); res := res || E'FAIL F6 more slabs than expected\n';
  exception when others then res := res || case when sqlerrm like '%only 5%' then 'PASS ' else 'FAIL ' end || 'F6 cannot receive more than the order expected: ' || sqlerrm || E'\n'; end;
  d := mfg_post_output_receipt(o5, out_slab, 5, null, null, null, '2026-12-28');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1210 Dr 0.00 Cr 224.00; 1220 Dr 224.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'F7 5 slabs at 44.80: ' || st || E'\n';
  d := mfg_post_output_receipt(o5, out_dust, 2, null, null, null, '2026-12-28');
  select (journal_entry_id is null) into st from mfg_material_documents where id = d;
  select sum(qty) into n from mfg_stock where item_id = i_dust;
  res := res || case when st = 'true' and n = 2 then 'PASS ' else 'FAIL ' end || 'F8 sawdust has no cost share: it goes into stock (' || n || ') with no journal entry' || E'\n';
  n := mfg_order_wip(o5);
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'F9 nothing left in work in process=' || n || E'\n';
  x := mfg_settle_order(o5, '2026-12-29');
  select (journal_entry_id is null) || '/' || residual into st from mfg_settlements where id = x;
  res := res || case when st = 'true/0.00' then 'PASS ' else 'FAIL ' end || 'F10 an order that hit its standard settles to nothing: ' || st || E'\n';

  ---------------------------------------------------------------- G. the stock sub-ledger agrees with the general ledger (standard costing)
  select coalesce(sum(abs(difference)), 0), count(*) into n, c from mfg_reconciliation();
  res := res || case when n = 0 and c = 5 then 'PASS ' else 'FAIL ' end || 'G1 reconciliation: ' || c || ' control accounts, total difference ' || n || E'\n';

  ---------------------------------------------------------------- H. actual costing: shares, leftovers and reversals
  execute 'reset role';
  update mfg_company_settings set costing_method = 'ACTUAL' where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  i_log2 := mfg_save_item(null, jsonb_build_object('sku','LOG2','name','Log B','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',100));
  i_plank2 := mfg_save_item(null, jsonb_build_object('sku','PLANK2','name','Plank B','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  i_slab2 := mfg_save_item(null, jsonb_build_object('sku','SLAB2','name','Slab B','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_plank2, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_log2, 'qty', 1, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_slab2, 'qty', 0.5, 'uom', 'PC', 'kind', 'COPRODUCT', 'cost_share_pct', 20))));
  perform mfg_activate_bom(b);
  perform mfg_post_stock_adjustment(i_log2, loc_rm, 100, 100, 'OPENING', '2027-01-04');

  o6 := mfg_create_order(i_plank2, 10, '2027-01-05');
  perform mfg_release_order(o6);
  select id into cm from mfg_prod_components where order_id = o6;
  perform mfg_post_material_issue(o6, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 10)), '2027-01-05');
  perform mfg_post_confirmation(o6, null, 10, 0, null, 0, 0, 0, true, '2027-01-06');
  d := mfg_post_fg_receipt(o6, 10, null, null, null, '2027-01-06');
  select unit_cost into n from mfg_material_doc_lines where doc_id = d;
  select id into out_slab from mfg_prod_outputs where order_id = o6;
  d2 := mfg_post_output_receipt(o6, out_slab, 5, null, null, null, '2027-01-06');
  select unit_cost into n2 from mfg_material_doc_lines where doc_id = d2;
  res := res || case when n = 80 and n2 = 40 and mfg_order_wip(o6) = 0 then 'PASS ' else 'FAIL ' end || 'H1 actual costing splits the order''s real cost 80/20: plank ' || n || ', slab ' || n2 || ', work in process ' || mfg_order_wip(o6) || E'\n';
  x := mfg_settle_order(o6, '2027-01-07');
  select (journal_entry_id is null) into st from mfg_settlements where id = x;
  res := res || case when st = 'true' then 'PASS ' else 'FAIL ' end || 'H2 nothing to settle when every unit of cost reached stock' || E'\n';

  o7 := mfg_create_order(i_plank2, 10, '2027-01-08');
  perform mfg_release_order(o7);
  select id into cm from mfg_prod_components where order_id = o7;
  perform mfg_post_material_issue(o7, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 10)), '2027-01-08');
  perform mfg_post_confirmation(o7, null, 10, 0, null, 0, 0, 0, true, '2027-01-09');
  perform mfg_post_fg_receipt(o7, 10, null, null, null, '2027-01-09');
  x := mfg_settle_order(o7, '2027-01-10');
  select journal_entry_id into je from mfg_settlements where id = x;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1210 Dr 0.00 Cr 200.00; 5560 Dr 200.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'H3 the slabs were never received, so their 200 is expensed on settlement: ' || st || E'\n';

  po2 := mfg_create_po(vend, '2027-01-11', null, jsonb_build_array(jsonb_build_object('item_id', i_log2, 'qty', 100, 'unit_price', 120)));
  select l.id into pl2 from purchase_order_lines l where l.purchase_order_id = po2;
  perform mfg_post_goods_receipt(po2, '2027-01-11', jsonb_build_array(jsonb_build_object('po_line_id', pl2, 'qty', 100)));
  o8 := mfg_create_order(i_plank2, 10, '2027-01-12');
  perform mfg_release_order(o8);
  select id into cm from mfg_prod_components where order_id = o8;
  perform mfg_post_material_issue(o8, jsonb_build_array(jsonb_build_object('component_id', cm, 'qty', 10)), '2027-01-12');
  perform mfg_post_confirmation(o8, null, 10, 0, null, 0, 0, 0, true, '2027-01-13');
  d := mfg_post_fg_receipt(o8, 10, null, null, null, '2027-01-13');
  select moving_avg_cost into n from mfg_item_master where item_id = i_plank2;
  d2 := mfg_reverse_document(d, '2027-01-14', 'received twice');
  select moving_avg_cost into n2 from mfg_item_master where item_id = i_plank2;
  select sum(qty) into n3 from mfg_stock where item_id = i_plank2;
  res := res || case when n > 82 and abs(n2 - 80) < 0.001 and n3 = 20 and mfg_order_wip(o8) = 1111.11 then 'PASS ' else 'FAIL ' end || 'H4 reversing a receipt restores the moving average: ' || n || ' → ' || n2 || ' (expect 80), planks ' || n3 || ', work in process ' || mfg_order_wip(o8) || E'\n';

  ---------------------------------------------------------------- K. the invoice guard (approved as Q-C)
  insert into invoices (tenant_id, customer_id, order_date, total, status) values (mfg, cust, '2027-02-01', 1, 'draft') returning id into d;
  begin insert into invoice_lines (invoice_id, item_id, description, qty, unit_price) values (d, i_chair, 'x', 1, 1); res := res || E'FAIL K1 an invoice line with a stock item was accepted\n';
  exception when others then res := res || case when sqlerrm like '%can''t name a stock item%' then 'PASS ' else 'FAIL ' end || 'K1 a Manufacturing invoice line cannot name a stock item: ' || sqlerrm || E'\n'; end;
  begin perform convert_sales_order_to_invoice(so2, '2027-02-01'); res := res || E'FAIL K2 the Standard conversion copied stock items onto a Manufacturing invoice\n';
  exception when others then res := res || case when sqlerrm like '%can''t name a stock item%' then 'PASS ' else 'FAIL ' end || 'K2 converting a sales order that has stock items is refused: ' || sqlerrm || E'\n'; end;
  perform switch_tenant(t1);
  select id into x from items where tenant_id = t1 limit 1;
  if x is null then insert into items (tenant_id, name) values (t1, 'zz std item') returning id into x; end if;
  begin
    insert into invoices (tenant_id, order_date, total, status) values (t1, '2026-12-02', 10, 'draft') returning id into d;
    insert into invoice_lines (invoice_id, item_id, description, qty, unit_price) values (d, x, 'Std item', 1, 10);
    res := res || E'PASS K3 a Standard company can still put a stock item on an invoice line\n';
  exception when others then res := res || 'FAIL K3 Standard invoice line refused: ' || sqlerrm || E'\n'; end;
  perform switch_tenant(mfg);
  select count(*) into c from pg_proc where proname = 'guard_mfg_invoice_lines' and has_function_privilege('authenticated', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'K4 the guard function is not callable from the browser=' || c || E'\n';

  ---------------------------------------------------------------- I. who may do what
  begin insert into mfg_settlements (tenant_id, order_id, posting_date) values (mfg, o1, '2027-01-01'); res := res || E'FAIL I1 a student wrote a settlement directly\n';
  exception when others then res := res || E'PASS I1 settlements can only be written by the settlement function\n'; end;
  begin insert into mfg_invoice_links (tenant_id, so_line_id, invoice_id, qty) values (mfg, sl1, inv1, 1); res := res || E'FAIL I2 a student wrote an invoice link\n';
  exception when others then res := res || E'PASS I2 invoice links can only be written by the invoice function\n'; end;
  execute 'reset role';
  begin update mfg_settlements set residual = 1 where order_id = o1; res := res || E'FAIL I3 a settlement was edited\n';
  exception when others then res := res || E'PASS I3 a settlement cannot be edited, even by the database owner\n'; end;
  select count(*) into c from pg_proc where proname in ('mfg__avg_after', 'mfg__move_so', 'mfg__refresh_order_status', 'mfg__reverse_entry', 'mfg__reverse_doc', 'mfg__variance_split') and has_function_privilege('authenticated', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I4 the internal functions cannot be called from the browser=' || c || E'\n';
  select count(*) into c from pg_proc where proname in ('mfg_settle_order', 'mfg_reverse_settlement', 'mfg_close_order', 'mfg_reverse_document', 'mfg_reverse_confirmation', 'mfg_post_output_receipt',
    'mfg_post_delivery', 'mfg_create_invoice_from_so', 'mfg_order_variances') and has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I5 not-signed-in users cannot run any of the new functions=' || c || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_settlements) + (select count(*) from mfg_prod_outputs) + (select count(*) from mfg_invoice_links) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I6 another student sees none of it=' || c || E'\n';
  begin perform mfg_settle_order(o8, '2027-01-20'); res := res || E'FAIL I7 another student settled an order\n';
  exception when others then res := res || E'PASS I7 another student cannot settle this company''s order\n'; end;
  begin perform mfg_post_delivery(so2, '2027-01-20', jsonb_build_array(jsonb_build_object('so_line_id', sl2, 'qty', 1))); res := res || E'FAIL I8 another student delivered\n';
  exception when others then res := res || E'PASS I8 another student cannot deliver against this company''s sales order\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_settlements where tenant_id = mfg;
  res := res || case when c >= 5 then 'PASS ' else 'FAIL ' end || 'I9 the teacher can read the student''s settlements=' || c || E'\n';
  begin perform mfg_settle_order(o8, '2027-01-20'); res := res || E'FAIL I10 the teacher settled for a student\n';
  exception when others then res := res || E'PASS I10 the teacher cannot post for a student\n'; end;
  select count(*) into c from mfg_order_variances(o1);
  res := res || case when c = 4 then 'PASS ' else 'FAIL ' end || 'I11 the teacher can see an order''s variances=' || c || E'\n';

  ---------------------------------------------------------------- J. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_settlements where tenant_id = mfg) + (select count(*) from mfg_prod_outputs where tenant_id = mfg)
         + (select count(*) from mfg_invoice_links where tenant_id = mfg) + (select count(*) from mfg_material_documents where tenant_id = mfg)
         + (select count(*) from mfg_order_costs where tenant_id = mfg) + (select count(*) from invoices where tenant_id = mfg) + (select count(*) from journal_entries where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J1 the teacher deleted the company with its settlements, deliveries, invoices and entries (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL J1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 4b — failures: %\n%', n, res;
end $$;
