-- ============================================================
-- Manufacturing ERP — Phase 4a integration test (migrations 0029 + 0030 + 0031).
--
-- Run it AFTER the three migrations, or paste it after them in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id.
--
-- The main story is the plan's Dining Chair (section 6.3/6.4): lumber bought at 65 against a 60 standard, an order of 100
-- chairs, material issued at standard price × actual quantity (310 / 800 / 20), 160 labor hours, 52 machine hours,
-- 98 good + 2 scrap, finished goods in at 468 each — and 2,936 left in work in process for Phase 4b to settle.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; n2 numeric; n3 numeric; st text; h text; d uuid; d2 uuid; je uuid; x uuid;
  i_lum uuid; i_scr uuid; i_var uuid; i_chair uuid; i_alum uuid; i_widget uuid; i_panel uuid;
  wc1 uuid; b uuid; rt uuid; est uuid; vend uuid; po uuid; pl_lum uuid; pl_scr uuid; pl_var uuid;
  loc_rm uuid; loc_q uuid; loc_fg uuid; o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid;
  cm_lum uuid; cm_scr uuid; cm_var uuid; cm_alum uuid; conf uuid; a_inv uuid; a_cash uuid; a_opex uuid; a_eq uuid;
  var_json jsonb;
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
    'mfg_order_wip','mfg_order_availability','mfg__issue_components','mfg_post_material_issue','mfg_post_confirmation','mfg_post_fg_receipt','mfg_reconciliation'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items',
    'mfg_batches','mfg_stock','mfg_material_documents','mfg_material_doc_lines','mfg_po_line_items',
    'mfg_production_orders','mfg_prod_components','mfg_prod_operations','mfg_confirmations','mfg_order_costs'];
begin
  ---------------------------------------------------------------- Z. nothing that existed was changed (apart from the two approved journal triggers)
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
     and t.tgname not in ('trg_journal_balanced', 'trg_mfg_control_accounts');
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged apart from the two approved ones (' || h || E')\n';
  select count(*) into c from pg_trigger where tgname in ('trg_journal_balanced', 'trg_mfg_control_accounts') and tgrelid = 'public.journal_lines'::regclass;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'Z5 the two approved triggers sit on journal_lines=' || c || E'\n';

  ---------------------------------------------------------------- set-up: company, items, a released standard cost
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase4a Co', '2026-01-01', 'STANDARD');
  select count(*) into c from mfg_account_determination where key in ('OPENING_EQUITY', 'INVENTORY_DIFF');
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'A1 new company has the two new posting keys=' || c || E'\n';

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

  begin perform mfg_create_order(i_chair, 10, '2026-11-16'); res := res || E'FAIL B0 an order was created before any standard cost existed\n';
  exception when others then res := res || case when sqlerrm like '%no standard cost%' then 'PASS ' else 'FAIL ' end || 'B0 no order without a standard cost: ' || sqlerrm || E'\n'; end;
  est := mfg_create_cost_estimate(i_chair, 1, '2026-11-15');
  perform mfg_mark_cost_estimate(est);
  perform mfg_release_cost_estimate(est, '2026-11-15');
  select standard_cost into n from mfg_item_master where item_id = i_chair;
  res := res || case when n = 468 then 'PASS ' else 'FAIL ' end || 'B1 standard cost released: chair ' || n || E' (expect 468)\n';

  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  select id into loc_q from mfg_storage_locations where code = 'QUARANTINE';
  select id into loc_fg from mfg_storage_locations where code = 'FG-STORE';
  select id into a_cash from accounts where code = '1000';
  select id into a_opex from accounts where code = '5100';
  select id into a_inv from accounts where code = '1200';

  ---------------------------------------------------------------- C. the central posting function and the new ledger guards
  begin   -- an unbalanced manual entry cannot be saved
    insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-11-02', 'zz unbalanced') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_cash, 100, 0), (je, a_opex, 0, 90);
    set constraints trg_journal_balanced immediate;
    res := res || E'FAIL C1 an unbalanced entry was accepted\n';
  exception when others then res := res || case when sqlerrm like '%does not balance%' then 'PASS ' else 'FAIL ' end || 'C1 unbalanced entry refused: ' || sqlerrm || E'\n'; end;
  set constraints trg_journal_balanced deferred;
  begin   -- a balanced manual entry is fine (cash and an expense are not control accounts)
    insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-11-02', 'zz rent') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_opex, 100, 0), (je, a_cash, 0, 100);
    set constraints trg_journal_balanced immediate;
    res := res || E'PASS C2 a balanced manual entry on cash and an expense is accepted\n';
  exception when others then res := res || 'FAIL C2 a balanced manual entry was refused: ' || sqlerrm || E'\n'; end;
  set constraints trg_journal_balanced deferred;
  begin   -- but not on a control account
    insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-11-02', 'zz hand-posted stock') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_inv, 500, 0);
    res := res || E'FAIL C3 a manual line on the inventory account was accepted\n';
  exception when others then res := res || case when sqlerrm like '%run by the system%' then 'PASS ' else 'FAIL ' end || 'C3 manual line on a control account refused: ' || sqlerrm || E'\n'; end;
  begin   -- a system-style entry (with a source document) is not blocked by the control-account rule
    insert into journal_entries (tenant_id, entry_date, memo, source_table, source_id) values (mfg, '2026-11-02', 'zz sourced', 'zz_test', gen_random_uuid()) returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_inv, 5, 0), (je, a_inv, 0, 5);   -- nets to nothing, so the ledger stays clean
    set constraints trg_journal_balanced immediate;
    res := res || E'PASS C4 an entry with a source document may use a control account\n';
  exception when others then res := res || 'FAIL C4 sourced entry refused: ' || sqlerrm || E'\n'; end;
  set constraints trg_journal_balanced deferred;

  ---------------------------------------------------------------- D. opening balances (and first-expiry-first-out set-up)
  d := mfg_post_stock_adjustment(i_lum, loc_rm, 150, null, 'OPENING', '2026-11-05');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 9000.00 Cr 0.00; 3000 Dr 0.00 Cr 9000.00' then 'PASS ' else 'FAIL ' end || 'D1 opening 150 BF of lumber at standard 60: ' || st || E'\n';
  d := mfg_post_stock_adjustment(i_var, loc_rm, 10, null, 'OPENING', '2026-11-05', 'V0', '2027-01-31');
  select count(*) into c from mfg_batches where item_id = i_var and batch_no = 'V0' and expiry_date = '2027-01-31';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'D2 opening varnish lot V0 with an expiry date' || E'\n';
  select document_number into st from mfg_material_documents where id = d;
  res := res || case when st ~ '^ADJ-[0-9]{4}$' then 'PASS ' else 'FAIL ' end || 'D3 document numbered ' || st || E'\n';
  begin perform mfg_post_stock_adjustment(i_lum, loc_rm, -1000, null, 'COUNT', '2026-11-05'); res := res || E'FAIL D4 a count took more stock than exists\n';
  exception when others then res := res || case when sqlerrm like '%Not enough stock%' then 'PASS ' else 'FAIL ' end || 'D4 cannot count away stock that is not there: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- E. purchase order and goods receipt
  insert into vendors (tenant_id, name) values (mfg, 'zz Lumber Co') returning id into vend;
  po := mfg_create_po(vend, '2026-11-10', '2026-11-12', jsonb_build_array(
    jsonb_build_object('item_id', i_lum, 'qty', 200, 'unit_price', 65),
    jsonb_build_object('item_id', i_scr, 'qty', 1000, 'unit_price', 1),
    jsonb_build_object('item_id', i_var, 'qty', 25, 'unit_price', 250)));
  select l.id into pl_lum from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_lum;
  select l.id into pl_scr from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_scr;
  select l.id into pl_var from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po and li.item_id = i_var;
  select round(total, 2) || '/' || status into st from purchase_orders where id = po;
  res := res || case when st = '20250.00/sent' then 'PASS ' else 'FAIL ' end || 'E1 purchase order total/status=' || st || E' (200×65 + 1000×1 + 25×250 = 20,250)\n';

  d := mfg_post_goods_receipt(po, '2026-11-12', jsonb_build_array(
    jsonb_build_object('po_line_id', pl_lum, 'qty', 120), jsonb_build_object('po_line_id', pl_scr, 'qty', 1000),
    jsonb_build_object('po_line_id', pl_var, 'qty', 25, 'batch_no', 'V1', 'expiry', '2027-06-30')), 'gr-1');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 14450.00 Cr 0.00; 2050 Dr 0.00 Cr 15050.00; 5500 Dr 600.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'E2 first receipt: ' || st || E'\n';
  select count(*) into c from goods_receipts where purchase_order_id = po;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'E3 the existing goods-receipt record is written too (rows=' || c || E')\n';
  d2 := mfg_post_goods_receipt(po, '2026-11-12', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 120)), 'gr-1');
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  res := res || case when d2 = d and n = 270 then 'PASS ' else 'FAIL ' end || 'E4 the same idempotency key posts nothing twice (same document: ' || (d2 = d) || ', lumber ' || n || E')\n';
  begin perform mfg_post_goods_receipt(po, '2026-11-13', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 81))); res := res || E'FAIL E5 over-receipt accepted\n';
  exception when others then res := res || case when sqlerrm like '%only 80%' then 'PASS ' else 'FAIL ' end || 'E5 cannot receive more than was ordered: ' || sqlerrm || E'\n'; end;
  select status into st from purchase_orders where id = po;
  res := res || case when st = 'sent' then 'PASS ' else 'FAIL ' end || 'E6 the PO stays open while 80 BF are outstanding (' || st || E')\n';
  d2 := mfg_post_goods_receipt(po, '2026-11-13', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 80)), 'gr-2');
  select journal_entry_id into je from mfg_material_documents where id = d2;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 4800.00 Cr 0.00; 2050 Dr 0.00 Cr 5200.00; 5500 Dr 400.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'E7 second receipt: ' || st || E'\n';
  select status into st from purchase_orders where id = po;
  res := res || case when st = 'closed' then 'PASS ' else 'FAIL ' end || 'E8 the PO closes when everything is in (' || st || E')\n';
  begin perform mfg_post_goods_receipt(po, '2026-11-14', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 1))); res := res || E'FAIL E9 receipt on a closed PO accepted\n';
  exception when others then res := res || case when sqlerrm like '%already fully received%' then 'PASS ' else 'FAIL ' end || 'E9 closed PO refuses further receipts: ' || sqlerrm || E'\n'; end;
  select sum(debit) into n from journal_lines jl join accounts a on a.id = jl.account_id join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg and a.code = '5500';
  res := res || case when n = 1000 then 'PASS ' else 'FAIL ' end || 'E10 purchase price variance so far=' || n || E' (expect 1,000 = 200 × 5)\n';
  select qty_on_hand into n from items where id = i_lum;
  res := res || case when n = 350 then 'PASS ' else 'FAIL ' end || 'E11 the Standard-side stock count follows: ' || n || E' (expect 350)\n';
  begin perform mfg_delete_po(po); res := res || E'FAIL E12 a received PO was deleted\n';
  exception when others then res := res || E'PASS E12 a PO with receipts cannot be deleted\n'; end;

  ---------------------------------------------------------------- F. the production order for 100 chairs
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  update tenants set approval_threshold = 40000 where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o1 := mfg_create_order(i_chair, 100, '2026-11-16', '2026-11-30');
  select qty_planned || '/' || std_unit_cost || '/' || planned_cost || '/' || status || '/' || document_number into st from mfg_production_orders where id = o1;
  res := res || case when st = '100.0000/468.000000/46800.000000/CREATED/PRD-0001' then 'PASS ' else 'FAIL ' end || 'F1 order created: ' || st || E'\n';
  select string_agg(i.sku || '=' || c.qty_required, ', ' order by i.sku) into st from mfg_prod_components c join items i on i.id = c.item_id where c.order_id = o1;
  res := res || case when st = 'LUM=300.000000, SCR=800.000000, VAR=20.000000' then 'PASS ' else 'FAIL ' end || 'F2 what the order needs: ' || st || E'\n';
  select count(*) into c from mfg_prod_operations where order_id = o1;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'F3 operations copied from the routing=' || c || E'\n';
  select id into cm_lum from mfg_prod_components where order_id = o1 and item_id = i_lum;
  select id into cm_scr from mfg_prod_components where order_id = o1 and item_id = i_scr;
  select id into cm_var from mfg_prod_components where order_id = o1 and item_id = i_var;
  begin perform mfg_post_material_issue(o1, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 1)), '2026-11-16'); res := res || E'FAIL F4 issued to an unreleased order\n';
  exception when others then res := res || case when sqlerrm like '%released order%' then 'PASS ' else 'FAIL ' end || 'F4 no issue before release: ' || sqlerrm || E'\n'; end;
  st := mfg_release_order(o1);
  res := res || case when st = 'PENDING_APPROVAL' then 'PASS ' else 'FAIL ' end || 'F5 above the approval threshold the order waits: ' || st || E'\n';
  begin perform mfg_approve_order(o1); res := res || E'FAIL F6 a student approved an order\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'F6 a student cannot approve: ' || sqlerrm || E'\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_approve_order(o1);
  select status || '/' || (release_approved_by = teach) into st from mfg_production_orders where id = o1;
  res := res || case when st = 'RELEASED/true' then 'PASS ' else 'FAIL ' end || 'F7 the teacher released it: ' || st || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  update tenants set approval_threshold = null where id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- explicit issue: 310 / 800 / 20 at standard price × actual quantity
  d := mfg_post_material_issue(o1, jsonb_build_array(
    jsonb_build_object('component_id', cm_lum, 'qty', 310), jsonb_build_object('component_id', cm_scr, 'qty', 800), jsonb_build_object('component_id', cm_var, 'qty', 20)), '2026-11-16', 'iss-1');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 0.00 Cr 24400.00; 1210 Dr 24400.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'G1 material issue: ' || st || E'\n';
  n := mfg_order_wip(o1);
  res := res || case when n = 24400 then 'PASS ' else 'FAIL ' end || 'G2 work in process of the order=' || n || E' (expect 24,400 = 18,600 + 800 + 5,000)\n';
  select string_agg(coalesce(bt.batch_no, '-') || '=' || s.qty, ', ' order by coalesce(bt.batch_no, '-')) into st
    from mfg_stock s left join mfg_batches bt on bt.id = s.batch_id where s.item_id = i_var;
  res := res || case when st = 'V0=0.000000, V1=15.000000' then 'PASS ' else 'FAIL ' end || 'G3 varnish issued earliest-expiry first: ' || st || E'\n';
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  res := res || case when n = 40 then 'PASS ' else 'FAIL ' end || 'G4 lumber left=' || n || E' (expect 40)\n';
  select qty_issued into n from mfg_prod_components where id = cm_lum;
  res := res || case when n = 310 then 'PASS ' else 'FAIL ' end || 'G5 the order records 310 BF issued against 300 needed' || E'\n';
  d2 := mfg_post_material_issue(o1, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 1)), '2026-11-16', 'iss-1');
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  res := res || case when d2 = d and n = 40 then 'PASS ' else 'FAIL ' end || 'G6 an issue posted twice with the same key does nothing the second time' || E'\n';

  -- confirmation: 98 good + 2 scrap, 160 labor hours, 52 machine hours
  conf := mfg_post_confirmation(o1, 10, 98, 2, 'Cracked in the press', 0, 160, 52, true, '2026-11-20', null, 'cnf-1');
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st
    from journal_lines jl join accounts a on a.id = jl.account_id join mfg_confirmations cf on cf.journal_entry_id = jl.journal_entry_id where cf.id = conf;
  res := res || case when st = '1210 Dr 24400.00 Cr 0.00; 5700 Dr 0.00 Cr 12800.00; 5710 Dr 0.00 Cr 5200.00; 5720 Dr 0.00 Cr 6400.00' then 'PASS ' else 'FAIL ' end || 'H1 confirmation: ' || st || E'\n';
  n := mfg_order_wip(o1);
  res := res || case when n = 48800 then 'PASS ' else 'FAIL ' end || 'H2 work in process after labor, machine and overhead=' || n || E' (expect 48,800)\n';
  select status || '/' || qty_good || '/' || qty_scrap into st from mfg_production_orders where id = o1;
  res := res || case when st = 'CONFIRMED/98.000000/2.000000' then 'PASS ' else 'FAIL ' end || 'H3 order: ' || st || E'\n';
  select document_number into st from mfg_confirmations where id = conf;
  res := res || case when st = 'CNF-0001' then 'PASS ' else 'FAIL ' end || 'H4 confirmation number ' || st || E'\n';
  begin perform mfg_post_confirmation(o1, 10, 1, 0, null, 0, 1, 0, false, '2026-11-21'); res := res || E'FAIL H5 confirmed after the final confirmation\n';
  exception when others then res := res || case when sqlerrm like '%isn''t finished%' then 'PASS ' else 'FAIL ' end || 'H5 nothing more after the final confirmation: ' || sqlerrm || E'\n'; end;

  -- finished goods in, in two parts
  d := mfg_post_fg_receipt(o1, 60, null, null, null, '2026-11-21', 'fg-1');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1210 Dr 0.00 Cr 28080.00; 1220 Dr 28080.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'I1 first 60 chairs at 468: ' || st || E'\n';
  select status into st from mfg_production_orders where id = o1;
  res := res || case when st = 'CONFIRMED' then 'PASS ' else 'FAIL ' end || 'I2 order is not DELIVERED until every good chair is in (' || st || E')\n';
  begin perform mfg_post_fg_receipt(o1, 39, null, null, null, '2026-11-21'); res := res || E'FAIL I3 received more than was made\n';
  exception when others then res := res || case when sqlerrm like '%waiting to be received%' then 'PASS ' else 'FAIL ' end || 'I3 cannot receive more than the 38 left: ' || sqlerrm || E'\n'; end;
  d := mfg_post_fg_receipt(o1, 38, null, null, null, '2026-11-22');
  n := mfg_order_wip(o1);
  select status into st from mfg_production_orders where id = o1;
  res := res || case when n = 2936 and st = 'DELIVERED' then 'PASS ' else 'FAIL ' end || 'I4 work in process left=' || n || ', order ' || st || E' (expect 2,936 — the variance Phase 4b settles — and DELIVERED)\n';
  select sum(qty) into n from mfg_stock where item_id = i_chair;
  select qty_on_hand into n2 from items where id = i_chair;
  res := res || case when n = 98 and n2 = 98 then 'PASS ' else 'FAIL ' end || 'I5 chairs in stock=' || n || ', Standard-side=' || n2 || E'\n';

  ---------------------------------------------------------------- J. backflush: 10 chairs with no hand issue
  o3 := mfg_create_order(i_chair, 10, '2026-11-23', null, 1, 1, true);
  perform mfg_release_order(o3);
  select count(*) into c from mfg_prod_components where order_id = o3 and backflush;
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'J1 all three components flagged for backflush=' || c || E'\n';
  conf := mfg_post_confirmation(o3, 10, 10, 0, null, 0, 15, 5, true, '2026-11-24');
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  select sum(qty) into n2 from mfg_stock where item_id = i_scr;
  select sum(qty) into n3 from mfg_stock where item_id = i_var;
  res := res || case when n = 10 and n2 = 120 and n3 = 13 then 'PASS ' else 'FAIL ' end || 'J2 backflush took lumber 30, screws 80, varnish 2: left ' || n || ' / ' || n2 || ' / ' || n3 || E'\n';
  n := mfg_order_wip(o3);
  res := res || case when n = 4680 then 'PASS ' else 'FAIL ' end || 'J3 work in process of the small order=' || n || E' (expect 4,680 = 10 × 468)\n';
  perform mfg_post_fg_receipt(o3, 10, null, null, null, '2026-11-24');
  n := mfg_order_wip(o3);
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'J4 an order that hit its standard leaves nothing in work in process=' || n || E'\n';

  ---------------------------------------------------------------- K. transfers and stock counts
  d := mfg_transfer_stock(i_lum, loc_rm, loc_q, 4, '2026-11-25');
  select count(*) into c from mfg_material_documents where id = d and journal_entry_id is null;
  select qty into n from mfg_stock where item_id = i_lum and location_id = loc_q;
  select sum(qty) into n2 from mfg_stock where item_id = i_lum;
  res := res || case when c = 1 and n = 4 and n2 = 10 then 'PASS ' else 'FAIL ' end || 'K1 a transfer moves stock (' || n || ' in quarantine, ' || n2 || ' in all) and posts no entry' || E'\n';
  d := mfg_post_stock_adjustment(i_lum, loc_rm, -2, null, 'COUNT', '2026-11-26');
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 0.00 Cr 120.00; 5610 Dr 120.00 Cr 0.00' then 'PASS ' else 'FAIL ' end || 'K2 two units counted missing: ' || st || E'\n';

  ---------------------------------------------------------------- L. the stock sub-ledger agrees with the general ledger
  select coalesce(sum(abs(difference)), 0), count(*) into n, c from mfg_reconciliation();
  res := res || case when n = 0 and c = 5 then 'PASS ' else 'FAIL ' end || 'L1 reconciliation: ' || c || ' control accounts, total difference ' || n || E'\n';
  select string_agg(area || '=' || subledger, ', ' order by area) into st from mfg_reconciliation();
  res := res || case when st = 'Finished goods=50544.00, Packaging & supplies=0.00, Raw materials=3850.00, Received, not yet invoiced (GR/IR)=20250.00, Work in process=2936.00' then 'PASS ' else 'FAIL ' end || 'L2 balances: ' || st || E'\n';
  select sum(jl.debit) - sum(jl.credit) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'L3 the whole company trial balance nets to ' || n || E'\n';

  ---------------------------------------------------------------- M. immutability and direct writes
  begin insert into mfg_stock (tenant_id, item_id, location_id, qty) values (mfg, i_lum, loc_rm, 1000); res := res || E'FAIL M1 a student wrote stock directly\n';
  exception when others then res := res || E'PASS M1 stock cannot be written directly\n'; end;
  update mfg_production_orders set status = 'CLOSED' where id = o1;
  select status into st from mfg_production_orders where id = o1;
  res := res || case when st = 'DELIVERED' then 'PASS ' else 'FAIL ' end || 'M2 a student cannot change an order''s status directly (' || st || E')\n';
  execute 'reset role';
  begin update mfg_material_documents set memo = 'tampered' where id = d; res := res || E'FAIL M3 a posted stock document was edited\n';
  exception when others then res := res || case when sqlerrm like '%reversal%' then 'PASS ' else 'FAIL ' end || 'M3 a posted stock document cannot be edited, even by the database owner: ' || sqlerrm || E'\n'; end;
  begin delete from mfg_material_doc_lines where doc_id = d; res := res || E'FAIL M4 a stock line was deleted\n';
  exception when others then res := res || E'PASS M4 a stock line cannot be deleted\n'; end;
  begin delete from mfg_order_costs where order_id = o1; res := res || E'FAIL M5 order costs were deleted\n';
  exception when others then res := res || E'PASS M5 order cost postings cannot be deleted\n'; end;
  begin delete from mfg_confirmations where order_id = o1; res := res || E'FAIL M6 a confirmation was deleted\n';
  exception when others then res := res || E'PASS M6 a confirmation cannot be deleted\n'; end;
  select count(*) into c from pg_proc where proname in ('mfg__post_entry', 'mfg__move', 'mfg__pick', 'mfg__issue_components') and has_function_privilege('authenticated', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'M7 the internal posting functions cannot be called from the browser=' || c || E'\n';
  select count(*) into c from pg_proc where proname in ('mfg_create_po', 'mfg_post_goods_receipt', 'mfg_post_material_issue', 'mfg_post_confirmation', 'mfg_post_fg_receipt', 'mfg_create_order', 'mfg_reconciliation') and has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'M8 not-signed-in users cannot run the stock or production functions=' || c || E'\n';

  ---------------------------------------------------------------- N. other companies and the teacher
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_stock) + (select count(*) from mfg_material_documents) + (select count(*) from mfg_production_orders) + (select count(*) from mfg_order_costs) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'N1 another student sees none of it=' || c || E'\n';
  begin perform mfg_post_goods_receipt(po, '2026-11-12', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 1))); res := res || E'FAIL N2 another student posted a receipt\n';
  exception when others then res := res || E'PASS N2 another student cannot post to this company\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_material_documents where tenant_id = mfg;
  res := res || case when c >= 8 then 'PASS ' else 'FAIL ' end || 'N3 the teacher can read the student''s stock documents=' || c || E'\n';
  begin perform mfg_post_fg_receipt(o1, 1, null, null, null, '2026-11-22'); res := res || E'FAIL N4 the teacher posted for a student\n';
  exception when others then res := res || E'PASS N4 the teacher cannot post for a student\n'; end;
  select count(*) into c from mfg_reconciliation(mfg);
  res := res || case when c = 5 then 'PASS ' else 'FAIL ' end || 'N5 the teacher can run the reconciliation for a student company=' || c || E'\n';

  ---------------------------------------------------------------- O. negative stock is refused unless the teacher allows it
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  o2 := mfg_create_order(i_chair, 10, '2026-12-01');
  perform mfg_release_order(o2);
  select id into cm_lum from mfg_prod_components where order_id = o2 and item_id = i_lum;
  begin perform mfg_post_material_issue(o2, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 9)), '2026-12-01');
    res := res || E'FAIL O1 stock went negative\n';
  exception when others then res := res || case when sqlerrm like '%Not enough stock of "Lumber"%' then 'PASS ' else 'FAIL ' end || 'O1 not enough lumber: ' || sqlerrm || E'\n'; end;
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  res := res || case when n = 8 then 'PASS ' else 'FAIL ' end || 'O2 the refused issue changed nothing (lumber ' || n || E')\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_mfg_negative_stock(mfg, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform mfg_post_material_issue(o2, jsonb_build_array(jsonb_build_object('component_id', cm_lum, 'qty', 9)), '2026-12-01');
  select sum(qty) into n from mfg_stock where item_id = i_lum;
  select qty_on_hand into n2 from items where id = i_lum;
  res := res || case when n = -1 and n2 = -1 then 'PASS ' else 'FAIL ' end || 'O3 with the teacher''s permission stock may go negative: ' || n || ' (Standard-side ' || n2 || E')\n';
  begin perform mfg_post_stock_adjustment(i_lum, loc_rm, 1, null, 'COUNT', '2026-12-02'); res := res || E'PASS O4 and can be brought back up\n';
  exception when others then res := res || 'FAIL O4 could not correct negative stock: ' || sqlerrm || E'\n'; end;
  begin perform set_mfg_negative_stock(mfg, false); res := res || E'FAIL O5 a student changed the setting\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'O5 a student cannot change the setting: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- P. actual costing: moving average and the order's real cost
  execute 'reset role';
  update mfg_company_settings set costing_method = 'ACTUAL' where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  i_alum := mfg_save_item(null, jsonb_build_object('sku','ALUM','name','Alder wood','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',60));
  i_widget := mfg_save_item(null, jsonb_build_object('sku','WID','name','Widget','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  begin perform mfg_post_stock_adjustment(i_alum, loc_rm, 100, null, 'OPENING', '2026-12-03'); res := res || E'FAIL P1 an opening balance without a cost was accepted\n';
  exception when others then res := res || case when sqlerrm like '%cost of one unit%' then 'PASS ' else 'FAIL ' end || 'P1 actual costing needs the cost of an opening balance: ' || sqlerrm || E'\n'; end;
  perform mfg_post_stock_adjustment(i_alum, loc_rm, 100, 60, 'OPENING', '2026-12-03');
  po := mfg_create_po(vend, '2026-12-03', null, jsonb_build_array(jsonb_build_object('item_id', i_alum, 'qty', 200, 'unit_price', 65)));
  select l.id into pl_lum from purchase_order_lines l where l.purchase_order_id = po;
  d := mfg_post_goods_receipt(po, '2026-12-04', jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 200)));
  select moving_avg_cost into n from mfg_item_master where item_id = i_alum;
  select journal_entry_id into je from mfg_material_documents where id = d;
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when n = 63.333333 then 'PASS ' else 'FAIL ' end || 'P2 moving average of 100 @ 60 and 200 @ 65=' || n || E' (expect 63.333333)\n';
  res := res || case when st = '1200 Dr 13000.00 Cr 0.00; 2050 Dr 0.00 Cr 13000.00' then 'PASS ' else 'FAIL ' end || 'P3 under actual costing there is no price variance: ' || st || E'\n';
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_widget, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_alum, 'qty', 1, 'uom', 'BF'))));
  perform mfg_activate_bom(b);
  o4 := mfg_create_order(i_widget, 10, '2026-12-05');
  perform mfg_release_order(o4);
  select id into cm_alum from mfg_prod_components where order_id = o4;
  perform mfg_post_material_issue(o4, jsonb_build_array(jsonb_build_object('component_id', cm_alum, 'qty', 10)), '2026-12-05');
  n := mfg_order_wip(o4);
  res := res || case when n = 633.33 then 'PASS ' else 'FAIL ' end || 'P4 ten feet issued at the moving average: work in process ' || n || E' (expect 633.33)\n';
  perform mfg_post_confirmation(o4, null, 10, 0, null, 0, 0, 0, true, '2026-12-06');
  d := mfg_post_fg_receipt(o4, 10, null, null, null, '2026-12-06');
  select unit_cost into n from mfg_material_doc_lines where doc_id = d;
  select moving_avg_cost into n2 from mfg_item_master where item_id = i_widget;
  res := res || case when mfg_order_wip(o4) = 0 and n = 63.333 and n2 = 63.333 then 'PASS ' else 'FAIL ' end || 'P5 finished goods at the order''s real cost ' || n || ' each, order cleared, widget average ' || n2 || E'\n';

  -- one quantity rule: explosion, cost estimate and production order must agree (item scrap 10 %, recipe yield 90 %, line scrap 5 %)
  i_panel := mfg_save_item(null, jsonb_build_object('sku','PANEL','name','Panel','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','scrap_pct',10));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_panel, 'valid_from', '2026-11-01', 'yield_pct', 90, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_alum, 'qty', 2, 'uom', 'BF', 'scrap_pct', 5))));
  perform mfg_activate_bom(b);
  select base_qty into n from mfg_explode_bom(i_panel, 100, '2026-12-05') where item_id = i_alum;
  est := mfg_create_cost_estimate(i_panel, 100, '2026-12-05');
  select qty into n2 from mfg_cost_estimate_lines where estimate_id = est and component_item_id = i_alum;
  o5 := mfg_create_order(i_panel, 100, '2026-12-05');
  select qty_required into n3 from mfg_prod_components where order_id = o5 and item_id = i_alum;
  res := res || case when n = 259.259259 and n2 = n and n3 = n then 'PASS ' else 'FAIL ' end || 'Q1 one quantity rule: explosion ' || n || ', cost estimate ' || n2 || ', production order ' || n3 || E' (expect 259.259259 each)\n';
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_panel, 'yield_pct', 0, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_alum, 'qty', 1, 'uom', 'BF'))));
    res := res || E'FAIL Q2 a yield of 0 was accepted\n';
  exception when others then res := res || case when sqlerrm like '%yield%' then 'PASS ' else 'FAIL ' end || 'Q2 yield must be above 0: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_panel, 'yield_pct', 120, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_alum, 'qty', 1, 'uom', 'BF'))));
    res := res || E'FAIL Q3 a yield of 120 percent was accepted\n';
  exception when others then res := res || case when sqlerrm like '%yield%' then 'PASS ' else 'FAIL ' end || 'Q3 yield cannot exceed 100: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- R. the Standard ERP is undisturbed by the two new journal triggers
  select count(*) into c from mfg_reconciliation();
  perform switch_tenant(t1);
  select id into a_inv from accounts where code = '1200';
  select id into a_eq from accounts where code = '3000';
  begin
    insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-11-28', 'zz standard manual entry to inventory') returning id into je;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_inv, 250, 0), (je, a_eq, 0, 250);
    set constraints trg_journal_balanced immediate;
    res := res || E'PASS R1 a Standard company can still post a manual entry to its inventory account\n';
  exception when others then res := res || 'FAIL R1 Standard manual entry refused: ' || sqlerrm || E'\n'; end;
  set constraints trg_journal_balanced deferred;
  begin   -- the whole transaction so far must satisfy the balance rule
    set constraints trg_journal_balanced immediate;
    res := res || E'PASS R2 every entry created by this whole test balances\n';
  exception when others then res := res || 'FAIL R2 something in this test is unbalanced: ' || sqlerrm || E'\n'; end;
  set constraints trg_journal_balanced deferred;
  perform switch_tenant(mfg);

  ---------------------------------------------------------------- S. the teacher deletes a Manufacturing company that has stock and history
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_material_documents where tenant_id = mfg)
         + (select count(*) from mfg_stock where tenant_id = mfg) + (select count(*) from mfg_production_orders where tenant_id = mfg)
         + (select count(*) from mfg_confirmations where tenant_id = mfg) + (select count(*) from journal_entries where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'S1 the teacher deleted the company with all its stock documents, orders and entries (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL S1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 4a — failures: %\n%', n, res;
end $$;
