-- ============================================================
-- Classroom ERP — migration 0053 (Manufacturing ERP, Phase 11b: the answer key gets its own read-only company)
--
-- Needs 0050–0052. Found in the pilot: a student can own only ONE solo Manufacturing company (unique index tenant_editions_one_mfg_per_owner),
-- and it is the company they did the activity in, so "load the answer key into a new empty company" (0051) could not work. Instead the answer
-- key is now its OWN company, made for the student on demand and read-only: it is a team-style company (no owner in tenant_editions, a row in
-- mfg_teams) where the student holds only the AUDITOR role, which reads everything and posts nothing.
--
--   mfg_activity_keys                      Which company is a student's answer-key company (one per activity per student).
--   mfg__load_activity_1(tenant)           Internal: posts the Activity 1 answer key into a company, as the signed-in user (who then holds all roles).
--   mfg_open_answer_key(activity)          Student: after release, makes (once) and opens their answer-key company. Never touches their own company.
--   mfg_activity_release_company(...)      Teacher: release or take back for the student(s) of one company (the owner, or every member of a team).
--   mfg_activity_release_state(...)        Teacher: replaced to understand team companies.
--   mfg_load_activity_key(activity)        Dropped (0051's load-into-an-empty-company); nothing used it but the card, which is replaced.
--
-- ROLLBACK:  drop function if exists mfg_open_answer_key(text), mfg__load_activity_1(uuid), mfg_activity_release_company(text, uuid, boolean); drop table if exists mfg_activity_keys;
-- ============================================================

create table if not exists mfg_activity_keys (
  activity   text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity, user_id)
);
alter table mfg_activity_keys enable row level security;       -- no policies: only the functions below touch it

drop function if exists mfg_load_activity_key(text);

create or replace function mfg__load_activity_1(p_tenant uuid)
returns jsonb as $$
declare
  v_t uuid := p_tenant;
  m date := '2026-11-01';
  i_pole uuid; i_rat uuid; i_lac uuid; i_ctn uuid; i_bsk uuid; i_std uuid;
  wc_w uuid; wc_f uuid; b uuid; rt uuid; est uuid;
  e_nena uuid; e_toto uuid; vend1 uuid; vend2 uuid; cust1 uuid; cust2 uuid;
  po1 uuid; po2 uuid; l_pole uuid; l_rat uuid; l_ctn uuid; l_lac uuid; oa uuid; ob uuid;
  so1 uuid; so2 uuid; sl1 uuid; sl2 uuid; sl3 uuid; inv uuid; v uuid;
begin
  insert into vendors (tenant_id, name) values (v_t, 'Laguna Bamboo Traders') returning id into vend1;
  insert into vendors (tenant_id, name) values (v_t, 'Pasig Packaging Supply') returning id into vend2;
  insert into customers (tenant_id, name) values (v_t, 'Greenleaf Home Store') returning id into cust1;
  insert into customers (tenant_id, name) values (v_t, 'Cebu Gift Shop') returning id into cust2;
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (v_t, 'Aling Nena Reyes', 'Weaver', 0, 'hourly', 80) returning id into e_nena;
  insert into employees (tenant_id, name, title, salary, pay_type, hourly_rate) values (v_t, 'Mang Totoy Cruz', 'Finisher', 0, 'hourly', 90) returning id into e_toto;

  i_pole := mfg_save_item(null, jsonb_build_object('sku','BAM-POLE','name','Bamboo pole','item_type','RAW','make_or_buy','BUY','base_uom','PC','planned_price',45,'procurement_lead_days',5));
  i_rat  := mfg_save_item(null, jsonb_build_object('sku','RAT-STR','name','Rattan strip','item_type','RAW','make_or_buy','BUY','base_uom','KG','planned_price',160,'procurement_lead_days',5));
  i_lac  := mfg_save_item(null, jsonb_build_object('sku','LAC-CL','name','Clear lacquer','item_type','RAW','make_or_buy','BUY','base_uom','L','planned_price',280,'procurement_lead_days',3));
  i_ctn  := mfg_save_item(null, jsonb_build_object('sku','CTN-GB','name','Gift carton','item_type','PACKAGING','make_or_buy','BUY','base_uom','PC','planned_price',30,'procurement_lead_days',3));
  i_bsk  := mfg_save_item(null, jsonb_build_object('sku','BSK-LD','name','Laundry basket','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));
  i_std  := mfg_save_item(null, jsonb_build_object('sku','STD-PL','name','Plant stand','item_type','FINISHED','make_or_buy','MAKE','base_uom','PC','production_lead_days',7));

  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (v_t, 'Weaving', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_w;
  insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days)
    values (v_t, 'Finishing', 1, 8, 90, 100, '{1,2,3,4,5,6}') returning id into wc_f;
  insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
    select v_t, w.id, a.id, m, case a.kind when 'LABOR' then 80 else case w.id when wc_w then 25 else 40 end end
      from mfg_activity_types a cross join (select wc_w as id union all select wc_f) w
     where a.tenant_id = v_t and a.kind in ('LABOR', 'MACHINE');
  update mfg_costing_sheet set oh_rate_per_hour = 30 where tenant_id = v_t and kind = 'FIXED';

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

  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-02', 'jv_type', 'GENERAL', 'reference', 'Capital', 'particulars', 'Owner puts in the starting cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '1000'), 'debit', 100000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '3000'), 'credit', 100000))));
  perform mfg_submit_voucher(v);

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

  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust1, '2026-11-19', 'draft', 35728, 12, 3828) returning id into so1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_bsk, 'Laundry basket', 30, 780) returning id into sl1;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so1, i_std, 'Plant stand', 10, 850) returning id into sl2;
  update sales_orders set status = 'confirmed' where id = so1;
  perform mfg_post_delivery(so1, '2026-11-20', jsonb_build_array(jsonb_build_object('so_line_id', sl1, 'qty', 30), jsonb_build_object('so_line_id', sl2, 'qty', 10)));
  inv := mfg_create_invoice_from_so(so1, '2026-12-21', '2026-11-21'); perform post_invoice(inv);
  insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount) values (v_t, cust2, '2026-11-25', 'draft', 13272, 12, 1422) returning id into so2;
  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price) values (so2, i_bsk, 'Laundry basket', 15, 790) returning id into sl3;
  update sales_orders set status = 'confirmed' where id = so2;
  perform mfg_post_delivery(so2, '2026-11-26', jsonb_build_array(jsonb_build_object('so_line_id', sl3, 'qty', 15)));
  inv := mfg_create_invoice_from_so(so2, '2026-12-27', '2026-11-27'); perform post_invoice(inv);

  v := mfg_save_voucher(null, jsonb_build_object('voucher_date', '2026-11-28', 'jv_type', 'GENERAL', 'reference', 'Workshop rent', 'particulars', 'Workshop rent for November paid in cash',
        'lines', jsonb_build_array(jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '5100'), 'debit', 6000),
                                   jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = '1000'), 'credit', 6000))));
  perform mfg_submit_voucher(v);
  perform mfg_settle_period(m);
  perform mfg_close_period(m);

  insert into mfg_audit_log (tenant_id, event, detail, created_by) values (v_t, 'activity_key_loaded', jsonb_build_object('activity', 'activity-1-manufacturing'), auth.uid());
  return jsonb_build_object('activity', 'activity-1-manufacturing', 'month', '2026-11', 'items', 6, 'orders', 2, 'invoices', 2);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg__load_activity_1(uuid) from public, anon, authenticated;

-- the students a release applies to for one company: its owner (solo company) or every student member (team company)
create or replace function mfg__release_users(p_tenant uuid)
returns table (user_id uuid) as $$
begin
  if exists (select 1 from mfg_teams where tenant_id = p_tenant) then
    return query select m.user_id from memberships m join profiles p on p.id = m.user_id where m.tenant_id = p_tenant and p.role = 'student';
  else
    return query select e.owner_id from tenant_editions e where e.tenant_id = p_tenant and e.owner_id is not null;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function mfg__release_users(uuid) from public, anon, authenticated;

create or replace function mfg_activity_release_company(p_activity text, p_tenant uuid, p_release boolean default true)
returns integer as $$
declare
  n integer := 0; u uuid;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can release an answer key.'; end if;
  if p_activity <> 'activity-1-manufacturing' then raise exception 'Unknown activity.'; end if;
  for u in select r.user_id from mfg__release_users(p_tenant) r loop
    perform mfg_activity_release(p_activity, u, p_release);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'That company has no student to release the key to.'; end if;
  return n;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_activity_release_state(p_activity text, p_tenant uuid)
returns jsonb as $$
declare
  total integer; released integer;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  select count(*), count(*) filter (where exists (select 1 from mfg_activity_releases a where a.activity = p_activity and a.user_id = r.user_id))
    into total, released from mfg__release_users(p_tenant) r;
  return jsonb_build_object(
    'class', exists (select 1 from mfg_activity_releases where activity = p_activity and user_id is null),
    'owner', total > 0 and released = total,
    'has_owner', total > 0,
    'students', total);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_open_answer_key(p_activity text)
returns uuid as $$
declare
  me uuid := auth.uid(); t uuid; d text; n text; r text;
  full_roles text[] := array['PURCHASING', 'WAREHOUSE', 'PRODUCTION', 'SALES', 'FINANCE_MANAGER'];
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers do not load the answer key; students do.'; end if;
  if p_activity <> 'activity-1-manufacturing' then raise exception 'Unknown activity.'; end if;
  if not mfg_activity_key_available(p_activity) then
    raise exception 'Your teacher has not released the answer key yet. Finish the activity and ask your teacher to check it first.';
  end if;

  select tenant_id into t from mfg_activity_keys where activity = p_activity and user_id = me;
  if t is null then
    -- a read-only team-style company, made by the same function the teacher uses for team companies, minus its teacher-only guard
    d := pg_get_functiondef('mfg_create_team_company(text, date, text)'::regprocedure);
    n := replace(d, 'mfg_create_team_company(', 'mfg__make_answer_company(');
    n := regexp_replace(n, 'if is_teacher\(\) is not true then raise exception ''Only the teacher can create a team company\.''; end if;', '', 'g');
    if n = d or position('Only the teacher can create a team company' in n) > 0 then raise exception 'Could not prepare the answer-key company (function text changed).'; end if;
    execute n;
    t := mfg__make_answer_company('Activity 1 answer key', date '2026-01-01', 'STANDARD');
    drop function mfg__make_answer_company(text, date, text);
    insert into memberships (user_id, tenant_id) values (me, t) on conflict do nothing;
    insert into mfg_company_roles (tenant_id, user_id, role, assigned_by) select t, me, x, me from unnest(full_roles) x;
    update profiles set tenant_id = t where id = me;
    perform mfg__load_activity_1(t);
    delete from mfg_company_roles where tenant_id = t and user_id = me;
    insert into mfg_company_roles (tenant_id, user_id, role, assigned_by) values (t, me, 'AUDITOR', me);
    insert into mfg_activity_keys (activity, user_id, tenant_id) values (p_activity, me, t);
  else
    update profiles set tenant_id = t where id = me;
  end if;
  insert into edition_last_used (user_id, edition, tenant_id) values (me, 'MANUFACTURING', t)
    on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = now();
  return t;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_activity_release_company(text, uuid, boolean) from public, anon;
revoke execute on function mfg_open_answer_key(text) from public, anon;
grant execute on function mfg_activity_release_company(text, uuid, boolean) to authenticated;
grant execute on function mfg_open_answer_key(text) to authenticated;
