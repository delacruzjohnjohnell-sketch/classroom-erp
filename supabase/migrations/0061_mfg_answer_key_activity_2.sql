-- ============================================================
-- Classroom ERP — migration 0061 (Activity 2 Manufacturing: its answer-key company)
--
-- Needs 0053, 0054, 0058–0060. Only our own Manufacturing functions are touched; no table, no Standard object.
--
--   mfg__load_activity_2(tenant)         Internal: posts the Activity 2 answer key (Rattan Furniture Works, December 2026 and January 2027) into a
--                                        company, as the signed-in user, through the same functions the screens call. Mirrors the answer-key run
--                                        whose figures are stored by 0060.
--   mfg_activity_release / _release_company / mfg_open_answer_key
--                                        Until now they accepted only 'activity-1-manufacturing'. They now accept either activity, and
--                                        mfg_open_answer_key names the company and loads the key to match. The loading user also holds the
--                                        QUALITY and ACCOUNTANT roles for the moment of loading (the key uses inspections and payments).
--
-- ROLLBACK:  drop function if exists mfg__load_activity_2(uuid);   then re-run the definitions of the three functions in 0051/0053.
-- ============================================================

create or replace function mfg__load_activity_2(p_tenant uuid)
returns jsonb as $$
declare
  v_t uuid := p_tenant;
  m date := '2026-12-01';
  i_wd uuid; i_rat uuid; i_fab uuid; i_fom uuid; i_var uuid; i_scr uuid; i_ctn uuid; i_fch uuid; i_ftb uuid; i_chr uuid; i_tbl uuid;
  wc_f uuid; wc_w uuid; wc_n uuid; b uuid; rt uuid; est uuid; v uuid;
  vd1 uuid; vd2 uuid; vd3 uuid; cu1 uuid; cu2 uuid; cu3 uuid; so uuid; ids uuid[];
  po1 uuid; po2 uuid; po3 uuid; po4 uuid; po5 uuid; po6 uuid; l_rat uuid;
  o_ch uuid; o_tb uuid; o_cr uuid; o_ts uuid; conf uuid;
  vi1 uuid; vi2 uuid; vi3 uuid; vi uuid; bl uuid;
  gr1 uuid; dl_wd uuid; dl_sc uuid; lot uuid; ncr uuid; qid uuid; rm uuid; l3 uuid;
  inv_ce uuid; inv_gl uuid; inv_dv uuid; inv uuid; rec record; lines jsonb; asset uuid;
  a_cash uuid; a_fa uuid; a_opx uuid; a_mkt uuid;
begin
  select id into a_cash from accounts where tenant_id = v_t and code = '1000';
  select id into a_fa from accounts where tenant_id = v_t and code = '1500';
  select id into a_opx from accounts where tenant_id = v_t and code = '5100';
  select id into a_mkt from accounts where tenant_id = v_t and code = '5200';
  select id into rm from mfg_storage_locations where tenant_id = v_t and code = 'RM-STORE';
  select id into qid from mfg_storage_locations where tenant_id = v_t and kind = 'QUARANTINE';

  -- ---- December: set up
  i_wd  := mfg_save_item(null, jsonb_build_object('sku','FRM-WD','name','Frame wood','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',95,'procurement_lead_days',3));
  i_rat := mfg_save_item(null, jsonb_build_object('sku','RAT-STR','name','Rattan strip','item_type','RAW','make_or_buy','BUY','base_uom','KG','planned_price',160,'procurement_lead_days',3));
  i_fab := mfg_save_item(null, jsonb_build_object('sku','FAB-CL','name','Cushion fabric','item_type','RAW','make_or_buy','BUY','base_uom','M','planned_price',120,'procurement_lead_days',3));
  i_fom := mfg_save_item(null, jsonb_build_object('sku','FOM-CS','name','Foam cushion','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',85,'procurement_lead_days',3));
  i_var := mfg_save_item(null, jsonb_build_object('sku','VAR-GL','name','Varnish','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',320,'batch_tracked',true,'procurement_lead_days',3));
  i_scr := mfg_save_item(null, jsonb_build_object('sku','SCR-WD','name','Wood screws','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1,'procurement_lead_days',3));
  i_ctn := mfg_save_item(null, jsonb_build_object('sku','CTN-BX','name','Carton box','item_type','PACKAGING','make_or_buy','BUY','base_uom','PC','planned_price',40,'procurement_lead_days',3));
  i_fch := mfg_save_item(null, jsonb_build_object('sku','FRM-CH','name','Chair frame','item_type','SEMI','make_or_buy','MAKE','base_uom','PC','production_lead_days',2,'default_location_id',rm));
  i_ftb := mfg_save_item(null, jsonb_build_object('sku','FRM-TB','name','Table frame','item_type','SEMI','make_or_buy','MAKE','base_uom','PC','production_lead_days',2,'default_location_id',rm));
  i_chr := mfg_save_item(null, jsonb_build_object('sku','CHR-RT','name','Rattan chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',3));
  i_tbl := mfg_save_item(null, jsonb_build_object('sku','TBL-SD','name','Side table','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',3));

  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days) values (v_t, 'Frame shop', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_f;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days) values (v_t, 'Weaving', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_w;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days) values (v_t, 'Finishing', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_n;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select v_t, w.id, a.id, m, case a.kind when 'LABOR' then 80 else case w.id when wc_f then 30 when wc_w then 25 else 40 end end
      from mfg_activity_types a cross join (select wc_f as id union all select wc_w union all select wc_n) w where a.tenant_id = v_t and a.kind in ('LABOR', 'MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 30 where tenant_id = v_t and kind = 'FIXED';

  b := mfg_save_bom(null, jsonb_build_object('item_id', i_fch, 'valid_from', m, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_wd, 'qty', 3, 'uom', 'BF'), jsonb_build_object('component_item_id', i_var, 'qty', 0.25, 'uom', 'L'), jsonb_build_object('component_item_id', i_scr, 'qty', 8, 'uom', 'PC')))); perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_ftb, 'valid_from', m, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_wd, 'qty', 6, 'uom', 'BF'), jsonb_build_object('component_item_id', i_var, 'qty', 0.4, 'uom', 'L'), jsonb_build_object('component_item_id', i_scr, 'qty', 12, 'uom', 'PC')))); perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chr, 'valid_from', m, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_fch, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 2, 'uom', 'KG'), jsonb_build_object('component_item_id', i_fab, 'qty', 0.5, 'uom', 'M'), jsonb_build_object('component_item_id', i_fom, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC')))); perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_tbl, 'valid_from', m, 'lines', jsonb_build_array(jsonb_build_object('component_item_id', i_ftb, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_rat, 'qty', 1.5, 'uom', 'KG'), jsonb_build_object('component_item_id', i_ctn, 'qty', 1, 'uom', 'PC')))); perform mfg_activate_bom(b);

  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_fch, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'description', 'Cut and join the frame', 'work_center_id', wc_f, 'setup_min', 30, 'run_min_per_unit', 48, 'labor_min_per_unit', 48, 'machine_min_per_unit', 24)))); perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_ftb, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'description', 'Cut and join the frame', 'work_center_id', wc_f, 'setup_min', 30, 'run_min_per_unit', 60, 'labor_min_per_unit', 60, 'machine_min_per_unit', 30)))); perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chr, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'description', 'Weave and upholster', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 90, 'labor_min_per_unit', 90, 'machine_min_per_unit', 45), jsonb_build_object('op_no', 20, 'description', 'Varnish and pack', 'work_center_id', wc_n, 'setup_min', 24, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30)))); perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_tbl, 'ops', jsonb_build_array(jsonb_build_object('op_no', 10, 'description', 'Weave the top', 'work_center_id', wc_w, 'setup_min', 30, 'run_min_per_unit', 60, 'labor_min_per_unit', 60, 'machine_min_per_unit', 30), jsonb_build_object('op_no', 20, 'description', 'Varnish and pack', 'work_center_id', wc_n, 'setup_min', 30, 'run_min_per_unit', 36, 'labor_min_per_unit', 36, 'machine_min_per_unit', 36)))); perform mfg_activate_routing(rt);

  est := mfg_create_cost_estimate(i_fch, 20, '2026-12-01'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-12-01');
  est := mfg_create_cost_estimate(i_ftb, 10, '2026-12-01'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-12-01');
  est := mfg_create_cost_estimate(i_chr, 20, '2026-12-01'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-12-01');
  est := mfg_create_cost_estimate(i_tbl, 10, '2026-12-01'); perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, '2026-12-01');

  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-12-01', 'jv_type', 'GENERAL', 'reference', 'Capital', 'particulars', 'Owner puts in the starting cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_cash, 'debit', 500000), jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '3000'), 'credit', 500000)))); perform mfg_submit_voucher(v);

  insert into vendors (tenant_id, name) values (v_t, 'Laguna Rattan and Timber') returning id into vd1;
  insert into vendors (tenant_id, name) values (v_t, 'Pasig Fabric and Foam') returning id into vd2;
  insert into vendors (tenant_id, name) values (v_t, 'Batangas Coatings') returning id into vd3;
  insert into customers (tenant_id, name) values (v_t, 'Greenleaf Home Store') returning id into cu1;
  insert into customers (tenant_id, name) values (v_t, 'Cebu Gift Shop') returning id into cu2;
  insert into customers (tenant_id, name) values (v_t, 'Davao Rattan Depot') returning id into cu3;

  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cu1, '2026-12-02', 'draft', 99680, 12, 10680) returning id into so;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so, i_chr, 'Rattan chair', 40, 1850), (so, i_tbl, 'Side table', 10, 1500);
  update sales_orders set status = 'confirmed' where id = so;
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cu2, '2026-12-02', 'draft', 63840, 12, 6840) returning id into so;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so, i_chr, 'Rattan chair', 30, 1900); update sales_orders set status = 'confirmed' where id = so;
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cu3, '2026-12-03', 'draft', 32480, 12, 3480) returning id into so;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so, i_tbl, 'Side table', 20, 1450); update sales_orders set status = 'confirmed' where id = so;

  -- ---- December: plan, buy, make
  perform mfg_run_mrp(84, 7, true, '2026-12-01');
  select array_agg(id) into ids from mfg_planned_orders where tenant_id = v_t;
  perform mfg_convert_planned_orders(ids, false);
  po1 := mfg_convert_requisitions(vd1, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', case i.sku when 'FRM-WD' then 98 when 'RAT-STR' then 160 else 1 end)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and i.sku in ('FRM-WD','RAT-STR','SCR-WD')));
  po2 := mfg_convert_requisitions(vd2, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', case i.sku when 'FAB-CL' then 120 when 'FOM-CS' then 85 else 40 end)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and i.sku in ('FAB-CL','FOM-CS','CTN-BX')));
  po3 := mfg_convert_requisitions(vd3, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', 320)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and i.sku = 'VAR-GL'));
  perform mfg_post_goods_receipt(po1, '2026-12-02', (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', case i.sku when 'RAT-STR' then 140 else l.qty end)) from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id join items i on i.id = li.item_id where l.purchase_order_id = po1));
  perform mfg_post_goods_receipt(po2, '2026-12-03', (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty)) from purchase_order_lines l where l.purchase_order_id = po2));
  perform mfg_post_goods_receipt(po3, '2026-12-03', (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'batch_no', 'VAR-1226-A', 'expiry', '2027-12-31')) from purchase_order_lines l where l.purchase_order_id = po3));

  select o.id into o_ch from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'FRM-CH' and o.status = 'CREATED';
  select o.id into o_tb from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'FRM-TB' and o.status = 'CREATED';
  select o.id into o_cr from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'CHR-RT' and o.status = 'CREATED';
  select o.id into o_ts from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'TBL-SD' and o.status = 'CREATED';
  perform mfg_release_order(o_ch);
  perform mfg_post_material_issue(o_ch, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_ch), '2026-12-03');
  perform mfg_post_confirmation(o_ch, 10, 70, 0, null, 0.5, 56, 28, true, '2026-12-05', null);
  perform mfg_post_fg_receipt(o_ch, 70, null, null, null, '2026-12-05');
  perform mfg_release_order(o_tb);
  perform mfg_post_material_issue(o_tb, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_tb), '2026-12-03');
  perform mfg_post_confirmation(o_tb, 10, 30, 0, null, 0.5, 30, 15, true, '2026-12-05', null);
  perform mfg_post_fg_receipt(o_tb, 30, null, null, null, '2026-12-05');
  perform mfg_release_order(o_cr);
  perform mfg_post_material_issue(o_cr, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_cr), '2026-12-06');
  perform mfg_post_confirmation(o_cr, 10, 70, 0, null, 0.5, 105, 52.5, false, '2026-12-09', null);
  perform mfg_post_confirmation(o_cr, 20, 68, 2, 'Varnish ran on two chairs', 0.4, 35, 35, true, '2026-12-10', null);
  perform mfg_post_fg_receipt(o_cr, 68, null, null, null, '2026-12-10');
  select l.id into l_rat from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_rat;
  perform mfg_post_goods_receipt(po1, '2026-12-08', jsonb_build_array(jsonb_build_object('po_line_id', l_rat, 'qty', 45)));
  perform mfg_release_order(o_ts);
  perform mfg_post_material_issue(o_ts, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_ts), '2026-12-11');
  perform mfg_post_confirmation(o_ts, 10, 30, 0, null, 0.5, 30, 15, false, '2026-12-12', null);
  perform mfg_post_confirmation(o_ts, 20, 30, 0, null, 0.5, 18, 18, true, '2026-12-13', null);
  perform mfg_post_fg_receipt(o_ts, 30, null, null, null, '2026-12-13');

  -- ---- December: invoices, deliveries, payments
  vi1 := mfg_post_vendor_invoice(po1, 'LRT-2210', '2026-12-09', '2027-01-08', 12, (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'unit_price', l.unit_cost)) from purchase_order_lines l where l.purchase_order_id = po1));
  vi2 := mfg_post_vendor_invoice(po2, 'PFF-0841', '2026-12-04', '2027-01-03', 12, (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'unit_price', l.unit_cost)) from purchase_order_lines l where l.purchase_order_id = po2));
  vi3 := mfg_post_vendor_invoice(po3, 'BC-5532', '2026-12-04', '2027-01-03', 12, (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'unit_price', l.unit_cost)) from purchase_order_lines l where l.purchase_order_id = po3));
  select bill_id into bl from mfg_vendor_invoices where id = vi2;
  perform record_bill_payment(bl, (select total from mfg_vendor_invoices where id = vi2), '2026-12-28', 'Bank transfer');
  select bill_id into bl from mfg_vendor_invoices where id = vi1;
  perform record_bill_payment(bl, 50000, '2026-12-29', 'Bank transfer');

  for rec in select s.id, c.name from sales_orders s join customers c on c.id = s.customer_id where s.tenant_id = v_t and s.status = 'confirmed' order by s.order_date, c.name loop
    lines := (select jsonb_agg(jsonb_build_object('so_line_id', l.id, 'qty', case when rec.name like 'Cebu%' then 28 else l.qty end)) from sales_order_lines l where l.sales_order_id = rec.id);
    if rec.name like 'Cebu%' then
      perform mfg_post_delivery(rec.id, '2026-12-15', lines);  inv_ce := mfg_create_invoice_from_so(rec.id, '2027-01-14', '2026-12-15'); perform post_invoice(inv_ce);
    elsif rec.name like 'Greenleaf%' then
      perform mfg_post_delivery(rec.id, '2026-12-16', lines);  inv_gl := mfg_create_invoice_from_so(rec.id, '2027-01-15', '2026-12-16'); perform post_invoice(inv_gl);
    else
      perform mfg_post_delivery(rec.id, '2026-12-17', lines);  inv_dv := mfg_create_invoice_from_so(rec.id, '2027-01-16', '2026-12-17'); perform post_invoice(inv_dv);
    end if;
  end loop;
  perform record_invoice_payment(inv_gl, (select total from invoices where id = inv_gl), '2026-12-30', 'Bank transfer');
  perform record_invoice_payment(inv_dv, 20000, '2026-12-30', 'Bank transfer');

  -- ---- December: loom, upkeep, downtime, rent, close
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-12-01', 'jv_type', 'GENERAL', 'reference', 'Loom', 'particulars', 'Bought a weaving loom for cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_fa, 'debit', 120000), jsonb_build_object('account_id', a_cash, 'credit', 120000)))); perform mfg_submit_voucher(v);
  insert into fixed_assets (tenant_id, name, purchase_date, cost, salvage_value, useful_life_months) values (v_t, 'Weaving loom', '2026-12-01', 120000, 12000, 36) returning id into asset;
  perform record_depreciation(asset, 3000, '2026-12-31');
  perform mfg_set_work_center_upkeep(wc_w, asset, 30);
  perform mfg_log_downtime(wc_w, '2026-12-09', 3, 'BREAKDOWN', 'Loom belt snapped');
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-12-28', 'jv_type', 'GENERAL', 'reference', 'Workshop rent', 'particulars', 'Workshop rent for December paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opx, 'debit', 24000), jsonb_build_object('account_id', a_cash, 'credit', 24000)))); perform mfg_submit_voucher(v);
  for rec in select id from mfg_production_orders where tenant_id = v_t order by document_number loop perform mfg_settle_order(rec.id, '2026-12-31'); end loop;
  perform mfg_settle_period('2026-12-01');
  perform mfg_close_period('2026-12-01');

  -- ---- January: quality plan, a new order, plan, buy
  perform mfg_save_inspection_plan(i_rat, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'unit', '%', 'spec_min', 8, 'spec_max', 12)));
  perform mfg_save_item_quality(i_rat, true, false);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cu1, '2027-01-04', 'draft', 59808, 12, 6408) returning id into so;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so, i_chr, 'Rattan chair', 24, 1850), (so, i_tbl, 'Side table', 6, 1500);
  update sales_orders set status = 'confirmed' where id = so;
  perform mfg_run_mrp(84, 7, true, '2027-01-04');
  select array_agg(id) into ids from mfg_planned_orders where tenant_id = v_t and status = 'OPEN';
  perform mfg_convert_planned_orders(ids, false);
  po4 := mfg_convert_requisitions(vd1, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', case i.sku when 'FRM-WD' then 100 when 'RAT-STR' then 160 else 1 end)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and q.status = 'OPEN' and i.sku in ('FRM-WD','RAT-STR','SCR-WD')));
  po5 := mfg_convert_requisitions(vd2, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', case i.sku when 'FAB-CL' then 120 when 'FOM-CS' then 85 else 40 end)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and q.status = 'OPEN' and i.sku in ('FAB-CL','FOM-CS','CTN-BX')));
  po6 := mfg_convert_requisitions(vd3, (select jsonb_agg(jsonb_build_object('req_id', q.id, 'unit_price', 320)) from mfg_purchase_reqs q join items i on i.id = q.item_id where q.tenant_id = v_t and q.status = 'OPEN' and i.sku = 'VAR-GL'));
  gr1 := mfg_post_goods_receipt(po4, '2027-01-06', (select jsonb_agg(case when li.item_id = i_rat then jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'location_id', qid) else jsonb_build_object('po_line_id', l.id, 'qty', l.qty) end) from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po4));
  perform mfg_post_goods_receipt(po5, '2027-01-06', (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty)) from purchase_order_lines l where l.purchase_order_id = po5));
  perform mfg_post_goods_receipt(po6, '2027-01-07', (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'batch_no', 'VAR-0127-B', 'expiry', '2028-01-31')) from purchase_order_lines l where l.purchase_order_id = po6));
  select id into lot from mfg_inspection_lots where tenant_id = v_t and item_id = i_rat and status <> 'DECIDED' order by document_number desc limit 1;
  perform mfg_record_inspection(lot, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'value', 13.5)));
  perform mfg_decide_inspection_lot(lot, 57, 0, 4, 0, 'MATERIAL', 'Rattan too damp on 4 bundles', '2027-01-07');
  select id into ncr from mfg_ncr where lot_id = lot;
  perform mfg_close_ncr(ncr, 'Vendor will redeliver 4 kg; moisture to be measured on arrival');
  select id into dl_wd from mfg_material_doc_lines where doc_id = gr1 and item_id = i_wd;
  select id into dl_sc from mfg_material_doc_lines where doc_id = gr1 and item_id = i_scr;
  perform mfg_post_landed_cost(vd1, 'LRT-F-77', '2027-01-08', '2027-02-07', 'VALUE', 1300, 12, 'Trucking from Laguna', jsonb_build_array(jsonb_build_object('doc_line_id', dl_wd), jsonb_build_object('doc_line_id', dl_sc)));
  select id into l3 from purchase_order_lines where purchase_order_id = po6 limit 1;
  vi := mfg_post_vendor_invoice(po6, 'BC-6001', '2027-01-08', '2027-02-07', 12, jsonb_build_array(jsonb_build_object('po_line_id', l3, 'qty', 8.9, 'unit_price', 340)));
  perform mfg_reject_held_invoice(vi, 'Billed at 340 but the order price is 320');
  perform mfg_post_vendor_invoice(po6, 'BC-6001A', '2027-01-09', '2027-02-08', 12, jsonb_build_array(jsonb_build_object('po_line_id', l3, 'qty', 8.9, 'unit_price', 320)));

  -- ---- January: make
  select o.id into o_ch from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'FRM-CH' and o.status = 'CREATED';
  select o.id into o_tb from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'FRM-TB' and o.status = 'CREATED';
  select o.id into o_cr from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'CHR-RT' and o.status = 'CREATED';
  select o.id into o_ts from mfg_production_orders o join items i on i.id = o.item_id where o.tenant_id = v_t and i.sku = 'TBL-SD' and o.status = 'CREATED';
  perform mfg_release_order(o_ch);
  perform mfg_post_material_issue(o_ch, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_ch), '2027-01-08');
  perform mfg_post_confirmation(o_ch, 10, 26, 0, null, 0.5, 21, 10.4, true, '2027-01-09', null);
  perform mfg_post_fg_receipt(o_ch, 26, null, null, null, '2027-01-09');
  perform mfg_release_order(o_tb);
  perform mfg_post_material_issue(o_tb, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_tb), '2027-01-08');
  perform mfg_post_confirmation(o_tb, 10, 6, 0, null, 0.5, 6, 3, true, '2027-01-09', null);
  perform mfg_post_fg_receipt(o_tb, 6, null, null, null, '2027-01-09');
  perform mfg_release_order(o_cr);
  perform mfg_post_material_issue(o_cr, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_cr), '2027-01-10');
  conf := mfg_post_confirmation(o_cr, 10, 26, 0, null, 0.5, 90, 19.5, false, '2027-01-11', null);
  perform mfg_reverse_confirmation(conf, '2027-01-11', 'Wrong labour hours typed');
  perform mfg_post_confirmation(o_cr, 10, 26, 0, null, 0.5, 39, 19.5, false, '2027-01-11', null);
  perform mfg_post_confirmation(o_cr, 20, 26, 0, null, 0.4, 13, 13, true, '2027-01-12', null);
  perform mfg_post_fg_receipt(o_cr, 26, null, null, null, '2027-01-12');
  select l.id into l_rat from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po4 and li.item_id = i_rat;
  perform mfg_post_goods_receipt(po4, '2027-01-12', jsonb_build_array(jsonb_build_object('po_line_id', l_rat, 'qty', 4, 'location_id', qid)));
  select id into lot from mfg_inspection_lots where tenant_id = v_t and item_id = i_rat and status <> 'DECIDED' order by document_number desc limit 1;
  perform mfg_record_inspection(lot, jsonb_build_array(jsonb_build_object('characteristic', 'Moisture', 'value', 10)));
  perform mfg_decide_inspection_lot(lot, 4, 0, 0, 0, null, null, '2027-01-12');
  perform mfg_release_order(o_ts);
  perform mfg_post_material_issue(o_ts, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = o_ts), '2027-01-13');
  perform mfg_post_confirmation(o_ts, 10, 6, 0, null, 0.5, 6, 3, false, '2027-01-14', null);
  perform mfg_post_confirmation(o_ts, 20, 6, 0, null, 0.5, 3.6, 3.6, true, '2027-01-14', null);
  perform mfg_post_fg_receipt(o_ts, 6, null, null, null, '2027-01-14');

  -- ---- January: invoices, deliveries, payments, vouchers, close
  perform mfg_post_vendor_invoice(po4, 'JAN-PO-0004', '2027-01-15', '2027-02-14', 12, (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'unit_price', l.unit_cost)) from purchase_order_lines l where l.purchase_order_id = po4));
  perform mfg_post_vendor_invoice(po5, 'JAN-PO-0005', '2027-01-15', '2027-02-14', 12, (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty, 'unit_price', l.unit_cost)) from purchase_order_lines l where l.purchase_order_id = po5));
  for rec in select s.id, c.name from sales_orders s join customers c on c.id = s.customer_id where s.tenant_id = v_t and s.status = 'confirmed' order by s.order_date, c.name loop
    lines := (select jsonb_agg(jsonb_build_object('so_line_id', l.id, 'qty', case when rec.name like 'Cebu%' then 2 else l.qty end)) from sales_order_lines l where l.sales_order_id = rec.id);
    if rec.name like 'Cebu%' then
      perform mfg_post_delivery(rec.id, '2027-01-16', lines);  inv := mfg_create_invoice_from_so(rec.id, '2027-02-15', '2027-01-16'); perform post_invoice(inv);
    else
      perform mfg_post_delivery(rec.id, '2027-01-17', lines);  inv := mfg_create_invoice_from_so(rec.id, '2027-02-16', '2027-01-17'); perform post_invoice(inv);
    end if;
  end loop;
  perform record_invoice_payment(inv_ce, (select total from invoices where id = inv_ce), '2027-01-20', 'Bank transfer');
  perform record_invoice_payment(inv_dv, (select total from invoices where id = inv_dv) - 20000, '2027-01-20', 'Bank transfer');
  select bill_id into bl from mfg_vendor_invoices where id = vi1;
  perform record_bill_payment(bl, (select total from mfg_vendor_invoices where id = vi1) - 50000, '2027-01-22', 'Bank transfer');
  select bill_id into bl from mfg_vendor_invoices where id = vi3;
  perform record_bill_payment(bl, (select total from mfg_vendor_invoices where id = vi3), '2027-01-22', 'Bank transfer');
  perform record_depreciation(asset, 3000, '2027-01-31');
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2027-01-28', 'jv_type', 'GENERAL', 'reference', 'Workshop rent', 'particulars', 'Workshop rent for January paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opx, 'debit', 24000), jsonb_build_object('account_id', a_cash, 'credit', 24000)))); perform mfg_submit_voucher(v);
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2027-01-25', 'jv_type', 'GENERAL', 'reference', 'Facebook ads', 'particulars', 'Online ads paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_opx, 'debit', 5000), jsonb_build_object('account_id', a_cash, 'credit', 5000)))); perform mfg_submit_voucher(v);
  perform mfg_reverse_voucher(v, '2027-01-26', 'Should be Marketing Expense');
  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2027-01-26', 'jv_type', 'GENERAL', 'reference', 'Facebook ads', 'particulars', 'Online ads paid in cash, to Marketing',
        'lines', jsonb_build_array(jsonb_build_object('account_id', a_mkt, 'debit', 5000), jsonb_build_object('account_id', a_cash, 'credit', 5000)))); perform mfg_submit_voucher(v);
  for rec in select id from mfg_production_orders where tenant_id = v_t and status <> 'TECHNICALLY_COMPLETE' order by document_number loop perform mfg_settle_order(rec.id, '2027-01-31'); end loop;
  perform mfg_settle_period('2027-01-01');
  perform mfg_close_period('2027-01-01');

  insert into mfg_audit_log (tenant_id, event, detail, created_by) values (v_t, 'activity_key_loaded', jsonb_build_object('activity', 'activity-2-manufacturing'), auth.uid());
  return jsonb_build_object('activity', 'activity-2-manufacturing', 'months', jsonb_build_array('2026-12', '2027-01'));
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg__load_activity_2(uuid) from public, anon, authenticated;

-- ---------- both activities are accepted, and the right key is loaded ----------
do $do$
declare
  d text; n text;
begin
  for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('mfg_activity_release', 'mfg_activity_release_company', 'mfg_open_answer_key') loop
    n := replace(d, 'p_activity <> ''activity-1-manufacturing''', 'p_activity not in (''activity-1-manufacturing'', ''activity-2-manufacturing'')');
    if position('mfg_open_answer_key' in d) > 0 and position('mfg__load_activity_1' in d) > 0 then
      n := replace(n, 'array[''PURCHASING'', ''WAREHOUSE'', ''PRODUCTION'', ''SALES'', ''FINANCE_MANAGER'']', 'array[''PURCHASING'', ''WAREHOUSE'', ''PRODUCTION'', ''QUALITY'', ''SALES'', ''ACCOUNTANT'', ''FINANCE_MANAGER'']');
      n := replace(n, 'mfg__make_answer_company(''Activity 1 answer key'',', 'mfg__make_answer_company(case p_activity when ''activity-2-manufacturing'' then ''Activity 2 answer key'' else ''Activity 1 answer key'' end,');
      n := replace(n, 'perform mfg__load_activity_1(t);', 'if p_activity = ''activity-2-manufacturing'' then perform mfg__load_activity_2(t); else perform mfg__load_activity_1(t); end if;');
      if position('mfg__load_activity_2' in n) = 0 or position('Activity 2 answer key' in n) = 0 or position('''QUALITY''' in n) = 0 then
        raise exception 'mfg_open_answer_key did not look as expected; nothing changed.';
      end if;
    end if;
    if n = d then raise exception 'a release function did not look as expected; nothing changed.'; end if;
    execute n;
  end loop;
end $do$;

revoke execute on function mfg_activity_release(text, uuid, boolean) from public, anon;
revoke execute on function mfg_activity_release_company(text, uuid, boolean) from public, anon;
revoke execute on function mfg_open_answer_key(text) from public, anon;
grant execute on function mfg_activity_release(text, uuid, boolean) to authenticated;
grant execute on function mfg_activity_release_company(text, uuid, boolean) to authenticated;
grant execute on function mfg_open_answer_key(text) to authenticated;
