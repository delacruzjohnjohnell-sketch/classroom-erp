-- ============================================================
-- Classroom ERP — migration 0036 (Manufacturing ERP, Phase 6a: quality — inspection plans, lots, results, decisions, NCR)
--
-- Needs 0023–0035. ADDITIVE ONLY: new tables, new functions and three new triggers on Manufacturing tables. No Standard object is touched
-- and no existing function is redefined.
--
--   Which items are inspected   mfg_item_quality: per item, "inspect on receipt" (goods bought) and "inspect on production" (goods made).
--   Inspection plan             mfg_inspection_plans: the characteristics to measure for an item, with a minimum and/or maximum.
--   Inspection lot (QI-)        created by a trigger when a flagged item is received (goods receipt GR, or finished-goods receipt FGR).
--                               Flagged goods MUST be received into the quarantine store (the trigger refuses anything else), so they
--                               are not available to MRP, issues or deliveries until a decision is made.
--   Results                     mfg_record_inspection: a value per characteristic, checked against the specification.
--   Decision                    mfg_decide_inspection_lot splits the lot quantity into accept / scrap / return to vendor / rework:
--                                 accept   quarantine -> the item's usual store (a transfer, no postings)
--                                 scrap    stock out + Dr Scrap & Rework Loss, Cr inventory, at the item's cost
--                                 return   stock out + Dr GR/IR, Cr inventory (price difference to PPV); only for bought goods and
--                                          only while no posted vendor invoice covers them
--                                 rework   stays in quarantine under a new inspection lot (QI-) to be inspected again
--                               Anything not accepted creates a non-conformance report (NCR-) with its root cause and cost.
--   Guards                      an order with undecided inspection lots cannot be closed; a stock document made by a quality decision
--                               cannot be reversed from the stock screen; reversing a receipt cancels its open inspection lots.
--
-- ROLLBACK (drops only what this file created):
--   drop trigger if exists trg_mfg_qc_rev_guard on mfg_material_documents; drop trigger if exists trg_mfg_qc_close_guard on mfg_production_orders;
--   drop trigger if exists trg_mfg_qc_line on mfg_material_doc_lines;
--   drop function if exists mfg_close_ncr(uuid, text), mfg_decide_inspection_lot(uuid, numeric, numeric, numeric, numeric, text, text, date),
--     mfg_record_inspection(uuid, jsonb), mfg_save_inspection_plan(uuid, jsonb), mfg_save_item_quality(uuid, boolean, boolean),
--     mfg__qc_rev_guard(), mfg__qc_close_guard(), mfg__qc_line(), mfg__qc_quarantine(uuid);
--   drop table if exists mfg_ncr, mfg_inspection_results, mfg_inspection_lots, mfg_inspection_plans, mfg_item_quality;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_item_quality (
  item_id            uuid primary key references items(id) on delete cascade,
  tenant_id          uuid not null references tenants(id) on delete cascade,
  inspect_receipt    boolean not null default false,
  inspect_production boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table if not exists mfg_inspection_plans (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  item_id        uuid not null references items(id) on delete cascade,
  line_no        int not null,
  characteristic text not null,
  unit           text,
  spec_min       numeric(18, 6),
  spec_max       numeric(18, 6),
  unique (item_id, line_no),
  check (spec_min is not null or spec_max is not null),
  check (spec_min is null or spec_max is null or spec_min <= spec_max)
);
create unique index if not exists mfg_inspection_plans_char on mfg_inspection_plans (item_id, lower(characteristic));

create table if not exists mfg_inspection_lots (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- QI-0001
  item_id          uuid not null references items(id) on delete cascade,
  source           text not null check (source in ('GR', 'PRODUCTION', 'REWORK')),
  source_doc_id    uuid,                                           -- the stock document that brought the goods in
  source_line_id   uuid,
  parent_lot_id    uuid references mfg_inspection_lots(id) on delete set null,
  order_id         uuid,                                           -- the production order, for production lots
  qty              numeric(18, 6) not null check (qty > 0),
  batch_id         uuid,
  location_id      uuid not null references mfg_storage_locations(id),
  status           text not null default 'CREATED' check (status in ('CREATED', 'IN_INSPECTION', 'DECIDED', 'CANCELLED')),
  decision         text check (decision in ('ACCEPT', 'SCRAP', 'RETURN', 'REWORK', 'SPLIT')),
  qty_accept       numeric(18, 6) not null default 0,
  qty_scrap        numeric(18, 6) not null default 0,
  qty_return       numeric(18, 6) not null default 0,
  qty_rework       numeric(18, 6) not null default 0,
  note             text,
  decided_by       uuid,
  decided_at       timestamptz,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists mfg_inspection_lots_idx on mfg_inspection_lots (tenant_id, status);
create index if not exists mfg_inspection_lots_item on mfg_inspection_lots (tenant_id, item_id);
create index if not exists mfg_inspection_lots_doc on mfg_inspection_lots (source_doc_id);
create index if not exists mfg_inspection_lots_order on mfg_inspection_lots (order_id) where order_id is not null;

create table if not exists mfg_inspection_results (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  lot_id         uuid not null references mfg_inspection_lots(id) on delete cascade,
  characteristic text not null,
  unit           text,
  spec_min       numeric(18, 6),                                   -- the specification when it was measured
  spec_max       numeric(18, 6),
  value          numeric(18, 6) not null,
  in_spec        boolean not null,
  recorded_by    uuid default auth.uid(),
  recorded_at    timestamptz not null default now(),
  unique (lot_id, characteristic)
);

create table if not exists mfg_ncr (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  document_number   text,                                          -- NCR-0001
  lot_id            uuid not null references mfg_inspection_lots(id) on delete cascade,
  item_id           uuid not null references items(id) on delete cascade,
  root_cause        text not null check (root_cause in ('MATERIAL', 'MACHINE', 'METHOD', 'PEOPLE', 'MEASUREMENT', 'ENVIRONMENT', 'SUPPLIER', 'OTHER')),
  note              text,
  disposition       text not null,                                 -- e.g. "Scrap 2; Return 1"
  qty               numeric(18, 6) not null check (qty > 0),
  cost              numeric(18, 2) not null default 0,             -- the loss posted to Scrap & Rework Loss
  status            text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  corrective_action text,
  closed_at         timestamptz,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists mfg_ncr_idx on mfg_ncr (tenant_id, status);
create index if not exists mfg_ncr_lot on mfg_ncr (lot_id);

-- ---------- security: read by the owning company and the teacher; writes only through the functions below ----------
alter table mfg_item_quality enable row level security;
alter table mfg_inspection_plans enable row level security;
alter table mfg_inspection_lots enable row level security;
alter table mfg_inspection_results enable row level security;
alter table mfg_ncr enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_item_quality', 'mfg_inspection_plans', 'mfg_inspection_lots', 'mfg_inspection_results', 'mfg_ncr'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

drop trigger if exists trg_mfg_qi_number on mfg_inspection_lots;
create trigger trg_mfg_qi_number before insert on mfg_inspection_lots for each row execute function mfg_assign_number('inspection_lot', 'QI');
drop trigger if exists trg_mfg_ncr_number on mfg_ncr;
create trigger trg_mfg_ncr_number before insert on mfg_ncr for each row execute function mfg_assign_number('ncr', 'NCR');

-- ---------- helpers and triggers ----------
create or replace function mfg__qc_quarantine(p_tenant uuid)
returns uuid as $$
  select id from mfg_storage_locations where tenant_id = p_tenant and kind = 'QUARANTINE' order by code limit 1;
$$ language sql stable security definer set search_path = public;

-- An inspected item arriving on a receipt makes an inspection lot; it must arrive in quarantine.
-- Reversing a receipt cancels the lots that are still open.
create or replace function mfg__qc_line()
returns trigger as $$
declare
  d record; q record; v_name text;
begin
  select doc_type, reference_type, reference_id, reversal_of into d from mfg_material_documents where id = new.doc_id;
  if d.doc_type = 'REV' then
    if new.qty_change < 0 and d.reversal_of is not null then
      update mfg_inspection_lots set status = 'CANCELLED'
       where source_doc_id = d.reversal_of and item_id = new.item_id and status in ('CREATED', 'IN_INSPECTION');
    end if;
    return new;
  end if;
  if new.qty_change <= 0 or d.doc_type not in ('GR', 'FGR') then return new; end if;
  select * into q from mfg_item_quality where item_id = new.item_id;
  if not found then return new; end if;
  if (d.doc_type = 'GR' and not q.inspect_receipt) or (d.doc_type = 'FGR' and not q.inspect_production) then return new; end if;
  if not exists (select 1 from mfg_storage_locations where id = new.location_id and kind = 'QUARANTINE') then
    select name into v_name from items where id = new.item_id;
    raise exception '"%" is inspected before it can be used, so it must be received into the quarantine store.', v_name;
  end if;
  insert into mfg_inspection_lots (tenant_id, item_id, source, source_doc_id, source_line_id, order_id, qty, batch_id, location_id)
  values (new.tenant_id, new.item_id, case when d.doc_type = 'GR' then 'GR' else 'PRODUCTION' end, new.doc_id, new.id,
          case when d.reference_type = 'mfg_production_orders' then d.reference_id end, new.qty_change, new.batch_id, new.location_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_mfg_qc_line on mfg_material_doc_lines;
create trigger trg_mfg_qc_line after insert on mfg_material_doc_lines for each row execute function mfg__qc_line();

-- A production order cannot be closed while goods from it are still waiting for an inspection decision.
create or replace function mfg__qc_close_guard()
returns trigger as $$
declare n int;
begin
  if new.status = 'CLOSED' and old.status is distinct from 'CLOSED' then
    select count(*) into n from mfg_inspection_lots where order_id = new.id and status in ('CREATED', 'IN_INSPECTION');
    if n > 0 then
      raise exception 'Order % still has % inspection lot% waiting for a decision. Decide % before closing the order.',
        coalesce(new.document_number, ''), n, case when n = 1 then '' else 's' end, case when n = 1 then 'it' else 'them' end;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_mfg_qc_close_guard on mfg_production_orders;
create trigger trg_mfg_qc_close_guard before update of status on mfg_production_orders for each row execute function mfg__qc_close_guard();

-- Stock documents made by a quality decision are not reversed from the stock screen (the decision itself is the record).
create or replace function mfg__qc_rev_guard()
returns trigger as $$
begin
  if new.doc_type = 'REV' and new.reversal_of is not null
     and exists (select 1 from mfg_material_documents where id = new.reversal_of and reference_type = 'mfg_inspection_lots') then
    raise exception 'This document was made by an inspection decision and can''t be reversed here. Receive or adjust the stock again if the decision was a mistake.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_mfg_qc_rev_guard on mfg_material_documents;
create trigger trg_mfg_qc_rev_guard before insert on mfg_material_documents for each row execute function mfg__qc_rev_guard();

-- ---------- which items are inspected, and what is measured ----------
create or replace function mfg_save_item_quality(p_item uuid, p_receipt boolean, p_production boolean)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
begin
  if not exists (select 1 from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item and i.tenant_id = v_t and m.item_type <> 'SERVICE') then
    raise exception 'Choose a stocked item from your company.';
  end if;
  insert into mfg_item_quality (item_id, tenant_id, inspect_receipt, inspect_production)
  values (p_item, v_t, coalesce(p_receipt, false), coalesce(p_production, false))
  on conflict (item_id) do update set inspect_receipt = excluded.inspect_receipt, inspect_production = excluded.inspect_production, updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;

-- p_rows: [{"characteristic": "Moisture", "unit": "%", "spec_min": 8, "spec_max": 12}]. Replaces the item's plan.
create or replace function mfg_save_inspection_plan(p_item uuid, p_rows jsonb)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  r jsonb; n int := 0; v_char text; v_min numeric; v_max numeric;
begin
  if not exists (select 1 from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item and i.tenant_id = v_t and m.item_type <> 'SERVICE') then
    raise exception 'Choose a stocked item from your company.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Send the characteristics as a list.'; end if;
  delete from mfg_inspection_plans where item_id = p_item and tenant_id = v_t;
  for r in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    v_char := trim(coalesce(r->>'characteristic', ''));
    v_min := nullif(r->>'spec_min', '')::numeric;
    v_max := nullif(r->>'spec_max', '')::numeric;
    if v_char = '' then raise exception 'Line %: name the characteristic.', n; end if;
    if v_min is null and v_max is null then raise exception 'Line % (%): enter a minimum, a maximum, or both.', n, v_char; end if;
    if v_min is not null and v_max is not null and v_min > v_max then raise exception 'Line % (%): the minimum can''t be above the maximum.', n, v_char; end if;
    if exists (select 1 from mfg_inspection_plans where item_id = p_item and lower(characteristic) = lower(v_char)) then
      raise exception 'Line %: "%" is listed twice.', n, v_char;
    end if;
    insert into mfg_inspection_plans (tenant_id, item_id, line_no, characteristic, unit, spec_min, spec_max)
    values (v_t, p_item, n, v_char, nullif(trim(coalesce(r->>'unit', '')), ''), v_min, v_max);
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- p_results: [{"characteristic": "Moisture", "value": 9.5}]. Measuring again replaces the earlier value until the lot is decided.
create or replace function mfg_record_inspection(p_lot uuid, p_results jsonb)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  l mfg_inspection_lots; r jsonb; pl mfg_inspection_plans; v numeric; n int := 0;
begin
  select * into l from mfg_inspection_lots where id = p_lot and tenant_id = v_t for update;
  if l.id is null then raise exception 'That inspection lot was not found.'; end if;
  if l.status not in ('CREATED', 'IN_INSPECTION') then raise exception 'This inspection lot is already %, so its results can''t change.', lower(l.status); end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) = 0 then raise exception 'Enter at least one measured value.'; end if;
  for r in select * from jsonb_array_elements(p_results) loop
    n := n + 1;
    select * into pl from mfg_inspection_plans where item_id = l.item_id and lower(characteristic) = lower(trim(coalesce(r->>'characteristic', '')));
    if pl.id is null then raise exception 'Line %: "%" is not on this item''s inspection plan.', n, coalesce(r->>'characteristic', ''); end if;
    v := nullif(r->>'value', '')::numeric;
    if v is null then raise exception 'Line % (%): enter the measured value.', n, pl.characteristic; end if;
    insert into mfg_inspection_results (tenant_id, lot_id, characteristic, unit, spec_min, spec_max, value, in_spec)
    values (v_t, l.id, pl.characteristic, pl.unit, pl.spec_min, pl.spec_max, v,
            (pl.spec_min is null or v >= pl.spec_min) and (pl.spec_max is null or v <= pl.spec_max))
    on conflict (lot_id, characteristic) do update
      set value = excluded.value, in_spec = excluded.in_spec, unit = excluded.unit, spec_min = excluded.spec_min, spec_max = excluded.spec_max,
          recorded_by = auth.uid(), recorded_at = now();
  end loop;
  update mfg_inspection_lots set status = 'IN_INSPECTION' where id = l.id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the decision ----------
create or replace function mfg_decide_inspection_lot(p_lot uuid, p_accept numeric, p_scrap numeric, p_return numeric, p_rework numeric,
                                                     p_cause text, p_note text, p_date date default null)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  l mfg_inspection_lots; v_date date := coalesce(p_date, current_date);
  a numeric := round(coalesce(p_accept, 0), 6); s numeric := round(coalesce(p_scrap, 0), 6);
  r numeric := round(coalesce(p_return, 0), 6); w numeric := round(coalesce(p_rework, 0), 6);
  it record; v_missing int; v_out int; v_have numeric; v_dest uuid; v_info numeric; v_unit numeric; v_key text;
  v_doc uuid; v_je uuid; v_amt numeric := 0; v_cost numeric := 0; v_disp text := ''; v_kinds int := 0; v_decision text;
  src record; v_po_line record; v_po_price numeric; v_inv numeric; v_po_amt numeric; v_ppv numeric; v_lines jsonb; v_inv_qty numeric; v_received numeric;
begin
  select * into l from mfg_inspection_lots where id = p_lot and tenant_id = v_t for update;
  if l.id is null then raise exception 'That inspection lot was not found.'; end if;
  if l.status not in ('CREATED', 'IN_INSPECTION') then raise exception 'This inspection lot is already %.', lower(l.status); end if;
  if a < 0 or s < 0 or r < 0 or w < 0 then raise exception 'A quantity can''t be negative.'; end if;
  if abs(a + s + r + w - l.qty) > 0.000001 then
    raise exception 'The quantities must add up to the whole lot: the lot holds % and you entered %.', trim_scale(l.qty), trim_scale(a + s + r + w);
  end if;
  select count(*) into v_missing from mfg_inspection_plans p
   where p.item_id = l.item_id and not exists (select 1 from mfg_inspection_results x where x.lot_id = l.id and lower(x.characteristic) = lower(p.characteristic));
  if v_missing > 0 then raise exception 'Record the result of every characteristic first (% still missing).', v_missing; end if;
  select count(*) into v_out from mfg_inspection_results where lot_id = l.id and not in_spec;
  if a > 0 and v_out > 0 and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception '% result% outside the specification. Say why you accept the goods.', v_out, case when v_out = 1 then ' is' else 's are' end;
  end if;
  if s + r + w > 0 and (p_cause is null or p_cause not in ('MATERIAL', 'MACHINE', 'METHOD', 'PEOPLE', 'MEASUREMENT', 'ENVIRONMENT', 'SUPPLIER', 'OTHER')) then
    raise exception 'Choose the root cause of the rejection.';
  end if;
  if r > 0 and l.source <> 'GR' then raise exception 'Only goods bought from a vendor can be returned to the vendor.'; end if;
  select coalesce(sum(qty), 0) into v_have from mfg_stock
   where tenant_id = v_t and item_id = l.item_id and location_id = l.location_id and batch_id is not distinct from l.batch_id;
  if v_have < l.qty - 0.000001 then
    raise exception 'The goods are no longer in the quarantine store (% there, % in the lot).', trim_scale(v_have), trim_scale(l.qty);
  end if;
  select i.name, m.item_type, m.default_location_id into it from items i join mfg_item_master m on m.item_id = i.id where i.id = l.item_id;
  v_key := mfg__inv_key(it.item_type);

  -- accepted: out of quarantine into the usual store (a transfer; nothing is posted)
  if a > 0 then
    select id into v_dest from mfg_storage_locations where tenant_id = v_t and id = it.default_location_id and kind in ('RM', 'FG');
    if v_dest is null then
      select id into v_dest from mfg_storage_locations
       where tenant_id = v_t and kind = case when it.item_type in ('RAW', 'PACKAGING') then 'RM' else 'FG' end order by code limit 1;
    end if;
    if v_dest is null then raise exception 'There is no store to put "%" into. Add one under Master Data.', it.name; end if;
    select coalesce(case when mfg__method(v_t) = 'STANDARD' then m.standard_cost else m.moving_avg_cost end, 0) into v_info from mfg_item_master m where m.item_id = l.item_id;
    v_doc := mfg__doc(v_t, 'TRF', v_date, 'mfg_inspection_lots', l.id, 'Released after inspection ' || l.document_number, null);
    perform mfg__move(v_doc, v_t, 1, l.item_id, l.location_id, l.batch_id, -a, v_info, null);
    perform mfg__move(v_doc, v_t, 2, l.item_id, v_dest, l.batch_id, a, v_info, null);
    v_kinds := v_kinds + 1; v_decision := 'ACCEPT';
  end if;

  -- scrapped: stock out, the loss is booked at the item's cost
  if s > 0 then
    v_unit := mfg__item_cost(v_t, l.item_id);
    v_amt := round(s * v_unit, 2);
    v_doc := mfg__doc(v_t, 'ADJ', v_date, 'mfg_inspection_lots', l.id, 'Scrapped after inspection ' || l.document_number, null);
    perform mfg__move(v_doc, v_t, 1, l.item_id, l.location_id, l.batch_id, -s, v_unit, null);
    v_je := mfg__post_entry(v_t, v_date, 'Scrap after inspection ' || l.document_number, 'mfg_material_documents', v_doc,
      jsonb_build_array(jsonb_build_object('key', 'SCRAP_LOSS', 'debit', v_amt), jsonb_build_object('key', v_key, 'credit', v_amt)));
    update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
    v_cost := v_cost + v_amt;
    v_disp := v_disp || 'Scrap ' || trim_scale(s) || '; ';
    v_kinds := v_kinds + 1; v_decision := 'SCRAP';
  end if;

  -- returned to the vendor: stock out, the goods-received-not-invoiced accrual is taken back
  if r > 0 then
    select * into src from mfg_material_doc_lines where id = l.source_line_id;
    if src.po_line_id is null then raise exception 'These goods were not received against a purchase order, so they can''t be returned to a vendor.'; end if;
    select pl.unit_cost, pl.purchase_order_id into v_po_line from purchase_order_lines pl where pl.id = src.po_line_id;
    v_po_price := v_po_line.unit_cost;
    select coalesce(sum(qty_change), 0) into v_received from mfg_material_doc_lines where po_line_id = src.po_line_id;
    select coalesce(sum(vl.qty), 0) into v_inv_qty from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id
     where vl.po_line_id = src.po_line_id and vi.status = 'POSTED';
    if v_received - r < v_inv_qty - 0.000001 then
      raise exception 'A vendor invoice already covers these goods. Ask the vendor for a credit note; returns after invoicing are not supported yet.';
    end if;
    v_unit := mfg__item_cost(v_t, l.item_id);
    v_inv := round(r * v_unit, 2);
    v_po_amt := round(r * v_po_price, 2);
    v_ppv := v_po_amt - v_inv;
    v_doc := mfg__doc(v_t, 'ADJ', v_date, 'mfg_inspection_lots', l.id, 'Returned to vendor after inspection ' || l.document_number, null);
    perform mfg__move(v_doc, v_t, 1, l.item_id, l.location_id, l.batch_id, -r, v_unit, src.po_line_id);
    v_lines := jsonb_build_array(jsonb_build_object('key', 'GR_IR', 'debit', v_po_amt), jsonb_build_object('key', v_key, 'credit', v_inv));
    if v_ppv > 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'credit', v_ppv);
    elsif v_ppv < 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'debit', -v_ppv); end if;
    v_je := mfg__post_entry(v_t, v_date, 'Return to vendor after inspection ' || l.document_number, 'mfg_material_documents', v_doc, v_lines);
    update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
    update purchase_orders set status = 'sent' where id = v_po_line.purchase_order_id and status = 'closed';
    v_disp := v_disp || 'Return ' || trim_scale(r) || '; ';
    v_kinds := v_kinds + 1; v_decision := 'RETURN';
  end if;

  -- rework: stays in quarantine under a new lot, inspected again once the rework is done
  if w > 0 then
    insert into mfg_inspection_lots (tenant_id, item_id, source, source_doc_id, source_line_id, parent_lot_id, order_id, qty, batch_id, location_id)
    values (v_t, l.item_id, 'REWORK', l.source_doc_id, l.source_line_id, l.id, l.order_id, w, l.batch_id, l.location_id);
    v_disp := v_disp || 'Rework ' || trim_scale(w) || '; ';
    v_kinds := v_kinds + 1; v_decision := 'REWORK';
  end if;

  update mfg_inspection_lots
     set status = 'DECIDED', decision = case when v_kinds > 1 then 'SPLIT' else v_decision end,
         qty_accept = a, qty_scrap = s, qty_return = r, qty_rework = w, note = nullif(trim(coalesce(p_note, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = l.id;

  if s + r + w > 0 then
    insert into mfg_ncr (tenant_id, lot_id, item_id, root_cause, note, disposition, qty, cost)
    values (v_t, l.id, l.item_id, p_cause, nullif(trim(coalesce(p_note, '')), ''), rtrim(v_disp, '; '), s + r + w, v_cost);
  end if;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'inspection_decided', jsonb_build_object('lot', l.document_number, 'accept', a, 'scrap', s, 'return', r, 'rework', w, 'loss', v_cost), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_close_ncr(p_ncr uuid, p_action text)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text;
begin
  select status into st from mfg_ncr where id = p_ncr and tenant_id = v_t for update;
  if st is null then raise exception 'That non-conformance report was not found.'; end if;
  if st = 'CLOSED' then raise exception 'This report is already closed.'; end if;
  if length(trim(coalesce(p_action, ''))) < 3 then raise exception 'Write down what you did to stop it happening again.'; end if;
  update mfg_ncr set status = 'CLOSED', corrective_action = trim(p_action), closed_at = now() where id = p_ncr;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__qc_quarantine(uuid) from public, anon, authenticated;
revoke execute on function mfg__qc_line() from public, anon, authenticated;
revoke execute on function mfg__qc_close_guard() from public, anon, authenticated;
revoke execute on function mfg__qc_rev_guard() from public, anon, authenticated;
revoke execute on function mfg_save_item_quality(uuid, boolean, boolean) from public, anon;
revoke execute on function mfg_save_inspection_plan(uuid, jsonb) from public, anon;
revoke execute on function mfg_record_inspection(uuid, jsonb) from public, anon;
revoke execute on function mfg_decide_inspection_lot(uuid, numeric, numeric, numeric, numeric, text, text, date) from public, anon;
revoke execute on function mfg_close_ncr(uuid, text) from public, anon;
grant execute on function mfg_save_item_quality(uuid, boolean, boolean) to authenticated;
grant execute on function mfg_save_inspection_plan(uuid, jsonb) to authenticated;
grant execute on function mfg_record_inspection(uuid, jsonb) to authenticated;
grant execute on function mfg_decide_inspection_lot(uuid, numeric, numeric, numeric, numeric, text, text, date) to authenticated;
grant execute on function mfg_close_ncr(uuid, text) to authenticated;
