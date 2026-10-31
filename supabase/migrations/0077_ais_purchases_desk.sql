-- ============================================================
-- Classroom ERP — migration 0077 (AIS edition: the Purchases desk, the expenditure-cycle workbench; plus one Sales desk fix)
--
-- Needs 0076. Adds new tables and functions; replaces ais_wb_enter_order (below).
--
-- FIX to the Sales desk: ais_wb_enter_order accepted any quantity and price, so a student could type the list price on a card whose purchase order shows a
-- lower one and the price trap would never fire. The quantity and price must now agree to the purchase order on the card.
--
-- THE PURCHASES DESK. Nine vendor cards (seven purchase packets, two payment authorizations). Per purchase packet the student:
--   1 records the receipt of goods from the receiving report   (Dr Inventory, Cr GR/IR clearing 2050; stock goes up)
--   2 enters the vendor invoice exactly as it reads
--   3 runs the THREE-WAY MATCH: purchase order vs receiving report vs invoice, and the vendor against the approved list
--   4 approves or rejects what the match holds                 (whoever entered the invoice cannot approve it unless the company allows solo work)
--   5 posts the invoice to payables                            (Dr GR/IR for what was received, Dr Input VAT, Dr/Cr price variance 5900, Cr Accounts Payable 2000)
--   then pays the vendor from a payment card                   (Dr Accounts Payable, Cr Cash)
-- Hidden in the cards: a price above the purchase order, a short delivery billed in full, an invoice with no receiving report, an unapproved vendor with
-- no purchase order, and the same vendor invoice sent twice. A held invoice that the student approves for themselves is planted for the Audit seat.
-- Answers are in ais_pw_task_keys (no policy). ROLLBACK: drop the ais_pw_* tables and functions; re-create ais_wb_enter_order from 0076.
-- ============================================================

create table if not exists ais_pw_vendors (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, approved boolean not null default true
);
create index if not exists ais_pw_vendors_tenant on ais_pw_vendors (tenant_id);

create table if not exists ais_pw_tasks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  seq int not null, kind text not null check (kind in ('PURCHASE', 'PAYMENT')),
  vendor_id uuid not null references ais_pw_vendors(id) on delete cascade, item_id uuid references ais_wb_items(id) on delete cascade,
  ref_no text not null,                                                 -- the PO number (or the payment voucher number)
  po_qty numeric(14,2), po_price numeric(14,2),
  rr_no text, rr_qty numeric(14,2), rr_date date,                       -- the receiving report on the card (null = none attached)
  inv_no text, inv_qty numeric(14,2), inv_price numeric(14,2), doc_date date not null,
  amount numeric(14,2), note text,
  status text not null default 'NEW' check (status in ('NEW', 'RECEIVED', 'INVOICED', 'REJECTED', 'DONE')),
  unique (tenant_id, seq)
);

create table if not exists ais_pw_task_keys (task_id uuid primary key references ais_pw_tasks(id) on delete cascade, trap text, why text not null);

create table if not exists ais_pw_receipts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  task_id uuid not null references ais_pw_tasks(id) on delete cascade, qty numeric(14,2) not null check (qty > 0), entered_by uuid not null, entry_id uuid
);
create index if not exists ais_pw_receipts_tenant on ais_pw_receipts (tenant_id);

create table if not exists ais_pw_bills (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade, seq int not null,
  task_id uuid not null references ais_pw_tasks(id) on delete cascade, vendor_id uuid not null references ais_pw_vendors(id) on delete cascade,
  item_id uuid not null references ais_wb_items(id) on delete cascade,
  inv_no text not null, inv_qty numeric(14,2) not null, inv_price numeric(14,2) not null, net numeric(14,2) not null, vat numeric(14,2) not null, gross numeric(14,2) not null,
  inv_date date not null, po_qty numeric(14,2), po_price numeric(14,2), rec_qty numeric(14,2),
  status text not null default 'ENTERED' check (status in ('ENTERED', 'MATCH_OK', 'HELD', 'APPROVED', 'REJECTED', 'POSTED')),
  vendor_flag boolean not null default false, po_flag boolean not null default false, rr_flag boolean not null default false,
  price_flag boolean not null default false, qty_flag boolean not null default false, hold_reason text,
  entered_by uuid not null, approved_by uuid, self_approved boolean not null default false, decision_note text,
  post_date date, entry_id uuid, paid numeric(14,2) not null default 0
);
create index if not exists ais_pw_bills_tenant on ais_pw_bills (tenant_id);

alter table ais_pw_vendors enable row level security; alter table ais_pw_tasks enable row level security; alter table ais_pw_task_keys enable row level security;
alter table ais_pw_receipts enable row level security; alter table ais_pw_bills enable row level security;

-- ---------- Sales desk fix: agree the order to the purchase order on the card ----------
create or replace function ais_wb_enter_order(p_task uuid, p_customer uuid, p_item uuid, p_qty numeric, p_price numeric)
returns uuid as $$
declare
  c record; x ais_wb_tasks%rowtype; it ais_wb_items%rowtype; n numeric; v numeric; seqn int; oid uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_wb_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'ORDER' then raise exception 'This card is a remittance, not a purchase order. Use "Record the cash".'; end if;
  if x.status <> 'NEW' then raise exception 'This card has already been worked.'; end if;
  if p_customer is distinct from x.customer_id then raise exception 'The customer must be the one named on the purchase order.'; end if;
  if p_item is distinct from x.item_id then raise exception 'The item must be the one named on the purchase order.'; end if;
  select * into it from ais_wb_items where id = p_item and tenant_id = c.tenant;
  if not found then raise exception 'Choose an item from the price list.'; end if;
  if p_qty is distinct from x.qty then raise exception 'The purchase order shows % units. Enter the quantity as written on it.', x.qty; end if;
  if p_price is distinct from x.po_price then raise exception 'The purchase order shows a unit price of %. Enter the price as written on it; the system compares it to the price list.', to_char(x.po_price, 'FM999,999,990.00'); end if;
  n := round(p_qty * p_price, 2); v := round(n * 0.12, 2);
  select coalesce(max(seq), 0) + 1 into seqn from ais_wb_orders where tenant_id = c.tenant;
  insert into ais_wb_orders (tenant_id, seq, task_id, customer_id, item_id, qty, unit_price, net, vat, gross, cogs, order_date, entered_by, price_flag)
  values (c.tenant, seqn, x.id, x.customer_id, it.id, p_qty, p_price, n, v, n + v, round(p_qty * it.unit_cost, 2), x.doc_date, auth.uid(), p_price <> it.list_price)
  returning id into oid;
  update ais_wb_tasks set status = 'ORDERED' where id = x.id;
  return oid;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the company's vendors and the vendor cards (made once, the first time the desk is opened) ----------
create or replace function ais__pw_seed(p_tenant uuid, p_date0 date)
returns void as $$
declare
  v_ne uuid; v_tg uuid; v_mi uuid; v_gh uuid; i_prem uuid; i_reg uuid; i_brown uuid; t uuid;
begin
  if exists (select 1 from ais_pw_vendors where tenant_id = p_tenant) then return; end if;
  perform ais__wb_seed(p_tenant, p_date0);
  select id into i_prem from ais_wb_items where tenant_id = p_tenant and sku = 'RICE-P50';
  select id into i_reg from ais_wb_items where tenant_id = p_tenant and sku = 'RICE-R50';
  select id into i_brown from ais_wb_items where tenant_id = p_tenant and sku = 'RICE-B50';
  insert into ais_pw_vendors (tenant_id, name) values (p_tenant, 'Nueva Ecija Rice Mill') returning id into v_ne;
  insert into ais_pw_vendors (tenant_id, name) values (p_tenant, 'Tarlac Grain Co.') returning id into v_tg;
  insert into ais_pw_vendors (tenant_id, name) values (p_tenant, 'Mindoro Farm Coop') returning id into v_mi;
  insert into ais_pw_vendors (tenant_id, name, approved) values (p_tenant, 'Golden Harvest Trading', false) returning id into v_gh;

  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 1, 'PURCHASE', v_ne, i_prem, 'PO-A101', 200, 1640, 'RR-3301', 200, p_date0 + 3, 'V-5521', 200, 1640, p_date0 + 4, 'Regular supplier. The purchase order, receiving report and invoice agree.') returning id into t;
  insert into ais_pw_task_keys values (t, null, 'All three documents agree on quantity and price, and the vendor is approved. Receive it, enter the invoice, run the match, and post it.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date)
    values (p_tenant, 2, 'PURCHASE', v_tg, i_reg, 'PO-A102', 300, 1480, 'RR-3302', 300, p_date0 + 5, 'V-2207', 300, 1480, p_date0 + 6) returning id into t;
  insert into ais_pw_task_keys values (t, null, 'All three documents agree. A clean purchase.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 3, 'PURCHASE', v_ne, i_brown, 'PO-A103', 100, 1840, 'RR-3303', 100, p_date0 + 7, 'V-5530', 100, 1980, p_date0 + 8, 'The invoice price is higher than the price on the purchase order.') returning id into t;
  insert into ais_pw_task_keys values (t, 'PRICE_MISMATCH', 'The vendor billed 1,980.00 a sack against the 1,840.00 agreed on the purchase order, so 14,000 would be overpaid. Pay the purchase order price: have the vendor correct the invoice, do not just accept it.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 4, 'PURCHASE', v_tg, i_reg, 'PO-A104', 150, 1480, 'RR-3304', 120, p_date0 + 9, 'V-2214', 150, 1480, p_date0 + 10, 'The receiving report counted fewer sacks than the invoice bills.') returning id into t;
  insert into ais_pw_task_keys values (t, 'QTY_MISMATCH', 'The warehouse received 120 sacks but the invoice bills 150. You pay only for what arrived: 30 sacks (44,400 before VAT) would be paid for goods that were never delivered.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 5, 'PURCHASE', v_mi, i_prem, 'PO-A105', 80, 1640, null, null, null, 'V-0091', 80, 1640, p_date0 + 11, 'There is a purchase order and an invoice, but the receiving report is not attached.') returning id into t;
  insert into ais_pw_task_keys values (t, 'NO_RECEIVING_REPORT', 'No receiving report means no proof the rice arrived. Without it the invoice must not be paid: ask the warehouse whether the goods were actually received.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 6, 'PURCHASE', v_gh, i_prem, '— none —', null, null, null, null, null, 'V-0310', 60, 1500, p_date0 + 12, 'A new supplier offers a low price. There is no purchase order and the supplier is not on the approved vendor list.') returning id into t;
  insert into ais_pw_task_keys values (t, 'UNAPPROVED_VENDOR', 'The vendor is not on the approved list and nobody issued a purchase order. This is how fictitious or kickback suppliers get paid. It needs vendor approval and a purchase order first.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, item_id, ref_no, po_qty, po_price, rr_no, rr_qty, rr_date, inv_no, inv_qty, inv_price, doc_date, note)
    values (p_tenant, 7, 'PURCHASE', v_ne, i_prem, 'PO-A101', 200, 1640, 'RR-3301', 200, p_date0 + 3, 'V-5521', 200, 1640, p_date0 + 13, 'A copy of the vendor invoice arrived again by email, marked "second notice".') returning id into t;
  insert into ais_pw_task_keys values (t, 'DUP_INVOICE', 'Invoice V-5521 and purchase order PO-A101 are the same as card 1: a duplicate. Posting it would pay the same 200 sacks twice. Reject it.');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, ref_no, doc_date, amount, note)
    values (p_tenant, 8, 'PAYMENT', v_ne, 'CHK-8801', p_date0 + 20, 367360.00, 'Payment voucher: pay Nueva Ecija Rice Mill invoice V-5521 in full.') returning id into t;
  insert into ais_pw_task_keys values (t, null, 'Pay invoice V-5521 from card 1 in full (367,360.00).');
  insert into ais_pw_tasks (tenant_id, seq, kind, vendor_id, ref_no, doc_date, amount, note)
    values (p_tenant, 9, 'PAYMENT', v_tg, 'CHK-8802', p_date0 + 21, 497280.00, 'Payment voucher: pay Tarlac Grain Co. invoice V-2207 in full.') returning id into t;
  insert into ais_pw_task_keys values (t, null, 'Pay invoice V-2207 from card 2 in full (497,280.00).');
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the whole desk in one read ----------
create or replace function ais_pw_state()
returns jsonb as $$
declare
  c record; t uuid; res jsonb;
begin
  select * into c from ais__wb_context(false);
  t := c.tenant;
  perform ais__pw_seed(t, date '2027-01-03');
  select jsonb_build_object(
    'phase', (select phase from ais_instances where id = c.inst), 'solo', c.solo,
    'vendors', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'approved', v.approved,
        'owed', (select coalesce(sum(b.gross - b.paid), 0) from ais_pw_bills b where b.vendor_id = v.id and b.status = 'POSTED')) order by v.name), '[]'::jsonb) from ais_pw_vendors v where v.tenant_id = t),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'vendor_id', x.vendor_id, 'vendor', v.name, 'vendor_approved', v.approved,
        'item_id', x.item_id, 'item', i.name, 'ref_no', x.ref_no, 'po_qty', x.po_qty, 'po_price', x.po_price, 'rr_no', x.rr_no, 'rr_qty', x.rr_qty, 'rr_date', x.rr_date,
        'inv_no', x.inv_no, 'inv_qty', x.inv_qty, 'inv_price', x.inv_price, 'doc_date', x.doc_date, 'amount', x.amount, 'note', x.note, 'status', x.status,
        'received', exists (select 1 from ais_pw_receipts r where r.task_id = x.id)) order by x.seq), '[]'::jsonb)
      from ais_pw_tasks x join ais_pw_vendors v on v.id = x.vendor_id left join ais_wb_items i on i.id = x.item_id where x.tenant_id = t),
    'bills', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'seq', b.seq, 'task_id', b.task_id, 'vendor_id', b.vendor_id, 'vendor', v.name, 'item', i.name, 'inv_no', b.inv_no,
        'inv_qty', b.inv_qty, 'inv_price', b.inv_price, 'net', b.net, 'vat', b.vat, 'gross', b.gross, 'inv_date', b.inv_date, 'po_qty', b.po_qty, 'po_price', b.po_price, 'rec_qty', b.rec_qty,
        'status', b.status, 'hold_reason', b.hold_reason, 'entered_by_me', b.entered_by = auth.uid(), 'self_approved', b.self_approved, 'decision_note', b.decision_note, 'paid', b.paid) order by b.seq), '[]'::jsonb)
      from ais_pw_bills b join ais_pw_vendors v on v.id = b.vendor_id join ais_wb_items i on i.id = b.item_id where b.tenant_id = t),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'on_hand', i.qty_on_hand) order by i.sku), '[]'::jsonb) from ais_wb_items i where i.tenant_id = t)
  ) into res;
  return res;
end;
$$ language plpgsql volatile security definer set search_path = public;

-- ---------- step 1: record the receipt of goods (from the receiving report on the card) ----------
create or replace function ais_pw_receive(p_task uuid, p_qty numeric)
returns uuid as $$
declare
  c record; x ais_pw_tasks%rowtype; v ais_pw_vendors%rowtype; it ais_wb_items%rowtype; e uuid; amt numeric; sd date;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pw_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'PURCHASE' then raise exception 'This card is a payment voucher, not a purchase.'; end if;
  if x.status <> 'NEW' then raise exception 'The goods on this card have already been received or it has moved on.'; end if;
  if x.rr_qty is null then raise exception 'No receiving report is attached to this card, so you cannot record a receipt of goods.'; end if;
  if p_qty is distinct from x.rr_qty then raise exception 'The receiving report shows % units. Record the quantity the warehouse actually counted.', x.rr_qty; end if;
  select * into v from ais_pw_vendors where id = x.vendor_id;
  select * into it from ais_wb_items where id = x.item_id for update;
  amt := round(x.rr_qty * x.po_price, 2);
  sd := ais__wb_next_weekday(x.rr_date);
  e := ais__post_entry_src(c.tenant, sd, 'Goods received ' || x.rr_no || ' (' || v.name || ', ' || x.rr_qty || ' x ' || it.sku || ')', 'ais_pw_receipts', x.id,
        jsonb_build_array(jsonb_build_object('acct', '1200', 'debit', amt, 'credit', 0), jsonb_build_object('acct', '2050', 'debit', 0, 'credit', amt)));
  update ais_wb_items set qty_on_hand = qty_on_hand + x.rr_qty where id = it.id;
  insert into ais_pw_receipts (tenant_id, task_id, qty, entered_by, entry_id) values (c.tenant, x.id, x.rr_qty, auth.uid(), e);
  update ais_pw_tasks set status = 'RECEIVED' where id = x.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 2: enter the vendor invoice exactly as it reads ----------
create or replace function ais_pw_enter_invoice(p_task uuid, p_inv_no text, p_qty numeric, p_price numeric)
returns uuid as $$
declare
  c record; x ais_pw_tasks%rowtype; n numeric; vt numeric; seqn int; bid uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pw_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'PURCHASE' then raise exception 'This card is a payment voucher, not a purchase.'; end if;
  if x.status not in ('NEW', 'RECEIVED') then raise exception 'The invoice on this card has already been entered.'; end if;
  if trim(coalesce(p_inv_no, '')) is distinct from x.inv_no then raise exception 'The vendor invoice number is %. Enter it as printed.', x.inv_no; end if;
  if p_qty is distinct from x.inv_qty then raise exception 'The vendor invoice bills % units. Enter the quantity as printed.', x.inv_qty; end if;
  if p_price is distinct from x.inv_price then raise exception 'The vendor invoice shows a unit price of %. Enter it as printed.', to_char(x.inv_price, 'FM999,999,990.00'); end if;
  n := round(p_qty * p_price, 2); vt := round(n * 0.12, 2);
  select coalesce(max(seq), 0) + 1 into seqn from ais_pw_bills where tenant_id = c.tenant;
  insert into ais_pw_bills (tenant_id, seq, task_id, vendor_id, item_id, inv_no, inv_qty, inv_price, net, vat, gross, inv_date, po_qty, po_price, entered_by)
  values (c.tenant, seqn, x.id, x.vendor_id, x.item_id, x.inv_no, p_qty, p_price, n, vt, n + vt, x.doc_date, x.po_qty, x.po_price, auth.uid()) returning id into bid;
  update ais_pw_tasks set status = 'INVOICED' where id = x.id;
  return bid;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 3: the three-way match ----------
create or replace function ais_pw_match(p_bill uuid)
returns jsonb as $$
declare
  c record; b ais_pw_bills%rowtype; v ais_pw_vendors%rowtype; x ais_pw_tasks%rowtype; rq numeric; why text[] := array[]::text[];
  vf boolean; pf boolean; rf boolean; prf boolean; qf boolean;
begin
  select * into c from ais__wb_context(true);
  select * into b from ais_pw_bills where id = p_bill and tenant_id = c.tenant;
  if not found then raise exception 'That invoice does not belong to your company.'; end if;
  if b.status <> 'ENTERED' then raise exception 'The match has already been run on this invoice.'; end if;
  select * into v from ais_pw_vendors where id = b.vendor_id;
  select * into x from ais_pw_tasks where id = b.task_id;
  select qty into rq from ais_pw_receipts where task_id = b.task_id;
  vf := not v.approved; pf := x.po_price is null; rf := rq is null;
  prf := not pf and b.inv_price <> b.po_price;
  qf := not rf and b.inv_qty > rq;
  if vf then why := array_append(why, 'The vendor is not on the approved vendor list'); end if;
  if pf then why := array_append(why, 'There is no purchase order'); end if;
  if rf then why := array_append(why, 'There is no receiving report on file'); end if;
  if prf then why := array_append(why, 'The invoice price ' || to_char(b.inv_price, 'FM999,999,990.00') || ' differs from the purchase order price ' || to_char(b.po_price, 'FM999,999,990.00')); end if;
  if qf then why := array_append(why, 'The invoice bills ' || b.inv_qty || ' units but only ' || rq || ' were received'); end if;
  update ais_pw_bills set rec_qty = rq, vendor_flag = vf, po_flag = pf, rr_flag = rf, price_flag = prf, qty_flag = qf,
         status = case when cardinality(why) = 0 then 'MATCH_OK' else 'HELD' end, hold_reason = nullif(array_to_string(why, '. '), '') where id = b.id;
  return jsonb_build_object('ok', cardinality(why) = 0, 'reason', nullif(array_to_string(why, '. '), ''), 'po_qty', b.po_qty, 'po_price', b.po_price, 'rec_qty', rq, 'inv_qty', b.inv_qty, 'inv_price', b.inv_price);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 4: approve or reject a held invoice ----------
create or replace function ais_pw_approve(p_bill uuid, p_reason text)
returns void as $$
declare
  c record; b ais_pw_bills%rowtype; own boolean;
begin
  select * into c from ais__wb_context(true);
  select * into b from ais_pw_bills where id = p_bill and tenant_id = c.tenant;
  if not found then raise exception 'That invoice does not belong to your company.'; end if;
  if b.status <> 'HELD' then raise exception 'Only an invoice held by the match needs approval.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the approval (at least ten characters).'; end if;
  own := b.entered_by = auth.uid();
  if own and not c.solo then raise exception 'You entered this invoice, so a different person must approve it (segregation of duties).'; end if;
  update ais_pw_bills set status = 'APPROVED', approved_by = auth.uid(), self_approved = own, decision_note = trim(p_reason) where id = b.id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_pw_reject(p_bill uuid, p_reason text)
returns void as $$
declare
  c record; b ais_pw_bills%rowtype;
begin
  select * into c from ais__wb_context(true);
  select * into b from ais_pw_bills where id = p_bill and tenant_id = c.tenant;
  if not found then raise exception 'That invoice does not belong to your company.'; end if;
  if b.status in ('POSTED', 'REJECTED') then raise exception 'This invoice can no longer be rejected.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the rejection (at least ten characters).'; end if;
  update ais_pw_bills set status = 'REJECTED', decision_note = trim(p_reason) where id = b.id;
  update ais_pw_tasks set status = 'REJECTED' where id = b.task_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 5: post the invoice to payables ----------
create or replace function ais_pw_post(p_bill uuid)
returns uuid as $$
declare
  c record; b ais_pw_bills%rowtype; v ais_pw_vendors%rowtype; k ais_pw_task_keys%rowtype; cleared numeric := 0; var numeric; lines jsonb := '[]'::jsonb; e uuid; sd date; ptype text; i uuid;
begin
  select * into c from ais__wb_context(true);
  select * into b from ais_pw_bills where id = p_bill and tenant_id = c.tenant;
  if not found then raise exception 'That invoice does not belong to your company.'; end if;
  if b.status = 'ENTERED' then raise exception 'Run the three-way match before posting.'; end if;
  if b.status = 'HELD' then raise exception 'The match held this invoice. It needs an approval before it can be posted.'; end if;
  if b.status not in ('MATCH_OK', 'APPROVED') then raise exception 'This invoice cannot be posted (it is %).', lower(b.status); end if;
  select * into v from ais_pw_vendors where id = b.vendor_id;
  sd := ais__wb_next_weekday(b.inv_date);
  if b.rec_qty is not null and b.po_price is not null then
    cleared := round(least(b.inv_qty, b.rec_qty) * b.po_price, 2);
    var := round(b.net - cleared, 2);
    lines := jsonb_build_array(jsonb_build_object('acct', '2050', 'debit', cleared, 'credit', 0), jsonb_build_object('acct', '1160', 'debit', b.vat, 'credit', 0));
    if var > 0 then lines := lines || jsonb_build_object('acct', '5900', 'debit', var, 'credit', 0);
    elsif var < 0 then lines := lines || jsonb_build_object('acct', '5900', 'debit', 0, 'credit', -var); end if;
  else
    lines := jsonb_build_array(jsonb_build_object('acct', '1200', 'debit', b.net, 'credit', 0), jsonb_build_object('acct', '1160', 'debit', b.vat, 'credit', 0));
  end if;
  lines := lines || jsonb_build_object('acct', '2000', 'debit', 0, 'credit', b.gross);
  e := ais__post_entry_src(c.tenant, sd, 'Vendor invoice ' || b.inv_no || ' — ' || v.name, 'ais_pw_bills', b.id, lines);
  update ais_pw_bills set status = 'POSTED', post_date = sd, entry_id = e where id = b.id;
  update ais_pw_tasks set status = 'DONE' where id = b.task_id;

  -- an exception released on the student's own approval, or the duplicate the system cannot see, is now something for the Audit seat to find
  select * into k from ais_pw_task_keys where task_id = b.task_id;
  ptype := case when b.self_approved and b.vendor_flag then 'UNAPPROVED_VENDOR'
                when b.self_approved and b.rr_flag then 'NO_RECEIVING_REPORT'
                when b.self_approved and b.qty_flag then 'QTY_MISMATCH'
                when b.self_approved and b.price_flag then 'PRICE_MISMATCH'
                when k.trap = 'DUP_INVOICE' then 'DUP_INVOICE' else null end;
  select id into i from ais_instances where tenant_id = c.tenant;
  if ptype is not null and i is not null then
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail)
    values (i, c.tenant, e, ptype, jsonb_build_object('source', 'purchases', 'invoice', b.inv_no, 'amount', b.gross, 'self_approved', b.self_approved));
  end if;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 6: pay the vendor ----------
create or replace function ais_pw_pay(p_task uuid, p_bill uuid, p_amount numeric)
returns uuid as $$
declare
  c record; x ais_pw_tasks%rowtype; b ais_pw_bills%rowtype; v ais_pw_vendors%rowtype; e uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pw_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'PAYMENT' then raise exception 'This card is a purchase, not a payment voucher.'; end if;
  if x.status <> 'NEW' then raise exception 'This payment voucher has already been recorded.'; end if;
  select * into b from ais_pw_bills where id = p_bill and tenant_id = c.tenant;
  if not found then raise exception 'Choose the invoice being paid.'; end if;
  if b.status <> 'POSTED' then raise exception 'That invoice has not been posted to payables, so there is nothing to pay.'; end if;
  if b.vendor_id <> x.vendor_id then raise exception 'That invoice belongs to a different vendor than the payment voucher.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount to pay.'; end if;
  if p_amount > b.gross - b.paid then raise exception 'Only % is owed on that invoice.', to_char(b.gross - b.paid, 'FM999,999,990.00'); end if;
  if p_amount <> x.amount then raise exception 'The payment voucher authorizes %. Enter that amount.', to_char(x.amount, 'FM999,999,990.00'); end if;
  select * into v from ais_pw_vendors where id = x.vendor_id;
  e := ais__post_entry_src(c.tenant, ais__wb_next_weekday(x.doc_date), 'Payment ' || x.ref_no || ' of invoice ' || b.inv_no || ' (' || v.name || ')', 'ais_pw_bills', x.id,
        jsonb_build_array(jsonb_build_object('acct', '2000', 'debit', p_amount, 'credit', 0), jsonb_build_object('acct', '1000', 'debit', 0, 'credit', p_amount)));
  update ais_pw_bills set paid = paid + p_amount where id = b.id;
  update ais_pw_tasks set status = 'DONE' where id = x.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the student's score for the desk (max 6 per card), shown by the same rule as the document inbox ----------
create or replace function ais_pw_my_score()
returns jsonb as $$
declare
  c record; pts numeric := 0; mx numeric := 0; rws jsonb := '[]'::jsonb; x record; b ais_pw_bills%rowtype; p numeric; msg text;
begin
  select * into c from ais__wb_context(false);
  if not ais__results_visible(c.inst) then return jsonb_build_object('visible', false); end if;
  for x in select t.*, k.trap, k.why from ais_pw_tasks t join ais_pw_task_keys k on k.task_id = t.id where t.tenant_id = c.tenant order by t.seq loop
    mx := mx + 6; p := 0; b := null;
    select * into b from ais_pw_bills where task_id = x.id;
    if x.kind = 'PAYMENT' then
      p := case when x.status = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Paid correctly.' else 'Not paid.' end;
    elsif x.trap is null then
      p := case when b.status = 'POSTED' then 6 else 0 end;
      msg := case when p = 6 then 'Received, matched and posted.' when b.status = 'REJECTED' then 'Rejected, but this was a valid purchase.' else 'Not completed.' end;
    else
      if b.id is null or b.status = 'REJECTED' then p := 6; msg := case when b.id is null then 'Not processed, so nothing was paid.' else 'Correct: you stopped it.' end;
      elsif b.status in ('POSTED', 'APPROVED') and not b.self_approved and b.approved_by is not null then p := 3; msg := 'Released with a second person''s approval. The control worked, but check that it should have been released.';
      elsif b.status in ('POSTED', 'APPROVED') then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; it was not released.'; end if;
    end if;
    pts := pts + p;
    rws := rws || jsonb_build_object('seq', x.seq, 'ref_no', coalesce(x.inv_no, x.ref_no), 'points', p, 'max', 6, 'message', msg, 'why', x.why);
  end loop;
  return jsonb_build_object('visible', true, 'points', pts, 'max', mx, 'rows', rws);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- privileges ----------
revoke execute on function ais__pw_seed(uuid, date) from public, anon, authenticated;
revoke execute on function ais_wb_enter_order(uuid, uuid, uuid, numeric, numeric), ais_pw_state(), ais_pw_receive(uuid, numeric), ais_pw_enter_invoice(uuid, text, numeric, numeric), ais_pw_match(uuid),
  ais_pw_approve(uuid, text), ais_pw_reject(uuid, text), ais_pw_post(uuid), ais_pw_pay(uuid, uuid, numeric), ais_pw_my_score() from public, anon;
grant execute on function ais_wb_enter_order(uuid, uuid, uuid, numeric, numeric), ais_pw_state(), ais_pw_receive(uuid, numeric), ais_pw_enter_invoice(uuid, text, numeric, numeric), ais_pw_match(uuid),
  ais_pw_approve(uuid, text), ais_pw_reject(uuid, text), ais_pw_post(uuid), ais_pw_pay(uuid, uuid, numeric), ais_pw_my_score() to authenticated;
