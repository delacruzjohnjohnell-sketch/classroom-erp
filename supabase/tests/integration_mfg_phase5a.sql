-- ============================================================
-- Manufacturing ERP — Phase 5a integration test (migration 0034).
--
-- Run it AFTER 0029–0034 are applied, or paste it after the migrations in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id.
--
-- The story (planning starts on Monday 2 November 2026, weekly buckets, 12 weeks):
--   A dining chair (10 in stock) is wanted for 30 by a sales order on 30 Nov, 5 on 10 Dec, and the December forecast is 20.
--   Chair = 1 seat + 4 legs + 1 glue; seat = 2 foam + 4 bolts + 1 sandpaper. Each bought item has a different lot rule
--   (legs fixed 100, foam min 50 / max 100, bolts 20 % scrap, sandpaper periodic). A stool is wanted too early to make in time
--   and has no bill of materials. Open purchase orders exercise the exceptions. Then orders are converted, a second run
--   replaces what was not converted, and the company is deleted.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; st text; h text; x uuid;
  i_chair uuid; i_stool uuid; i_seat uuid; i_leg uuid; i_glue uuid; i_foam uuid; i_bolt uuid; i_sand uuid; i_nail uuid;
  loc_fg uuid; loc_rm uuid; vend uuid; cust uuid; b uuid; so1 uuid; so2 uuid; so3 uuid; so4 uuid;
  po_leg uuid; po_glue uuid; po_nail uuid; run1 uuid; run2 uuid;
  pln_chair35 uuid; pln_chair5 uuid; pln_fixed uuid; pr_leg1 uuid; pr_leg2 uuid; pr_glue5 uuid; ord uuid; po_new uuid;
  t0 timestamptz; ms numeric; ii int; jj int; raws uuid[] := '{}'; semis uuid[] := '{}'; fin uuid; lns jsonb; so_s uuid; run3 uuid;
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
    'mfg_delete_planned_order','mfg_delete_requisition','mfg_convert_planned_order','mfg_convert_requisitions'];
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

  ---------------------------------------------------------------- the lot rules and the buckets, as plain numbers
  st := mfg__lot_qty('FIXED', 120, 50, 0, 0)::text || mfg__lot_qty('EOQ', 120, 200, 0, 0)::text || mfg__lot_qty('MIN_MAX', 210, 0, 50, 100)::text
     || mfg__lot_qty('LOT_FOR_LOT', 37, 0, 0, 0)::text || mfg__lot_qty('PERIODIC', 12.5, 3, 0, 0)::text || mfg__lot_qty('MIN_MAX', 20, 0, 50, 100)::text || mfg__lot_qty('LOT_FOR_LOT', 0, 0, 0, 0)::text;
  res := res || case when st = '{150.000000}{200}{100,100,50}{37.000000}{12.500000}{50}{}' then 'PASS ' else 'FAIL ' end || 'L1 lot rules (fixed, EOQ, min-max, lot-for-lot, periodic, small, none): ' || st || E'\n';
  st := mfg__bucket('2026-10-10', '2026-11-02', 7, 12) || ',' || mfg__bucket('2026-11-02', '2026-11-02', 7, 12) || ',' || mfg__bucket('2026-11-09', '2026-11-02', 7, 12)
     || ',' || mfg__bucket('2027-01-24', '2026-11-02', 7, 12) || ',' || mfg__bucket('2027-01-25', '2026-11-02', 7, 12);
  res := res || case when st = '0,0,1,11,-1' then 'PASS ' else 'FAIL ' end || 'L2 buckets (late, first day, next week, last day, beyond): ' || st || E'\n';
  res := res || case when not has_function_privilege('authenticated', 'mfg__lot_qty(text, numeric, numeric, numeric, numeric)', 'execute')
                      and not has_function_privilege('anon', 'mfg_run_mrp(int, int, boolean, date)', 'execute')
                      and has_function_privilege('authenticated', 'mfg_run_mrp(int, int, boolean, date)', 'execute') then 'PASS ' else 'FAIL ' end
             || 'L3 helpers are internal; the run is for signed-in users only' || E'\n';

  ---------------------------------------------------------------- set-up: a company, nine items, two bills of materials
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase5a Co', '2026-01-01', 'ACTUAL');
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_stool := mfg_save_item(null, jsonb_build_object('sku','STOOL','name','Stool','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',14));
  i_seat  := mfg_save_item(null, jsonb_build_object('sku','SEAT','name','Seat','item_type','SEMI','make_or_buy','MAKE','base_uom','PC','production_lead_days',5));
  i_leg   := mfg_save_item(null, jsonb_build_object('sku','LEG','name','Leg','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',14,'lot_rule','FIXED','lot_size',100));
  i_glue  := mfg_save_item(null, jsonb_build_object('sku','GLUE','name','Glue','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',7));
  i_foam  := mfg_save_item(null, jsonb_build_object('sku','FOAM','name','Foam','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',7,'lot_rule','MIN_MAX','min_lot',50,'max_lot',100));
  i_bolt  := mfg_save_item(null, jsonb_build_object('sku','BOLT','name','Bolt','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',7,'scrap_pct',20));
  i_sand  := mfg_save_item(null, jsonb_build_object('sku','SAND','name','Sandpaper','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',0,'lot_rule','PERIODIC','lot_size',2));
  i_nail  := mfg_save_item(null, jsonb_build_object('sku','NAIL','name','Nail','item_type','RAW','make_or_buy','BUY','base_uom','PC','procurement_lead_days',3));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2026-01-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_seat, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_leg, 'qty', 4, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_glue, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_seat, 'valid_from', '2026-01-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_foam, 'qty', 2, 'uom', 'PC'), jsonb_build_object('component_item_id', i_bolt, 'qty', 4, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_sand, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  select id into loc_fg from mfg_storage_locations where code = 'FG-STORE';
  select id into loc_rm from mfg_storage_locations where code = 'RM-STORE';
  insert into vendors (tenant_id, name) values (mfg, 'zz Parts Co') returning id into vend;
  insert into customers (tenant_id, name) values (mfg, 'zz Casa Muebles') returning id into cust;
  execute 'reset role';
  insert into mfg_stock (tenant_id, item_id, location_id, qty) values (mfg, i_chair, loc_fg, 10), (mfg, i_nail, loc_rm, 1000);
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  po_leg := mfg_create_po(vend, '2026-10-01', '2026-10-20', jsonb_build_array(jsonb_build_object('item_id', i_leg, 'qty', 50, 'unit_price', 5)));
  po_glue := mfg_create_po(vend, '2026-10-01', '2026-12-20', jsonb_build_array(jsonb_build_object('item_id', i_glue, 'qty', 100, 'unit_price', 2)));
  po_nail := mfg_create_po(vend, '2026-10-01', '2026-11-20', jsonb_build_array(jsonb_build_object('item_id', i_nail, 'qty', 500, 'unit_price', 1)));
  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-10-20', '2026-11-30', 'confirmed', 0, 12, 0) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_chair, 'Chair', 30, 1000);
  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-10-21', '2026-12-10', 'confirmed', 0, 12, 0) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_chair, 'Chair', 5, 1000);
  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-10-22', '2026-11-05', 'confirmed', 0, 12, 0) returning id into so3;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so3, i_stool, 'Stool', 12, 500);
  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, status, total, tax_rate, tax_amount) values (mfg, cust, '2026-10-23', '2026-11-10', 'draft', 0, 12, 0) returning id into so4;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so4, i_chair, 'Chair', 99, 1000);

  perform mfg_save_forecast(i_chair, '2026-12-15', 20);
  select count(*) into c from mfg_forecasts where tenant_id = mfg and item_id = i_chair and period_start = '2026-12-01' and qty = 20;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'F1 a forecast saved for any day in December is stored for the month' || E'\n';
  perform mfg_save_forecast(i_chair, '2027-02-10', 40);
  perform mfg_save_forecast(i_chair, '2027-02-01', 0);
  select count(*) into c from mfg_forecasts where tenant_id = mfg and period_start = '2027-02-01';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'F2 a forecast of zero clears the month' || E'\n';
  begin perform mfg_save_forecast(i_chair, '2027-02-01', -1); res := res || E'FAIL F3 a negative forecast was saved\n';
  exception when others then res := res || E'PASS F3 a negative forecast is refused\n'; end;

  ---------------------------------------------------------------- A. the first run
  run1 := mfg_run_mrp(84, 7, true, '2026-11-02');
  select status || '/' || document_number || '/' || bucket_count || '/' || items_planned || '/' || planned_orders || '/' || requisitions || '/' || exceptions into st from mfg_mrp_runs where id = run1;
  res := res || case when st = 'DONE/MRP-0001/12/9/5/9/5' then 'PASS ' else 'FAIL ' end || 'A1 run finished: ' || st || ' (9 items planned, 5 planned orders, 9 requisitions, 5 exceptions)' || E'\n';

  select string_agg(i.sku || ' ' || trim_scale(p.qty) || ' ' || p.start_date || '>' || p.finish_date || case when p.late_days > 0 then ' late ' || p.late_days else '' end, '; ' order by i.sku, p.start_date) into st
    from mfg_planned_orders p join items i on i.id = p.item_id where p.run_id = run1;
  res := res || case when st = 'CHAIR 35 2026-11-23>2026-11-30; CHAIR 5 2026-11-30>2026-12-07; SEAT 35 2026-11-18>2026-11-23; SEAT 5 2026-11-25>2026-11-30; STOOL 12 2026-11-02>2026-11-16 late 14'
                     then 'PASS ' else 'FAIL ' end || 'A2 planned orders (stock 10 covers the first 10 chairs; each shortage is made a lead time earlier; the stool starts today and is 14 days late): ' || st || E'\n';

  select string_agg(i.sku || ' ' || trim_scale(r.qty) || ' need ' || r.need_date || ' by ' || r.order_by_date, '; ' order by i.sku, r.need_date) into st
    from mfg_purchase_reqs r join items i on i.id = r.item_id where r.run_id = run1;
  res := res || case when st = 'BOLT 175 need 2026-11-16 by 2026-11-09; BOLT 25 need 2026-11-23 by 2026-11-16; FOAM 70 need 2026-11-16 by 2026-11-09; FOAM 50 need 2026-11-23 by 2026-11-16; GLUE 35 need 2026-11-23 by 2026-11-16; GLUE 5 need 2026-11-30 by 2026-11-23; LEG 100 need 2026-11-23 by 2026-11-09; LEG 100 need 2026-11-30 by 2026-11-16; SAND 40 need 2026-11-16 by 2026-11-16'
                     then 'PASS ' else 'FAIL ' end || 'A3 requisitions (bolts grossed up for 20 % scrap, legs in lots of 100 after the 50 on order, foam min 50, sandpaper for two weeks at once): ' || st || E'\n';

  select string_agg(e.kind || ':' || i.sku, ', ' order by i.sku, e.kind) into st from mfg_mrp_exceptions e join items i on i.id = e.item_id where e.run_id = run1;
  res := res || case when st = 'RESCHEDULE_IN:GLUE, PAST_DUE_RECEIPT:LEG, NOT_NEEDED:NAIL, LATE_START:STOOL, NO_ACTIVE_BOM:STOOL' then 'PASS ' else 'FAIL ' end || 'A4 exceptions: ' || st || E'\n';

  select string_agg(d.kind || ' ' || trim_scale(d.qty) || ' ' || d.need_date, '; ' order by d.need_date) into st from mfg_mrp_demand d where d.run_id = run1 and d.item_id = i_chair;
  res := res || case when st = 'SALES_ORDER 30 2026-11-30; FORECAST 15 2026-12-01; SALES_ORDER 5 2026-12-10' then 'PASS ' else 'FAIL ' end
             || 'A5 chair demand (the draft order is ignored; December sales orders use up 5 of the 20 forecast): ' || st || E'\n';

  select string_agg(trim_scale(g.projected_end)::text, ',' order by g.bucket_no) into st from mfg_mrp_grid g where g.run_id = run1 and g.item_id = i_chair;
  res := res || case when st = '10,10,10,10,0,0,0,0,0,0,0,0' then 'PASS ' else 'FAIL ' end || 'A6 chair projected stock by week: ' || st || E'\n';
  select string_agg(g.bucket_no || ':' || trim_scale(g.planned_release) || '/' || trim_scale(g.planned_receipt), ',' order by g.bucket_no) into st
    from mfg_mrp_grid g where g.run_id = run1 and g.item_id = i_chair and (g.planned_release > 0 or g.planned_receipt > 0);
  res := res || case when st = '3:35/0,4:5/35,5:0/5' then 'PASS ' else 'FAIL ' end || 'A7 chair releases and receipts: ' || st || E'\n';

  select string_agg(p.demand_ref || '<-' || p.supply_kind || ' ' || trim_scale(p.qty), '; ' order by p.demand_date, p.supply_date) into st from mfg_pegging p where p.run_id = run1 and p.item_id = i_leg;
  res := res || case when st = 'PLN-0001<-PURCHASE_ORDER 50; PLN-0001<-REQUISITION 90; PLN-0002<-REQUISITION 10; PLN-0002<-REQUISITION 10' then 'PASS ' else 'FAIL ' end
             || 'A8 legs pegged to the planned chair orders (50 from the open purchase order, then the requisitions): ' || st || E'\n';
  select string_agg(p.demand_kind || '<-' || p.supply_kind || ' ' || trim_scale(p.qty), '; ' order by p.demand_date, p.supply_date) into st from mfg_pegging p where p.run_id = run1 and p.item_id = i_chair;
  res := res || case when st = 'SALES_ORDER<-ONHAND 10; SALES_ORDER<-PLANNED_ORDER 20; FORECAST<-PLANNED_ORDER 15; SALES_ORDER<-PLANNED_ORDER 5' then 'PASS ' else 'FAIL ' end
             || 'A9 chair demand pegged to stock first, then to the planned orders: ' || st || E'\n';
  select sum(p.qty) into n from mfg_pegging p where p.run_id = run1 and p.item_id = i_chair;
  res := res || case when n = 50 then 'PASS ' else 'FAIL ' end || 'A10 every chair requirement is covered (50 = 30 + 15 + 5)=' || n || E'\n';

  ---------------------------------------------------------------- B. conversions
  select p.id into pln_chair35 from mfg_planned_orders p where p.run_id = run1 and p.item_id = i_chair and p.qty = 35;
  select p.id into pln_chair5 from mfg_planned_orders p where p.run_id = run1 and p.item_id = i_chair and p.qty = 5;
  ord := mfg_convert_planned_order(pln_chair35, false);
  select o.status || '/' || trim_scale(o.qty_planned) || '/' || o.planned_start || '/' || o.planned_end || '/' || (select count(*) from mfg_prod_components pc where pc.order_id = o.id) into st
    from mfg_production_orders o where o.id = ord;
  res := res || case when st in ('CREATED/35/2026-11-23/2026-11-30/3', 'PENDING_APPROVAL/35/2026-11-23/2026-11-30/3') then 'PASS ' else 'FAIL ' end || 'B1 the planned order became a production order with its 3 components: ' || st || E'\n';
  select status || '/' || (converted_to_id = ord) into st from mfg_planned_orders where id = pln_chair35;
  res := res || case when st = 'CONVERTED/true' then 'PASS ' else 'FAIL ' end || 'B2 the planned order points to the production order: ' || st || E'\n';
  begin perform mfg_convert_planned_order(pln_chair35, false); res := res || E'FAIL B3 a planned order was converted twice\n';
  exception when others then res := res || case when sqlerrm like '%already converted%' then 'PASS ' else 'FAIL ' end || 'B3 converting twice is refused: ' || sqlerrm || E'\n'; end;
  perform mfg_delete_planned_order(pln_chair5);
  begin perform mfg_delete_planned_order(pln_chair5); res := res || E'FAIL B4 a deleted planned order was deleted again\n';
  exception when others then res := res || case when sqlerrm like '%Only an open%' then 'PASS ' else 'FAIL ' end || 'B4 deleted once, not twice: ' || sqlerrm || E'\n'; end;
  begin perform mfg_delete_planned_order(pln_chair35); res := res || E'FAIL B5 a converted planned order was deleted\n';
  exception when others then res := res || E'PASS B5 a converted planned order cannot be deleted\n'; end;

  select r.id into pr_leg1 from mfg_purchase_reqs r where r.run_id = run1 and r.item_id = i_leg and r.need_date = '2026-11-23';
  select r.id into pr_leg2 from mfg_purchase_reqs r where r.run_id = run1 and r.item_id = i_leg and r.need_date = '2026-11-30';
  select r.id into pr_glue5 from mfg_purchase_reqs r where r.run_id = run1 and r.item_id = i_glue and r.qty = 5;
  begin perform mfg_convert_requisitions(vend, jsonb_build_array(jsonb_build_object('req_id', pr_leg1))); res := res || E'FAIL B6 converted without a price\n';
  exception when others then res := res || case when sqlerrm like '%enter the price%' then 'PASS ' else 'FAIL ' end || 'B6 a price is required: ' || sqlerrm || E'\n'; end;
  begin perform mfg_convert_requisitions(vend, jsonb_build_array(jsonb_build_object('req_id', pr_leg1, 'unit_price', 4), jsonb_build_object('req_id', pr_leg1, 'unit_price', 4)));
    res := res || E'FAIL B7 the same requisition twice in one order\n';
  exception when others then res := res || case when sqlerrm like '%listed twice%' then 'PASS ' else 'FAIL ' end || 'B7 the same requisition twice is refused' || E'\n'; end;
  po_new := mfg_convert_requisitions(vend, jsonb_build_array(jsonb_build_object('req_id', pr_leg1, 'unit_price', 4), jsonb_build_object('req_id', pr_leg2, 'unit_price', 4.5)));
  select count(*) || '/' || trim_scale(po.total) || '/' || po.expected_date into st from purchase_orders po join purchase_order_lines l on l.purchase_order_id = po.id where po.id = po_new group by po.total, po.expected_date;
  res := res || case when st = '2/850/2026-11-23' then 'PASS ' else 'FAIL ' end || 'B8 two requisitions became one purchase order (2 lines, 100×4 + 100×4.5, expected on the earliest need date): ' || st || E'\n';
  select count(*) into c from mfg_purchase_reqs where id in (pr_leg1, pr_leg2) and status = 'CONVERTED' and po_id = po_new;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'B9 both requisitions point to the purchase order' || E'\n';
  begin perform mfg_convert_requisitions(vend, jsonb_build_array(jsonb_build_object('req_id', pr_leg1, 'unit_price', 4))); res := res || E'FAIL B10 converted a requisition twice\n';
  exception when others then res := res || case when sqlerrm like '%already converted%' then 'PASS ' else 'FAIL ' end || 'B10 converting a requisition twice is refused' || E'\n'; end;
  perform mfg_delete_requisition(pr_glue5);
  select status into st from mfg_purchase_reqs where id = pr_glue5;
  res := res || case when st = 'DELETED' then 'PASS ' else 'FAIL ' end || 'B11 a requisition can be deleted: ' || st || E'\n';

  pln_fixed := mfg_create_planned_order(i_chair, 8, '2026-12-14', '2026-12-21');
  select source || '/' || firm || '/' || status into st from mfg_planned_orders where id = pln_fixed;
  res := res || case when st = 'MANUAL/true/OPEN' then 'PASS ' else 'FAIL ' end || 'B12 a planned order made by hand is firm: ' || st || E'\n';
  begin perform mfg_create_planned_order(i_leg, 5, '2026-12-14', '2026-12-21'); res := res || E'FAIL B13 a planned order for a bought item\n';
  exception when others then res := res || E'PASS B13 only items you make can have a planned order\n'; end;
  begin perform mfg_create_planned_order(i_chair, 5, '2026-12-14', '2026-12-10'); res := res || E'FAIL B14 finish before start\n';
  exception when others then res := res || E'PASS B14 finish can''t be before start\n'; end;

  ---------------------------------------------------------------- C. the second run replaces what nobody converted
  run2 := mfg_run_mrp(84, 7, true, '2026-11-02');
  select string_agg(status || ':' || cnt, ', ' order by status) into st from (select status, count(*) cnt from mfg_planned_orders where tenant_id = mfg and source = 'MRP' group by status) q;
  res := res || case when st = 'CONVERTED:1, DELETED:4, OPEN:5' then 'PASS ' else 'FAIL ' end || 'C1 planned orders after the second run: ' || st || ' (converted kept, old open ones replaced)' || E'\n';
  select count(*) filter (where status = 'CONVERTED') || '/' || count(*) filter (where status = 'DELETED') into st from mfg_purchase_reqs where tenant_id = mfg and run_id = run1;
  res := res || case when st = '2/7' then 'PASS ' else 'FAIL ' end || 'C2 requisitions of the first run: converted/deleted=' || st || E'\n';
  select count(distinct run_id) || '/' || (select count(*) from mfg_mrp_runs where tenant_id = mfg and status = 'DONE') into st from mfg_mrp_grid where tenant_id = mfg;
  res := res || case when st = '1/2' then 'PASS ' else 'FAIL ' end || 'C3 only the latest run keeps its grid; both runs stay in the list: grids/runs=' || st || E'\n';
  select count(*) into c from mfg_planned_orders where id = pln_fixed and status = 'OPEN' and firm;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'C4 the firm planned order survives a new run' || E'\n';
  select string_agg(i.sku || ' ' || trim_scale(p.qty) || ' ' || p.start_date || '>' || p.finish_date, '; ' order by i.sku, p.start_date) into st
    from mfg_planned_orders p join items i on i.id = p.item_id where p.run_id = run2 and p.status = 'OPEN';
  res := res || case when st = 'CHAIR 5 2026-11-30>2026-12-07; SEAT 35 2026-11-18>2026-11-23; SEAT 5 2026-11-25>2026-11-30; SEAT 8 2026-12-09>2026-12-14; STOOL 12 2026-11-02>2026-11-16' then 'PASS ' else 'FAIL ' end
             || 'C5 the new plan counts the production order (35 chairs) and the firm order (8): ' || st || E'\n';
  select string_agg(d.kind || ' ' || trim_scale(d.qty) || ' ' || d.need_date, '; ' order by d.need_date, d.kind) into st from mfg_mrp_demand d where d.run_id = run2 and d.item_id = i_seat;
  res := res || case when st = 'ORDER_COMPONENT 35 2026-11-23; DEPENDENT 5 2026-11-30; DEPENDENT 8 2026-12-14' then 'PASS ' else 'FAIL ' end || 'C6 seat demand from the open production order, the new plan and the firm order: ' || st || E'\n';
  select string_agg(p.supply_kind || ' ' || trim_scale(p.qty), '; ' order by p.demand_date, p.supply_date) into st from mfg_pegging p where p.run_id = run2 and p.item_id = i_chair;
  res := res || case when st like 'ONHAND 10%PRODUCTION_ORDER 20%' then 'PASS ' else 'FAIL ' end || 'C7 chair demand is now pegged to the production order: ' || st || E'\n';

  ---------------------------------------------------------------- D. limits and who may do what
  begin perform mfg_run_mrp(84, 5, true, '2026-11-02'); res := res || E'FAIL D1 a 5-day bucket was accepted\n';
  exception when others then res := res || E'PASS D1 only 1, 7, 14 or 30-day buckets\n'; end;
  begin perform mfg_run_mrp(3, 7, true, '2026-11-02'); res := res || E'FAIL D2 a 3-day horizon was accepted\n';
  exception when others then res := res || E'PASS D2 the horizon must be at least 7 days\n'; end;
  begin perform mfg_run_mrp(365, 1, true, '2026-11-02'); res := res || E'FAIL D3 365 daily buckets were accepted\n';
  exception when others then res := res || case when sqlerrm like '%buckets%' then 'PASS ' else 'FAIL ' end || 'D3 too many buckets is refused: ' || sqlerrm || E'\n'; end;
  begin insert into mfg_planned_orders (tenant_id, item_id, qty, start_date, finish_date, source) values (mfg, i_chair, 1, '2026-12-01', '2026-12-02', 'MANUAL'); res := res || E'FAIL D4 a student wrote a planned order directly\n';
  exception when others then res := res || E'PASS D4 planned orders can''t be written directly\n'; end;
  begin insert into mfg_pegging (tenant_id, run_id, item_id, demand_kind, supply_kind, qty) values (mfg, run2, i_chair, 'X', 'ONHAND', 1); res := res || E'FAIL D5 a student wrote pegging directly\n';
  exception when others then res := res || case when sqlerrm like '%row-level security%' then 'PASS ' else 'FAIL ' end || 'D5 pegging can''t be written directly: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- S. size: 210 more items over three levels, one run well inside the 8-second limit
  for ii in 1..120 loop
    raws := raws || mfg_save_item(null, jsonb_build_object('sku', 'R' || lpad(ii::text, 3, '0'), 'name', 'Raw ' || ii, 'item_type', 'RAW', 'make_or_buy', 'BUY', 'base_uom', 'PC', 'procurement_lead_days', 7));
  end loop;
  for ii in 1..30 loop
    semis := semis || mfg_save_item(null, jsonb_build_object('sku', 'S' || lpad(ii::text, 2, '0'), 'name', 'Semi ' || ii, 'item_type', 'SEMI', 'make_or_buy', 'MAKE', 'base_uom', 'PC', 'production_lead_days', 3));
    lns := '[]'::jsonb;
    for jj in 0..4 loop lns := lns || jsonb_build_object('component_item_id', raws[((ii * 4 + jj) % 120) + 1], 'qty', 2, 'uom', 'PC'); end loop;
    perform mfg_activate_bom(mfg_save_bom(null, jsonb_build_object('item_id', semis[ii], 'valid_from', '2026-01-01', 'lines', lns)));
  end loop;
  for ii in 1..60 loop
    fin := mfg_save_item(null, jsonb_build_object('sku', 'F' || lpad(ii::text, 2, '0'), 'name', 'Finished ' || ii, 'item_type', 'FINISHED', 'make_or_buy', 'MAKE', 'base_uom', 'PC', 'production_lead_days', 5));
    lns := jsonb_build_array(jsonb_build_object('component_item_id', semis[(ii % 30) + 1], 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', semis[((ii + 7) % 30) + 1], 'qty', 2, 'uom', 'PC'));
    for jj in 0..3 loop lns := lns || jsonb_build_object('component_item_id', raws[((ii * 3 + jj * 5) % 120) + 1], 'qty', 1, 'uom', 'PC'); end loop;
    perform mfg_activate_bom(mfg_save_bom(null, jsonb_build_object('item_id', fin, 'valid_from', '2026-01-01', 'lines', lns)));
    insert into sales_orders (tenant_id, customer_id, order_date, expected_date, status, total, tax_rate, tax_amount)
    values (mfg, cust, '2026-10-20', '2026-11-02'::date + ((ii % 10) * 7), 'confirmed', 0, 12, 0) returning id into so_s;
    insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so_s, fin, 'Finished', 100 + ii, 10);
  end loop;
  t0 := clock_timestamp();
  run3 := mfg_run_mrp(84, 7, true, '2026-11-02');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  select items_planned || ' items, ' || planned_orders || ' planned orders, ' || requisitions || ' requisitions, ' || exceptions || ' exceptions' into st from mfg_mrp_runs where id = run3;
  res := res || case when ms < 4000 then 'PASS ' else 'FAIL ' end || 'S1 a run over about 220 items and three levels took ' || round(ms) || ' ms (' || st || '); the limit for signed-in users is 8000 ms' || E'\n';
  select count(*) into c from mfg_planned_orders where run_id = run3 and status = 'OPEN';
  res := res || case when c >= 90 then 'PASS ' else 'FAIL ' end || 'S2 60 finished goods and 30 sub-assemblies all got planned orders (open planned orders=' || c || E')\n';
  select count(*) into c from mfg_pegging where run_id = run3;
  res := res || case when c > 100 then 'PASS ' else 'FAIL ' end || 'S3 pegging rows written=' || c || E'\n';

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_planned_orders) + (select count(*) from mfg_purchase_reqs) + (select count(*) from mfg_mrp_runs) + (select count(*) from mfg_mrp_grid)
       + (select count(*) from mfg_mrp_demand) + (select count(*) from mfg_mrp_exceptions) + (select count(*) from mfg_pegging) + (select count(*) from mfg_forecasts) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'D6 another company sees none of it (rows=' || c || E')\n';
  begin perform mfg_run_mrp(84, 7, true, '2026-11-02'); res := res || E'FAIL D7 a student of another company ran MRP here\n';
  exception when others then res := res || E'PASS D7 only a Manufacturing company can run MRP\n'; end;
  begin perform mfg_convert_planned_order(pln_fixed, false); res := res || E'FAIL D8 another student converted this company''s planned order\n';
  exception when others then res := res || E'PASS D8 another student cannot convert this company''s planned order\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_planned_orders where tenant_id = mfg;
  res := res || case when c >= 8 then 'PASS ' else 'FAIL ' end || 'D9 the teacher can read the plan (planned orders=' || c || E')\n';
  begin perform mfg_run_mrp(84, 7, true, '2026-11-02'); res := res || E'FAIL D10 the teacher ran MRP for a student\n';
  exception when others then res := res || E'PASS D10 the teacher cannot run the student''s plan\n'; end;

  ---------------------------------------------------------------- E. the teacher deletes the company with all of it
  begin
    perform delete_company(mfg);
    select (select count(*) from tenants where id = mfg) + (select count(*) from mfg_planned_orders where tenant_id = mfg) + (select count(*) from mfg_purchase_reqs where tenant_id = mfg)
         + (select count(*) from mfg_mrp_runs where tenant_id = mfg) + (select count(*) from mfg_mrp_grid where tenant_id = mfg) + (select count(*) from mfg_mrp_demand where tenant_id = mfg)
         + (select count(*) from mfg_mrp_exceptions where tenant_id = mfg) + (select count(*) from mfg_pegging where tenant_id = mfg) + (select count(*) from mfg_forecasts where tenant_id = mfg) into c;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'E1 the teacher deleted the company with its plan (rows left=' || c || E')\n';
  exception when others then res := res || 'FAIL E1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 5a — failures: %\n%', n, res;
end $$;
