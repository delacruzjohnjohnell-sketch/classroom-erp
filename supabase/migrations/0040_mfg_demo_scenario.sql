-- ============================================================
-- Classroom ERP — migration 0040 (Manufacturing ERP, Phase 7b: the demo company)
--
-- Needs 0023–0039. ADDITIVE ONLY: one new function. It creates nothing by itself that the app cannot already create — it calls the
-- same functions the screens call, as the signed-in student, so every posting is the real thing and the books check ties.
--
--   mfg_load_demo()   Fills an EMPTY Manufacturing company (no items, no production orders) with a small wooden-furniture shop in
--                     Nueva Ecija and two months of its life, so a student can see every screen with real figures:
--                       items        Narra lumber, marine plywood, wood screws, varnish (batch tracked), sandpaper, carton box,
--                                    Dining chair, Study table
--                       setup        3 work centres (Cutting, Assembly, Finishing) with hourly rates, an overhead rate, bills of
--                                    materials, 3-step routings, two hourly workers; under standard costing the cost estimates
--                                    are released so the products carry a standard cost
--                       LAST MONTH   opening stock; two purchase orders (the plywood arrives late; the hardware order is invoiced and
--                                    matched); a Dining chair order of 40 (38 good, 2 scrap, lumber over-used) and a Study table order of
--                                    15 made right; both settled; two sales orders delivered and invoiced
--                       THIS MONTH   a Dining chair order of 60 released with sawing done and some material issued (work in process);
--                                    an open purchase order; a confirmed sales order not yet delivered; an MRP run on that demand
--                     Last month is ready to settle and close under Period End. Payroll is deliberately NOT run, so Period End warns
--                     that the production wages have not been posted — a good thing to fix as an exercise. Dates are relative to today.
--
-- ROLLBACK (drops only what this file created):  drop function if exists mfg_load_demo();
-- ============================================================

create or replace function mfg_load_demo()
returns jsonb as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;          -- first day of last month
  m2 date := date_trunc('month', current_date)::date;                                 -- first day of this month
  i_lum uuid; i_ply uuid; i_scr uuid; i_var uuid; i_snd uuid; i_box uuid; i_chair uuid; i_table uuid;
  b uuid; rt uuid; est uuid;
  wc_cut uuid; wc_asm uuid; wc_fin uuid;
  e_ben uuid; e_rosa uuid; vend1 uuid; vend2 uuid; cust1 uuid; cust2 uuid;
  loc_rm uuid;
  po1 uuid; po2 uuid; po3 uuid; pl_lum uuid; pl_ply uuid; pl_scr uuid; pl_var uuid; pl_snd uuid; pl_box uuid;
  oa uuid; ob uuid; oc uuid;
  so1 uuid; so2 uuid; so3 uuid; sl1 uuid; sl2 uuid; sl3 uuid; sl4 uuid; sl5 uuid; inv uuid;
begin
  select costing_method into v_method from mfg_company_settings where tenant_id = v_t;
  if exists (select 1 from mfg_item_master where tenant_id = v_t) or exists (select 1 from mfg_production_orders where tenant_id = v_t) then
    raise exception 'The demo needs an empty company. This one already has items or production orders. Make a new Manufacturing company to try the demo.';
  end if;
  if exists (select 1 from tenants where id = v_t and books_locked_through is not null and books_locked_through >= m1) then
    raise exception 'The books are locked, so the demo cannot post last month''s entries.';
  end if;

  -- ---------- master data ----------
  i_lum := mfg_save_item(null, jsonb_build_object('sku','LUM-NARRA','name','Narra lumber','item_type','RAW','make_or_buy','BUY','base_uom','BF','planned_price',95,'procurement_lead_days',5,'safety_stock',60));
  i_ply := mfg_save_item(null, jsonb_build_object('sku','PLY-34','name','Marine plywood 3/4"','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',1450,'procurement_lead_days',7));
  i_scr := mfg_save_item(null, jsonb_build_object('sku','SCR-WD','name','Wood screws','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',0.8,'procurement_lead_days',3));
  i_var := mfg_save_item(null, jsonb_build_object('sku','VAR-GL','name','Varnish','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',320,'batch_tracked',true,'procurement_lead_days',3));
  i_snd := mfg_save_item(null, jsonb_build_object('sku','SND-SH','name','Sandpaper sheet','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',12,'procurement_lead_days',3));
  i_box := mfg_save_item(null, jsonb_build_object('sku','BOX-CT','name','Carton box','item_type','PACKAGING','make_or_buy','BUY','base_uom','PC','planned_price',45,'procurement_lead_days',3));
  i_chair := mfg_save_item(null, jsonb_build_object('sku','CHAIR-D','name','Dining chair','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',10));
  i_table := mfg_save_item(null, jsonb_build_object('sku','TABLE-S','name','Study table','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',12));

  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (v_t, 'Cutting', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_cut;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (v_t, 'Assembly', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_asm;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
  values (v_t, 'Finishing', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_fin;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select v_t, w.id, a.id, m1,
           case a.kind when 'LABOR' then 85 else case w.id when wc_cut then 120 when wc_asm then 40 else 60 end end
      from mfg_activity_types a cross join (select wc_cut as id union all select wc_asm union all select wc_fin) w
     where a.tenant_id = v_t and a.kind in ('LABOR', 'MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 40 where tenant_id = v_t and kind = 'FIXED';

  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (v_t, 'Mang Ben Salonga', 'Carpenter', 0, 'hourly', 90) returning id into e_ben;
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (v_t, 'Aling Rosa Dela Cruz', 'Finisher', 0, 'hourly', 85) returning id into e_rosa;
  insert into vendors (tenant_id, name) values (v_t, 'Cabanatuan Timber Supply') returning id into vend1;
  insert into vendors (tenant_id, name) values (v_t, 'Gapan Hardware & Finishes') returning id into vend2;
  insert into customers (tenant_id, name) values (v_t, 'Casa Muebles Manila') returning id into cust1;
  insert into customers (tenant_id, name) values (v_t, 'Nueva Ecija Homes') returning id into cust2;

  b := mfg_save_bom(null, jsonb_build_object('item_id', i_chair, 'valid_from', m1, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_lum, 'qty', 3, 'uom', 'BF'), jsonb_build_object('component_item_id', i_scr, 'qty', 8, 'uom', 'PC'),
    jsonb_build_object('component_item_id', i_var, 'qty', 0.2, 'uom', 'L'), jsonb_build_object('component_item_id', i_snd, 'qty', 0.5, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  b := mfg_save_bom(null, jsonb_build_object('item_id', i_table, 'valid_from', m1, 'lines', jsonb_build_array(
    jsonb_build_object('component_item_id', i_ply, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_lum, 'qty', 6, 'uom', 'BF'),
    jsonb_build_object('component_item_id', i_scr, 'qty', 16, 'uom', 'PC'), jsonb_build_object('component_item_id', i_var, 'qty', 0.35, 'uom', 'L'),
    jsonb_build_object('component_item_id', i_snd, 'qty', 1, 'uom', 'PC'), jsonb_build_object('component_item_id', i_box, 'qty', 1, 'uom', 'PC'))));
  perform mfg_activate_bom(b);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_chair, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Cut the parts', 'work_center_id', wc_cut, 'setup_min', 30, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30),
    jsonb_build_object('op_no', 20, 'description', 'Assemble', 'work_center_id', wc_asm, 'setup_min', 15, 'run_min_per_unit', 60, 'labor_min_per_unit', 60, 'machine_min_per_unit', 20),
    jsonb_build_object('op_no', 30, 'description', 'Sand and varnish', 'work_center_id', wc_fin, 'setup_min', 20, 'run_min_per_unit', 30, 'labor_min_per_unit', 30, 'machine_min_per_unit', 30))));
  perform mfg_activate_routing(rt);
  rt := mfg_save_routing(null, jsonb_build_object('item_id', i_table, 'ops', jsonb_build_array(
    jsonb_build_object('op_no', 10, 'description', 'Cut the top and legs', 'work_center_id', wc_cut, 'setup_min', 30, 'run_min_per_unit', 45, 'labor_min_per_unit', 45, 'machine_min_per_unit', 45),
    jsonb_build_object('op_no', 20, 'description', 'Assemble', 'work_center_id', wc_asm, 'setup_min', 15, 'run_min_per_unit', 70, 'labor_min_per_unit', 70, 'machine_min_per_unit', 25),
    jsonb_build_object('op_no', 30, 'description', 'Sand and varnish', 'work_center_id', wc_fin, 'setup_min', 20, 'run_min_per_unit', 35, 'labor_min_per_unit', 35, 'machine_min_per_unit', 35))));
  perform mfg_activate_routing(rt);

  -- estimates; under standard costing they are released so the products carry a standard cost
  est := mfg_create_cost_estimate(i_chair, 20, m1 + 1);
  if v_method = 'STANDARD' then perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, m1 + 1); end if;
  est := mfg_create_cost_estimate(i_table, 10, m1 + 1);
  if v_method = 'STANDARD' then perform mfg_mark_cost_estimate(est); perform mfg_release_cost_estimate(est, m1 + 1); end if;

  -- ---------- last month ----------
  select id into loc_rm from mfg_storage_locations where tenant_id = v_t and code = 'RM-STORE';
  perform mfg_post_stock_adjustment(i_lum, loc_rm, 300, 95, 'OPENING', m1 + 1);
  perform mfg_post_stock_adjustment(i_ply, loc_rm, 12, 1450, 'OPENING', m1 + 1);
  perform mfg_post_stock_adjustment(i_scr, loc_rm, 2000, 0.8, 'OPENING', m1 + 1);

  po1 := mfg_create_po(vend1, m1 + 2, m1 + 5, jsonb_build_array(
    jsonb_build_object('item_id', i_lum, 'qty', 400, 'unit_price', 100), jsonb_build_object('item_id', i_ply, 'qty', 15, 'unit_price', 1500)));
  po2 := mfg_create_po(vend2, m1 + 2, m1 + 6, jsonb_build_array(
    jsonb_build_object('item_id', i_scr, 'qty', 4000, 'unit_price', 0.8), jsonb_build_object('item_id', i_var, 'qty', 30, 'unit_price', 330),
    jsonb_build_object('item_id', i_snd, 'qty', 300, 'unit_price', 12), jsonb_build_object('item_id', i_box, 'qty', 60, 'unit_price', 45)));
  select l.id into pl_lum from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_lum;
  select l.id into pl_ply from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po1 and li.item_id = i_ply;
  select l.id into pl_scr from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_scr;
  select l.id into pl_var from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_var;
  select l.id into pl_snd from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_snd;
  select l.id into pl_box from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id where l.purchase_order_id = po2 and li.item_id = i_box;
  perform mfg_post_goods_receipt(po1, m1 + 5, jsonb_build_array(jsonb_build_object('po_line_id', pl_lum, 'qty', 400)));             -- on time
  perform mfg_post_goods_receipt(po2, m1 + 6, jsonb_build_array(
    jsonb_build_object('po_line_id', pl_scr, 'qty', 4000),
    jsonb_build_object('po_line_id', pl_var, 'qty', 30, 'batch_no', 'VRN-' || to_char(m1, 'YYMM'), 'expiry', m1 + 365),
    jsonb_build_object('po_line_id', pl_snd, 'qty', 300), jsonb_build_object('po_line_id', pl_box, 'qty', 60)));
  perform mfg_post_goods_receipt(po1, m1 + 10, jsonb_build_array(jsonb_build_object('po_line_id', pl_ply, 'qty', 15)));            -- the plywood is 5 days late
  perform mfg_post_vendor_invoice(po2, 'GH-2209', m1 + 8, m1 + 38, 12, jsonb_build_array(
    jsonb_build_object('po_line_id', pl_scr, 'qty', 4000, 'unit_price', 0.8), jsonb_build_object('po_line_id', pl_var, 'qty', 30, 'unit_price', 330),
    jsonb_build_object('po_line_id', pl_snd, 'qty', 300, 'unit_price', 12), jsonb_build_object('po_line_id', pl_box, 'qty', 60, 'unit_price', 45)));

  -- Dining chair order: 40 planned, lumber over-used, 38 good + 2 scrap
  oa := mfg_create_order(i_chair, 40, m1 + 7, m1 + 19);
  perform mfg_release_order(oa);
  perform mfg_post_material_issue(oa, (
    select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty',
             case when c.item_id = i_lum then 128 when c.item_id = i_scr then 330 when c.item_id = i_var then 8.5 else c.qty_required end))
      from mfg_prod_components c where c.order_id = oa), m1 + 8);
  perform mfg_post_confirmation(oa, 10, 40, 0, null, 0.5, 22, 21, false, m1 + 9, e_ben);
  perform mfg_post_confirmation(oa, 20, 40, 0, null, 0.25, 44, 14, false, m1 + 12, e_ben);
  perform mfg_post_confirmation(oa, 30, 38, 2, 'Varnish ran and spoiled two chairs', 0.33, 21, 20, true, m1 + 16, e_rosa);
  perform mfg_post_fg_receipt(oa, 38, null, null, null, m1 + 17);
  perform mfg_settle_order(oa, m1 + 27);

  -- Study table order: 15, made right
  ob := mfg_create_order(i_table, 15, m1 + 9, m1 + 21);
  perform mfg_release_order(ob);
  perform mfg_post_material_issue(ob, (
    select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = ob), m1 + 11);
  perform mfg_post_confirmation(ob, 10, 15, 0, null, 0.5, 11.25, 11.25, false, m1 + 13, e_ben);
  perform mfg_post_confirmation(ob, 20, 15, 0, null, 0.25, 17.5, 6.25, false, m1 + 17, e_ben);
  perform mfg_post_confirmation(ob, 30, 15, 0, null, 0.33, 8.75, 8.75, true, m1 + 20, e_rosa);
  perform mfg_post_fg_receipt(ob, 15, null, null, null, m1 + 21);
  perform mfg_settle_order(ob, m1 + 27);

  -- sales: two orders delivered and invoiced
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust1, m1 + 18, 'draft', 89432, 12, 9582) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_chair, 'Dining chair', 25, 1850) returning id into sl1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_table, 'Study table', 8, 4200) returning id into sl2;
  update sales_orders set status = 'confirmed' where id = so1;
  perform mfg_post_delivery(so1, m1 + 23, jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 25), jsonb_build_object('so_line_id', sl2, 'qty', 8)));
  inv := mfg_create_invoice_from_so(so1, m1 + 24);
  perform post_invoice(inv);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust2, m1 + 22, 'draft', 21280, 12, 2280) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_chair, 'Dining chair', 10, 1900) returning id into sl3;
  update sales_orders set status = 'confirmed' where id = so2;
  perform mfg_post_delivery(so2, m1 + 25, jsonb_build_array(jsonb_build_object('so_line_id', sl3, 'qty', 10)));
  inv := mfg_create_invoice_from_so(so2, m1 + 26);
  perform post_invoice(inv);

  -- ---------- this month (dates never in the future) ----------
  oc := mfg_create_order(i_chair, 60, least(m2 + 1, current_date), m2 + 14);
  perform mfg_release_order(oc);
  perform mfg_post_material_issue(oc, (
    select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', round(c.qty_required / 2, 3)))
      from mfg_prod_components c where c.order_id = oc and c.item_id in (i_lum, i_scr)), least(m2 + 2, current_date));
  perform mfg_post_confirmation(oc, 10, 60, 0, null, 0.5, 32, 31, false, least(m2 + 3, current_date), e_ben);

  po3 := mfg_create_po(vend1, least(m2 + 2, current_date), m2 + 20, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 500, 'unit_price', 102)));

  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust1, least(m2 + 2, current_date), 'draft', 130592, 12, 13992) returning id into so3;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so3, i_chair, 'Dining chair', 40, 1850) returning id into sl4;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so3, i_table, 'Study table', 10, 4200) returning id into sl5;
  update sales_orders set status = 'confirmed' where id = so3;
  perform mfg_run_mrp(84, 7, true, current_date);

  insert into mfg_audit_log (tenant_id, event, detail, created_by) values (v_t, 'demo_loaded', jsonb_build_object('last_month', to_char(m1, 'YYYY-MM')), auth.uid());
  return jsonb_build_object('last_month', to_char(m1, 'YYYY-MM'), 'items', 8, 'work_centers', 3, 'orders', 3, 'purchase_orders', 3, 'sales_orders', 3);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_load_demo() from public, anon;
grant execute on function mfg_load_demo() to authenticated;
