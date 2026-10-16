-- ============================================================
-- Classroom ERP — migration 0030 (Manufacturing ERP, Phase 4a part 1: the accounting and stock kernel)
--
-- Needs 0023–0029. ADDITIVE ONLY: new tables and functions; rows are inserted into the existing PO, goods-receipt and
-- journal tables only through the functions below, exactly as the Standard functions do.
--
-- The kernel in one sentence: every stock movement is a material document whose lines move stock AND are posted to the
-- ledger by ONE function (mfg__post_entry) in the same transaction, so stock and ledger cannot drift apart.
--
--   mfg__post_entry    the only way Manufacturing writes a journal entry: checks it balances to the centavo
--                      (a difference of up to 5 centavos from rounding goes to the Rounding account; more is refused)
--   material documents immutable (no update, no delete; a correction is a linked reversal — Phase 4b). The teacher's
--                      "delete company" is the one exception.
--   stock              mfg_stock rows by item / location / lot; a trigger refuses a negative balance unless the teacher
--                      allowed it for the company (allow_negative_stock)
--   lots               issues are picked first-expiry-first-out, then first-in-first-out (mfg__pick)
--   valuation          standard costing: stock is carried at the item's standard cost and the difference between the
--                      purchase price and standard goes to Purchase Price Variance; actual costing: the item's moving
--                      average, updated at every receipt
--   goods receipt      Dr inventory (at standard, or at the PO price under actual costing) · Dr/Cr PPV · Cr GR/IR
--
-- ROLLBACK (drops only what this file created):
--   drop function if exists mfg_transfer_stock(uuid, uuid, uuid, numeric, date, text),
--     mfg_post_stock_adjustment(uuid, uuid, numeric, numeric, text, date, text, date, text),
--     mfg_post_goods_receipt(uuid, date, jsonb, text), mfg_delete_po(uuid), mfg_create_po(uuid, date, date, jsonb),
--     mfg__pick(uuid, uuid, uuid, numeric), mfg__move(uuid, uuid, int, uuid, uuid, uuid, numeric, numeric, uuid),
--     mfg__doc(uuid, text, date, text, uuid, text, text), mfg__batch(uuid, uuid, text, date, date),
--     mfg__item_cost(uuid, uuid), mfg__inv_key(text), mfg__method(uuid), mfg__post_entry(uuid, date, text, text, uuid, jsonb),
--     mfg_stock_guard(), mfg_block_mutation();
--   drop table if exists mfg_po_line_items, mfg_material_doc_lines, mfg_material_documents, mfg_stock, mfg_batches;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_batches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  batch_no    text not null,
  received_on date not null default current_date,
  expiry_date date,
  created_at  timestamptz not null default now(),
  unique (tenant_id, item_id, batch_no)
);

create table if not exists mfg_stock (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  location_id uuid not null references mfg_storage_locations(id) on delete cascade,
  batch_id    uuid references mfg_batches(id) on delete cascade,
  qty         numeric(18, 6) not null default 0
);
create unique index if not exists mfg_stock_unique
  on mfg_stock (tenant_id, item_id, location_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists mfg_stock_item_idx on mfg_stock (tenant_id, item_id);

create table if not exists mfg_material_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_number text not null,
  doc_type        text not null check (doc_type in ('GR', 'GI', 'FGR', 'TRF', 'ADJ', 'DLV', 'REV')),
  posting_date    date not null,
  reference_type  text,                               -- 'goods_receipts', 'mfg_production_orders', …
  reference_id    uuid,
  memo            text,
  reversal_of     uuid references mfg_material_documents(id),
  journal_entry_id uuid references journal_entries(id) on delete set null,
  idempotency_key text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create unique index if not exists mfg_material_documents_key on mfg_material_documents (tenant_id, idempotency_key) where idempotency_key is not null;
create index if not exists mfg_material_documents_ref on mfg_material_documents (tenant_id, reference_type, reference_id);

create table if not exists mfg_material_doc_lines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  doc_id      uuid not null references mfg_material_documents(id) on delete cascade,
  line_no     int not null,
  item_id     uuid not null references items(id) on delete cascade,
  location_id uuid not null references mfg_storage_locations(id) on delete cascade,
  batch_id    uuid references mfg_batches(id) on delete cascade,
  qty_change  numeric(18, 6) not null check (qty_change <> 0),     -- + into stock, − out of stock
  unit_cost   numeric(18, 6) not null,
  total_cost  numeric(18, 6) not null,                              -- qty_change × unit_cost
  po_line_id  uuid,                                                 -- the purchase-order line a receipt was against
  unique (doc_id, line_no)
);
create index if not exists mfg_material_doc_lines_item on mfg_material_doc_lines (tenant_id, item_id);
create index if not exists mfg_material_doc_lines_po on mfg_material_doc_lines (po_line_id) where po_line_id is not null;

-- Existing purchase-order lines carry only a description, so each Manufacturing line is linked to its item.
create table if not exists mfg_po_line_items (
  po_line_id uuid primary key references purchase_order_lines(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  item_id    uuid not null references items(id) on delete cascade
);

alter table mfg_batches enable row level security;
alter table mfg_stock enable row level security;
alter table mfg_material_documents enable row level security;
alter table mfg_material_doc_lines enable row level security;
alter table mfg_po_line_items enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_batches', 'mfg_stock', 'mfg_material_documents', 'mfg_material_doc_lines', 'mfg_po_line_items'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;
-- no insert / update / delete policy on any of them: only the functions in this file write stock

-- ---------- immutability (documents and their lines) ----------
create or replace function mfg_block_mutation()
returns trigger as $$
begin
  -- the teacher deleting a whole company is the one allowed exception (same rule as journal entries)
  if is_teacher() and nullif(current_setting('app.deleting_company', true), '') is not null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- a document may be linked to its journal entry once, right after it is posted
  if tg_op = 'UPDATE' and tg_table_name = 'mfg_material_documents' then
    if old.journal_entry_id is null and new.journal_entry_id is not null
       and (to_jsonb(new) - 'journal_entry_id') = (to_jsonb(old) - 'journal_entry_id') then
      return new;
    end if;
  end if;
  raise exception 'Stock documents can''t be edited or deleted once posted — post a reversal instead.';
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_no_edit_doc on mfg_material_documents;
create trigger trg_mfg_no_edit_doc before update or delete on mfg_material_documents
  for each row execute function mfg_block_mutation();
drop trigger if exists trg_mfg_no_edit_doc_line on mfg_material_doc_lines;
create trigger trg_mfg_no_edit_doc_line before update or delete on mfg_material_doc_lines
  for each row execute function mfg_block_mutation();

-- ---------- no negative stock unless the teacher allows it ----------
create or replace function mfg_stock_guard()
returns trigger as $$
declare
  v_item text; v_loc text;
begin
  if new.qty < 0 and not coalesce((select allow_negative_stock from mfg_company_settings where tenant_id = new.tenant_id), false) then
    select name into v_item from items where id = new.item_id;
    select name into v_loc from mfg_storage_locations where id = new.location_id;
    raise exception 'Not enough stock of "%" in %: that would leave % in stock. Receive more first, or ask your teacher to allow negative stock.',
      v_item, v_loc, round(new.qty, 4);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_stock_guard on mfg_stock;
create trigger trg_mfg_stock_guard before insert or update on mfg_stock
  for each row execute function mfg_stock_guard();

-- ---------- helpers ----------
create or replace function mfg__method(p_tenant uuid)
returns text as $$
  select costing_method from mfg_company_settings where tenant_id = p_tenant;
$$ language sql stable security definer set search_path = public;

create or replace function mfg__inv_key(p_item_type text)
returns text as $$
begin
  return case p_item_type
    when 'RAW' then 'RM_INVENTORY' when 'PACKAGING' then 'PACKAGING_INVENTORY'
    when 'SEMI' then 'FG_INVENTORY' when 'FINISHED' then 'FG_INVENTORY'
    else null end;
end;
$$ language plpgsql immutable;

-- The cost one unit of the item is carried at: its standard cost, or its moving average under actual costing.
create or replace function mfg__item_cost(p_tenant uuid, p_item uuid)
returns numeric as $$
declare
  v_cost numeric; v_name text; v_method text := mfg__method(p_tenant);
begin
  select case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end, i.name
    into v_cost, v_name from mfg_item_master m join items i on i.id = m.item_id where m.item_id = p_item and m.tenant_id = p_tenant;
  if v_name is null then raise exception 'That item was not found.'; end if;
  if coalesce(v_cost, 0) <= 0 then
    if v_method = 'STANDARD' then
      raise exception '"%" has no standard cost yet. Work out a cost estimate and release it first (Product costing).', v_name;
    end if;
    raise exception '"%" has no cost yet — it needs a receipt or an opening balance with a cost first.', v_name;
  end if;
  return v_cost;
end;
$$ language plpgsql stable security definer set search_path = public;

-- THE posting function. p_lines: [{"key":"RM_INVENTORY","debit":100}, {"account_id":"…","credit":100}, …].
create or replace function mfg__post_entry(p_tenant uuid, p_date date, p_memo text, p_source_table text, p_source_id uuid, p_lines jsonb)
returns uuid as $$
declare
  l jsonb; dr numeric; cr numeric; d numeric := 0; c numeric := 0; diff numeric; je uuid; n int := 0;
  recs jsonb := '[]'::jsonb; r jsonb;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    dr := round(coalesce((l->>'debit')::numeric, 0), 2);
    cr := round(coalesce((l->>'credit')::numeric, 0), 2);
    if dr < 0 or cr < 0 then raise exception 'A posting line can''t be negative.'; end if;
    if dr = 0 and cr = 0 then continue; end if;
    if dr <> 0 and cr <> 0 then raise exception 'A posting line is either a debit or a credit, not both.'; end if;
    recs := recs || jsonb_build_object('a', coalesce(nullif(l->>'account_id', '')::uuid, mfg_account(p_tenant, l->>'key')), 'd', dr, 'c', cr);
    d := d + dr; c := c + cr; n := n + 1;
  end loop;
  if n = 0 then return null; end if;                                   -- nothing to post
  diff := d - c;
  if diff <> 0 then
    if abs(diff) > 0.05 then raise exception 'This posting does not balance (debits and credits differ by %). Nothing was saved.', diff; end if;
    recs := recs || jsonb_build_object('a', mfg_account(p_tenant, 'ROUNDING'), 'd', greatest(-diff, 0), 'c', greatest(diff, 0));
  end if;
  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (p_tenant, p_date, p_memo, auth.uid(), p_source_table, p_source_id) returning id into je;
  for r in select * from jsonb_array_elements(recs) loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (je, (r->>'a')::uuid, (r->>'d')::numeric, (r->>'c')::numeric);
  end loop;
  return je;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg__batch(p_tenant uuid, p_item uuid, p_batch_no text, p_received date, p_expiry date)
returns uuid as $$
declare
  v_id uuid;
begin
  select id into v_id from mfg_batches where tenant_id = p_tenant and item_id = p_item and batch_no = p_batch_no;
  if v_id is null then
    insert into mfg_batches (tenant_id, item_id, batch_no, received_on, expiry_date) values (p_tenant, p_item, p_batch_no, p_received, p_expiry) returning id into v_id;
  end if;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg__doc(p_tenant uuid, p_type text, p_date date, p_ref_type text, p_ref_id uuid, p_memo text, p_key text)
returns uuid as $$
declare
  v_id uuid;
  v_prefix text := case p_type when 'GR' then 'GRN' when 'GI' then 'MI' when 'FGR' then 'FGR' when 'TRF' then 'TRF'
                               when 'ADJ' then 'ADJ' when 'DLV' then 'DLV' else 'REV' end;
begin
  insert into mfg_material_documents (tenant_id, document_number, doc_type, posting_date, reference_type, reference_id, memo, idempotency_key)
  values (p_tenant, next_doc_number(p_tenant, 'mat_' || p_type, v_prefix), p_type, p_date, p_ref_type, p_ref_id, p_memo, p_key)
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- One stock movement: the document line, the stock balance, and the Standard-side mirror (items.qty_on_hand).
create or replace function mfg__move(p_doc uuid, p_tenant uuid, p_line_no int, p_item uuid, p_loc uuid, p_batch uuid,
                                     p_qty numeric, p_unit_cost numeric, p_po_line uuid)
returns void as $$
begin
  insert into mfg_material_doc_lines (tenant_id, doc_id, line_no, item_id, location_id, batch_id, qty_change, unit_cost, total_cost, po_line_id)
  values (p_tenant, p_doc, p_line_no, p_item, p_loc, p_batch, p_qty, p_unit_cost, round(p_qty * p_unit_cost, 6), p_po_line);
  update mfg_stock set qty = qty + p_qty
   where tenant_id = p_tenant and item_id = p_item and location_id = p_loc and batch_id is not distinct from p_batch;
  if not found then
    insert into mfg_stock (tenant_id, item_id, location_id, batch_id, qty) values (p_tenant, p_item, p_loc, p_batch, p_qty);
  end if;
  update items set qty_on_hand = qty_on_hand + p_qty where id = p_item;
end;
$$ language plpgsql security definer set search_path = public;

-- Which lots to take p_qty from: earliest expiry first, then oldest first. A shortage is refused unless negative stock is allowed.
create or replace function mfg__pick(p_tenant uuid, p_item uuid, p_loc uuid, p_qty numeric)
returns table (batch_id uuid, qty numeric) as $$
declare
  rem numeric := p_qty; r record; take numeric; v_item text; v_loc text;
begin
  for r in select s.batch_id as bid, s.qty as q
             from mfg_stock s left join mfg_batches b on b.id = s.batch_id
            where s.tenant_id = p_tenant and s.item_id = p_item and s.location_id = p_loc and s.qty > 0
            order by b.expiry_date nulls last, b.received_on nulls last, s.id loop
    exit when rem <= 0;
    take := least(rem, r.q);
    batch_id := r.bid; qty := take; rem := rem - take;
    return next;
  end loop;
  if rem > 0 then
    if not coalesce((select allow_negative_stock from mfg_company_settings where tenant_id = p_tenant), false) then
      select name into v_item from items where id = p_item;
      select name into v_loc from mfg_storage_locations where id = p_loc;
      raise exception 'Not enough stock of "%" in %: you need % but only % is there. Receive more first, or ask your teacher to allow negative stock.',
        v_item, v_loc, p_qty, p_qty - rem;
    end if;
    batch_id := null; qty := rem;
    return next;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- purchase orders (reusing the existing PO tables) ----------
create or replace function mfg_create_po(p_vendor uuid, p_date date, p_expected date, p_lines jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_po uuid; ln jsonb; v_item uuid; v_name text; q numeric; price numeric; v_total numeric := 0; v_line uuid; n int := 0;
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
    select i.name into v_name from items i join mfg_item_master m on m.item_id = i.id
     where i.id = v_item and i.tenant_id = v_t and m.active and m.item_type <> 'SERVICE';
    if v_name is null then raise exception 'Line %: choose a stocked item from your company.', n; end if;
    if q <= 0 then raise exception 'Line %: the quantity of "%" must be above zero.', n, v_name; end if;
    if price < 0 then raise exception 'Line %: enter the price of "%".', n, v_name; end if;
    insert into purchase_order_lines (purchase_order_id, description, qty, unit_cost) values (v_po, v_name, q, price) returning id into v_line;
    insert into mfg_po_line_items (po_line_id, tenant_id, item_id) values (v_line, v_t, v_item);
    v_total := v_total + round(q * price, 2);
  end loop;
  update purchase_orders set total = v_total where id = v_po;
  return v_po;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_po(p_po uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
begin
  if not exists (select 1 from purchase_orders where id = p_po and tenant_id = v_t) then raise exception 'That purchase order was not found.'; end if;
  if exists (select 1 from mfg_material_doc_lines dl join purchase_order_lines l on l.id = dl.po_line_id where l.purchase_order_id = p_po) then
    raise exception 'Goods have been received against this purchase order, so it can''t be deleted.';
  end if;
  delete from purchase_orders where id = p_po;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- goods receipt ----------
-- p_lines: [{"po_line_id": …, "qty": 200, "location_id": …?, "batch_no": …?, "expiry": …?}]
create or replace function mfg_post_goods_receipt(p_po uuid, p_date date, p_lines jsonb, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  po record; v_doc uuid; v_gr uuid; v_je uuid; v_docno text;
  ln jsonb; pl record; v_item record; q numeric; remaining numeric; v_loc uuid; v_batch uuid; v_bno text;
  v_price numeric; v_unit numeric; v_inv numeric; v_po_amt numeric; v_ppv numeric := 0; v_total_po numeric := 0;
  v_keys jsonb := '{}'::jsonb; v_key text; v_n int := 0; v_oldqty numeric; v_avg numeric; v_lines jsonb := '[]'::jsonb; k text;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  select * into po from purchase_orders where id = p_po and tenant_id = v_t;
  if po.id is null then raise exception 'That purchase order was not found.'; end if;
  if po.status = 'closed' then raise exception 'That purchase order is already fully received.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Enter the quantity you received on at least one line.'; end if;

  insert into goods_receipts (tenant_id, purchase_order_id, receipt_date, notes) values (v_t, p_po, coalesce(p_date, current_date), 'Manufacturing goods receipt') returning id into v_gr;
  v_doc := mfg__doc(v_t, 'GR', coalesce(p_date, current_date), 'goods_receipts', v_gr, 'Goods receipt for PO ' || coalesce(po.document_number, ''), p_key);
  select document_number into v_docno from mfg_material_documents where id = v_doc;

  for ln in select * from jsonb_array_elements(p_lines) loop
    q := coalesce(nullif(ln->>'qty', '')::numeric, 0);
    if q = 0 then continue; end if;
    if q < 0 then raise exception 'A received quantity can''t be negative.'; end if;
    select l.*, li.item_id into pl from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id
     where l.id = nullif(ln->>'po_line_id', '')::uuid and l.purchase_order_id = p_po;
    if pl.id is null then raise exception 'One of the lines is not on this purchase order.'; end if;
    select coalesce(sum(qty_change), 0) into remaining from mfg_material_doc_lines where po_line_id = pl.id;
    remaining := pl.qty - remaining;
    if q > remaining + 0.000001 then
      raise exception '"%": you ordered % and have already received %, so only % more can be received.', pl.description, pl.qty, pl.qty - remaining, remaining;
    end if;
    select i.name, m.item_type, m.default_location_id, m.batch_tracked, m.standard_cost into v_item
      from items i join mfg_item_master m on m.item_id = i.id where i.id = pl.item_id;
    v_key := mfg__inv_key(v_item.item_type);
    if v_key is null then raise exception '"%" is a service, so it has no stock to receive.', v_item.name; end if;

    v_loc := coalesce(nullif(ln->>'location_id', '')::uuid, v_item.default_location_id,
                      (select id from mfg_storage_locations where tenant_id = v_t and code = 'RM-STORE'));
    if not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t and kind <> 'WIP') then
      raise exception '"%": choose a storage location (not the shop floor).', v_item.name;
    end if;
    if v_item.batch_tracked then
      v_bno := coalesce(nullif(trim(ln->>'batch_no'), ''), v_docno);
      v_batch := mfg__batch(v_t, pl.item_id, v_bno, coalesce(p_date, current_date), nullif(ln->>'expiry', '')::date);
    else
      v_batch := null;
    end if;

    v_price := pl.unit_cost;
    v_po_amt := round(q * v_price, 2);
    if v_method = 'STANDARD' then
      v_unit := mfg__item_cost(v_t, pl.item_id);
      v_inv := round(q * v_unit, 2);
      v_ppv := v_ppv + (v_po_amt - v_inv);
    else
      select coalesce(sum(qty), 0) into v_oldqty from mfg_stock where tenant_id = v_t and item_id = pl.item_id;
      select moving_avg_cost into v_avg from mfg_item_master where item_id = pl.item_id;
      v_unit := v_price;
      v_inv := v_po_amt;
      v_avg := mfg_moving_average(v_oldqty, v_avg, q, v_price);
      update mfg_item_master set moving_avg_cost = v_avg where item_id = pl.item_id;
      update items set unit_cost = v_avg where id = pl.item_id;
    end if;
    v_n := v_n + 1;
    perform mfg__move(v_doc, v_t, v_n, pl.item_id, v_loc, v_batch, q, v_unit, pl.id);
    v_keys := jsonb_set(v_keys, array[v_key], to_jsonb(coalesce((v_keys->>v_key)::numeric, 0) + v_inv));
    v_total_po := v_total_po + v_po_amt;
    insert into goods_receipt_lines (goods_receipt_id, description, qty_received) values (v_gr, pl.description, q);
  end loop;
  if v_n = 0 then raise exception 'Enter the quantity you received on at least one line.'; end if;

  for k in select jsonb_object_keys(v_keys) loop
    v_lines := v_lines || jsonb_build_object('key', k, 'debit', (v_keys->>k)::numeric);
  end loop;
  if v_ppv > 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'debit', v_ppv);
  elsif v_ppv < 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'credit', -v_ppv); end if;
  v_lines := v_lines || jsonb_build_object('key', 'GR_IR', 'credit', v_total_po);
  v_je := mfg__post_entry(v_t, coalesce(p_date, current_date), 'Goods receipt ' || v_docno || ' (PO ' || coalesce(po.document_number, '') || ')', 'mfg_material_documents', v_doc, v_lines);
  update mfg_material_documents set journal_entry_id = v_je where id = v_doc;

  if not exists (select 1 from purchase_order_lines l
                  where l.purchase_order_id = p_po
                    and l.qty - coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = l.id), 0) > 0.000001) then
    update purchase_orders set status = 'closed' where id = p_po;
  end if;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- opening balances and stock-count differences ----------
create or replace function mfg_post_stock_adjustment(p_item uuid, p_location uuid, p_qty_change numeric, p_unit_cost numeric,
                                                     p_reason text, p_date date, p_batch_no text default null, p_expiry date default null, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  v_doc uuid; v_je uuid; v_item record; v_key text; v_off text; v_unit numeric; v_amt numeric; v_batch uuid; v_n int := 0;
  v_oldqty numeric; v_avg numeric; p record;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  if p_reason not in ('OPENING', 'COUNT') then raise exception 'Choose opening balance or stock count.'; end if;
  if p_qty_change is null or p_qty_change = 0 then raise exception 'Enter how much the stock changes by.'; end if;
  if p_reason = 'OPENING' and p_qty_change < 0 then raise exception 'An opening balance adds stock. Use a stock count to take stock away.'; end if;
  select i.name, m.item_type, m.batch_tracked, m.moving_avg_cost into v_item from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item and i.tenant_id = v_t;
  if v_item.name is null then raise exception 'That item was not found.'; end if;
  v_key := mfg__inv_key(v_item.item_type);
  if v_key is null then raise exception '"%" is a service, so it has no stock.', v_item.name; end if;
  if not exists (select 1 from mfg_storage_locations where id = p_location and tenant_id = v_t) then raise exception 'Choose a storage location.'; end if;
  v_off := case p_reason when 'OPENING' then 'OPENING_EQUITY' else 'INVENTORY_DIFF' end;

  v_doc := mfg__doc(v_t, 'ADJ', coalesce(p_date, current_date), null, null,
                    case p_reason when 'OPENING' then 'Opening balance' else 'Stock count difference' end, p_key);
  if p_qty_change > 0 then
    if v_method = 'STANDARD' then
      v_unit := mfg__item_cost(v_t, p_item);
    elsif p_reason = 'OPENING' then
      if coalesce(p_unit_cost, 0) <= 0 then raise exception 'Enter the cost of one unit for the opening balance.'; end if;
      v_unit := p_unit_cost;
    else
      v_unit := mfg__item_cost(v_t, p_item);
    end if;
    if v_item.batch_tracked then
      v_batch := mfg__batch(v_t, p_item, coalesce(nullif(trim(p_batch_no), ''), (select document_number from mfg_material_documents where id = v_doc)), coalesce(p_date, current_date), p_expiry);
    end if;
    if v_method = 'ACTUAL' and p_reason = 'OPENING' then
      select coalesce(sum(qty), 0) into v_oldqty from mfg_stock where tenant_id = v_t and item_id = p_item;
      v_avg := mfg_moving_average(v_oldqty, v_item.moving_avg_cost, p_qty_change, v_unit);
      update mfg_item_master set moving_avg_cost = v_avg where item_id = p_item;
      update items set unit_cost = v_avg where id = p_item;
    end if;
    perform mfg__move(v_doc, v_t, 1, p_item, p_location, v_batch, p_qty_change, v_unit, null);
    v_amt := round(p_qty_change * v_unit, 2);
    v_je := mfg__post_entry(v_t, coalesce(p_date, current_date), 'Stock adjustment', 'mfg_material_documents', v_doc,
      jsonb_build_array(jsonb_build_object('key', v_key, 'debit', v_amt), jsonb_build_object('key', v_off, 'credit', v_amt)));
  else
    v_unit := mfg__item_cost(v_t, p_item);
    for p in select * from mfg__pick(v_t, p_item, p_location, -p_qty_change) loop
      v_n := v_n + 1;
      perform mfg__move(v_doc, v_t, v_n, p_item, p_location, p.batch_id, -p.qty, v_unit, null);
    end loop;
    v_amt := round(-p_qty_change * v_unit, 2);
    v_je := mfg__post_entry(v_t, coalesce(p_date, current_date), 'Stock adjustment', 'mfg_material_documents', v_doc,
      jsonb_build_array(jsonb_build_object('key', v_off, 'debit', v_amt), jsonb_build_object('key', v_key, 'credit', v_amt)));
  end if;
  update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- Moving stock between two locations changes no account, so it posts no journal entry.
create or replace function mfg_transfer_stock(p_item uuid, p_from uuid, p_to uuid, p_qty numeric, p_date date, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_doc uuid; v_unit numeric; v_n int := 0; p record;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  if p_from = p_to then raise exception 'Choose two different locations.'; end if;
  if not exists (select 1 from mfg_item_master where item_id = p_item and tenant_id = v_t) then raise exception 'That item was not found.'; end if;
  if not exists (select 1 from mfg_storage_locations where id = p_from and tenant_id = v_t) or not exists (select 1 from mfg_storage_locations where id = p_to and tenant_id = v_t) then
    raise exception 'Choose storage locations from your company.';
  end if;
  v_unit := mfg__item_cost(v_t, p_item);
  v_doc := mfg__doc(v_t, 'TRF', coalesce(p_date, current_date), null, null, 'Stock transfer', p_key);
  for p in select * from mfg__pick(v_t, p_item, p_from, p_qty) loop
    v_n := v_n + 1;
    perform mfg__move(v_doc, v_t, v_n, p_item, p_from, p.batch_id, -p.qty, v_unit, null);
    v_n := v_n + 1;
    perform mfg__move(v_doc, v_t, v_n, p_item, p_to, p.batch_id, p.qty, v_unit, null);
  end loop;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_block_mutation() from public, anon, authenticated;
revoke execute on function mfg_stock_guard() from public, anon, authenticated;
revoke execute on function mfg__method(uuid) from public, anon;
revoke execute on function mfg__inv_key(text) from public, anon;
revoke execute on function mfg__item_cost(uuid, uuid) from public, anon, authenticated;
revoke execute on function mfg__post_entry(uuid, date, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function mfg__batch(uuid, uuid, text, date, date) from public, anon, authenticated;
revoke execute on function mfg__doc(uuid, text, date, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function mfg__move(uuid, uuid, int, uuid, uuid, uuid, numeric, numeric, uuid) from public, anon, authenticated;
revoke execute on function mfg__pick(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function mfg_create_po(uuid, date, date, jsonb) from public, anon;
revoke execute on function mfg_delete_po(uuid) from public, anon;
revoke execute on function mfg_post_goods_receipt(uuid, date, jsonb, text) from public, anon;
revoke execute on function mfg_post_stock_adjustment(uuid, uuid, numeric, numeric, text, date, text, date, text) from public, anon;
revoke execute on function mfg_transfer_stock(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function mfg_create_po(uuid, date, date, jsonb) to authenticated;
grant execute on function mfg_delete_po(uuid) to authenticated;
grant execute on function mfg_post_goods_receipt(uuid, date, jsonb, text) to authenticated;
grant execute on function mfg_post_stock_adjustment(uuid, uuid, numeric, numeric, text, date, text, date, text) to authenticated;
grant execute on function mfg_transfer_stock(uuid, uuid, uuid, numeric, date, text) to authenticated;
