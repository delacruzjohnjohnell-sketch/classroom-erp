-- ============================================================
-- Manufacturing ERP — Phase 2 integration test (migrations 0025 + 0026: master data, BOMs, routings,
-- account determination editing).
--
-- Run it AFTER the two migrations, or paste it after them in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- Set s1/t1 to a student and their Standard company, s2 to a second student in a DIFFERENT company,
-- teach to the teacher's profile id. The Z lines compare a fingerprint of every pre-existing function,
-- column, policy and trigger with the fingerprint taken after Phase 1 — they prove Phase 2 changed nothing
-- that already existed.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; n numeric; n2 numeric; st text; d date; h text; ok boolean;
  i_chair uuid; i_seat uuid; i_leg uuid; i_kit uuid; i_lumber uuid; i_screw uuid; i_varnish uuid; i_saw uuid; i_spare uuid;
  b_kit uuid; b_leg uuid; b_seat uuid; b_chair1 uuid; b_chair2 uuid; b_chair3 uuid; b_tmp uuid;
  wc1 uuid; wc2 uuid; wc3 uuid; at_labor uuid; r1 uuid; r2 uuid; a_opex uuid; a_pack uuid; a_wip uuid; a_cash_std uuid;
  new_fns text[] := array['create_mfg_company','mfg__my_tenant','mfg_assign_number','mfg_wc_number','mfg_seed_master_data','mfg_convert_qty',
    'mfg_save_item','mfg_delete_item','mfg_set_account','mfg_activity_rate','mfg_reaches','mfg_bom_cycle_guard','mfg_recalc_low_level',
    'mfg_save_bom','mfg_copy_bom','mfg_activate_bom','mfg_obsolete_bom','mfg_delete_bom','mfg_active_bom','mfg__explode','mfg_explode_bom',
    'mfg_where_used','mfg_compare_boms','mfg_save_routing','mfg_copy_routing','mfg_activate_routing','mfg_obsolete_routing',
    'mfg_delete_routing','mfg_routing_load','mfg_wc_available_hours'];
  new_tabs text[] := array['mfg_uom','mfg_uom_conversions','mfg_storage_locations','mfg_item_master','mfg_cost_centers','mfg_work_centers',
    'mfg_holidays','mfg_activity_types','mfg_activity_rates','mfg_costing_sheet','mfg_boms','mfg_bom_items','mfg_routings','mfg_routing_ops'];
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

  ---------------------------------------------------------------- set-up: edition open, student company
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase2 Co', '2026-01-01', 'STANDARD');

  ---------------------------------------------------------------- A. a new company starts with sensible master data
  select count(*) into c from mfg_uom;
  res := res || case when c = 14 then 'PASS ' else 'FAIL ' end || 'A1 units of measure seeded=' || c || E' (expect 14)\n';
  select count(*) into c from mfg_storage_locations;
  res := res || case when c = 4 then 'PASS ' else 'FAIL ' end || 'A2 storage locations=' || c || E' (expect 4)\n';
  select count(*) into c from mfg_activity_types;
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'A3 activity types=' || c || E' (expect 3)\n';
  select count(*) into c from mfg_cost_centers;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'A4 cost centers=' || c || E' (expect 1)\n';
  select count(*) into c from mfg_costing_sheet;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'A5 costing sheet rows=' || c || E' (expect 2)\n';
  select count(*) into c from accounts;
  res := res || case when c = 41 then 'PASS ' else 'FAIL ' end || 'A6 chart of accounts still has 41 accounts=' || c || E'\n';

  ---------------------------------------------------------------- B. items
  i_lumber := mfg_save_item(null, jsonb_build_object('sku','LUM','name','Lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF','procurement_lead_days',5));
  i_screw := mfg_save_item(null, jsonb_build_object('sku','SCR','name','Screw','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
  i_varnish := mfg_save_item(null, jsonb_build_object('sku','VAR','name','Varnish','item_type','RAW','make_or_buy','BUY','base_uom','L'));
  i_saw := mfg_save_item(null, jsonb_build_object('sku','SAW','name','Sawdust','item_type','RAW','make_or_buy','BUY','base_uom','KG'));
  i_leg := mfg_save_item(null, jsonb_build_object('sku','LEG','name','Chair leg','item_type','SEMI','make_or_buy','MAKE','base_uom','PC','production_lead_days',1));
  i_seat := mfg_save_item(null, jsonb_build_object('sku','SEAT','name','Chair seat','item_type','SEMI','make_or_buy','MAKE','base_uom','PC'));
  i_kit := mfg_save_item(null, jsonb_build_object('sku','KIT','name','Fastener kit','item_type','SEMI','make_or_buy','MAKE','base_uom','PC'));
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR','name','Dining chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC',
                           'lot_rule','FIXED','lot_size',50,'safety_stock',10,'batch_tracked',true));
  select count(*) into c from mfg_item_master;
  res := res || case when c = 8 then 'PASS ' else 'FAIL ' end || 'B1 item master rows=' || c || E' (expect 8)\n';
  select count(*) into c from items where qty_on_hand = 0 and unit_cost = 0;
  res := res || case when c = 8 then 'PASS ' else 'FAIL ' end || 'B2 the Standard items rows start with no stock and no cost=' || c || E'\n';
  select lot_rule || '/' || lot_size || '/' || batch_tracked into st from mfg_item_master where item_id = i_chair;
  res := res || case when st = 'FIXED/50.0000/true' then 'PASS ' else 'FAIL ' end || 'B3 lot rule saved=' || st || E'\n';
  begin perform mfg_save_item(null, jsonb_build_object('sku','lum','name','Another','item_type','RAW','make_or_buy','BUY','base_uom','BF'));
    res := res || E'FAIL B4 duplicate SKU accepted\n';
  exception when others then res := res || case when sqlerrm like '%already exists%' then 'PASS ' else 'FAIL ' end || 'B4 duplicate SKU refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_item(null, jsonb_build_object('sku','X1','name','Bad lot','item_type','RAW','make_or_buy','BUY','base_uom','PC','lot_rule','FIXED','lot_size',0));
    res := res || E'FAIL B5 fixed lot with size 0 accepted\n';
  exception when others then res := res || case when sqlerrm like '%lot size%' then 'PASS ' else 'FAIL ' end || 'B5 fixed lot needs a size: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_item(null, jsonb_build_object('sku','X2','name','Bad unit','item_type','RAW','make_or_buy','BUY','base_uom','NOPE'));
    res := res || E'FAIL B6 unknown unit accepted\n';
  exception when others then res := res || case when sqlerrm like '%unit of measure%' then 'PASS ' else 'FAIL ' end || 'B6 unknown unit refused: ' || sqlerrm || E'\n'; end;
  perform mfg_save_item(i_saw, jsonb_build_object('sku','SAW','name','Saw dust','item_type','RAW','make_or_buy','BUY','base_uom','KG'));
  select name into st from items where id = i_saw;
  res := res || case when st = 'Saw dust' then 'PASS ' else 'FAIL ' end || 'B7 item renamed=' || st || E'\n';
  begin insert into mfg_item_master (item_id, tenant_id, item_type, make_or_buy, base_uom) values (gen_random_uuid(), mfg, 'RAW', 'BUY', 'PC');
    res := res || E'FAIL B8 direct insert into the item master accepted\n';
  exception when others then res := res || 'PASS B8 direct write to the item master blocked' || E'\n'; end;

  ---------------------------------------------------------------- C. units of measure
  insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, null, 'DOZ', 'PC', 12);
  insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, null, 'L', 'ML', 1000);
  insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, i_varnish, 'L', 'ML', 900);
  n := mfg_convert_qty(mfg, i_leg, 2, 'DOZ', 'PC');
  res := res || case when n = 24 then 'PASS ' else 'FAIL ' end || 'C1 2 dozen = ' || n || E' pieces (expect 24)\n';
  n := mfg_convert_qty(mfg, i_leg, 24, 'PC', 'DOZ');
  res := res || case when n = 2 then 'PASS ' else 'FAIL ' end || 'C2 24 pieces = ' || n || E' dozen — works backwards (expect 2)\n';
  n := mfg_convert_qty(mfg, i_leg, 1, 'L', 'ML');
  res := res || case when n = 1000 then 'PASS ' else 'FAIL ' end || 'C3 general conversion 1 L=' || n || E' mL (expect 1000)\n';
  n := mfg_convert_qty(mfg, i_varnish, 1, 'L', 'ML');
  res := res || case when n = 900 then 'PASS ' else 'FAIL ' end || 'C4 item-specific conversion wins: 1 L of varnish=' || n || E' mL (expect 900)\n';
  begin perform mfg_convert_qty(mfg, i_leg, 1, 'KG', 'PC'); res := res || E'FAIL C5 missing conversion accepted\n';
  exception when others then res := res || case when sqlerrm like '%no unit conversion%' then 'PASS ' else 'FAIL ' end || 'C5 missing conversion explained: ' || sqlerrm || E'\n'; end;
  begin insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, null, 'DOZ', 'PC', 13);
    res := res || E'FAIL C6 duplicate conversion accepted\n';
  exception when others then res := res || E'PASS C6 duplicate conversion refused\n'; end;
  begin insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (mfg, null, 'G', 'KG', 0);
    res := res || E'FAIL C7 zero factor accepted\n';
  exception when others then res := res || E'PASS C7 zero factor refused\n'; end;

  ---------------------------------------------------------------- D. bills of materials: building a multi-level structure
  b_kit := mfg_save_bom(null, jsonb_build_object('item_id', i_kit, 'base_qty', 1, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_screw, 'qty', 8, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_varnish, 'qty', 0.2, 'uom', 'L'))));
  b_leg := mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'base_qty', 1, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lumber, 'qty', 3, 'uom', 'BF', 'scrap_pct', 10))));
  b_seat := mfg_save_bom(null, jsonb_build_object('item_id', i_seat, 'base_qty', 1, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lumber, 'qty', 5, 'uom', 'BF'),
    jsonb_build_object('component_item_id', i_kit, 'qty', 1, 'uom', 'PC', 'is_phantom', true))));
  b_chair1 := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'base_qty', 1, 'valid_from', '2026-11-01', 'description', 'First release', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 4, 'uom', 'PC', 'scrap_pct', 5),
    jsonb_build_object('component_item_id', i_seat, 'qty', 1, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_screw, 'qty', 2, 'uom', 'DOZ'),
    jsonb_build_object('component_item_id', i_saw, 'qty', 2, 'uom', 'KG', 'kind', 'BYPRODUCT'))));
  select count(*) into c from mfg_boms where status = 'DRAFT';
  res := res || case when c = 4 then 'PASS ' else 'FAIL ' end || 'D1 four BOMs saved as drafts=' || c || E'\n';
  select count(*) into c from mfg_boms where document_number ~ '^BOM-[0-9]{4}$';
  res := res || case when c = 4 then 'PASS ' else 'FAIL ' end || 'D2 BOM numbers look like BOM-0001=' || c || ' (' || (select string_agg(document_number, ',' order by document_number) from mfg_boms) || E')\n';
  select count(*) into c from mfg_bom_items;
  res := res || case when c = 9 then 'PASS ' else 'FAIL ' end || 'D3 BOM lines saved=' || c || E' (expect 9)\n';

  begin insert into mfg_boms (tenant_id, item_id, version, base_qty) values (mfg, i_leg, 99, 1);
    res := res || E'FAIL D4 direct insert into a BOM accepted\n';
  exception when others then res := res || E'PASS D4 direct write to BOM tables blocked\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_lumber, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_screw, 'qty', 1, 'uom', 'PC'))));
    res := res || E'FAIL D5 BOM for a bought item accepted\n';
  exception when others then res := res || case when sqlerrm like '%Make%' then 'PASS ' else 'FAIL ' end || 'D5 only made items have a BOM: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_lumber, 'qty', 1, 'uom', 'KG'))));
    res := res || E'FAIL D6 line in a unit with no conversion accepted\n';
  exception when others then res := res || case when sqlerrm like '%no unit conversion%' then 'PASS ' else 'FAIL ' end || 'D6 unit that cannot be converted refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_saw, 'qty', 1, 'uom', 'KG', 'kind', 'BYPRODUCT'))));
    res := res || E'FAIL D7 BOM with no component accepted\n';
  exception when others then res := res || case when sqlerrm like '%at least one component%' then 'PASS ' else 'FAIL ' end || 'D7 needs a component: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'lines', jsonb_build_array(
      jsonb_build_object('component_item_id', i_lumber, 'qty', 1, 'uom', 'BF'),
      jsonb_build_object('component_item_id', i_saw, 'qty', 1, 'uom', 'KG', 'kind', 'COPRODUCT', 'cost_share_pct', 60),
      jsonb_build_object('component_item_id', i_screw, 'qty', 1, 'uom', 'PC', 'kind', 'COPRODUCT', 'cost_share_pct', 60))));
    res := res || E'FAIL D8 cost shares above 100 accepted\n';
  exception when others then res := res || case when sqlerrm like '%more than 100%' then 'PASS ' else 'FAIL ' end || 'D8 cost shares cannot exceed 100: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_bom(null, jsonb_build_object('item_id', i_leg, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_leg, 'qty', 1, 'uom', 'PC'))));
    res := res || E'FAIL D9 an item as its own component accepted\n';
  exception when others then res := res || case when sqlerrm like '%itself%' then 'PASS ' else 'FAIL ' end || 'D9 item cannot contain itself: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- E. a loop in the structure is impossible
  perform mfg_activate_bom(b_kit); perform mfg_activate_bom(b_leg); perform mfg_activate_bom(b_seat); perform mfg_activate_bom(b_chair1);
  begin   -- the chair contains the seat; a seat that contains the chair would loop
    perform mfg_save_bom(null, jsonb_build_object('item_id', i_seat, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_chair, 'qty', 1, 'uom', 'PC'))));
    res := res || E'FAIL E1 a two-level loop was accepted\n';
  exception when others then res := res || case when sqlerrm like '%can''t contain itself%' then 'PASS ' else 'FAIL ' end || 'E1 two-level loop refused: ' || sqlerrm || E'\n'; end;
  begin   -- kit is inside seat, seat inside chair: a kit that contains the chair loops three levels deep
    perform mfg_save_bom(null, jsonb_build_object('item_id', i_kit, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_chair, 'qty', 1, 'uom', 'PC'))));
    res := res || E'FAIL E2 a three-level loop was accepted\n';
  exception when others then res := res || case when sqlerrm like '%can''t contain itself%' then 'PASS ' else 'FAIL ' end || 'E2 three-level loop refused: ' || sqlerrm || E'\n'; end;
  select count(*) into c from mfg_boms;
  res := res || case when c = 4 then 'PASS ' else 'FAIL ' end || 'E3 the refused loops left no half-saved BOM behind (BOMs=' || c || E')\n';

  ---------------------------------------------------------------- F. low-level codes
  select string_agg(i.sku || '=' || m.low_level_code, ', ' order by i.sku) into st
    from mfg_item_master m join items i on i.id = m.item_id;
  res := res || case when st = 'CHAIR=0, KIT=2, LEG=1, LUM=2, SAW=0, SCR=3, SEAT=1, VAR=3'
                     then 'PASS ' else 'FAIL ' end || 'F1 low-level codes: ' || st || E'\n';

  ---------------------------------------------------------------- G. explosion
  select count(*) into c from mfg_explode_bom(i_chair, 10, '2026-11-15');
  res := res || case when c = 9 then 'PASS ' else 'FAIL ' end || 'G1 explosion rows=' || c || E' (expect 9: chair, leg, lumber, seat, lumber, phantom kit, screw, varnish, screw)\n';
  select sum(base_qty) into n from mfg_explode_bom(i_chair, 10, '2026-11-15') where item_id = i_lumber;
  res := res || case when n = 188.6 then 'PASS ' else 'FAIL ' end || 'G2 lumber for 10 chairs=' || n || E' BF (expect 188.6 = 42 legs × 3.3 + 10 seats × 5)\n';
  select sum(base_qty) into n from mfg_explode_bom(i_chair, 10, '2026-11-15') where item_id = i_screw;
  res := res || case when n = 320 then 'PASS ' else 'FAIL ' end || 'G3 screws=' || n || E' (expect 320 = 240 direct from 20 dozen + 80 through the phantom kit)\n';
  select sum(base_qty) into n from mfg_explode_bom(i_chair, 10, '2026-11-15') where item_id = i_varnish;
  res := res || case when n = 2 then 'PASS ' else 'FAIL ' end || 'G4 varnish=' || n || E' L (expect 2)\n';
  select base_qty into n from mfg_explode_bom(i_chair, 10, '2026-11-15') where item_id = i_leg;
  res := res || case when n = 42 then 'PASS ' else 'FAIL ' end || 'G5 legs with 5 percent scrap=' || n || E' (expect 42)\n';
  select count(*) into c from mfg_explode_bom(i_chair, 10, '2026-11-15') where is_phantom and level = 2;
  select max(level) into st from mfg_explode_bom(i_chair, 10, '2026-11-15');
  res := res || case when c = 1 and st = '3' then 'PASS ' else 'FAIL ' end || 'G6 the phantom sits at level 2 and its children at level ' || st || E'\n';
  select count(*) into c from mfg_explode_bom(i_chair, 10, '2026-11-15') where item_id = i_saw;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G7 the by-product is not a requirement (rows=' || c || E')\n';
  select string_agg(coalesce(path, '-'), ' ' order by seq) into st from mfg_explode_bom(i_chair, 1, '2026-11-15');
  res := res || case when st = ' 1 1.1 2 2.1 2.2 2.2.1 2.2.2 3' then 'PASS ' else 'FAIL ' end || 'G8 rows come in tree order: ' || st || E'\n';
  begin perform * from mfg_explode_bom(i_chair, 1, '2026-10-01'); res := res || E'FAIL G9 explosion before any BOM is valid accepted\n';
  exception when others then res := res || case when sqlerrm like '%no active bill of materials%' then 'PASS ' else 'FAIL ' end || 'G9 no BOM in force on that date: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- H. versions, effectivity, alternatives
  begin perform mfg_save_bom(b_chair1, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('component_item_id', i_leg, 'qty', 9, 'uom', 'PC'))));
    res := res || E'FAIL H1 an active BOM was edited\n';
  exception when others then res := res || case when sqlerrm like '%Only a draft%' then 'PASS ' else 'FAIL ' end || 'H1 active BOM cannot be edited: ' || sqlerrm || E'\n'; end;
  b_chair2 := mfg_copy_bom(b_chair1);
  select version || '/' || status into st from mfg_boms where id = b_chair2;
  res := res || case when st = '2/DRAFT' then 'PASS ' else 'FAIL ' end || 'H2 copy is version 2 draft=' || st || E'\n';
  perform mfg_save_bom(b_chair2, jsonb_build_object('base_qty', 1, 'valid_from', '2026-12-01', 'description', 'Stronger legs', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 6, 'uom', 'PC', 'scrap_pct', 5),
    jsonb_build_object('component_item_id', i_seat, 'qty', 1, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_screw, 'qty', 2, 'uom', 'DOZ'),
    jsonb_build_object('component_item_id', i_saw, 'qty', 2, 'uom', 'KG', 'kind', 'BYPRODUCT'))));
  perform mfg_activate_bom(b_chair2);
  select valid_to into d from mfg_boms where id = b_chair1;
  res := res || case when d = '2026-11-30' then 'PASS ' else 'FAIL ' end || 'H3 activating version 2 closed version 1 the day before=' || d || E'\n';
  res := res || case when mfg_active_bom(mfg, i_chair, '2026-11-15') = b_chair1 then 'PASS ' else 'FAIL ' end || E'H4 on Nov 15 version 1 is in force\n';
  res := res || case when mfg_active_bom(mfg, i_chair, '2026-12-05') = b_chair2 then 'PASS ' else 'FAIL ' end || E'H5 on Dec 5 version 2 is in force\n';
  res := res || case when mfg_active_bom(mfg, i_chair, '2026-10-20') is null then 'PASS ' else 'FAIL ' end || E'H6 on Oct 20 no BOM is in force\n';
  select sum(base_qty) into n from mfg_explode_bom(i_chair, 10, '2026-12-05') where item_id = i_lumber;
  res := res || case when n = 257.9 then 'PASS ' else 'FAIL ' end || 'H7 lumber for 10 chairs on Dec 5=' || n || E' BF (expect 257.9 = 63 legs × 3.3 + 50)\n';
  b_chair3 := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', '2026-11-15', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 4, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_varnish, 'qty', 1, 'uom', 'L'))));
  begin perform mfg_activate_bom(b_chair3); res := res || E'FAIL H8 overlapping version activated\n';
  exception when others then res := res || case when sqlerrm like '%overlap%' then 'PASS ' else 'FAIL ' end || 'H8 overlapping dates refused: ' || sqlerrm || E'\n'; end;
  select valid_to into d from mfg_boms where id = b_chair1;
  res := res || case when d = '2026-11-30' then 'PASS ' else 'FAIL ' end || 'H9 the refused activation changed nothing (version 1 still ends ' || d || E')\n';
  -- alternative 2: a second recipe for the same item, in force at the same time
  b_tmp := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'alt_no', 2, 'valid_from', '2026-11-01', 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_leg, 'qty', 4, 'uom', 'PC'), jsonb_build_object('component_item_id', i_seat, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b_tmp);
  res := res || case when mfg_active_bom(mfg, i_chair, '2026-11-15', 2) = b_tmp and mfg_active_bom(mfg, i_chair, '2026-11-15', 1) = b_chair1
                     then 'PASS ' else 'FAIL ' end || E'H10 alternative 2 lives beside alternative 1\n';
  select count(*) into c from mfg_explode_bom(i_chair, 1, '2026-11-15', 2);
  res := res || case when c = 8 then 'PASS ' else 'FAIL ' end || 'H11 explosion of alternative 2 rows=' || c || E' (expect 8)\n';

  ---------------------------------------------------------------- I. comparison
  select count(*) filter (where change = 'CHANGED'), count(*) filter (where change = 'SAME') into c, n from mfg_compare_boms(b_chair1, b_chair2);
  res := res || case when c = 1 and n = 3 then 'PASS ' else 'FAIL ' end || 'I1 version 1 vs 2: changed=' || c || ', same=' || n || E' (expect 1 and 3)\n';
  select qty_a || '->' || qty_b into st from mfg_compare_boms(b_chair1, b_chair2) where component_item_id = i_leg;
  res := res || case when st = '4.000000->6.000000' then 'PASS ' else 'FAIL ' end || 'I2 leg quantity change=' || st || E'\n';
  select string_agg(component_name || ':' || change, ', ' order by component_name) into st from mfg_compare_boms(b_chair2, b_chair3);
  res := res || case when st like '%Varnish:ADDED%' and st like '%Chair seat:REMOVED%' and st like '%Chair leg:CHANGED%'
                     then 'PASS ' else 'FAIL ' end || 'I3 version 2 vs 3: ' || st || E'\n';

  ---------------------------------------------------------------- J. where used
  select count(*) into c from mfg_where_used(i_lumber);
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'J1 lumber is used directly in ' || c || E' BOMs (expect 2: leg and seat)\n';
  select count(*) into c from mfg_where_used(i_screw);
  res := res || case when c = 3 then 'PASS ' else 'FAIL ' end || 'J2 screws are used directly in ' || c || E' BOM versions (expect 3: kit, chair v1, chair v2)\n';
  select count(distinct parent_item_id) into c from mfg_where_used(i_lumber, true) where lvl = 2;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'J3 multi-level: lumber reaches ' || c || E' item at level 2 (the chair via leg and seat)\n';
  select count(distinct parent_item_id) into c from mfg_where_used(i_varnish, true) where lvl = 3;
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'J4 varnish reaches the chair at level 3 (kit → seat → chair)=' || c || E'\n';
  select count(*) into c from mfg_where_used(i_chair);
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'J5 a top-level item is used nowhere=' || c || E'\n';

  ---------------------------------------------------------------- K. lifecycle: delete a draft, obsolete an active BOM
  perform mfg_delete_bom(b_chair3);
  select count(*) into c from mfg_boms where id = b_chair3;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'K1 draft deleted (rows left=' || c || E')\n';
  begin perform mfg_delete_bom(b_chair1); res := res || E'FAIL K2 active BOM deleted\n';
  exception when others then res := res || case when sqlerrm like '%Only a draft%' then 'PASS ' else 'FAIL ' end || 'K2 active BOM cannot be deleted: ' || sqlerrm || E'\n'; end;
  perform mfg_obsolete_bom(b_tmp);
  select status into st from mfg_boms where id = b_tmp;
  res := res || case when st = 'OBSOLETE' then 'PASS ' else 'FAIL ' end || 'K3 alternative 2 made obsolete=' || st || E'\n';
  begin perform mfg_delete_item(i_saw); res := res || E'FAIL K4 an item on a BOM was deleted\n';
  exception when others then res := res || case when sqlerrm like '%bill of materials%' then 'PASS ' else 'FAIL ' end || 'K4 item on a BOM cannot be deleted: ' || sqlerrm || E'\n'; end;
  i_spare := mfg_save_item(null, jsonb_build_object('sku','SPARE','name','Spare','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
  perform mfg_delete_item(i_spare);
  select count(*) into c from items where id = i_spare;
  select count(*) into n from mfg_item_master where item_id = i_spare;
  res := res || case when c = 0 and n = 0 then 'PASS ' else 'FAIL ' end || 'K5 unused item deleted with its master row (' || c || '/' || n || E')\n';

  ---------------------------------------------------------------- L. work centers, calendar, rates, costing sheet
  insert into mfg_work_centers (tenant_id, name) values (mfg, 'Cutting') returning id into wc1;
  insert into mfg_work_centers (tenant_id, name, code) values (mfg, 'Assembly', 'ASSM') returning id into wc2;
  insert into mfg_work_centers (tenant_id, name, active) values (mfg, 'Old press', false) returning id into wc3;
  select document_number || '/' || code into st from mfg_work_centers where id = wc1;
  res := res || case when st = 'WC-0001/WC-0001' then 'PASS ' else 'FAIL ' end || 'L1 first work center numbered ' || st || E'\n';
  select document_number || '/' || code into st from mfg_work_centers where id = wc2;
  res := res || case when st = 'WC-0002/ASSM' then 'PASS ' else 'FAIL ' end || 'L2 a typed code is kept=' || st || E'\n';
  begin insert into mfg_work_centers (tenant_id, name, code) values (mfg, 'Dup', 'assm'); res := res || E'FAIL L3 duplicate work-center code accepted\n';
  exception when others then res := res || E'PASS L3 duplicate work-center code refused\n'; end;
  update mfg_work_centers set shifts = 2, hours_per_shift = 8, utilization_pct = 85 where id = wc1;
  n := mfg_wc_available_hours(wc1, '2026-11-02', '2026-11-08');
  res := res || case when abs(n - 68) < 0.0001 then 'PASS ' else 'FAIL ' end || 'L4 hours in a Mon-Sun week=' || n || E' (expect 68 = 5 days × 2 shifts × 8 h × 85%)\n';
  insert into mfg_holidays (tenant_id, holiday_date, name) values (mfg, '2026-11-04', 'Test holiday');
  n := mfg_wc_available_hours(wc1, '2026-11-02', '2026-11-08');
  res := res || case when abs(n - 54.4) < 0.0001 then 'PASS ' else 'FAIL ' end || 'L5 with a Wednesday holiday=' || n || E' (expect 54.4)\n';
  begin update mfg_work_centers set working_days = '{1,2,9}' where id = wc1; res := res || E'FAIL L6 weekday 9 accepted\n';
  exception when others then res := res || E'PASS L6 invalid weekday refused\n'; end;
  select id into at_labor from mfg_activity_types where code = 'LABOR';
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate) values (mfg, wc1, at_labor, '2026-10-01', 100);
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate) values (mfg, wc1, at_labor, '2026-12-01', 120);
  res := res || case when mfg_activity_rate(wc1, at_labor, '2026-11-15') = 100 and mfg_activity_rate(wc1, at_labor, '2026-12-15') = 120
                     then 'PASS ' else 'FAIL ' end || E'L7 planned rate follows the period (Nov 15 = 100, Dec 15 = 120)\n';
  res := res || case when mfg_activity_rate(wc1, at_labor, '2026-09-15') is null then 'PASS ' else 'FAIL ' end || E'L8 no rate before the first period\n';
  begin insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate) values (mfg, wc1, at_labor, '2027-01-15', 5);
    res := res || E'FAIL L9 a rate period not on the 1st accepted\n';
  exception when others then res := res || E'PASS L9 rate period must start on the 1st\n'; end;
  begin insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate) values (mfg, wc1, at_labor, '2026-12-01', 5);
    res := res || E'FAIL L10 duplicate rate accepted\n';
  exception when others then res := res || E'PASS L10 duplicate rate refused\n'; end;
  update mfg_costing_sheet set oh_pct = 15 where kind = 'VARIABLE';
  select oh_pct into n from mfg_costing_sheet where kind = 'VARIABLE';
  res := res || case when n = 15 then 'PASS ' else 'FAIL ' end || 'L11 costing sheet edited=' || n || E'\n';

  ---------------------------------------------------------------- M. routings
  r1 := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'description', 'Standard route', 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Cut', 'work_center_id', wc1, 'setup_min', 30, 'run_min_per_unit', 12, 'teardown_min', 10, 'queue_min', 60, 'move_min', 15, 'component_line_nos', jsonb_build_array(1, 2)),
    jsonb_build_object('op_no', 20, 'description', 'Assemble', 'work_center_id', wc2, 'run_min_per_unit', 20, 'control_key', 'PP02'))));
  select document_number || '/' || version || '/' || status into st from mfg_routings where id = r1;
  res := res || case when st = 'RTG-0001/1/DRAFT' then 'PASS ' else 'FAIL ' end || 'M1 routing saved=' || st || E'\n';
  select count(*) into c from mfg_routing_ops where routing_id = r1;
  res := res || case when c = 2 then 'PASS ' else 'FAIL ' end || 'M2 operations saved=' || c || E'\n';
  select work_min, wait_min into n, n2 from mfg_routing_load(r1, 10) where op_no = 10;
  res := res || case when n = 160 and n2 = 75 then 'PASS ' else 'FAIL ' end || 'M3 operation 10 for 10 units work=' || n || ', wait=' || n2 || E' (expect 160 and 75)\n';
  select work_min, wait_min into n, n2 from mfg_routing_load(r1, 10) where op_no = 20;
  res := res || case when n = 200 and n2 = 0 then 'PASS ' else 'FAIL ' end || 'M4 operation 20 work=' || n || ', wait=' || n2 || E' (expect 200 and 0)\n';
  begin perform mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
      jsonb_build_object('op_no', 10, 'work_center_id', wc1), jsonb_build_object('op_no', 10, 'work_center_id', wc2))));
    res := res || E'FAIL M5 duplicate operation number accepted\n';
  exception when others then res := res || case when sqlerrm like '%used twice%' then 'PASS ' else 'FAIL ' end || 'M5 duplicate operation number refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'work_center_id', wc3))));
    res := res || E'FAIL M6 inactive work center accepted\n';
  exception when others then res := res || case when sqlerrm like '%inactive%' then 'PASS ' else 'FAIL ' end || 'M6 inactive work center refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_save_routing(null, jsonb_build_object('item_id', i_lumber, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'work_center_id', wc1))));
    res := res || E'FAIL M7 routing for a bought item accepted\n';
  exception when others then res := res || case when sqlerrm like '%Make%' then 'PASS ' else 'FAIL ' end || 'M7 only made items have routings: ' || sqlerrm || E'\n'; end;
  perform mfg_activate_routing(r1);
  r2 := mfg_copy_routing(r1);
  perform mfg_activate_routing(r2);
  select count(*) into c from mfg_routings where item_id = i_chair and status = 'ACTIVE';
  select status into st from mfg_routings where id = r1;
  res := res || case when c = 1 and st = 'OBSOLETE' then 'PASS ' else 'FAIL ' end || 'M8 activating version 2 retired version 1: active=' || c || ', v1=' || st || E'\n';
  begin perform mfg_delete_routing(r2); res := res || E'FAIL M9 active routing deleted\n';
  exception when others then res := res || E'PASS M9 active routing cannot be deleted\n'; end;
  begin perform mfg_delete_item(i_chair); res := res || E'FAIL M10 item with BOM and routing deleted\n';
  exception when others then res := res || E'PASS M10 item with a BOM and routing cannot be deleted\n'; end;

  ---------------------------------------------------------------- N. other companies and the teacher
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from mfg_item_master) + (select count(*) from mfg_boms) + (select count(*) from mfg_bom_items) + (select count(*) from mfg_work_centers)
       + (select count(*) from mfg_uom) + (select count(*) from mfg_routings) into c;
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'N1 another student sees none of these rows=' || c || E'\n';
  begin perform mfg_save_item(null, jsonb_build_object('sku','S2','name','Sneaky','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
    res := res || E'FAIL N2 a Standard-company student created a Manufacturing item\n';
  exception when others then res := res || 'PASS N2 Standard company cannot use the Manufacturing functions: ' || sqlerrm || E'\n'; end;
  begin perform * from mfg_explode_bom(i_chair, 1, '2026-11-15'); res := res || E'FAIL N3 another student exploded a BOM\n';
  exception when others then res := res || case when sqlerrm like '%not found%' then 'PASS ' else 'FAIL ' end || 'N3 another student cannot reach the BOM: ' || sqlerrm || E'\n'; end;
  begin perform mfg_activate_bom(b_chair1); res := res || E'FAIL N4 another student activated a BOM\n';
  exception when others then res := res || E'PASS N4 another student cannot change the BOM\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_item_master where tenant_id = mfg;
  res := res || case when c = 8 then 'PASS ' else 'FAIL ' end || 'N5 the teacher can read the student''s items=' || c || E' (expect 8)\n';
  select count(*) into c from mfg_boms where tenant_id = mfg;
  res := res || case when c >= 4 then 'PASS ' else 'FAIL ' end || 'N6 the teacher can read the student''s BOMs=' || c || E'\n';
  begin perform mfg_save_item(null, jsonb_build_object('sku','T1','name','Teacher item','item_type','RAW','make_or_buy','BUY','base_uom','PC'));
    res := res || E'FAIL N7 the teacher created an item in a student company\n';
  exception when others then res := res || 'PASS N7 the teacher cannot create master data: ' || sqlerrm || E'\n'; end;
  begin insert into mfg_uom (tenant_id, code, name) values (mfg, 'ZZ', 'Teacher unit'); res := res || E'FAIL N8 the teacher wrote a unit of measure\n';
  exception when others then res := res || E'PASS N8 the teacher cannot write a student''s tables\n'; end;

  ---------------------------------------------------------------- O. account determination (teacher edits, with guard rails)
  select id into a_opex from accounts where tenant_id = mfg and code = '5100';
  select id into a_pack from accounts where tenant_id = mfg and code = '1230';
  select id into a_wip from accounts where tenant_id = mfg and code = '1210';
  select id into a_cash_std from accounts where tenant_id = t1 and code = '1000';
  select count(*) into c from mfg_audit_log where tenant_id = mfg and event = 'account_determination_changed';
  perform mfg_set_account(mfg, 'COGS', a_opex);
  res := res || case when mfg_account(mfg, 'COGS') = a_opex then 'PASS ' else 'FAIL ' end || E'O1 teacher re-pointed COGS to 5100\n';
  select count(*) - c into n from mfg_audit_log where tenant_id = mfg and event = 'account_determination_changed';
  res := res || case when n = 1 then 'PASS ' else 'FAIL ' end || 'O2 the change is in the audit log (new rows=' || n || E')\n';
  perform mfg_set_account(mfg, 'RM_INVENTORY', a_pack);
  res := res || case when mfg_account(mfg, 'RM_INVENTORY') = a_pack then 'PASS ' else 'FAIL ' end || E'O3 an inventory key accepts another asset account\n';
  begin perform mfg_set_account(mfg, 'WIP', a_opex); res := res || E'FAIL O4 WIP pointed at an expense account\n';
  exception when others then res := res || case when sqlerrm like '%needs an asset account%' then 'PASS ' else 'FAIL ' end || 'O4 wrong account type refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_set_account(mfg, 'GR_IR', a_wip); res := res || E'FAIL O5 GR/IR pointed at an asset account\n';
  exception when others then res := res || case when sqlerrm like '%needs a liability account%' then 'PASS ' else 'FAIL ' end || 'O5 GR/IR needs a liability account: ' || sqlerrm || E'\n'; end;
  begin perform mfg_set_account(mfg, 'NOT_A_KEY', a_opex); res := res || E'FAIL O6 unknown key accepted\n';
  exception when others then res := res || case when sqlerrm like '%Unknown posting type%' then 'PASS ' else 'FAIL ' end || 'O6 unknown key refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_set_account(mfg, 'COGS', a_cash_std); res := res || E'FAIL O7 an account from another company accepted\n';
  exception when others then res := res || case when sqlerrm like '%isn''t in this company%' then 'PASS ' else 'FAIL ' end || 'O7 account of another company refused: ' || sqlerrm || E'\n'; end;
  begin perform mfg_set_account(t1, 'COGS', a_cash_std); res := res || E'FAIL O8 a Standard company''s mapping edited\n';
  exception when others then res := res || 'PASS O8 Standard companies have no mapping to edit: ' || sqlerrm || E'\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform mfg_set_account(mfg, 'COGS', a_opex); res := res || E'FAIL O9 a student changed the mapping\n';
  exception when others then res := res || case when sqlerrm like '%Only the teacher%' then 'PASS ' else 'FAIL ' end || 'O9 a student cannot change the mapping: ' || sqlerrm || E'\n'; end;
  update mfg_account_determination set account_id = a_wip where tenant_id = mfg and key = 'COGS';
  res := res || case when mfg_account(mfg, 'COGS') = a_opex then 'PASS ' else 'FAIL ' end || E'O10 a direct update by the student did nothing\n';

  execute 'reset role';
  ---------------------------------------------------------------- summary
  n := (length(res) - length(replace(res, 'FAIL', ''))) / 4;
  raise exception E'MFG PHASE 2 — failures: %\n%', n, res;
end $$;
