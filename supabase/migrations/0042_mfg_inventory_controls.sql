-- ============================================================
-- Classroom ERP — migration 0042 (Manufacturing ERP, Phase 8b: reservations, purchasing units, lot genealogy, QC hold on payment)
--
-- Needs 0023–0041. Four columns are added to our own tables, two existing functions of ours are redefined (mfg_create_po, mfg_order_availability),
-- and one trigger is added to the Standard bill_payments table (approved; it acts only on Manufacturing companies).
--
--   Reservations    A released order's open component requirement (required − issued) is stock promised to it. mfg_reservations adds them up
--                   per item; mfg_stock_availability shows, per item, usable stock (not on the shop floor, not in quarantine), quarantined
--                   stock, reserved, available (usable − reserved), what is still to arrive on open purchase orders, and the projected
--                   position. mfg_order_availability (redefined) now ignores quarantined stock — it used to count it as available — and
--                   leaves out what OTHER orders have reserved, so two orders can no longer both count on the same lumber.
--   Purchasing unit An item may be bought in another unit (a box of 100). mfg_set_purchase_uom records it (a unit conversion must exist);
--                   mfg_create_po (redefined) accepts a "uom" on a line, converts the quantity and the price to the stocking unit, and keeps
--                   the quantity, unit and price as ordered on mfg_po_line_items. Receipts, stock and invoices stay in the stocking unit.
--   Lot genealogy   mfg_lot_trace follows a lot BACKWARD (what was received or produced, the order, the lots consumed, the suppliers) or
--                   FORWARD (the orders that used it, what they produced, the deliveries and customers). It works at order level: if an order
--                   used several lots, every output lot of that order is linked to every input lot.
--   Expiry          mfg_expiry_report lists lots in stock with days left and a bucket (expired, 30, 60, 90 days, later, none);
--                   mfg_dead_stock lists items with stock that have not moved out for N days.
--   QC hold         trg_mfg_payment_qc_guard (bill_payments): a vendor invoice cannot be paid while an inspection lot from goods on its
--                   purchase order is still undecided.
--
-- ROLLBACK:
--   drop trigger if exists trg_mfg_payment_qc_guard on bill_payments; drop function if exists mfg_payment_qc_guard();
--   drop function if exists mfg_dead_stock(uuid, int, date), mfg_expiry_report(uuid, date), mfg_lot_trace(uuid, uuid, text),
--     mfg_set_purchase_uom(uuid, text), mfg_stock_availability(uuid), mfg_reservations(uuid);
--   alter table mfg_po_line_items drop column if exists pur_qty, drop column if exists pur_uom, drop column if exists pur_price;
--   alter table mfg_item_master drop column if exists purchase_uom;   -- then re-run 0030 and 0031 to restore mfg_create_po / mfg_order_availability
-- ============================================================

alter table mfg_item_master add column if not exists purchase_uom text;
alter table mfg_po_line_items add column if not exists pur_qty numeric(18, 6);
alter table mfg_po_line_items add column if not exists pur_uom text;
alter table mfg_po_line_items add column if not exists pur_price numeric(18, 6);

-- ---------- reservations ----------
create or replace function mfg_reservations(p_tenant uuid)
returns table (item_id uuid, reserved numeric, orders int) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  select c.item_id, round(sum(c.qty_required - c.qty_issued), 6), count(distinct c.order_id)::int
    from mfg_prod_components c join mfg_production_orders o on o.id = c.order_id
   where c.tenant_id = p_tenant and o.status in ('RELEASED', 'PARTIALLY_CONFIRMED') and c.qty_required > c.qty_issued
   group by c.item_id;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_stock_availability(p_tenant uuid)
returns table (item_id uuid, usable numeric, quarantine numeric, reserved numeric, available numeric, on_order numeric, projected numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  with st as (
    select s.item_id as iid,
           sum(s.qty) filter (where sl.kind not in ('WIP', 'QUARANTINE')) as usable,
           sum(s.qty) filter (where sl.kind = 'QUARANTINE') as quar
      from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id where s.tenant_id = p_tenant group by 1
  ), rs as (
    select r.item_id as iid, r.reserved from mfg_reservations(p_tenant) r
  ), recv as (
    select dl.po_line_id as plid, sum(dl.qty_change) as q from mfg_material_doc_lines dl where dl.tenant_id = p_tenant and dl.po_line_id is not null group by 1
  ), oo as (
    select li.item_id as iid, sum(greatest(pl.qty - coalesce(rc.q, 0), 0)) as q
      from purchase_order_lines pl join purchase_orders po on po.id = pl.purchase_order_id
      join mfg_po_line_items li on li.po_line_id = pl.id left join recv rc on rc.plid = pl.id
     where po.tenant_id = p_tenant and po.status <> 'closed' group by 1
  )
  select m.item_id, round(coalesce(st.usable, 0), 6), round(coalesce(st.quar, 0), 6), round(coalesce(rs.reserved, 0), 6),
         round(coalesce(st.usable, 0) - coalesce(rs.reserved, 0), 6), round(coalesce(oo.q, 0), 6),
         round(coalesce(st.usable, 0) - coalesce(rs.reserved, 0) + coalesce(oo.q, 0), 6)
    from mfg_item_master m left join st on st.iid = m.item_id left join rs on rs.iid = m.item_id left join oo on oo.iid = m.item_id
   where m.tenant_id = p_tenant and m.item_type <> 'SERVICE' and (st.iid is not null or rs.iid is not null or oo.iid is not null)
   order by m.item_id;
end;
$$ language plpgsql stable security definer set search_path = public;

-- what each component needs against what is usable and not promised to another order
drop function if exists mfg_order_availability(uuid);
create or replace function mfg_order_availability(p_order uuid)
returns table (component_id uuid, item_id uuid, item_name text, uom text, required numeric, issued numeric, on_hand numeric, reserved_by_others numeric, short numeric) as $$
  with base as (
    select c.id as cid, c.item_id as iid, i.name as nm, m.base_uom as bu, c.qty_required as req, c.qty_issued as iss, c.tenant_id as tid,
           coalesce((select sum(s.qty) from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id
                      where s.item_id = c.item_id and s.tenant_id = c.tenant_id and sl.kind not in ('WIP', 'QUARANTINE')), 0) as oh,
           coalesce((select sum(greatest(x.qty_required - x.qty_issued, 0)) from mfg_prod_components x join mfg_production_orders xo on xo.id = x.order_id
                      where x.item_id = c.item_id and x.tenant_id = c.tenant_id and x.order_id <> c.order_id and xo.status in ('RELEASED', 'PARTIALLY_CONFIRMED')), 0) as ro,
           c.line_no
      from mfg_prod_components c join items i on i.id = c.item_id join mfg_item_master m on m.item_id = c.item_id
     where c.order_id = p_order
  )
  select cid, iid, nm, bu, req, iss, oh, ro, greatest(req - iss - greatest(oh - ro, 0), 0) from base order by line_no;
$$ language sql stable set search_path = public;

-- ---------- purchasing unit ----------
create or replace function mfg_set_purchase_uom(p_item uuid, p_uom text)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_base text;
begin
  select base_uom into v_base from mfg_item_master where item_id = p_item and tenant_id = v_t;
  if v_base is null then raise exception 'Choose one of your items.'; end if;
  if nullif(trim(coalesce(p_uom, '')), '') is null or p_uom = v_base then
    update mfg_item_master set purchase_uom = null where item_id = p_item;
    return;
  end if;
  if not exists (select 1 from mfg_uom where tenant_id = v_t and code = p_uom) then raise exception 'There is no unit "%" in this company.', p_uom; end if;
  perform mfg_convert_qty(v_t, p_item, 1, p_uom, v_base);            -- refuses if there is no conversion
  update mfg_item_master set purchase_uom = p_uom where item_id = p_item;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_create_po(p_vendor uuid, p_date date, p_expected date, p_lines jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_po uuid; ln jsonb; v_item uuid; v_name text; q numeric; price numeric; v_total numeric := 0; v_line uuid; n int := 0;
  v_base text; v_uom text; bq numeric; bp numeric;
begin
  if not exists (select 1 from vendors where id = p_vendor and tenant_id = v_t) then raise exception 'Choose a vendor.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one line to the purchase order.'; end if;
  insert into purchase_orders (tenant_id, vendor_id, order_date, expected_date, status, total)
  values (v_t, p_vendor, coalesce(p_date, current_date), p_expected, 'sent', 0) returning id into v_po;
  for ln in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    v_item := nullif(ln->>'item_id', '')::uuid;
    q := coalesce(nullif(ln->>'qty', '')::numeric, 0);
    price := coalesce(nullif(ln->>'unit_price', '')::numeric, -1);
    v_uom := nullif(trim(coalesce(ln->>'uom', '')), '');
    select i.name, m.base_uom into v_name, v_base from items i join mfg_item_master m on m.item_id = i.id
     where i.id = v_item and i.tenant_id = v_t and m.active and m.item_type <> 'SERVICE';
    if v_name is null then raise exception 'Line %: choose a stocked item from your company.', n; end if;
    if q <= 0 then raise exception 'Line %: the quantity of "%" must be above zero.', n, v_name; end if;
    if price < 0 then raise exception 'Line %: enter the price of "%".', n, v_name; end if;
    bq := q; bp := price;
    if v_uom is not null and v_uom <> v_base then
      bq := round(mfg_convert_qty(v_t, v_item, q, v_uom, v_base), 6);             -- refuses if there is no conversion
      if bq <= 0 then raise exception 'Line %: the quantity of "%" converts to nothing.', n, v_name; end if;
      bp := round(price * q / bq, 6);
    else
      v_uom := null;
    end if;
    insert into purchase_order_lines (purchase_order_id, description, qty, unit_cost) values (v_po, v_name, bq, bp) returning id into v_line;
    insert into mfg_po_line_items (po_line_id, tenant_id, item_id, pur_qty, pur_uom, pur_price)
    values (v_line, v_t, v_item, case when v_uom is null then null else q end, v_uom, case when v_uom is null then null else price end);
    v_total := v_total + round(q * price, 2);
  end loop;
  update purchase_orders set total = v_total where id = v_po;
  return v_po;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- lot genealogy ----------
create or replace function mfg_lot_trace(p_tenant uuid, p_batch uuid, p_direction text)
returns table (level int, kind text, ref_no text, ref_date date, item_id uuid, batch_no text, qty numeric, party text, note text) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if upper(coalesce(p_direction, '')) not in ('BACKWARD', 'FORWARD') then raise exception 'Trace BACKWARD (where it came from) or FORWARD (where it went).'; end if;
  if not exists (select 1 from mfg_batches b where b.id = p_batch and b.tenant_id = p_tenant) then raise exception 'That lot was not found.'; end if;
  if upper(p_direction) = 'BACKWARD' then
    return query
    with ln as (
      select dl.item_id as iid, dl.batch_id as bid, dl.qty_change as qc, dl.po_line_id as plid, dl.so_line_id as slid,
             d.document_number as dno, d.posting_date as pd, d.doc_type as dt, d.reference_type as rt, d.reference_id as rid,
             case when d.doc_type = 'REV' then o.doc_type else d.doc_type end as eff
        from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id left join mfg_material_documents o on o.id = d.reversal_of
       where dl.tenant_id = p_tenant),
    recv as (select * from ln where bid = p_batch and dt in ('GR', 'FGR') and qc > 0),
    orders as (select distinct r.rid as oid from recv r where r.dt = 'FGR' and r.rt = 'mfg_production_orders'),
    inputs as (
      select x.rid as oid, x.iid, x.bid, -sum(x.qc) as q, max(x.pd) as pd
        from ln x where x.eff = 'GI' and x.rt = 'mfg_production_orders' and x.rid in (select oid from orders) group by x.rid, x.iid, x.bid having -sum(x.qc) > 0),
    supp as (select s.* from ln s where s.dt = 'GR' and s.qc > 0 and s.bid in (select bid from inputs where bid is not null))
    select 0, 'LOT', b.batch_no, b.received_on, b.item_id, b.batch_no, null::numeric, null::text, 'Expires ' || coalesce(b.expiry_date::text, '—')
      from mfg_batches b where b.id = p_batch
    union all
    select 1, case r.dt when 'FGR' then 'PRODUCED' else 'RECEIVED' end, r.dno, r.pd, r.iid, bb.batch_no, r.qc, v.name, case when po.document_number is not null then 'PO ' || po.document_number end
      from recv r left join mfg_batches bb on bb.id = r.bid
      left join purchase_order_lines pl on pl.id = r.plid left join purchase_orders po on po.id = pl.purchase_order_id left join vendors v on v.id = po.vendor_id
    union all
    select 2, 'ORDER', o.document_number, o.planned_start, o.item_id, null, o.qty_good, null, 'Status ' || lower(replace(o.status, '_', ' '))
      from orders k join mfg_production_orders o on o.id = k.oid
    union all
    select 3, 'INPUT', o.document_number, i.pd, i.iid, bt.batch_no, i.q, null, case when i.bid is null then 'not lot-tracked' else 'consumed by the order' end
      from inputs i join mfg_production_orders o on o.id = i.oid left join mfg_batches bt on bt.id = i.bid
    union all
    select 4, 'SUPPLIER', s.dno, s.pd, s.iid, bt.batch_no, s.qc, v.name, case when po.document_number is not null then 'PO ' || po.document_number end
      from supp s left join mfg_batches bt on bt.id = s.bid
      left join purchase_order_lines pl on pl.id = s.plid left join purchase_orders po on po.id = pl.purchase_order_id left join vendors v on v.id = po.vendor_id
    order by 1, 4, 3;
  else
    return query
    with ln as (
      select dl.item_id as iid, dl.batch_id as bid, dl.qty_change as qc, dl.po_line_id as plid, dl.so_line_id as slid,
             d.document_number as dno, d.posting_date as pd, d.doc_type as dt, d.reference_type as rt, d.reference_id as rid,
             case when d.doc_type = 'REV' then o.doc_type else d.doc_type end as eff
        from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id left join mfg_material_documents o on o.id = d.reversal_of
       where dl.tenant_id = p_tenant),
    used as (
      select x.rid as oid, -sum(x.qc) as q, max(x.pd) as pd from ln x
       where x.bid = p_batch and x.eff = 'GI' and x.rt = 'mfg_production_orders' group by x.rid having -sum(x.qc) > 0),
    outs as (select r.* from ln r where r.dt = 'FGR' and r.qc > 0 and r.rid in (select oid from used)),
    sold as (select s.* from ln s where s.dt = 'DLV' and s.qc < 0 and (s.bid = p_batch or s.bid in (select bid from outs where bid is not null)))
    select 0, 'LOT', b.batch_no, b.received_on, b.item_id, b.batch_no, null::numeric, null::text, 'Expires ' || coalesce(b.expiry_date::text, '—')
      from mfg_batches b where b.id = p_batch
    union all
    select 1, 'USED_IN', o.document_number, u.pd, o.item_id, null, u.q, null, 'Status ' || lower(replace(o.status, '_', ' '))
      from used u join mfg_production_orders o on o.id = u.oid
    union all
    select 2, 'OUTPUT', ou.dno, ou.pd, ou.iid, bt.batch_no, ou.qc, null, 'from order ' || o.document_number
      from outs ou join mfg_production_orders o on o.id = ou.rid left join mfg_batches bt on bt.id = ou.bid
    union all
    select 3, 'DELIVERED', s.dno, s.pd, s.iid, bt.batch_no, -s.qc, cu.name, case when so.document_number is not null then 'SO ' || so.document_number end
      from sold s left join mfg_batches bt on bt.id = s.bid
      left join sales_order_lines sl on sl.id = s.slid left join sales_orders so on so.id = sl.sales_order_id left join customers cu on cu.id = so.customer_id
    order by 1, 4, 3;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- expiry and dead stock ----------
create or replace function mfg_expiry_report(p_tenant uuid, p_as_of date default current_date)
returns table (item_id uuid, batch_id uuid, batch_no text, location_id uuid, qty numeric, unit_cost numeric, value numeric, expiry_date date, days_left int, bucket text) as $$
declare
  v_method text;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  select costing_method into v_method from mfg_company_settings where tenant_id = p_tenant;
  return query
  select s.item_id, s.batch_id, b.batch_no, s.location_id, round(s.qty, 6),
         case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end,
         round(s.qty * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end, 2),
         b.expiry_date, (b.expiry_date - p_as_of)::int,
         (case when b.expiry_date is null then 'NO_EXPIRY' when b.expiry_date < p_as_of then 'EXPIRED' when b.expiry_date <= p_as_of + 30 then 'DUE_30'
               when b.expiry_date <= p_as_of + 60 then 'DUE_60' when b.expiry_date <= p_as_of + 90 then 'DUE_90' else 'LATER' end)::text
    from mfg_stock s join mfg_batches b on b.id = s.batch_id join mfg_item_master m on m.item_id = s.item_id
   where s.tenant_id = p_tenant and s.qty > 0
   order by b.expiry_date nulls last, b.batch_no;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_dead_stock(p_tenant uuid, p_days int default 180, p_as_of date default current_date)
returns table (item_id uuid, qty numeric, unit_cost numeric, value numeric, last_movement date, idle_days int) as $$
declare
  v_method text;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_days is null or p_days < 0 then raise exception 'Enter the number of idle days (0 or more).'; end if;
  select costing_method into v_method from mfg_company_settings where tenant_id = p_tenant;
  return query
  with st as (
    select s.item_id as iid, sum(s.qty) as q from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id
     where s.tenant_id = p_tenant and sl.kind <> 'WIP' group by 1 having sum(s.qty) > 0),
  mv as (
    select dl.item_id as iid,
           max(d.posting_date) filter (where dl.qty_change < 0 and d.doc_type in ('GI', 'DLV')) as last_out,
           max(d.posting_date) as last_any
      from mfg_material_doc_lines dl join mfg_material_documents d on d.id = dl.doc_id where dl.tenant_id = p_tenant group by 1)
  select st.iid, round(st.q, 6), case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end,
         round(st.q * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end, 2),
         coalesce(mv.last_out, mv.last_any), (p_as_of - coalesce(mv.last_out, mv.last_any))::int
    from st join mfg_item_master m on m.item_id = st.iid left join mv on mv.iid = st.iid
   where p_as_of - coalesce(mv.last_out, mv.last_any, p_as_of) >= p_days
   order by 6 desc, 4 desc;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- QC hold on payment ----------
create or replace function mfg_payment_qc_guard()
returns trigger as $$
declare
  v_po uuid; n int;
begin
  if tenant_edition(new.tenant_id) is distinct from 'MANUFACTURING' then return new; end if;
  select vi.po_id into v_po from mfg_vendor_invoices vi where vi.bill_id = new.bill_id and vi.tenant_id = new.tenant_id limit 1;
  if v_po is null then return new; end if;
  select count(*) into n
    from mfg_inspection_lots l
    join mfg_material_doc_lines dl on dl.id = l.source_line_id
    join purchase_order_lines pl on pl.id = dl.po_line_id
   where l.tenant_id = new.tenant_id and pl.purchase_order_id = v_po and l.status in ('CREATED', 'IN_INSPECTION');
  if n > 0 then
    raise exception 'Payment is on hold: % inspection lot% from the goods on this invoice''s purchase order ha% not been decided yet. Decide % under Quality first.',
      n, case when n = 1 then '' else 's' end, case when n = 1 then 's' else 've' end, case when n = 1 then 'it' else 'them' end;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_payment_qc_guard on bill_payments;
create trigger trg_mfg_payment_qc_guard before insert on bill_payments
  for each row execute function mfg_payment_qc_guard();

-- ---------- who may call what ----------
revoke execute on function mfg_payment_qc_guard() from public, anon, authenticated;
revoke execute on function mfg_reservations(uuid) from public, anon;
revoke execute on function mfg_stock_availability(uuid) from public, anon;
revoke execute on function mfg_order_availability(uuid) from public, anon;
revoke execute on function mfg_set_purchase_uom(uuid, text) from public, anon;
revoke execute on function mfg_create_po(uuid, date, date, jsonb) from public, anon;
revoke execute on function mfg_lot_trace(uuid, uuid, text) from public, anon;
revoke execute on function mfg_expiry_report(uuid, date) from public, anon;
revoke execute on function mfg_dead_stock(uuid, int, date) from public, anon;
grant execute on function mfg_reservations(uuid) to authenticated;
grant execute on function mfg_stock_availability(uuid) to authenticated;
grant execute on function mfg_order_availability(uuid) to authenticated;
grant execute on function mfg_set_purchase_uom(uuid, text) to authenticated;
grant execute on function mfg_create_po(uuid, date, date, jsonb) to authenticated;
grant execute on function mfg_lot_trace(uuid, uuid, text) to authenticated;
grant execute on function mfg_expiry_report(uuid, date) to authenticated;
grant execute on function mfg_dead_stock(uuid, int, date) to authenticated;
