-- ============================================================
-- Classroom ERP — migration 0064 (Activity 3 Manufacturing: the answer figures, teacher only, and the per-role scorecard)
--
-- Needs 0052, 0059, 0063. ADDITIVE.
--   mfg_practice_sets row 'capiz-feb-mar-2027'   The figures the Check compares a team company with. They are NOT typed in: this migration runs the Activity 3 answer key
--                                                in a throw-away team company inside a sub-transaction, reads the company's own snapshot (mfg_practice_snapshot_a2), turns it
--                                                into the set definition, and the sub-transaction is rolled back, so no company is left behind.
--   mfg_role_scorecard(tenant)                   Teacher only, read only. For every member of a team company: the roles they hold and how many documents each of them posted
--                                                (stock moves by type, production confirmations, orders, inspections decided, vendor invoices, payments, vouchers prepared and approved).
--
-- ROLLBACK:  drop function if exists mfg_role_scorecard(uuid);   delete from mfg_practice_sets where id = 'capiz-feb-mar-2027';
-- ============================================================

create or replace function mfg_role_scorecard(p_tenant uuid)
returns table (user_id uuid, full_name text, roles text[], counts jsonb) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the scorecard.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  with who as (
    select m.user_id as uid from memberships m where m.tenant_id = p_tenant
  ), c as (
    select created_by as uid, 'stock ' || lower(doc_type) as k, count(*) n from mfg_material_documents where tenant_id = p_tenant group by 1, 2
    union all select created_by, 'confirmations', count(*) from mfg_confirmations where tenant_id = p_tenant group by 1
    union all select created_by, 'production orders made', count(*) from mfg_production_orders where tenant_id = p_tenant group by 1
    union all select created_by, 'planned orders', count(*) from mfg_planned_orders where tenant_id = p_tenant group by 1
    union all select decided_by, 'inspections decided', count(*) from mfg_inspection_lots where tenant_id = p_tenant and decided_by is not null group by 1
    union all select created_by, 'vendor invoices entered', count(*) from mfg_vendor_invoices where tenant_id = p_tenant group by 1
    union all select approved_by, 'held invoices released', count(*) from mfg_vendor_invoices where tenant_id = p_tenant and approved_by is not null group by 1
    union all select created_by, 'customer payments recorded', count(*) from invoice_payments where tenant_id = p_tenant group by 1
    union all select created_by, 'vendor payments made', count(*) from bill_payments where tenant_id = p_tenant group by 1
    union all select prepared_by, 'vouchers prepared', count(*) from mfg_vouchers where tenant_id = p_tenant and prepared_by is not null group by 1
    union all select approved_by, 'vouchers approved', count(*) from mfg_vouchers where tenant_id = p_tenant and approved_by is not null group by 1
    union all select created_by, 'cost estimates', count(*) from mfg_cost_estimates where tenant_id = p_tenant group by 1
    union all select settled_by, 'months settled', count(*) from mfg_periods where tenant_id = p_tenant group by 1
    union all select closed_by, 'months closed', count(*) from mfg_periods where tenant_id = p_tenant and closed_by is not null group by 1
  )
  select w.uid, coalesce(p.full_name, '—'),
         coalesce((select array_agg(r.role order by r.role) from mfg_company_roles r where r.tenant_id = p_tenant and r.user_id = w.uid), '{}'::text[]),
         coalesce((select jsonb_object_agg(c.k, c.n) from c where c.uid = w.uid), '{}'::jsonb)
    from who w left join profiles p on p.id = w.uid
   order by 2;
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function mfg_role_scorecard(uuid) from public, anon;
grant execute on function mfg_role_scorecard(uuid) to authenticated;

do $do$
declare
  teacher uuid; student uuid; t uuid; def jsonb;
begin
  teacher := (select id from profiles where role = 'teacher' order by created_at limit 1);
  student := (select id from profiles where role = 'student' order by created_at limit 1);
  if teacher is null or student is null then raise exception 'A teacher and a student account are needed to build the answer set.'; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
    t := mfg_create_team_company('Activity 3 answer set build', date '2026-01-01', 'STANDARD');
    insert into memberships (user_id, tenant_id) values (student, t) on conflict do nothing;
    insert into mfg_company_roles (tenant_id, user_id, role, assigned_by)
      select t, student, x, teacher from unnest(array['PURCHASING','WAREHOUSE','PRODUCTION','QUALITY','SALES','ACCOUNTANT','FINANCE_MANAGER']) x;
    update profiles set tenant_id = t where id = student;
    perform set_config('request.jwt.claims', json_build_object('sub', student, 'role', 'authenticated')::text, true);
    perform mfg__load_activity_3(t);
    perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
    select jsonb_build_object(
 'id','capiz-feb-mar-2027','name','Activity 3 Manufacturing — Capiz Lantern Works, February and March 2027 (team company)',
 'summary','Standard costing. Two months run by a team: five vendors, six customers, three semi-finished and five finished products, planning twice a month, quality inspection of bought items and of every finished lamp, rework, landed cost, a hand-made rush order, held vendor invoices, deliveries and partial payments, a fixed asset, vouchers with approval and a reversal, then settle and close both months.',
 'vendors', s->'vendors', 'customers', s->'customers', 'employees','[]'::jsonb, 'workCenters', s->'work_centers',
 'rates', (select jsonb_agg(jsonb_build_object('workCenter',r->>'work_center','kind',r->>'kind','rate',(r->>'rate')::numeric)) from jsonb_array_elements(s->'rates') r),
 'ohRate', s->'oh_rate',
 'items', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sku',i->>'sku','name',i->>'name','type',i->>'type','uom',i->>'uom','plannedPrice',(i->>'planned_price')::numeric,
     'standardCost', case when s->'estimates_released' ? (i->>'sku') then (i->>'standard_cost')::numeric end,'qty',(i->>'qty')::numeric)) order by i->>'sku') from jsonb_array_elements(s->'items') i),
 'boms', (select jsonb_agg(jsonb_build_object('item',b->>'item','lines',(select jsonb_agg(jsonb_build_object('sku',l->>'sku','qty',(l->>'qty')::numeric)) from jsonb_array_elements(b->'lines') l))) from jsonb_array_elements(s->'boms') b),
 'routings', (select jsonb_agg(jsonb_build_object('item',x->>'item','ops',(select jsonb_agg(jsonb_build_object('op',(o->>'op_no')::int,'workCenter',o->>'work_center','setup',(o->>'setup_min')::numeric,'run',(o->>'run_min')::numeric,'labor',(o->>'labor_min')::numeric,'machine',(o->>'machine_min')::numeric)) from jsonb_array_elements(x->'ops') o))) from jsonb_array_elements(s->'routings') x),
 'purchaseOrders', (select jsonb_agg(jsonb_build_object('vendor',p->>'vendor','total',(p->>'total')::numeric)) from jsonb_array_elements(s->'purchase_orders') p),
 'vendorInvoices', (select jsonb_agg(jsonb_build_object('total',(v->>'total')::numeric,'invoiceDate',v->>'invoice_date','due',v->>'due_date','status',v->>'status')) from jsonb_array_elements(s->'vendor_invoices') v),
 'orders', (select jsonb_agg(jsonb_build_object('item',o->>'item','planned',(o->>'planned')::numeric,'good',(o->>'good')::numeric,'scrap',(o->>'scrap')::numeric)) from jsonb_array_elements(s->'orders') o),
 'invoices', (select jsonb_agg(jsonb_build_object('total',(v->>'total')::numeric,'date',v->>'date','due',v->>'due_date')) from jsonb_array_elements(s->'invoices') v),
 'balances', (select jsonb_agg(jsonb_build_object('code',k,'amount',v::numeric) order by k) from jsonb_each_text(s->'gl') e(k,v)),
 'manualVouchers', jsonb_build_object('count',(s#>>'{vouchers,manual_posted}')::int,'totalDebit',(s#>>'{vouchers,total_manual_amount}')::numeric),
 'months', '["2027-02","2027-03"]'::jsonb, 'profitLabel','February and March',
 'quality', jsonb_build_object(
   'plans',(select coalesce(jsonb_agg(jsonb_build_object('item',p->>'item','characteristic',p->>'characteristic','min',p->'min','max',p->'max')),'[]') from jsonb_array_elements(s->'quality_plans') p),
   'flags',(select coalesce(jsonb_agg(jsonb_build_object('item',p->>'item','receipt',p->'receipt','production',p->'production')),'[]') from jsonb_array_elements(s->'quality_flags') p),
   'lots',(select coalesce(jsonb_agg(jsonb_build_object('item',l->>'item','qty',(l->>'qty')::numeric,'accept',(l->>'accept')::numeric,'scrap',(l->>'scrap')::numeric,'return',(l->>'return')::numeric,'rework',(l->>'rework')::numeric)),'[]') from jsonb_array_elements(s->'inspection_lots') l),
   'ncrs',(select coalesce(jsonb_agg(jsonb_build_object('item',n->>'item','rootCause',n->>'root_cause','qty',(n->>'qty')::numeric)),'[]') from jsonb_array_elements(s->'ncrs') n)),
 'batches',(select coalesce(jsonb_agg(jsonb_build_object('item',b->>'item','batchNo',b->>'batch_no','expiry',b->>'expiry')),'[]') from jsonb_array_elements(s->'batches') b),
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('name',a->>'name','cost',(a->>'cost')::numeric,'salvage',(a->>'salvage')::numeric,'life',(a->>'life')::int,'accumulated',(a->>'accumulated')::numeric)),'[]') from jsonb_array_elements(s->'assets') a),
 'payments', jsonb_build_object('received',(s#>>'{payments,received}')::numeric,'receivedCount',(s#>>'{payments,received_count}')::int,'made',(s#>>'{payments,made}')::numeric,'madeCount',(s#>>'{payments,made_count}')::int),
 'reversals', jsonb_build_object('confirmations',(s#>>'{reversals,confirmations}')::int,'vouchers',(s#>>'{reversals,vouchers}')::int),
 'downtime',(select coalesce(jsonb_agg(jsonb_build_object('workCenter',d->>'work_center','hours',(d->>'hours')::numeric,'category',d->>'category')),'[]') from jsonb_array_elements(s->'downtime') d),
 'bills',(select jsonb_agg((b->>'total')::numeric) from jsonb_array_elements(s->'bills') b where b->>'status' <> 'void')) into def from (select mfg_practice_snapshot_a2(t) as s) q;
    raise exception using errcode = 'P0777', message = def::text;
  exception when sqlstate 'P0777' then
    def := sqlerrm::jsonb;
  end;
  insert into mfg_practice_sets (id, name, summary, definition)
  values ('capiz-feb-mar-2027', def->>'name', def->>'summary', def)
  on conflict (id) do update set name = excluded.name, summary = excluded.summary, definition = excluded.definition;
end $do$;
