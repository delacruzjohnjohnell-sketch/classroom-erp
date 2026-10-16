-- ============================================================
-- Manufacturing ERP — Phase 3 integration test (migrations 0027 + 0028: join list, costing engine).
--
-- Run it AFTER the two migrations, or paste it after them in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id. The Z lines compare a fingerprint of every pre-existing function,
-- column, policy and trigger with the fingerprint taken after Phase 1 — they prove Phases 2 and 3 changed
-- nothing that already existed.
--
-- The main example is the plan's Dining Chair: lumber 3 bd-ft @ 60 + screws 8 @ 1 + varnish 0.2 L @ 250
-- (material 238) + labor 1.5 h @ 80 (120) + machine 0.5 h @ 100 (50) + fixed overhead 40 per labor hour (60) = 468.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; n2 numeric; n3 numeric; st text; h text; je uuid; d date;
  i_lum uuid; i_scr uuid; i_var uuid; i_chair uuid; i_leg uuid; i_stool uuid; i_nail uuid; i_board uuid; i_saw uuid;
  i_bench uuid; i_kit uuid; i_bolt uuid; i_plate uuid; i_buy uuid;
  b uuid; rt uuid; rt2 uuid; wc1 uuid; wc2 uuid; at_setup uuid;
  e1 uuid; e100 uuid; e3 uuid; e4 uuid; e5 uuid; es uuid; es2 uuid; eb uuid; ebe uuid; ea uuid; eb2 uuid; ec uuid; ep uuid;
  lum jsonb; leg jsonb;
  new_fns text[] := array['joinable_companies','create_mfg_company','mfg__my_tenant','mfg_assign_number','mfg_wc_number','mfg_seed_master_data','mfg_convert_qty',
    'mfg_save_item','mfg_delete_item','mfg_set_account','mfg_activity_rate','mfg_reaches','mfg_bom_cycle_guard','mfg_recalc_low_level',
    'mfg_save_bom','mfg_copy_bom','mfg_activate_bom','mfg_obsolete_bom','mfg_delete_bom','mfg_active_bom','mfg__explode','mfg_explode_bom',
    'mfg_where_used','mfg_compare_boms','mfg_save_routing','mfg_copy_routing','mfg_activate_routing','mfg_obsolete_routing',
    'mfg_delete_routing','mfg_routing_load','mfg_wc_available_hours',
    'mfg__cost_warn','mfg__cost_line','mfg__cost_bom','mfg__cost_item','mfg_create_cost_estimate','mfg_release_lines',
    'mfg_mark_cost_estimate','mfg_release_cost_estimate','mfg_moving_average'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops',
    'mfg_cost_estimates','mfg_cost_estimate_lines','mfg_cost_estimate_items'];
begin
  ---------------------------------------------------------------- Z. nothing that existed was changed
  select md5(string_agg(md5(pg_get_functiondef(p.oid)), '' order by p.oid::regprocedure::text)) into h
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> all(new_fns);
  res := res || case when h = '380f461235f530dc097fb7c054daaca9' then 'PASS ' else 'FAIL ' end || 'Z1 existing functions unchanged (' || h || E')\n';
  select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, column_name)) into h
    from information_schema.columns where table_schema = 'public' and table_name <> all(new_tabs);
  res := res || case when h = 'e196786d70dc1f528bbb391b54f3c9fc' then 'PASS ' else 'FAIL ' end || 'Z2 existing columns unchanged (' || h || E')\n';
  select md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)) into h
    from pg_policies where schemaname = 'public' and tablename <> all(new_tabs);
  res := res || case when h = '568551cc4cc49b77c48fb07ce4591d61' then 'PASS ' else 'FAIL ' end || 'Z3 existing policies unchanged (' || h || E')\n';
  select md5(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, tgname)) into h
    from pg_trigger t where not tgisinternal and t.tgrelid::regclass::text !~ '^(auth|storage|realtime)\.' and t.tgrelid::regclass::text <> all(new_tabs);
  res := res || case when h = 'b30ea21aa09288d3f1e6a25e86219c3a' then 'PASS ' else 'FAIL ' end || 'Z4 existing triggers unchanged (' || h || E')\n';

  ---------------------------------------------------------------- set-up
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase3 Co', '2026-01-01', 'STANDARD');

  select string_agg(kind || '=' || hour_basis, ', ' order by kind) into st from mfg_costing_sheet;
  res := res || case when st = 'FIXED=LABOR, VARIABLE=MACHINE' then 'PASS ' else 'FAIL ' end || 'A1 costing sheet hour bases seeded: ' || st || E'\n';

  ---------------------------------------------------------------- B. items with planned prices
  i_lum := mfg_save_item(null, jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',60));
  i_scr := mfg_save_item(null, jsonb_build_object('sku','SCR','name','Screw','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1));
  i_var := mfg_save_item(null, jsonb_build_object('sku','VAR','name','Varnish','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',250));
  i_nail := mfg_save_item(null, jsonb_build_object('sku','NAIL','name','Nail','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',50,'price_unit',100));
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Dining chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  select planned_price || '/' || price_unit into st from mfg_item_master where item_id = i_nail;
  res := res || case when st = '50.000000/100' then 'PASS ' else 'FAIL ' end || 'B1 price per 100 saved=' || st || E'\n';
  begin perform mfg_save_item(null, jsonb_build_object('sku','X1','name','Bad unit','item_type','RAW','make_or_buy','BUY','base_uom','PC','price_unit',0));
    res := res || E'FAIL B2 price unit 0 accepted\n';
  exception when others then res := res || case when sqlerrm like '%price unit%' then 'PASS ' else 'FAIL ' end || 'B2 price unit must be 1 or more: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_item(null, jsonb_build_object('sku','X2','name','Neg','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',-1));
    res := res || E'FAIL B3 negative price accepted\n';
  exception when others then res := res || case when sqlerrm like '%planned price%' then 'PASS ' else 'FAIL ' end || 'B3 negative price refused: ' || sqlerrm || E'\n'; end;
  update mfg_item_master set standard_cost = 99 where item_id = i_lum;
  select standard_cost into n from mfg_item_master where item_id = i_lum;
  res := res || case when n = 0 then 'PASS ' else 'FAIL ' end || 'B4 a student cannot write a standard cost directly (still ' || n || E')\n';

  ---------------------------------------------------------------- C. the Dining Chair = 468
  insert into mfg_work_centers (tenant_id, name) values (mfg, 'Chair line') returning id into wc1;
  insert into mfg_work_centers (tenant_id, name) values (mfg, 'Unpriced bench') returning id into wc2;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select mfg, wc1, id, '2026-10-01'::date, case kind when 'LABOR' then 80 when 'MACHINE' then 100 else 0 end from mfg_activity_types where kind in ('LABOR','MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 40 where kind = 'FIXED';

  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lum, 'qty', 3, 'uom', 'BF'),
    jsonb_build_object('component_item_id', i_scr, 'qty', 8, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_var, 'qty', 0.2, 'uom', 'L'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Build', 'work_center_id', wc1, 'run_min_per_unit', 90, 'labor_min_per_unit', 90, 'machine_min_per_unit', 30))));
  perform mfg_activate_routing(rt);

  e1 := mfg_create_cost_estimate(i_chair, 1, '2026-11-15');
  select unit_cost, total_cost into n, n2 from mfg_cost_estimates where id = e1;
  res := res || case when n = 468 and n2 = 468 then 'PASS ' else 'FAIL ' end || 'C1 Dining Chair unit cost=' || n || ', total=' || n2 || E' (expect 468)\n';
  select string_agg(element || '=' || round(s, 2), ', ' order by element) into st
    from (select element, sum(amount) s from mfg_cost_estimate_lines where estimate_id = e1 group by element) x;
  res := res || case when st = 'FIX_OH=60.00, LABOR=120.00, MACHINE=50.00, MATERIAL=238.00' then 'PASS ' else 'FAIL ' end || 'C2 by element: ' || st || E'\n';
  select count(*) into c from mfg_cost_estimate_lines where estimate_id = e1;
  res := res || case when c = 6 then 'PASS ' else 'FAIL ' end || 'C3 lines=' || c || E' (3 materials, labor, machine, fixed overhead)\n';
  select document_number || '/' || status || '/' || jsonb_array_length(warnings) into st from mfg_cost_estimates where id = e1;
  res := res || case when st = 'CE-0001/DRAFT/0' then 'PASS ' else 'FAIL ' end || 'C4 header: ' || st || E'\n';
  e100 := mfg_create_cost_estimate(i_chair, 100, '2026-11-15');
  select unit_cost, total_cost into n, n2 from mfg_cost_estimates where id = e100;
  res := res || case when n = 468 and n2 = 46800 then 'PASS ' else 'FAIL ' end || 'C5 order of 100: unit ' || n || ', total ' || n2 || E' (expect 468 and 46,800)\n';
  begin perform mfg_create_cost_estimate(i_chair, 0, '2026-11-15'); res := res || E'FAIL C6 lot size 0 accepted\n';
  exception when others then res := res || case when sqlerrm like '%lot size%' then 'PASS ' else 'FAIL ' end || 'C6 lot size must be above zero: ' || sqlerrm || E'\n'; end;
  begin perform mfg_create_cost_estimate(i_lum, 1, '2026-11-15'); res := res || E'FAIL C7 bought item costed\n';
  exception when others then res := res || case when sqlerrm like '%Make%' then 'PASS ' else 'FAIL ' end || 'C7 only made items are costed: ' || sqlerrm || E'\n'; end;
  begin perform mfg_create_cost_estimate(i_chair, 1, '2026-10-01'); res := res || E'FAIL C8 estimate without an active BOM accepted\n';
  exception when others then res := res || case when sqlerrm like '%no active bill of materials%' then 'PASS ' else 'FAIL ' end || 'C8 no BOM in force: ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_cost_estimates;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'C9 refused estimates left nothing behind (estimates=' || c || E')\n';
  begin insert into mfg_cost_estimates (tenant_id, item_id, lot_size, costing_date, costing_method) values (mfg, i_chair, 1, '2026-11-15', 'STANDARD');
    res := res || E'FAIL C10 direct insert into estimates accepted\n';
  exception when others then res := res || E'PASS C10 direct write to estimates blocked\n'; end;

  ---------------------------------------------------------------- F. multi-level: stool = 3 legs + nails, yield loss on the leg
  i_leg := mfg_save_item(null, jsonb_build_object('sku','LEG','name','Stool leg','item_type','SEMI','make_or_buy','MAKE','base_uom','PC'));
  i_stool := mfg_save_item(null, jsonb_build_object('sku','STOOL','name','Stool','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_lum, 'qty', 1, 'uom', 'BF'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_stool, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 3, 'uom', 'PC'), jsonb_build_object('component_item_id', i_nail, 'qty', 4, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  perform mfg_activate_routing(mfg_save_routing(null, jsonb_build_object('item_id', i_leg, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'work_center_id', wc1, 'run_min_per_unit', 6)))));            -- labor defaults to the run time
  perform mfg_activate_routing(mfg_save_routing(null, jsonb_build_object('item_id', i_stool, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'work_center_id', wc1, 'run_min_per_unit', 15, 'labor_min_per_unit', 15, 'machine_min_per_unit', 0)))));
  es := mfg_create_cost_estimate(i_stool, 1, '2026-12-05');
  select unit_cost into n from mfg_cost_estimates where id = es;
  res := res || case when n = 248 then 'PASS ' else 'FAIL ' end || 'F1 stool unit cost=' || n || E' (expect 248 = 3 legs × 72 + nails 2 + labor 20 + overhead 10)\n';
  select unit_cost, qty into n, n2 from mfg_cost_estimate_items where estimate_id = es and item_id = i_leg;
  res := res || case when n = 72 and n2 = 3 then 'PASS ' else 'FAIL ' end || 'F2 leg costed on its own: unit ' || n || ' for ' || n2 || E' (expect 72 for 3)\n';
  es := mfg_create_cost_estimate(i_stool, 10, '2026-12-05');
  select total_cost, unit_cost into n, n2 from mfg_cost_estimates where id = es;
  res := res || case when n = 2480 and n2 = 248 then 'PASS ' else 'FAIL ' end || 'F3 ten stools: total ' || n || ', unit ' || n2 || E' (expect 2,480 and 248)\n';
  select count(*) into c from mfg_cost_estimate_lines where estimate_id = es;
  select count(*) into h from mfg_cost_estimate_lines where estimate_id = es and level = 1 and item_id = i_leg;
  res := res || case when c = 6 and h::int = 3 then 'PASS ' else 'FAIL ' end || 'F4 lines=' || c || ' (3 at the stool level, ' || h || E' at the leg level)\n';
  select amount into n from mfg_cost_estimate_lines where estimate_id = es and component_item_id = i_nail;
  res := res || case when n = 20 then 'PASS ' else 'FAIL ' end || 'F5 40 nails priced per 100: ' || n || E' (expect 20)\n';
  lum := jsonb_build_object('sku','LEG','name','Stool leg','item_type','SEMI','make_or_buy','MAKE','base_uom','PC');
  perform mfg_save_item(i_leg, lum || jsonb_build_object('scrap_pct', 20));
  es2 := mfg_create_cost_estimate(i_stool, 1, '2026-12-05');
  select unit_cost into n from mfg_cost_estimates where id = es2;
  select unit_cost, qty into n2, n3 from mfg_cost_estimate_items where estimate_id = es2 and item_id = i_leg;
  res := res || case when n = 302 and n2 = 90 and n3 = 3 then 'PASS ' else 'FAIL ' end || 'F6 20 percent leg yield loss: stool ' || n || ', leg ' || n2 || E' (expect 302 and 90)\n';
  perform mfg_save_item(i_leg, lum || jsonb_build_object('scrap_pct', 0));

  ---------------------------------------------------------------- G. co-products, phantoms, warnings
  i_board := mfg_save_item(null, jsonb_build_object('sku','BOARD','name','Board','item_type','SEMI','make_or_buy','MAKE','base_uom','PC'));
  i_saw := mfg_save_item(null, jsonb_build_object('sku','SAW','name','Sawdust','item_type','RAW','make_or_buy','BUY','base_uom','KG'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_board, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lum, 'qty', 10, 'uom', 'BF'),
    jsonb_build_object('component_item_id', i_saw, 'qty', 5, 'uom', 'KG', 'kind', 'BYPRODUCT', 'cost_share_pct', 10))));
  perform mfg_activate_bom(b);
  eb := mfg_create_cost_estimate(i_board, 1, '2026-11-15');
  select total_cost, main_share_pct, unit_cost into n, n2, n3 from mfg_cost_estimates where id = eb;
  res := res || case when n = 600 and n2 = 90 and n3 = 540 then 'PASS ' else 'FAIL ' end || 'G1 co-product split: total ' || n || ', main share ' || n2 || ', board unit ' || n3 || E' (expect 600, 90, 540)\n';
  select unit_cost, qty into n, n2 from mfg_cost_estimate_items where estimate_id = eb and item_id = i_saw;
  res := res || case when n = 12 and n2 = 5 then 'PASS ' else 'FAIL ' end || 'G2 by-product carries 60 over 5 KG=' || n || E' each (expect 12)\n';
  select string_agg(w, ' | ') into st from mfg_cost_estimates e, jsonb_array_elements_text(e.warnings) w where e.id = eb;
  res := res || case when st like '%Board%no active routing%' then 'PASS ' else 'FAIL ' end || 'G3 missing routing is warned about: ' || st || E'\n';
  begin perform mfg_mark_cost_estimate(eb); res := res || E'FAIL G4 an estimate with warnings was marked\n';
  exception when others then res := res || case when sqlerrm like '%Fix the warnings%' then 'PASS ' else 'FAIL ' end || 'G4 warnings block marking: ' || sqlerrm || E'\n'; end;

  i_bench := mfg_save_item(null, jsonb_build_object('sku','BENCH','name','Bench','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  i_kit := mfg_save_item(null, jsonb_build_object('sku','KIT','name','Nail kit','item_type','SEMI','make_or_buy','MAKE','base_uom','PC'));
  i_bolt := mfg_save_item(null, jsonb_build_object('sku','BOLT','name','Bolt','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_kit, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_nail, 'qty', 8, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_bench, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 2, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_kit, 'qty', 1, 'uom', 'PC', 'is_phantom', true),
    jsonb_build_object('component_item_id', i_bolt, 'qty', 2, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  ebe := mfg_create_cost_estimate(i_bench, 1, '2026-12-05');
  select unit_cost into n from mfg_cost_estimates where id = ebe;
  res := res || case when n = 148 then 'PASS ' else 'FAIL ' end || 'G5 bench through a phantom kit=' || n || E' (expect 148 = 2 legs × 72 + 8 nails × 0.50)\n';
  select count(*) into c from mfg_cost_estimate_items where estimate_id = ebe and item_id = i_kit;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G6 the phantom has no cost of its own (rows=' || c || E')\n';
  select string_agg(w, ' | ') into st from mfg_cost_estimates e, jsonb_array_elements_text(e.warnings) w where e.id = ebe;
  res := res || case when st like '%Bolt%no planned price%' then 'PASS ' else 'FAIL ' end || 'G7 missing price is warned about: ' || st || E'\n';

  i_plate := mfg_save_item(null, jsonb_build_object('sku','PLATE','name','Plate','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC'));
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_plate, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_lum, 'qty', 1, 'uom', 'BF'))));
  perform mfg_activate_bom(b);
  perform mfg_activate_routing(mfg_save_routing(null, jsonb_build_object('item_id', i_plate, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'work_center_id', wc2, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30)))));
  ep := mfg_create_cost_estimate(i_plate, 1, '2026-12-05');
  select string_agg(w, ' | ') into st from mfg_cost_estimates e, jsonb_array_elements_text(e.warnings) w where e.id = ep;
  res := res || case when st like '%Unpriced bench%no planned labor rate%' and st like '%Unpriced bench%no planned machine rate%' then 'PASS ' else 'FAIL ' end || 'G8 missing activity rates are warned about: ' || st || E'\n';
  select unit_cost into n from mfg_cost_estimates where id = ep;
  res := res || case when n = 80 then 'PASS ' else 'FAIL ' end || 'G9 unpriced work adds no labor or machine cost, only the 0.5 h of overhead: ' || n || E' (expect 80 = lumber 60 + overhead 20)\n';

  ---------------------------------------------------------------- E. mark and release, with revaluation of stock on hand
  perform mfg_mark_cost_estimate(e1);
  select status into st from mfg_cost_estimates where id = e1;
  select future_cost into n from mfg_item_master where item_id = i_chair;
  select future_cost into n2 from mfg_item_master where item_id = i_lum;
  res := res || case when st = 'MARKED' and n = 468 and n2 = 60 then 'PASS ' else 'FAIL ' end || 'E1 marked: ' || st || ', future chair cost ' || n || ', future lumber cost ' || n2 || E'\n';
  begin perform mfg_release_cost_estimate(e100); res := res || E'FAIL E2 an unmarked estimate was released\n';
  exception when others then res := res || case when sqlerrm like '%Only a marked%' then 'PASS ' else 'FAIL ' end || 'E2 must be marked first: ' || sqlerrm || E'\n'; end;
  je := mfg_release_cost_estimate(e1, '2026-11-15');
  select standard_cost, cost_version into n, c from mfg_item_master where item_id = i_chair;
  select standard_cost into n2 from mfg_item_master where item_id = i_lum;
  select unit_cost into n3 from items where id = i_chair;
  res := res || case when n = 468 and c = 1 and n2 = 60 and n3 = 468 and je is null then 'PASS ' else 'FAIL ' end
    || 'E3 released with no stock: chair standard ' || n || ' (version ' || c || '), lumber ' || n2 || ', Standard-side cost ' || n3 || E', no journal entry\n';
  select status into st from mfg_cost_estimates where id = e1;
  res := res || case when st = 'RELEASED' then 'PASS ' else 'FAIL ' end || 'E4 estimate is ' || st || E'\n';
  begin perform mfg_release_cost_estimate(e1); res := res || E'FAIL E5 released twice\n';
  exception when others then res := res || case when sqlerrm like '%Only a marked%' then 'PASS ' else 'FAIL ' end || 'E5 a second release is refused: ' || sqlerrm || E'\n'; end;

  -- stock arrives, then the lumber price rises to 62
  update items set qty_on_hand = 400 where id = i_lum;
  update items set qty_on_hand = 10 where id = i_chair;
  select jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF') into lum;
  perform mfg_save_item(i_lum, lum || jsonb_build_object('planned_price', 62));
  e3 := mfg_create_cost_estimate(i_chair, 1, '2026-11-20');
  select unit_cost into n from mfg_cost_estimates where id = e3;
  res := res || case when n = 474 then 'PASS ' else 'FAIL ' end || 'E6 chair costs ' || n || E' after lumber rises to 62 (expect 474)\n';
  select count(*), coalesce(sum(value_change), 0) into c, n from mfg_release_lines(e3) where value_change <> 0;
  res := res || case when c = 2 and n = 860 then 'PASS ' else 'FAIL ' end || 'E7 preview shows ' || c || ' items revalued by ' || n || E' (expect 2 and 860: lumber 400 × 2, chairs 10 × 6)\n';
  perform mfg_mark_cost_estimate(e3);
  je := mfg_release_cost_estimate(e3, '2026-11-20');
  select string_agg(a.code || ' Dr ' || round(jl.debit, 2) || ' Cr ' || round(jl.credit, 2), '; ' order by a.code) into st
    from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = je;
  res := res || case when st = '1200 Dr 800.00 Cr 0.00; 1220 Dr 60.00 Cr 0.00; 5580 Dr 0.00 Cr 860.00' then 'PASS ' else 'FAIL ' end || 'E8 revaluation entry: ' || st || E'\n';
  select sum(debit) - sum(credit) into n from journal_lines where journal_entry_id = je;
  select entry_date::text || '/' || source_table into st from journal_entries where id = je;
  res := res || case when n = 0 and st = '2026-11-20/mfg_cost_estimates' then 'PASS ' else 'FAIL ' end || 'E9 the entry balances (' || n || ') and is dated and sourced: ' || st || E'\n';
  select standard_cost, previous_standard_cost, cost_version into n, n2, c from mfg_item_master where item_id = i_lum;
  select standard_cost into n3 from mfg_item_master where item_id = i_chair;
  res := res || case when n = 62 and n2 = 60 and c = 2 and n3 = 474 then 'PASS ' else 'FAIL ' end || 'E10 lumber ' || n2 || ' → ' || n || ' (version ' || c || '), chair ' || n3 || E'\n';
  select status into st from mfg_cost_estimates where id = e1;
  res := res || case when st = 'SUPERSEDED' then 'PASS ' else 'FAIL ' end || 'E11 the older released estimate is now ' || st || E'\n';
  select count(*) into c from mfg_audit_log where tenant_id = mfg and event = 'cost_estimate_released';
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'E12 both releases are in the audit log=' || c || E'\n';

  -- a locked period stops the release completely
  perform mfg_save_item(i_lum, lum || jsonb_build_object('planned_price', 64));
  e4 := mfg_create_cost_estimate(i_chair, 1, '2026-11-25');
  perform mfg_mark_cost_estimate(e4);
  update tenants set books_locked_through = '2026-11-30' where id = mfg;
  begin perform mfg_release_cost_estimate(e4, '2026-11-25'); res := res || E'FAIL E13 released into a locked period\n';
  exception when others then res := res || 'PASS E13 locked period refuses the release: ' || sqlerrm || E'\n'; end;
  select standard_cost into n from mfg_item_master where item_id = i_lum;
  select status into st from mfg_cost_estimates where id = e4;
  res := res || case when n = 62 and st = 'MARKED' then 'PASS ' else 'FAIL ' end || 'E14 the refused release changed nothing: lumber ' || n || ', estimate ' || st || E'\n';
  update tenants set books_locked_through = null where id = mfg;
  je := mfg_release_cost_estimate(e4, '2026-11-25');
  select standard_cost into n from mfg_item_master where item_id = i_lum;
  select standard_cost into n2 from mfg_item_master where item_id = i_chair;
  select sum(debit) into n3 from journal_lines where journal_entry_id = je;
  res := res || case when n = 64 and n2 = 480 and n3 = 860 then 'PASS ' else 'FAIL ' end || 'E15 released once unlocked: lumber ' || n || ', chair ' || n2 || ', revalued ' || n3 || E'\n';

  -- under actual costing an estimate is for planning only
  execute 'reset role';
  update mfg_company_settings set costing_method = 'ACTUAL' where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  e5 := mfg_create_cost_estimate(i_chair, 1, '2026-12-05');
  select costing_method into st from mfg_cost_estimates where id = e5;
  begin perform mfg_mark_cost_estimate(e5); res := res || E'FAIL E16 an actual-costing estimate was marked\n';
  exception when others then res := res || case when st = 'ACTUAL' and sqlerrm like '%actual costing%' then 'PASS ' else 'FAIL ' end || 'E16 actual costing: estimates are planning only: ' || sqlerrm || E'\n'; end;
  execute 'reset role';
  update mfg_company_settings set costing_method = 'STANDARD' where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  ---------------------------------------------------------------- D. setup is spread over the lot
  ea := mfg_create_cost_estimate(i_chair, 100, '2026-12-05');
  select unit_cost into n from mfg_cost_estimates where id = ea;
  rt2 := mfg_copy_routing(rt);
  perform mfg_save_routing(rt2, jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Build', 'work_center_id', wc1, 'setup_min', 60, 'run_min_per_unit', 90, 'labor_min_per_unit', 90, 'machine_min_per_unit', 30))));
  perform mfg_activate_routing(rt2);
  eb2 := mfg_create_cost_estimate(i_chair, 100, '2026-12-05');
  select unit_cost into n2 from mfg_cost_estimates where id = eb2;
  res := res || case when n2 - n = 1.2 then 'PASS ' else 'FAIL ' end || 'D1 a 60-minute setup adds ' || (n2 - n) || E' per chair on a lot of 100 (expect 1.20: 1 h × 80 + 1 h × 40 overhead ÷ 100)\n';
  ec := mfg_create_cost_estimate(i_chair, 1, '2026-12-05');
  select unit_cost into n3 from mfg_cost_estimates where id = ec;
  res := res || case when n3 - n = 120 then 'PASS ' else 'FAIL ' end || 'D2 the same setup on a lot of 1 adds ' || (n3 - n) || E' (expect 120)\n';
  select rate into n from mfg_cost_estimate_lines where estimate_id = eb2 and description like '%setup%';
  res := res || case when n = 80 then 'PASS ' else 'FAIL ' end || 'D3 with no setup rate, setup is charged at the labor rate=' || n || E'\n';
  select id into at_setup from mfg_activity_types where kind = 'SETUP';
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate) values (mfg, wc1, at_setup, '2026-10-01', 60);
  ec := mfg_create_cost_estimate(i_chair, 100, '2026-12-05');
  select unit_cost into n3 from mfg_cost_estimates where id = ec;
  res := res || case when n2 - n3 = 0.2 then 'PASS ' else 'FAIL ' end || 'D4 a SETUP rate of 60 lowers it by ' || (n2 - n3) || E' (expect 0.20)\n';

  ---------------------------------------------------------------- H. moving average (actual costing)
  res := res || case when mfg_moving_average(100, 60, 200, 65) = 63.333333 then 'PASS ' else 'FAIL ' end || 'H1 100 @ 60 + 200 @ 65 = ' || mfg_moving_average(100, 60, 200, 65) || E' (expect 63.333333)\n';
  res := res || case when mfg_moving_average(0, 0, 10, 5) = 5 and mfg_moving_average(-5, 99, 10, 7) = 7 then 'PASS ' else 'FAIL ' end || E'H2 empty or negative stock takes the new cost\n';
  res := res || case when mfg_moving_average(10, 5, 0, 0) = 5 then 'PASS ' else 'FAIL ' end || E'H3 nothing received leaves the average alone\n';

  ---------------------------------------------------------------- I. other students, the teacher, direct writes
  update mfg_cost_estimates set unit_cost = 1 where id = e3;
  select unit_cost into n from mfg_cost_estimates where id = e3;
  res := res || case when n = 474 then 'PASS ' else 'FAIL ' end || 'I1 a student cannot rewrite an estimate (still ' || n || E')\n';
  begin insert into mfg_cost_estimate_lines (tenant_id, estimate_id, seq, level, element, amount) values (mfg, e3, 99, 0, 'MATERIAL', 1);
    res := res || E'FAIL I2 direct insert of an estimate line accepted\n';
  exception when others then res := res || E'PASS I2 direct write to estimate lines blocked\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_cost_estimates) + (select count(*) from mfg_cost_estimate_lines) + (select count(*) from mfg_cost_estimate_items) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'I3 another student sees no estimates=' || c || E'\n';
  begin perform mfg_create_cost_estimate(i_chair, 1, '2026-11-15'); res := res || E'FAIL I4 a Standard-company student created an estimate\n';
  exception when others then res := res || 'PASS I4 Standard company cannot cost: ' || sqlerrm || E'\n'; end;
  begin perform mfg_release_cost_estimate(e5); res := res || E'FAIL I5 another student released an estimate\n';
  exception when others then res := res || E'PASS I5 another student cannot release\n'; end;

  -- the join list
  select count(*) into c from joinable_companies() where id = mfg;
  select count(*) into n from joinable_companies() where id = t1;
  res := res || case when c = 0 and n = 1 then 'PASS ' else 'FAIL ' end || 'J1 join list hides the Manufacturing company (' || c || ') and keeps Standard ones (' || n || E')\n';

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_cost_estimates where tenant_id = mfg;
  res := res || case when c >= 8 then 'PASS ' else 'FAIL ' end || 'I6 the teacher can read the student''s estimates=' || c || E'\n';
  begin perform mfg_create_cost_estimate(i_chair, 1, '2026-11-15'); res := res || E'FAIL I7 the teacher created an estimate\n';
  exception when others then res := res || 'PASS I7 the teacher cannot create estimates: ' || sqlerrm || E'\n'; end;
  select count(*) into c from joinable_companies() where id = mfg;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || E'J2 the teacher''s join list hides it too\n';

  execute 'reset role';
  select count(*) into c from pg_proc where proname = 'joinable_companies' and has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J3 not-signed-in users cannot call the join list=' || c || E'\n';
  select count(*) into c from pg_proc where proname in ('mfg_create_cost_estimate','mfg_release_cost_estimate','mfg_mark_cost_estimate') and has_function_privilege('anon', oid, 'execute');
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J4 not-signed-in users cannot run the costing functions=' || c || E'\n';

  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 3 — failures: %\n%', n, res;
end $$;
