-- ============================================================
-- Classroom ERP — migration 0049 (Manufacturing ERP, Phase 11a: team companies and roles)
--
-- Needs 0023–0048. ADDITIVE ONLY: two new tables and new functions. Our own Manufacturing functions are redefined with the same signatures
-- (the write functions get a role check; mfg_approve_voucher / mfg_reject_voucher learn about the finance manager). No Standard table,
-- function, policy or trigger is changed.
--
--   Solo company   Created by a student (create_mfg_company, unchanged). The owner can do everything. Nothing changes for a solo company.
--   Team company   Created ONLY by the teacher (mfg_create_team_company). It has no owner. The teacher adds students from the class list
--                  and gives each one or more roles; only the teacher can add, change or remove members. Everyone in the team sees the
--                  whole set of books; each role can post only in its own area; the teacher stays the final override.
--
--   Roles          PURCHASING, WAREHOUSE, PRODUCTION, QUALITY, SALES, ACCOUNTANT, FINANCE_MANAGER, AUDITOR (reads, never posts).
--   Areas          master, costing, purchasing, ap, planning, production, issue, stock, shipping, sales, quality, finance, settle, close, approve.
--   Enforcement    mfg__my_tenant(area) is the one door every student write goes through. In a team company it refuses a person whose
--                  roles do not include the area, in plain words. The functions below were rewritten to ask for their area.
--   Duties         A person cannot approve a voucher they prepared. Only the teacher or a finance manager approves.
--
-- ROLLBACK: re-run the earlier migrations that defined each function (0025–0048), then
--   drop function if exists mfg_can_approve_voucher(uuid), mfg_team_remove_member(uuid, uuid), mfg_team_set_member(uuid, uuid, text[]),
--     mfg_team_roster(uuid), mfg_teams_list(), mfg_class_students(), mfg_my_roles(), mfg_create_team_company(text, date, text),
--     mfg__my_tenant(text), mfg__can(uuid, uuid, text), mfg__role_areas(text), mfg_role_label(text), mfg_area_label(text);
--   drop table if exists mfg_company_roles, mfg_teams;
-- ============================================================

create table if not exists mfg_teams (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists mfg_company_roles (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('PURCHASING', 'WAREHOUSE', 'PRODUCTION', 'QUALITY', 'SALES', 'ACCOUNTANT', 'FINANCE_MANAGER', 'AUDITOR')),
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (tenant_id, user_id, role)
);
create index if not exists mfg_company_roles_user on mfg_company_roles (user_id);

alter table mfg_teams enable row level security;
alter table mfg_company_roles enable row level security;
drop policy if exists "mfg read" on mfg_teams;
create policy "mfg read" on mfg_teams for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');
drop policy if exists "mfg read" on mfg_company_roles;
create policy "mfg read" on mfg_company_roles for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');

-- ---------- roles and what each may do ----------
create or replace function mfg_role_label(p_role text)
returns text as $$
  select case p_role when 'PURCHASING' then 'Purchasing officer' when 'WAREHOUSE' then 'Warehouse clerk' when 'PRODUCTION' then 'Production planner'
    when 'QUALITY' then 'Quality inspector' when 'SALES' then 'Sales and shipping clerk' when 'ACCOUNTANT' then 'Accountant'
    when 'FINANCE_MANAGER' then 'Finance manager' when 'AUDITOR' then 'Auditor' else p_role end;
$$ language sql immutable set search_path = public;

create or replace function mfg__role_areas(p_role text)
returns text[] as $$
  select case p_role
    when 'PURCHASING' then array['purchasing', 'ap']
    when 'WAREHOUSE' then array['stock', 'issue', 'shipping']
    when 'PRODUCTION' then array['production', 'planning', 'master', 'issue']
    when 'QUALITY' then array['quality']
    when 'SALES' then array['sales', 'shipping']
    when 'ACCOUNTANT' then array['finance', 'ap', 'costing', 'settle']
    when 'FINANCE_MANAGER' then array['finance', 'ap', 'costing', 'settle', 'close', 'approve']
    else array[]::text[] end;
$$ language sql immutable set search_path = public;

create or replace function mfg_area_label(p_area text)
returns text as $$
  select case p_area
    when 'master' then 'change items, bills of materials or routings' when 'costing' then 'work on cost estimates'
    when 'purchasing' then 'create or change purchase orders' when 'ap' then 'enter or void vendor invoices and landed costs'
    when 'planning' then 'run planning (MRP, forecasts, planned orders)' when 'production' then 'work on production orders and the shop floor'
    when 'issue' then 'issue materials to production' when 'stock' then 'post stock receipts, adjustments or transfers'
    when 'shipping' then 'deliver goods' when 'sales' then 'raise sales invoices' when 'quality' then 'record inspections and decisions'
    when 'finance' then 'prepare or reverse journal vouchers' when 'settle' then 'settle orders or the month'
    when 'close' then 'close the month' when 'admin' then 'load the demo company' else 'do that' end;
$$ language sql immutable set search_path = public;

create or replace function mfg__can(p_tenant uuid, p_user uuid, p_area text)
returns boolean as $$
  select exists (select 1 from mfg_company_roles r where r.tenant_id = p_tenant and r.user_id = p_user and p_area = any (mfg__role_areas(r.role)));
$$ language sql stable security definer set search_path = public;

-- the one door for a student's write, now with an area: in a team company the person's roles must include it
create or replace function mfg__my_tenant(p_area text)
returns uuid as $$
declare
  t uuid := mfg__my_tenant();
  mine text;
begin
  if exists (select 1 from mfg_teams where tenant_id = t) and not mfg__can(t, auth.uid(), p_area) then
    select string_agg(mfg_role_label(r.role), ', ' order by r.role) into mine from mfg_company_roles r where r.tenant_id = t and r.user_id = auth.uid();
    raise exception 'In this team company your role (%) can''t %. Ask your teacher if you should hold another role.', coalesce(mine, 'none yet'), mfg_area_label(p_area);
  end if;
  return t;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- the teacher creates a team company: the same company as a student's, with no owner and no membership for the teacher ----------
do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'create_mfg_company' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'create_mfg_company was not found'; end if;
  n := regexp_replace(d, 'FUNCTION public\.create_mfg_company', 'FUNCTION public.mfg_create_team_company');
  if n = d then raise exception 'team company: could not rename'; end if; d := n;
  n := regexp_replace(d, 'if is_teacher\(\) then raise exception .*? end if;', 'if is_teacher() is not true then raise exception ''Only the teacher can create a team company.''; end if;');
  if n = d then raise exception 'team company: could not change the teacher check'; end if; d := n;
  n := regexp_replace(d, 'if exists \(select 1 from tenant_editions where owner_id = auth\.uid\(\) and edition = ''MANUFACTURING''\) then\s+raise exception .*?\s+end if;', '');
  if n = d then raise exception 'team company: could not drop the one-company check'; end if; d := n;
  n := regexp_replace(d, 'values \(new_id, ''MANUFACTURING'', auth\.uid\(\)\);', 'values (new_id, ''MANUFACTURING'', null); insert into mfg_teams (tenant_id, created_by) values (new_id, auth.uid());');
  if n = d then raise exception 'team company: could not change the edition row'; end if; d := n;
  n := regexp_replace(d, 'insert into memberships \(user_id, tenant_id\) values \(auth\.uid\(\), new_id\) on conflict do nothing;', '');
  if n = d then raise exception 'team company: could not drop the membership'; end if; d := n;
  n := regexp_replace(d, 'update profiles set tenant_id = new_id where id = auth\.uid\(\);', '');
  if n = d then raise exception 'team company: could not drop the profile switch'; end if; d := n;
  n := regexp_replace(d, 'insert into edition_last_used .*? opened_at = now\(\);', '');
  if n = d then raise exception 'team company: could not drop the last-used row'; end if; d := n;
  execute d;
end $do$;
revoke execute on function mfg_create_team_company(text, date, text) from public, anon;
grant execute on function mfg_create_team_company(text, date, text) to authenticated;

-- ---------- the teacher's roster tools ----------
create or replace function mfg_class_students()
returns table (id uuid, full_name text) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the class list.'; end if;
  return query select p.id, p.full_name from profiles p where p.role = 'student' order by p.full_name nulls last;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_teams_list()
returns table (tenant_id uuid, name text, members int, created_at timestamptz) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the team companies.'; end if;
  return query select t.id, t.name, (select count(*)::int from memberships m where m.tenant_id = t.id), mt.created_at
                 from mfg_teams mt join tenants t on t.id = mt.tenant_id order by mt.created_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_team_roster(p_tenant uuid)
returns table (user_id uuid, full_name text, roles text[]) as $$
begin
  if not (is_teacher() or p_tenant = my_tenant_id()) then raise exception 'That company is not yours to look at.'; end if;
  if not exists (select 1 from mfg_teams where mfg_teams.tenant_id = p_tenant) then raise exception 'That is not a team company.'; end if;
  return query
  select m.user_id, p.full_name, coalesce((select array_agg(r.role order by r.role) from mfg_company_roles r where r.tenant_id = p_tenant and r.user_id = m.user_id), array[]::text[])
    from memberships m left join profiles p on p.id = m.user_id where m.tenant_id = p_tenant order by p.full_name nulls last;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_team_set_member(p_tenant uuid, p_user uuid, p_roles text[])
returns void as $$
declare
  k text;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can add team members or change their roles.'; end if;
  if not exists (select 1 from mfg_teams where tenant_id = p_tenant) then raise exception 'That is not a team company.'; end if;
  if not exists (select 1 from profiles where id = p_user and role = 'student') then raise exception 'Choose a student.'; end if;
  foreach k in array coalesce(p_roles, array[]::text[]) loop
    if k not in ('PURCHASING', 'WAREHOUSE', 'PRODUCTION', 'QUALITY', 'SALES', 'ACCOUNTANT', 'FINANCE_MANAGER', 'AUDITOR') then raise exception 'Unknown role: %', k; end if;
  end loop;
  insert into memberships (user_id, tenant_id) values (p_user, p_tenant) on conflict do nothing;
  update profiles set tenant_id = p_tenant where id = p_user and tenant_id is null;
  delete from mfg_company_roles where tenant_id = p_tenant and user_id = p_user;
  insert into mfg_company_roles (tenant_id, user_id, role, assigned_by)
  select p_tenant, p_user, s.x, auth.uid() from (select distinct unnest(coalesce(p_roles, array[]::text[])) as x) s;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'team_member_set', jsonb_build_object('user', p_user, 'name', (select full_name from profiles where id = p_user), 'roles', to_jsonb(coalesce(p_roles, array[]::text[]))), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_team_remove_member(p_tenant uuid, p_user uuid)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can remove a team member.'; end if;
  if not exists (select 1 from mfg_teams where tenant_id = p_tenant) then raise exception 'That is not a team company.'; end if;
  delete from mfg_company_roles where tenant_id = p_tenant and user_id = p_user;
  delete from memberships where tenant_id = p_tenant and user_id = p_user;
  update profiles set tenant_id = (select m.tenant_id from memberships m where m.user_id = p_user order by m.created_at limit 1)
   where id = p_user and tenant_id = p_tenant;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'team_member_removed', jsonb_build_object('user', p_user, 'name', (select full_name from profiles where id = p_user)), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- what the signed-in person is in the active company: is it a team, and which roles do they hold
create or replace function mfg_my_roles()
returns table (is_team boolean, roles text[]) as $$
  select exists (select 1 from mfg_teams where tenant_id = my_tenant_id()),
         coalesce((select array_agg(r.role order by r.role) from mfg_company_roles r where r.tenant_id = my_tenant_id() and r.user_id = auth.uid()), array[]::text[]);
$$ language sql stable security definer set search_path = public;

-- ---------- vouchers: the teacher or a finance manager approves; nobody approves what they prepared ----------
create or replace function mfg_can_approve_voucher(p_id uuid)
returns boolean as $$
declare
  v mfg_vouchers;
begin
  select * into v from mfg_vouchers where id = p_id;
  if v.id is null or v.status <> 'PENDING_APPROVAL' then return false; end if;
  if is_teacher() then return true; end if;
  return v.tenant_id = my_tenant_id() and exists (select 1 from mfg_teams where tenant_id = v.tenant_id)
         and mfg__can(v.tenant_id, auth.uid(), 'approve') and v.prepared_by is distinct from auth.uid();
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_approve_voucher(p_id uuid)
returns void as $$
declare
  v mfg_vouchers;
begin
  select * into v from mfg_vouchers where id = p_id for update;
  if v.id is null then raise exception 'That voucher was not found.'; end if;
  if is_teacher() is not true then
    if not (v.tenant_id = my_tenant_id() and exists (select 1 from mfg_teams where tenant_id = v.tenant_id) and mfg__can(v.tenant_id, auth.uid(), 'approve')) then
      raise exception 'Only the teacher can approve a voucher (in a team company, its finance manager can too).';
    end if;
    if v.prepared_by is not distinct from auth.uid() then raise exception 'You prepared this voucher, so someone else must approve it.'; end if;
  end if;
  if v.status <> 'PENDING_APPROVAL' then raise exception 'That voucher is not waiting for approval (it is %).', lower(v.status); end if;
  perform mfg__voucher_check(p_id);
  update mfg_vouchers set reviewed_by = auth.uid(), reviewed_at = now(), approved_by = auth.uid(), approved_at = now() where id = p_id;
  perform mfg__post_voucher(p_id, auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_reject_voucher(p_id uuid, p_note text)
returns void as $$
declare
  v mfg_vouchers;
begin
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Tell the student what to fix.'; end if;
  select * into v from mfg_vouchers where id = p_id for update;
  if v.id is null or v.status <> 'PENDING_APPROVAL' then raise exception 'That voucher is not waiting for approval.'; end if;
  if is_teacher() is not true then
    if not (v.tenant_id = my_tenant_id() and exists (select 1 from mfg_teams where tenant_id = v.tenant_id) and mfg__can(v.tenant_id, auth.uid(), 'approve')) then
      raise exception 'Only the teacher can send a voucher back (in a team company, its finance manager can too).';
    end if;
    if v.prepared_by is not distinct from auth.uid() then raise exception 'You prepared this voucher, so someone else must review it.'; end if;
  end if;
  update mfg_vouchers set status = 'DRAFT', reject_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v.tenant_id, 'voucher_sent_back', jsonb_build_object('voucher', v.voucher_no, 'note', trim(p_note)), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- every student write function now asks for its area ----------
do $do$
declare
  map jsonb := jsonb_build_object(
    'purchasing', jsonb_build_array('mfg_create_po', 'mfg_delete_po', 'mfg_set_purchase_uom', 'mfg_convert_requisitions', 'mfg_delete_requisition'),
    'planning', jsonb_build_array('mfg_run_mrp', 'mfg_save_forecast', 'mfg_create_planned_order', 'mfg_delete_planned_order', 'mfg_convert_planned_order', 'mfg_convert_planned_orders', 'mfg_reschedule_planned_order'),
    'production', jsonb_build_array('mfg_create_order', 'mfg_release_order', 'mfg_cancel_order', 'mfg_post_confirmation', 'mfg_post_fg_receipt', 'mfg_post_output_receipt', 'mfg_reverse_confirmation',
                        'mfg_close_order', 'mfg_set_component_backflush', 'mfg_reschedule_order', 'mfg_set_order_priority', 'mfg_log_downtime', 'mfg_void_downtime', 'mfg_log_maintenance'),
    'issue', jsonb_build_array('mfg_post_material_issue'),
    'stock', jsonb_build_array('mfg_post_goods_receipt', 'mfg_post_stock_adjustment', 'mfg_transfer_stock', 'mfg_reverse_document'),
    'shipping', jsonb_build_array('mfg_post_delivery'),
    'sales', jsonb_build_array('mfg_create_invoice_from_so'),
    'quality', jsonb_build_array('mfg_record_inspection', 'mfg_decide_inspection_lot', 'mfg_close_ncr', 'mfg_save_inspection_plan', 'mfg_save_item_quality'),
    'ap', jsonb_build_array('mfg_post_vendor_invoice', 'mfg_void_vendor_invoice', 'mfg_reject_held_invoice', 'mfg_post_landed_cost', 'mfg_void_landed_cost'),
    'finance', jsonb_build_array('mfg_save_voucher', 'mfg_submit_voucher', 'mfg_delete_voucher', 'mfg_reverse_voucher'),
    'master', jsonb_build_array('mfg_save_item', 'mfg_delete_item', 'mfg_save_bom', 'mfg_copy_bom', 'mfg_activate_bom', 'mfg_obsolete_bom', 'mfg_delete_bom', 'mfg_save_routing', 'mfg_copy_routing',
                    'mfg_activate_routing', 'mfg_obsolete_routing', 'mfg_delete_routing', 'mfg_set_work_center_upkeep'),
    'costing', jsonb_build_array('mfg_create_cost_estimate', 'mfg_mark_cost_estimate', 'mfg_release_cost_estimate'),
    'settle', jsonb_build_array('mfg_settle_order', 'mfg_reverse_settlement', 'mfg_settle_period', 'mfg_undo_period_settlement'),
    'close', jsonb_build_array('mfg_close_period'),
    'admin', jsonb_build_array('mfg_load_demo'));
  a text; f text; r record; d text; n text; left_over text;
begin
  for a in select jsonb_object_keys(map) loop
    for f in select jsonb_array_elements_text(map -> a) loop
      for r in select p.oid from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace loop
        d := pg_get_functiondef(r.oid);
        n := replace(d, 'mfg__my_tenant()', format('mfg__my_tenant(%L)', a));
        if n <> d then execute n; end if;
      end loop;
    end loop;
  end loop;
  -- nothing else may still use the plain door, except the read-only reports and the doors themselves
  select string_agg(p.proname, ', ' order by p.proname) into left_over
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%mfg__my_tenant()%'
     and p.proname not in ('mfg__my_tenant', 'mfg_cost_drift', 'mfg_lot_size_curve');
  if left_over is not null then raise exception 'These functions still use the plain tenant door: %', left_over; end if;
end $do$;

-- ---------- who may call what ----------
revoke execute on function mfg_role_label(text) from public, anon;
revoke execute on function mfg_area_label(text) from public, anon;
revoke execute on function mfg__role_areas(text) from public, anon, authenticated;
revoke execute on function mfg__can(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function mfg__my_tenant(text) from public, anon, authenticated;
revoke execute on function mfg_class_students() from public, anon;
revoke execute on function mfg_teams_list() from public, anon;
revoke execute on function mfg_team_roster(uuid) from public, anon;
revoke execute on function mfg_team_set_member(uuid, uuid, text[]) from public, anon;
revoke execute on function mfg_team_remove_member(uuid, uuid) from public, anon;
revoke execute on function mfg_my_roles() from public, anon;
revoke execute on function mfg_can_approve_voucher(uuid) from public, anon;
grant execute on function mfg_role_label(text) to authenticated;
grant execute on function mfg_area_label(text) to authenticated;
grant execute on function mfg_class_students() to authenticated;
grant execute on function mfg_teams_list() to authenticated;
grant execute on function mfg_team_roster(uuid) to authenticated;
grant execute on function mfg_team_set_member(uuid, uuid, text[]) to authenticated;
grant execute on function mfg_team_remove_member(uuid, uuid) to authenticated;
grant execute on function mfg_my_roles() to authenticated;
grant execute on function mfg_can_approve_voucher(uuid) to authenticated;
