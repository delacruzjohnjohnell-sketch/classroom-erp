-- ============================================================
-- Manufacturing ERP — Practice Set 1 ("Bamboo Basket Works, November 2026"): the ANSWER KEY.
--
-- Runs the whole set exactly as a student would (same functions the screens call), then reports the snapshot the checker expects
-- (tests/fixtures/mfgPracticeSet1.snapshot.json). Paste migration 0050 before it. It ends with RAISE EXCEPTION, so nothing is saved.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  mfg uuid; res text := '';
  i_pole uuid; i_rat uuid; i_lac uuid; i_ctn uuid; i_bsk uuid; i_std uuid;
  wc_w uuid; wc_f uuid; b uuid; rt uuid; est uuid; loc uuid;
  e_nena uuid; e_toto uuid; vend1 uuid; vend2 uuid; cust1 uuid; cust2 uuid;
  po1 uuid; po2 uuid; l_pole uuid; l_rat uuid; l_ctn uuid; l_lac uuid; oa uuid; ob uuid;
  so1 uuid; so2 uuid; sl1 uuid; sl2 uuid; sl3 uuid; inv uuid; v uuid; pid uuid; j jsonb;
  m date := '2026-11-01';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Practice Set 1 key', '2026-01-01', 'STANDARD');

  -- ---- step group 1: setup (Nov 2)
  insert into vendors (tenant_id, name) values (mfg, 'Laguna Bamboo Traders') returning id into vend1;
  insert into vendors (tenant_id, name) values (mfg, 'Pasig Packaging Supply') returning id into vend2;
  insert into customers (tenant_id, name) values (mfg, 'Greenleaf Home Store') returning id into cust1;
  insert into customers (tenant_id, name) values (mfg, 'Cebu Gift Shop') returning id into cust2;
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (mfg, 'Aling Nena Reyes', 'Weaver', 0, 'hourly', 80) returning id into e_nena;
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (mfg, 'Mang Totoy Cruz', 'Finisher', 0, 'hourly', 90) returning id into e_toto;

  i_pole := mfg_save_item(null, jsonb_build_object('sku','BAM-POLE','name','Bamboo pole','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',45,'procurement_lead_days',5));
  i_rat  := mfg_save_item(null, jsonb_build_object('sku','RAT-STR','name','Rattan strip','item_type','RAW','make_or_buy','BUY','base_uom','KG','planned_price',160,'procurement_lead_days',5));
  i_lac  := mfg_save_item(null, jsonb_build_object('sku','LAC-CL','name','Clear lacquer','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',280,'procurement_lead_days',3));
  i_ctn  := mfg_save_item(null, jsonb_build_object('sku','CTN-GB','name','Gift carton','item_type','PACKAGING','make_or_buy','BUY','base_uom','PC','planned_price',30,'procurement_lead_days',3));
  i_bsk  := mfg_save_item(null, jsonb_build_object('sku','BSK-LD','name','Laundry basket','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_std  := mfg_save_item(null, jsonb_build_object('sku','STD-PL','name','Plant stand','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));

  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (mfg, 'Weaving', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_w;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (mfg, 'Finishing', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_f;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select mfg, w.id, a.id, m, case a.kind when 'LABOR' then 80 else case w.id when wc_w then 25 else 40 end end
      from mfg_activity_types a cross join (select wc_w as id union all select wc_f) w
     where a.tenant_id = mfg and a.kind in ('LABOR', 'MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 30 where tenant_id = mfg and kind = 'FIXED';

  b := mfg_save_bom(null, jsonb_build_object('item_id', i_bsk, 'valid_from', m, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_pole, 'qty', 4, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 1.5, 'uom', 'KG'),
    jsonb_build_object('component_item_id', i_lac, 'qty', 0.1, 'uom', 'L'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_std, 'valid_from', m, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_pole, 'qty', 6, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 0.5, 'uom', 'KG'),
    jsonb_build_object('component_item_id', i_lac, 'qty', 0.25, 'uom', 'L'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_bsk, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Weave the basket', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 42, 'labor_min_per_unit', 42, 'machine_min_per_unit', 12),
    jsonb_build_object('op_no', 20, 'description', 'Lacquer and pack', 'work_center_id', wc_f, 'setup_min', 15, 'run_min_per_unit', 15, 'labor_min_per_unit', 15, 'machine_min_per_unit', 15))));
  perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_std, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Cut and assemble the stand', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 24),
    jsonb_build_object('op_no', 20, 'description', 'Lacquer and pack', 'work_center_id', wc_f, 'setup_min', 12, 'run_min_per_unit', 18, 'labor_min_per_unit', 18, 'machine_min_per_unit', 18))));
  perform mfg_activate_routing(rt);
  est := mfg_create_cost_estimate(i_bsk, 50, '2026-11-02'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-11-02');
  est := mfg_create_cost_estimate(i_std, 20, '2026-11-02'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-11-02');

  -- the owner puts in the starting cash (voucher)
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-02', 'jv_type', 'GENERAL', 'reference', 'Capital', 'particulars', 'Owner puts in the starting cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = mfg and code = '1000'), 'debit', 100000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = mfg and code = '3000'), 'credit', 100000))));
  res := res || 'voucher1 ' || mfg_submit_voucher(v) || E'\n';

  -- ---- step group 2: buying (Nov 3 – Nov 10)
  po1 := mfg_create_po(vend1, '2026-11-03', '2026-11-06', jsonb_build_array(
    jsonb_build_object('item_id', i_pole, 'qty', 400, 'unit_price', 47), jsonb_build_object('item_id', i_rat, 'qty', 120, 'unit_price', 165)));
  po2 := mfg_create_po(vend2, '2026-11-03', '2026-11-09', jsonb_build_array(
    jsonb_build_object('item_id', i_ctn, 'qty', 100, 'unit_price', 30), jsonb_build_object('item_id', i_lac, 'qty', 30, 'unit_price', 290)));
  select l.id into l_pole from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_pole;
  select l.id into l_rat  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_rat;
  select l.id into l_ctn  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_ctn;
  select l.id into l_lac  from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_lac;
  perform mfg_post_goods_receipt(po1, '2026-11-06', jsonb_build_array(jsonb_build_object('po_line_id', l_pole, 'qty', 400), jsonb_build_object('po_line_id', l_rat, 'qty', 120)));
  perform mfg_post_goods_receipt(po2, '2026-11-09', jsonb_build_array(jsonb_build_object('po_line_id', l_ctn, 'qty', 100), jsonb_build_object('po_line_id', l_lac, 'qty', 30)));
  perform mfg_post_vendor_invoice(po2, 'PPS-4471', '2026-11-10', '2026-12-10', 12, jsonb_build_array(
    jsonb_build_object('po_line_id', l_ctn, 'qty', 100, 'unit_price', 30), jsonb_build_object('po_line_id', l_lac, 'qty', 30, 'unit_price', 290)));

  -- ---- step group 3: making (Nov 11 – Nov 25)
  oa := mfg_create_order(i_bsk, 50, '2026-11-11', '2026-11-18');
  perform mfg_release_order(oa);
  perform mfg_post_material_issue(oa, (
    select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', case when c.item_id = i_rat then 78 else c.qty_required end))
      from mfg_prod_components c where c.order_id = oa), '2026-11-12');
  perform mfg_post_confirmation(oa, 10, 50, 0, null, 0.5, 35, 10, false, '2026-11-14', e_nena);
  perform mfg_post_confirmation(oa, 20, 48, 2, 'Lacquer blistered two baskets', 0.25, 13, 12, true, '2026-11-17', e_toto);
  perform mfg_post_fg_receipt(oa, 48, null, null, null, '2026-11-18');
  perform mfg_settle_order(oa, '2026-11-25');
  ob := mfg_create_order(i_std, 20, '2026-11-12', '2026-11-19');
  perform mfg_release_order(ob);
  perform mfg_post_material_issue(ob, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = ob), '2026-11-13');
  perform mfg_post_confirmation(ob, 10, 20, 0, null, 0.5, 10, 8, false, '2026-11-16', e_nena);
  perform mfg_post_confirmation(ob, 20, 20, 0, null, 0.2, 6, 6, true, '2026-11-18', e_toto);
  perform mfg_post_fg_receipt(ob, 20, null, null, null, '2026-11-19');
  perform mfg_settle_order(ob, '2026-11-25');

  -- ---- step group 4: selling (Nov 20 – Nov 27)
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust1, '2026-11-19', 'draft', 35728, 12, 3828) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_bsk, 'Laundry basket', 30, 780) returning id into sl1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_std, 'Plant stand', 10, 850) returning id into sl2;
  update sales_orders set status = 'confirmed' where id = so1;
  perform mfg_post_delivery(so1, '2026-11-20', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30), jsonb_build_object('so_line_id', sl2, 'qty', 10)));
  inv := mfg_create_invoice_from_so(so1, '2026-12-21', '2026-11-21'); perform post_invoice(inv);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (mfg, cust2, '2026-11-25', 'draft', 13272, 12, 1422) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_bsk, 'Laundry basket', 15, 790) returning id into sl3;
  update sales_orders set status = 'confirmed' where id = so2;
  perform mfg_post_delivery(so2, '2026-11-26', jsonb_build_array(jsonb_build_object('so_line_id', sl3, 'qty', 15)));
  inv := mfg_create_invoice_from_so(so2, '2026-12-27', '2026-11-27'); perform post_invoice(inv);

  -- ---- step group 5: a manual voucher and the month end (Nov 28 – Nov 30)
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-28', 'jv_type', 'GENERAL', 'reference', 'Workshop rent', 'particulars', 'Workshop rent for November paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = mfg and code = '5100'), 'debit', 6000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = mfg and code = '1000'), 'credit', 6000))));
  res := res || 'voucher2 ' || mfg_submit_voucher(v) || E'\n';
  pid := mfg_settle_period(m);
  perform mfg_close_period(m);

  -- ---- the snapshot, as the teacher (needs migration 0050; its text is pasted before this block when run)
  perform set_config('request.jwt.claims', json_build_object('sub', 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91', 'role', 'authenticated')::text, true);
  raise exception E'SNAPSHOT\n%', mfg_practice_snapshot(mfg)::text;
end $$;
