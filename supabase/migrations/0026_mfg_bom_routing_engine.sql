-- ============================================================
-- Classroom ERP — migration 0026 (Manufacturing ERP, Phase 2, part 2: BOM and routing engine)
--
-- ADDITIVE ONLY. Needs 0025. Creates functions and one trigger on a Manufacturing table; touches nothing Standard.
--
--   Cycle prevention        trg_mfg_bom_cycle on mfg_bom_items (a component may never lead back to its parent)
--   Low-level codes         mfg_recalc_low_level(tenant)
--   Bills of materials      mfg_save_bom, mfg_copy_bom, mfg_activate_bom, mfg_obsolete_bom, mfg_delete_bom
--   Lookups                 mfg_active_bom, mfg_explode_bom, mfg_where_used, mfg_compare_boms
--   Routings                mfg_save_routing, mfg_copy_routing, mfg_activate_routing, mfg_obsolete_routing,
--                           mfg_delete_routing, mfg_routing_load
--   Calendar                mfg_wc_available_hours
--
-- Scrap: a component line with scrap 5 % needs 1.05 × its quantity (net × (1 + scrap/100)).
-- Only COMPONENT lines are inputs; COPRODUCT / BYPRODUCT lines are outputs and are ignored by cycle checks,
-- explosion, where-used and low-level codes.
--
-- ROLLBACK:
--   drop trigger if exists trg_mfg_bom_cycle on mfg_bom_items;
--   drop function if exists mfg_wc_available_hours(uuid, date, date), mfg_routing_load(uuid, numeric),
--     mfg_delete_routing(uuid), mfg_obsolete_routing(uuid), mfg_activate_routing(uuid), mfg_copy_routing(uuid),
--     mfg_save_routing(uuid, jsonb), mfg_compare_boms(uuid, uuid), mfg_where_used(uuid, boolean),
--     mfg_explode_bom(uuid, numeric, date, int, int), mfg__explode(uuid, uuid, numeric, date, int, text, uuid[], int),
--     mfg_active_bom(uuid, uuid, date, int), mfg_delete_bom(uuid), mfg_obsolete_bom(uuid), mfg_activate_bom(uuid),
--     mfg_copy_bom(uuid), mfg_save_bom(uuid, jsonb), mfg_recalc_low_level(uuid), mfg_bom_cycle_guard(), mfg_reaches(uuid, uuid, uuid);
-- ============================================================

-- ---------- does a chain of COMPONENT lines lead from one item to another? ----------
create or replace function mfg_reaches(p_tenant uuid, p_from uuid, p_target uuid)
returns boolean as $$
  with recursive down(item) as (
    select p_from
    union                                            -- UNION (not ALL) so a loop can never run forever
    select bi.component_item_id
      from down d
      join mfg_boms b on b.item_id = d.item and b.tenant_id = p_tenant and b.status <> 'OBSOLETE'
      join mfg_bom_items bi on bi.bom_id = b.id and bi.kind = 'COMPONENT'
  )
  select exists (select 1 from down where item = p_target);
$$ language sql stable security definer set search_path = public;

create or replace function mfg_bom_cycle_guard()
returns trigger as $$
declare
  v_parent uuid;
  v_pname text;
  v_cname text;
begin
  if new.kind <> 'COMPONENT' then return new; end if;
  select item_id into v_parent from mfg_boms where id = new.bom_id;
  if new.component_item_id = v_parent or mfg_reaches(new.tenant_id, new.component_item_id, v_parent) then
    select name into v_pname from items where id = v_parent;
    select name into v_cname from items where id = new.component_item_id;
    raise exception 'A bill of materials can''t contain itself: "%" already includes "%" somewhere below it.', v_cname, v_pname;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_bom_cycle on mfg_bom_items;
create trigger trg_mfg_bom_cycle after insert or update of component_item_id, kind, bom_id on mfg_bom_items
  for each row execute function mfg_bom_cycle_guard();

-- ---------- low-level codes: 0 = top of a structure, higher = deeper ----------
create or replace function mfg_recalc_low_level(p_tenant uuid)
returns void as $$
begin
  with recursive walk(item, depth) as (
    select distinct b.item_id, 0 from mfg_boms b where b.tenant_id = p_tenant and b.status <> 'OBSOLETE'
    union all
    select bi.component_item_id, w.depth + 1
      from walk w
      join mfg_boms b on b.item_id = w.item and b.tenant_id = p_tenant and b.status <> 'OBSOLETE'
      join mfg_bom_items bi on bi.bom_id = b.id and bi.kind = 'COMPONENT'
     where w.depth < 25
  ), lvl as (select item, max(depth) as d from walk group by item)
  update mfg_item_master m set low_level_code = l.d
    from (select m2.item_id, coalesce(lvl.d, 0) as d
            from mfg_item_master m2 left join lvl on lvl.item = m2.item_id where m2.tenant_id = p_tenant) l
   where m.item_id = l.item_id and m.low_level_code <> l.d;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- bills of materials ----------
-- p_data: { item_id, alt_no, base_qty, valid_from, valid_to, description,
--           lines: [ { component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct } ] }
-- A new BOM is always a new DRAFT version. An existing draft is replaced; an active BOM is never edited —
-- copy it to a new version instead.
create or replace function mfg_save_bom(p_bom_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_item uuid; v_alt int; v_base numeric; v_from date; v_to date; v_desc text;
  v_id uuid; v_ver int; v_status text;
  v_line jsonb; v_n int := 0; v_components int := 0; v_share numeric := 0;
  v_comp uuid; v_qty numeric; v_uom text; v_kind text; v_cshare numeric; v_cbase text; v_cactive boolean; v_cname text;
begin
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') = 0 then
    raise exception 'Add at least one line to the bill of materials.';
  end if;

  if p_bom_id is null then
    v_item := nullif(p_data->>'item_id', '')::uuid;
    v_alt := coalesce(nullif(p_data->>'alt_no', '')::int, 1);
  else
    select item_id, alt_no, status into v_item, v_alt, v_status from mfg_boms where id = p_bom_id and tenant_id = v_t;
    if v_item is null then raise exception 'That bill of materials was not found.'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft can be edited. Copy this one to a new version first.'; end if;
  end if;
  if v_alt < 1 then raise exception 'The alternative number must be 1 or higher.'; end if;

  if not exists (select 1 from mfg_item_master where item_id = v_item and tenant_id = v_t and make_or_buy = 'MAKE') then
    raise exception 'Choose an item you make. Only items marked "Make" can have a bill of materials.';
  end if;
  v_base := coalesce(nullif(p_data->>'base_qty', '')::numeric, 1);
  if v_base <= 0 then raise exception 'The base quantity must be above zero.'; end if;
  v_from := coalesce(nullif(p_data->>'valid_from', '')::date, current_date);
  v_to := nullif(p_data->>'valid_to', '')::date;
  if v_to is not null and v_to < v_from then raise exception 'The "valid to" date can''t be before the "valid from" date.'; end if;
  v_desc := nullif(trim(coalesce(p_data->>'description', '')), '');

  if p_bom_id is null then
    select coalesce(max(version), 0) + 1 into v_ver from mfg_boms where tenant_id = v_t and item_id = v_item and alt_no = v_alt;
    insert into mfg_boms (tenant_id, item_id, version, alt_no, base_qty, valid_from, valid_to, description)
    values (v_t, v_item, v_ver, v_alt, v_base, v_from, v_to, v_desc) returning id into v_id;
  else
    v_id := p_bom_id;
    update mfg_boms set base_qty = v_base, valid_from = v_from, valid_to = v_to, description = v_desc where id = v_id;
    delete from mfg_bom_items where bom_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_n := v_n + 1;
    v_comp := nullif(v_line->>'component_item_id', '')::uuid;
    v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    v_uom := coalesce(v_line->>'uom', '');
    v_kind := coalesce(nullif(v_line->>'kind', ''), 'COMPONENT');
    v_cshare := coalesce(nullif(v_line->>'cost_share_pct', '')::numeric, 0);
    if v_kind not in ('COMPONENT', 'COPRODUCT', 'BYPRODUCT') then raise exception 'Line %: choose component, co-product or by-product.', v_n; end if;
    select i.name, m.base_uom, m.active into v_cname, v_cbase, v_cactive
      from items i join mfg_item_master m on m.item_id = i.id where i.id = v_comp and i.tenant_id = v_t;
    if v_cname is null then raise exception 'Line %: choose an item from your company.', v_n; end if;
    if not v_cactive then raise exception 'Line %: "%" is inactive.', v_n, v_cname; end if;
    if v_qty <= 0 then raise exception 'Line %: the quantity of "%" must be above zero.', v_n, v_cname; end if;
    if not exists (select 1 from mfg_uom where tenant_id = v_t and code = v_uom) then raise exception 'Line %: choose a unit of measure.', v_n; end if;
    perform mfg_convert_qty(v_t, v_comp, 1, v_uom, v_cbase);   -- fails with a clear message if the units can't be converted
    if v_kind = 'COMPONENT' then
      v_components := v_components + 1;
      if v_comp = v_item then raise exception 'Line %: an item can''t be a component of itself.', v_n; end if;
    else
      v_share := v_share + v_cshare;
    end if;
    insert into mfg_bom_items (tenant_id, bom_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct)
    values (v_t, v_id, v_n, v_comp, v_qty, v_uom, coalesce(nullif(v_line->>'scrap_pct', '')::numeric, 0),
            coalesce((v_line->>'is_phantom')::boolean, false), v_kind, v_cshare);
  end loop;

  if v_components = 0 then raise exception 'A bill of materials needs at least one component.'; end if;
  if v_share > 100 then raise exception 'Co-product and by-product cost shares add up to % percent, which is more than 100.', v_share; end if;

  perform mfg_recalc_low_level(v_t);
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- A new draft version copied from an existing BOM of any status.
create or replace function mfg_copy_bom(p_bom_id uuid)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  b mfg_boms;
  v_id uuid;
begin
  select * into b from mfg_boms where id = p_bom_id and tenant_id = v_t;
  if b.id is null then raise exception 'That bill of materials was not found.'; end if;
  insert into mfg_boms (tenant_id, item_id, version, alt_no, base_qty, valid_from, valid_to, description)
  values (v_t, b.item_id, (select max(version) + 1 from mfg_boms where tenant_id = v_t and item_id = b.item_id and alt_no = b.alt_no),
          b.alt_no, b.base_qty, greatest(b.valid_from, current_date), null, b.description)
  returning id into v_id;
  insert into mfg_bom_items (tenant_id, bom_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct)
  select tenant_id, v_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind, cost_share_pct
    from mfg_bom_items where bom_id = p_bom_id;
  perform mfg_recalc_low_level(v_t);
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Draft → active. A newer version starting later closes the older active one the day before; any other overlap is refused.
create or replace function mfg_activate_bom(p_bom_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  b mfg_boms;
  o mfg_boms;
begin
  select * into b from mfg_boms where id = p_bom_id and tenant_id = v_t;
  if b.id is null then raise exception 'That bill of materials was not found.'; end if;
  if b.status <> 'DRAFT' then raise exception 'Only a draft can be activated (this one is %).', lower(b.status); end if;
  if not exists (select 1 from mfg_bom_items where bom_id = p_bom_id and kind = 'COMPONENT') then
    raise exception 'A bill of materials needs at least one component.';
  end if;

  for o in select * from mfg_boms
            where tenant_id = v_t and item_id = b.item_id and alt_no = b.alt_no and status = 'ACTIVE' and id <> b.id
              and daterange(valid_from, valid_to, '[]') && daterange(b.valid_from, b.valid_to, '[]') loop
    if o.valid_from < b.valid_from then
      update mfg_boms set valid_to = b.valid_from - 1 where id = o.id;
    else
      raise exception 'Version % (%) is already active from % and would overlap this one. Change the dates, or make that version obsolete first.',
        o.version, o.document_number, to_char(o.valid_from, 'Mon DD, YYYY');
    end if;
  end loop;

  update mfg_boms set status = 'ACTIVE' where id = p_bom_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'bom_activated', jsonb_build_object('bom_id', p_bom_id, 'document_number', b.document_number, 'version', b.version), auth.uid());
  perform mfg_recalc_low_level(v_t);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_obsolete_bom(p_bom_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  b mfg_boms;
begin
  select * into b from mfg_boms where id = p_bom_id and tenant_id = v_t;
  if b.id is null then raise exception 'That bill of materials was not found.'; end if;
  if b.status = 'OBSOLETE' then raise exception 'This bill of materials is already obsolete.'; end if;
  update mfg_boms set status = 'OBSOLETE' where id = p_bom_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'bom_obsoleted', jsonb_build_object('bom_id', p_bom_id, 'document_number', b.document_number, 'version', b.version), auth.uid());
  perform mfg_recalc_low_level(v_t);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_bom(p_bom_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_status text;
begin
  select status into v_status from mfg_boms where id = p_bom_id and tenant_id = v_t;
  if v_status is null then raise exception 'That bill of materials was not found.'; end if;
  if v_status <> 'DRAFT' then raise exception 'Only a draft can be deleted. Make an active BOM obsolete instead.'; end if;
  delete from mfg_boms where id = p_bom_id;      -- the lines go with it
  perform mfg_recalc_low_level(v_t);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- looking things up (these run as the caller, so row-level security applies) ----------
create or replace function mfg_active_bom(p_tenant uuid, p_item uuid, p_date date default current_date, p_alt int default 1)
returns uuid as $$
  select id from mfg_boms
   where tenant_id = p_tenant and item_id = p_item and alt_no = p_alt and status = 'ACTIVE'
     and valid_from <= p_date and (valid_to is null or valid_to >= p_date)
   order by version desc limit 1;
$$ language sql stable set search_path = public;

-- The rows below one BOM for p_qty of its item (in that item's base unit). Each child row is followed by its own children.
create or replace function mfg__explode(
  p_tenant uuid, p_bom uuid, p_qty numeric, p_date date, p_level int, p_path text, p_ancestors uuid[], p_max int,
  out o_level int, out o_path text, out o_item_id uuid, out o_parent_item_id uuid, out o_line_no int,
  out o_qty numeric, out o_uom text, out o_base_qty numeric, out o_base_uom text, out o_scrap_pct numeric,
  out o_is_phantom boolean, out o_has_bom boolean, out o_bom_id uuid)
returns setof record as $$
declare
  v_parent uuid;
  v_base numeric;
  l record;
  v_child_bom uuid;
begin
  select item_id, base_qty into v_parent, v_base from mfg_boms where id = p_bom;
  for l in select bi.*, m.base_uom as comp_uom from mfg_bom_items bi
             join mfg_item_master m on m.item_id = bi.component_item_id
            where bi.bom_id = p_bom and bi.kind = 'COMPONENT' order by bi.line_no loop
    if l.component_item_id = any (p_ancestors) then
      raise exception 'This structure loops back on itself at one of its components.';
    end if;
    o_level := p_level;
    o_path := case when p_path = '' then l.line_no::text else p_path || '.' || l.line_no end;
    o_item_id := l.component_item_id;
    o_parent_item_id := v_parent;
    o_line_no := l.line_no;
    o_qty := round(p_qty / v_base * l.qty * (1 + l.scrap_pct / 100), 6);          -- in the line's own unit
    o_uom := l.uom;
    o_base_qty := round(mfg_convert_qty(p_tenant, l.component_item_id, o_qty, l.uom, l.comp_uom), 6);
    o_base_uom := l.comp_uom;
    o_scrap_pct := l.scrap_pct;
    o_is_phantom := l.is_phantom;
    v_child_bom := mfg_active_bom(p_tenant, l.component_item_id, p_date, 1);
    o_has_bom := v_child_bom is not null;
    o_bom_id := v_child_bom;
    if l.is_phantom and v_child_bom is null then
      raise exception 'A phantom component has no active bill of materials to pass through.';
    end if;
    return next;
    if v_child_bom is not null and p_level < p_max then
      return query select * from mfg__explode(p_tenant, v_child_bom, o_base_qty, p_date, p_level + 1, o_path,
                                              p_ancestors || l.component_item_id, p_max);
    end if;
  end loop;
end;
$$ language plpgsql stable set search_path = public;

-- Indented multi-level explosion of the BOM in force on p_date, for p_qty of the item (in its base unit).
-- Level 0 is the item itself. A phantom row is shown but needs no stock — its children are the real requirements.
create or replace function mfg_explode_bom(p_item uuid, p_qty numeric, p_date date default current_date, p_alt int default 1, p_max_levels int default 12)
returns table (seq int, level int, path text, item_id uuid, parent_item_id uuid, line_no int, qty numeric, uom text,
               base_qty numeric, base_uom text, scrap_pct numeric, is_phantom boolean, has_bom boolean, bom_id uuid) as $$
declare
  v_t uuid;
  v_bom uuid;
  v_uom text;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  select i.tenant_id, m.base_uom into v_t, v_uom from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item;
  if v_t is null then raise exception 'That item was not found.'; end if;
  v_bom := mfg_active_bom(v_t, p_item, p_date, p_alt);
  if v_bom is null then raise exception 'This item has no active bill of materials on %.', to_char(p_date, 'Mon DD, YYYY'); end if;
  return query
    with x_rows as (
      select 0 as lv, ''::text as pth, p_item as iid, null::uuid as pid, 0 as ln, p_qty as q, v_uom as u, p_qty as bq, v_uom as bu,
             0::numeric as sc, false as ph, true as hb, v_bom as bid
      union all
      select * from (select o_level + 1, o_path, o_item_id, o_parent_item_id, o_line_no, o_qty, o_uom, o_base_qty, o_base_uom,
                            o_scrap_pct, o_is_phantom, o_has_bom, o_bom_id
                       from mfg__explode(v_t, v_bom, p_qty, p_date, 0, '', array[p_item], p_max_levels)) x
    )
    select (row_number() over ())::int, lv, pth, iid, pid, ln, q, u, bq, bu, sc, ph, hb, bid from x_rows;
end;
$$ language plpgsql stable set search_path = public;

-- Where an item is used (draft and active BOMs). Multi-level also lists the parents of the parents.
create or replace function mfg_where_used(p_item uuid, p_multilevel boolean default false)
returns table (lvl int, bom_id uuid, document_number text, parent_item_id uuid, parent_name text,
               version int, alt_no int, status text, qty numeric, uom text) as $$
  with recursive up(lvl, bom_id, q, u, parent_item) as (
    select 1, b.id, bi.qty, bi.uom, b.item_id
      from mfg_bom_items bi join mfg_boms b on b.id = bi.bom_id
     where bi.component_item_id = p_item and bi.kind = 'COMPONENT' and b.status <> 'OBSOLETE'
    union all
    select up.lvl + 1, b.id, bi.qty, bi.uom, b.item_id
      from up
      join mfg_bom_items bi on bi.component_item_id = up.parent_item and bi.kind = 'COMPONENT'
      join mfg_boms b on b.id = bi.bom_id and b.status <> 'OBSOLETE'
     where p_multilevel and up.lvl < 12
  )
  select up.lvl, up.bom_id, b.document_number, b.item_id, i.name, b.version, b.alt_no, b.status, up.q, up.u
    from up join mfg_boms b on b.id = up.bom_id join items i on i.id = b.item_id
   order by up.lvl, i.name, b.version;
$$ language sql stable set search_path = public;

-- Compares two BOMs per one unit of the parent item: ADDED, REMOVED, CHANGED or SAME for each component.
create or replace function mfg_compare_boms(p_a uuid, p_b uuid)
returns table (component_item_id uuid, component_name text, kind text, change text,
               qty_a numeric, uom_a text, scrap_a numeric, phantom_a boolean,
               qty_b numeric, uom_b text, scrap_b numeric, phantom_b boolean) as $$
  with a as (
    select bi.component_item_id as cid, bi.kind as k, sum(bi.qty) / max(bm.base_qty) as q, min(bi.uom) as u,
           max(bi.scrap_pct) as sc, bool_or(bi.is_phantom) as ph
      from mfg_bom_items bi join mfg_boms bm on bm.id = bi.bom_id where bi.bom_id = p_a group by bi.component_item_id, bi.kind),
  b as (
    select bi.component_item_id as cid, bi.kind as k, sum(bi.qty) / max(bm.base_qty) as q, min(bi.uom) as u,
           max(bi.scrap_pct) as sc, bool_or(bi.is_phantom) as ph
      from mfg_bom_items bi join mfg_boms bm on bm.id = bi.bom_id where bi.bom_id = p_b group by bi.component_item_id, bi.kind)
  select coalesce(a.cid, b.cid), i.name, coalesce(a.k, b.k),
         case when a.cid is null then 'ADDED'
              when b.cid is null then 'REMOVED'
              when a.q is distinct from b.q or a.u is distinct from b.u or a.sc is distinct from b.sc or a.ph is distinct from b.ph then 'CHANGED'
              else 'SAME' end,
         round(a.q, 6), a.u, a.sc, a.ph, round(b.q, 6), b.u, b.sc, b.ph
    from a full join b on a.cid = b.cid and a.k = b.k
    join items i on i.id = coalesce(a.cid, b.cid)
   order by i.name;
$$ language sql stable set search_path = public;

-- ---------- routings ----------
-- p_data: { item_id, alt_no, description,
--           ops: [ { op_no, description, work_center_id, setup_min, run_min_per_unit, teardown_min,
--                    queue_min, move_min, control_key, component_line_nos } ] }
create or replace function mfg_save_routing(p_routing_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_item uuid; v_alt int; v_desc text; v_id uuid; v_ver int; v_status text;
  v_op jsonb; v_n int := 0; v_opno int; v_wc uuid; v_wc_active boolean; v_key text; v_seen int[] := '{}';
begin
  if jsonb_typeof(p_data->'ops') is distinct from 'array' or jsonb_array_length(p_data->'ops') = 0 then
    raise exception 'Add at least one operation to the routing.';
  end if;
  if p_routing_id is null then
    v_item := nullif(p_data->>'item_id', '')::uuid;
    v_alt := coalesce(nullif(p_data->>'alt_no', '')::int, 1);
  else
    select item_id, alt_no, status into v_item, v_alt, v_status from mfg_routings where id = p_routing_id and tenant_id = v_t;
    if v_item is null then raise exception 'That routing was not found.'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft can be edited. Copy this one to a new version first.'; end if;
  end if;
  if v_alt < 1 then raise exception 'The alternative number must be 1 or higher.'; end if;
  if not exists (select 1 from mfg_item_master where item_id = v_item and tenant_id = v_t and make_or_buy = 'MAKE') then
    raise exception 'Choose an item you make. Only items marked "Make" can have a routing.';
  end if;
  v_desc := nullif(trim(coalesce(p_data->>'description', '')), '');

  if p_routing_id is null then
    select coalesce(max(version), 0) + 1 into v_ver from mfg_routings where tenant_id = v_t and item_id = v_item and alt_no = v_alt;
    insert into mfg_routings (tenant_id, item_id, version, alt_no, description) values (v_t, v_item, v_ver, v_alt, v_desc) returning id into v_id;
  else
    v_id := p_routing_id;
    update mfg_routings set description = v_desc where id = v_id;
    delete from mfg_routing_ops where routing_id = v_id;
  end if;

  for v_op in select * from jsonb_array_elements(p_data->'ops') loop
    v_n := v_n + 1;
    v_opno := coalesce(nullif(v_op->>'op_no', '')::int, v_n * 10);
    v_wc := nullif(v_op->>'work_center_id', '')::uuid;
    v_key := coalesce(nullif(v_op->>'control_key', ''), 'PP01');
    if v_opno <= 0 then raise exception 'Operation %: the operation number must be above zero.', v_n; end if;
    if v_opno = any (v_seen) then raise exception 'Operation number % is used twice.', v_opno; end if;
    v_seen := v_seen || v_opno;
    select active into v_wc_active from mfg_work_centers where id = v_wc and tenant_id = v_t;
    if v_wc_active is null then raise exception 'Operation %: choose a work center.', v_opno; end if;
    if not v_wc_active then raise exception 'Operation %: that work center is inactive.', v_opno; end if;
    if v_key not in ('PP01', 'PP02', 'PP03') then raise exception 'Operation %: choose a control key.', v_opno; end if;
    insert into mfg_routing_ops (tenant_id, routing_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
                                 teardown_min, queue_min, move_min, control_key, component_line_nos)
    values (v_t, v_id, v_opno, nullif(trim(coalesce(v_op->>'description', '')), ''), v_wc,
            coalesce(nullif(v_op->>'setup_min', '')::numeric, 0), coalesce(nullif(v_op->>'run_min_per_unit', '')::numeric, 0),
            coalesce(nullif(v_op->>'teardown_min', '')::numeric, 0), coalesce(nullif(v_op->>'queue_min', '')::numeric, 0),
            coalesce(nullif(v_op->>'move_min', '')::numeric, 0), v_key,
            coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(v_op->'component_line_nos', '[]'::jsonb)) x), '{}'));
  end loop;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_copy_routing(p_routing_id uuid)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  r mfg_routings;
  v_id uuid;
begin
  select * into r from mfg_routings where id = p_routing_id and tenant_id = v_t;
  if r.id is null then raise exception 'That routing was not found.'; end if;
  insert into mfg_routings (tenant_id, item_id, version, alt_no, description)
  values (v_t, r.item_id, (select max(version) + 1 from mfg_routings where tenant_id = v_t and item_id = r.item_id and alt_no = r.alt_no),
          r.alt_no, r.description) returning id into v_id;
  insert into mfg_routing_ops (tenant_id, routing_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
                               teardown_min, queue_min, move_min, control_key, component_line_nos)
  select tenant_id, v_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
         teardown_min, queue_min, move_min, control_key, component_line_nos
    from mfg_routing_ops where routing_id = p_routing_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Draft → active. Only one routing per item and alternative is active; the previous one becomes obsolete.
create or replace function mfg_activate_routing(p_routing_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  r mfg_routings;
begin
  select * into r from mfg_routings where id = p_routing_id and tenant_id = v_t;
  if r.id is null then raise exception 'That routing was not found.'; end if;
  if r.status <> 'DRAFT' then raise exception 'Only a draft can be activated (this one is %).', lower(r.status); end if;
  if not exists (select 1 from mfg_routing_ops where routing_id = p_routing_id) then raise exception 'A routing needs at least one operation.'; end if;
  update mfg_routings set status = 'OBSOLETE'
   where tenant_id = v_t and item_id = r.item_id and alt_no = r.alt_no and status = 'ACTIVE' and id <> p_routing_id;
  update mfg_routings set status = 'ACTIVE' where id = p_routing_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'routing_activated', jsonb_build_object('routing_id', p_routing_id, 'document_number', r.document_number, 'version', r.version), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_obsolete_routing(p_routing_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_status text;
begin
  select status into v_status from mfg_routings where id = p_routing_id and tenant_id = v_t;
  if v_status is null then raise exception 'That routing was not found.'; end if;
  if v_status = 'OBSOLETE' then raise exception 'This routing is already obsolete.'; end if;
  update mfg_routings set status = 'OBSOLETE' where id = p_routing_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_routing(p_routing_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_status text;
begin
  select status into v_status from mfg_routings where id = p_routing_id and tenant_id = v_t;
  if v_status is null then raise exception 'That routing was not found.'; end if;
  if v_status <> 'DRAFT' then raise exception 'Only a draft can be deleted. Make an active routing obsolete instead.'; end if;
  delete from mfg_routings where id = p_routing_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Time per operation for a quantity: work time (setup + run + teardown) and waiting time (queue + move), in minutes.
create or replace function mfg_routing_load(p_routing_id uuid, p_qty numeric)
returns table (op_no int, description text, work_center_id uuid, control_key text,
               work_min numeric, wait_min numeric, setup_min numeric, run_min numeric, teardown_min numeric) as $$
  select o.op_no, o.description, o.work_center_id, o.control_key,
         o.setup_min + o.run_min_per_unit * p_qty + o.teardown_min, o.queue_min + o.move_min,
         o.setup_min, o.run_min_per_unit * p_qty, o.teardown_min
    from mfg_routing_ops o where o.routing_id = p_routing_id order by o.op_no;
$$ language sql stable set search_path = public;

-- ---------- work-center calendar ----------
-- Available hours between two dates (inclusive): working days that are not holidays,
-- × shifts × hours per shift × utilization.
create or replace function mfg_wc_available_hours(p_work_center uuid, p_from date, p_to date)
returns numeric as $$
  select coalesce(sum(wc.shifts * wc.hours_per_shift * wc.utilization_pct / 100), 0)
    from mfg_work_centers wc
    cross join generate_series(p_from, p_to, interval '1 day') g
   where wc.id = p_work_center
     and extract(isodow from g)::int = any (wc.working_days)
     and not exists (select 1 from mfg_holidays h where h.tenant_id = wc.tenant_id and h.holiday_date = g::date);
$$ language sql stable set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_reaches(uuid, uuid, uuid) from public, anon, authenticated;       -- internal
revoke execute on function mfg_bom_cycle_guard() from public, anon, authenticated;
revoke execute on function mfg_recalc_low_level(uuid) from public, anon, authenticated;
revoke execute on function mfg_save_bom(uuid, jsonb) from public, anon;
revoke execute on function mfg_copy_bom(uuid) from public, anon;
revoke execute on function mfg_activate_bom(uuid) from public, anon;
revoke execute on function mfg_obsolete_bom(uuid) from public, anon;
revoke execute on function mfg_delete_bom(uuid) from public, anon;
revoke execute on function mfg_active_bom(uuid, uuid, date, int) from public, anon;
revoke execute on function mfg__explode(uuid, uuid, numeric, date, int, text, uuid[], int) from public, anon;
revoke execute on function mfg_explode_bom(uuid, numeric, date, int, int) from public, anon;
revoke execute on function mfg_where_used(uuid, boolean) from public, anon;
revoke execute on function mfg_compare_boms(uuid, uuid) from public, anon;
revoke execute on function mfg_save_routing(uuid, jsonb) from public, anon;
revoke execute on function mfg_copy_routing(uuid) from public, anon;
revoke execute on function mfg_activate_routing(uuid) from public, anon;
revoke execute on function mfg_obsolete_routing(uuid) from public, anon;
revoke execute on function mfg_delete_routing(uuid) from public, anon;
revoke execute on function mfg_routing_load(uuid, numeric) from public, anon;
revoke execute on function mfg_wc_available_hours(uuid, date, date) from public, anon;
grant execute on function mfg_save_bom(uuid, jsonb) to authenticated;
grant execute on function mfg_copy_bom(uuid) to authenticated;
grant execute on function mfg_activate_bom(uuid) to authenticated;
grant execute on function mfg_obsolete_bom(uuid) to authenticated;
grant execute on function mfg_delete_bom(uuid) to authenticated;
grant execute on function mfg_active_bom(uuid, uuid, date, int) to authenticated;
grant execute on function mfg__explode(uuid, uuid, numeric, date, int, text, uuid[], int) to authenticated;
grant execute on function mfg_explode_bom(uuid, numeric, date, int, int) to authenticated;
grant execute on function mfg_where_used(uuid, boolean) to authenticated;
grant execute on function mfg_compare_boms(uuid, uuid) to authenticated;
grant execute on function mfg_save_routing(uuid, jsonb) to authenticated;
grant execute on function mfg_copy_routing(uuid) to authenticated;
grant execute on function mfg_activate_routing(uuid) to authenticated;
grant execute on function mfg_obsolete_routing(uuid) to authenticated;
grant execute on function mfg_delete_routing(uuid) to authenticated;
grant execute on function mfg_routing_load(uuid, numeric) to authenticated;
grant execute on function mfg_wc_available_hours(uuid, date, date) to authenticated;
