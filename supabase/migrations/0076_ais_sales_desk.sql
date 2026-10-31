-- ============================================================
-- Classroom ERP — migration 0076 (AIS edition: the Sales desk, a hands-on revenue-cycle workbench)
--
-- Needs 0066-0075. Adds new tables and functions only; nothing existing is altered.
--
-- The Accounting student PROCESSES transactions instead of only reviewing finished packets. A queue of nine customer cards (seven purchase orders, two
-- remittance advices) is worked through in order: enter the order, run the credit check against the customer's LIVE receivable balance, approve or reject
-- what the check holds, ship (which posts cost of sales and reduces stock), bill (receivable, sales, VAT), and record the cash received.
-- Every step posts its own journal entry through the same guarded door as the desk, so the ledger the Audit seat tests now holds real, source-linked
-- entries. An exception the student approves for themselves (no second person) is planted for the Audit seat to find.
--
--   Hard controls (the system refuses): ship before the credit check, ship a held order, ship more than is in stock, bill before shipping,
--     collect more than a customer owes.
--   Judgment (the student must catch it): the credit check holds an order over the limit or at a price that is not on the price list, but nothing stops a
--     student approving it; the duplicate purchase order is not flagged at all.
--   Segregation of duties: whoever entered an order cannot approve its exception unless the company allows solo work, and then it is a self-approval.
--
-- The answers live in ais_wb_task_keys, which has no policy: students never read it.
-- ROLLBACK: drop table if exists ais_wb_receipts, ais_wb_orders, ais_wb_task_keys, ais_wb_tasks, ais_wb_items, ais_wb_customers; and drop the ais_wb_* functions.
-- ============================================================

create table if not exists ais_wb_customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  credit_limit numeric(14,2) not null,
  terms_days   int not null default 30
);
create index if not exists ais_wb_customers_tenant on ais_wb_customers (tenant_id);

create table if not exists ais_wb_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  sku         text not null,
  name        text not null,
  list_price  numeric(14,2) not null,
  unit_cost   numeric(14,2) not null,
  qty_on_hand numeric(14,2) not null
);
create index if not exists ais_wb_items_tenant on ais_wb_items (tenant_id);

create table if not exists ais_wb_tasks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  seq         int not null,
  kind        text not null check (kind in ('ORDER', 'RECEIPT')),
  customer_id uuid not null references ais_wb_customers(id) on delete cascade,
  item_id     uuid references ais_wb_items(id) on delete cascade,
  ref_no      text not null,                                   -- the customer's PO number, or the remittance number
  doc_date    date not null,
  qty         numeric(14,2),
  po_price    numeric(14,2),
  amount      numeric(14,2),                                   -- receipts: the amount remitted
  note        text,
  status      text not null default 'NEW' check (status in ('NEW', 'ORDERED', 'REJECTED', 'DONE')),
  unique (tenant_id, seq)
);

create table if not exists ais_wb_task_keys (
  task_id uuid primary key references ais_wb_tasks(id) on delete cascade,
  trap    text,                                                -- null = a clean card; else the exception tag it hides
  why     text not null
);

create table if not exists ais_wb_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  seq           int not null,
  task_id       uuid references ais_wb_tasks(id) on delete cascade,
  customer_id   uuid not null references ais_wb_customers(id) on delete cascade,
  item_id       uuid not null references ais_wb_items(id) on delete cascade,
  qty           numeric(14,2) not null check (qty > 0),
  unit_price    numeric(14,2) not null check (unit_price > 0),
  net           numeric(14,2) not null,
  vat           numeric(14,2) not null,
  gross         numeric(14,2) not null,
  cogs          numeric(14,2) not null,
  order_date    date not null,
  status        text not null default 'ENTERED' check (status in ('ENTERED', 'CREDIT_OK', 'HELD', 'APPROVED', 'REJECTED', 'SHIPPED', 'BILLED')),
  price_flag    boolean not null default false,
  limit_flag    boolean not null default false,
  balance_seen  numeric(14,2),
  exposure_seen numeric(14,2),
  hold_reason   text,
  entered_by    uuid not null,
  approved_by   uuid,
  self_approved boolean not null default false,
  decision_note text,
  ship_date     date,
  bill_date     date,
  invoice_no    int,
  paid          numeric(14,2) not null default 0,
  ship_entry    uuid,
  bill_entry    uuid
);
create index if not exists ais_wb_orders_tenant on ais_wb_orders (tenant_id);

create table if not exists ais_wb_receipts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  task_id     uuid references ais_wb_tasks(id) on delete cascade,
  order_id    uuid not null references ais_wb_orders(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  received_on date not null,
  entered_by  uuid not null,
  entry_id    uuid
);
create index if not exists ais_wb_receipts_tenant on ais_wb_receipts (tenant_id);

-- Everything is read and written through the functions below (security definer). No policies, so no direct access.
alter table ais_wb_customers enable row level security;
alter table ais_wb_items enable row level security;
alter table ais_wb_tasks enable row level security;
alter table ais_wb_task_keys enable row level security;
alter table ais_wb_orders enable row level security;
alter table ais_wb_receipts enable row level security;

-- ---------- the company's customers, items and the card queue (made once, the first time the desk is opened) ----------
create or replace function ais__wb_seed(p_tenant uuid, p_date0 date)
returns void as $$
declare
  c_santos uuid; c_dal uuid; c_luc uuid; c_mang uuid; c_kab uuid;
  i_prem uuid; i_reg uuid; i_brown uuid; t uuid;
begin
  if exists (select 1 from ais_wb_customers where tenant_id = p_tenant) then return; end if;

  insert into ais_wb_customers (tenant_id, name, credit_limit) values (p_tenant, 'Santos Trading', 250000) returning id into c_santos;
  insert into ais_wb_customers (tenant_id, name, credit_limit) values (p_tenant, 'Dalisay Wholesale', 200000) returning id into c_dal;
  insert into ais_wb_customers (tenant_id, name, credit_limit) values (p_tenant, 'Lucena Rice Mart', 120000) returning id into c_luc;
  insert into ais_wb_customers (tenant_id, name, credit_limit) values (p_tenant, 'Mang Tomas Grocery', 60000) returning id into c_mang;
  insert into ais_wb_customers (tenant_id, name, credit_limit) values (p_tenant, 'Kabisig Sari-sari', 50000) returning id into c_kab;

  insert into ais_wb_items (tenant_id, sku, name, list_price, unit_cost, qty_on_hand) values (p_tenant, 'RICE-P50', 'Sinag Premium Rice, 50 kg sack', 2050, 1640, 400) returning id into i_prem;
  insert into ais_wb_items (tenant_id, sku, name, list_price, unit_cost, qty_on_hand) values (p_tenant, 'RICE-R50', 'Sinag Regular Rice, 50 kg sack', 1850, 1480, 600) returning id into i_reg;
  insert into ais_wb_items (tenant_id, sku, name, list_price, unit_cost, qty_on_hand) values (p_tenant, 'RICE-B50', 'Sinag Brown Rice, 50 kg sack', 2300, 1840, 120) returning id into i_brown;

  -- 1 clean
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price, note) values (p_tenant, 1, 'ORDER', c_santos, i_prem, 'PO-4410', p_date0 + 1, 40, 2050, 'Standing customer, pays in 30 days.') returning id into t;
  insert into ais_wb_task_keys values (t, null, 'A normal order inside the credit limit at the list price. Process it all the way to the bill.');
  -- 2 clean
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price) values (p_tenant, 2, 'ORDER', c_luc, i_reg, 'PO-1187', p_date0 + 2, 30, 1850) returning id into t;
  insert into ais_wb_task_keys values (t, null, 'A normal order inside the credit limit at the list price.');
  -- 3 over the limit
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price, note) values (p_tenant, 3, 'ORDER', c_mang, i_prem, 'PO-0932', p_date0 + 4, 50, 2050, 'The buyer phoned: "Please rush it, I will settle the credit with you later."') returning id into t;
  insert into ais_wb_task_keys values (t, 'CREDIT_LIMIT', 'The order is about 114,800 against a 60,000 credit limit. Only the credit manager, a different person, may release it. A rushed customer is not an authorization.');
  -- 4 price not on the list
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price, note) values (p_tenant, 4, 'ORDER', c_dal, i_brown, 'PO-7741', p_date0 + 5, 25, 2100, 'The PO shows 2,100.00 a sack. The approved price list says 2,300.00.') returning id into t;
  insert into ais_wb_task_keys values (t, 'PRICE_MISMATCH', 'The PO price is below the approved list price and no one authorized a discount. Billing at the lower price loses revenue; the price needs an authorized approval.');
  -- 5 clean, but it will use up most of this customer's limit
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price) values (p_tenant, 5, 'ORDER', c_kab, i_prem, 'PO-0215', p_date0 + 6, 20, 2050) returning id into t;
  insert into ais_wb_task_keys values (t, null, 'Inside the 50,000 limit on its own (45,920). Once billed and unpaid it uses most of the limit, which matters for the next card.');
  -- 6 passes alone, fails against the live balance
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price, note) values (p_tenant, 6, 'ORDER', c_kab, i_reg, 'PO-0219', p_date0 + 8, 10, 1850, 'Small order. On its own it is far below the limit.') returning id into t;
  insert into ais_wb_task_keys values (t, 'CREDIT_LIMIT', 'On its own the order (20,720) is small, but the customer still owes 45,920 from the earlier order, so the total passes the 50,000 limit. The check must use the live balance, not just this order.');
  -- 7 duplicate PO
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, item_id, ref_no, doc_date, qty, po_price, note) values (p_tenant, 7, 'ORDER', c_santos, i_prem, 'PO-4410', p_date0 + 9, 40, 2050, 'The customer faxed its purchase order again, as a reminder.') returning id into t;
  insert into ais_wb_task_keys values (t, 'DUP_INVOICE', 'The PO number is the same as card 1 (PO-4410): the same order sent twice. Processing it bills the customer twice for one delivery. Reject it as a duplicate.');
  -- 8 and 9 cash received
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, ref_no, doc_date, amount, note) values (p_tenant, 8, 'RECEIPT', c_santos, 'OR-5201', p_date0 + 16, 91840.00, 'Remittance advice: payment of the Santos Trading invoice in full.') returning id into t;
  insert into ais_wb_task_keys values (t, null, 'Apply the full payment to the Santos Trading invoice from card 1 (91,840.00).');
  insert into ais_wb_tasks (tenant_id, seq, kind, customer_id, ref_no, doc_date, amount, note) values (p_tenant, 9, 'RECEIPT', c_luc, 'OR-5202', p_date0 + 18, 30125.50, 'Remittance advice: partial payment on account.') returning id into t;
  insert into ais_wb_task_keys values (t, null, 'Apply the part payment (30,125.50) to the Lucena Rice Mart invoice from card 2; the rest stays on the customer''s balance.');
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- small helpers ----------
create or replace function ais__wb_context(p_mutating boolean)
returns table (tenant uuid, inst uuid, lock_date date, solo boolean) as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); i ais_instances%rowtype; s ais_company_settings%rowtype;
begin
  select * into i from ais_instances where ais_instances.tenant_id = t;
  if not found then raise exception 'No practice set has been assigned to this company yet. Your teacher will assign one.'; end if;
  if p_mutating and i.phase <> 'ACCOUNTING' then raise exception 'The Accounting phase is closed, so the Sales desk is read-only now.'; end if;
  select * into s from ais_company_settings where ais_company_settings.tenant_id = t;
  return query select t, i.id, i.lock_date, coalesce(s.allow_solo, false);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais__wb_next_weekday(d date)
returns date as $$
  select case extract(dow from d)::int when 6 then d + 2 when 0 then d + 1 else d end;
$$ language sql immutable set search_path = public;

-- ---------- the whole desk in one read ----------
create or replace function ais_wb_state()
returns jsonb as $$
declare
  c record; t uuid; inst uuid; as_of date; res jsonb;
begin
  select * into c from ais__wb_context(false);
  t := c.tenant; inst := c.inst;
  as_of := coalesce(c.lock_date, current_date);
  perform ais__wb_seed(t, date '2027-01-03');

  select jsonb_build_object(
    'phase', (select phase from ais_instances where id = inst), 'mode', (select mode from ais_instances where id = inst), 'as_of', as_of, 'solo', c.solo, 'me', auth.uid(),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'credit_limit', k.credit_limit,
        'balance', b.bal, 'committed', b.com, 'available', k.credit_limit - b.bal - b.com,
        'aging', jsonb_build_object('current', b.a0, 'd31', b.a31, 'd61', b.a61, 'd90', b.a90)) order by k.name), '[]'::jsonb)
      from ais_wb_customers k
      cross join lateral (
        select coalesce(sum(o.gross - o.paid) filter (where o.status = 'BILLED'), 0) as bal,
               coalesce(sum(o.gross) filter (where o.status = 'SHIPPED'), 0) as com,
               coalesce(sum(o.gross - o.paid) filter (where o.status = 'BILLED' and as_of - o.bill_date <= 30), 0) as a0,
               coalesce(sum(o.gross - o.paid) filter (where o.status = 'BILLED' and as_of - o.bill_date between 31 and 60), 0) as a31,
               coalesce(sum(o.gross - o.paid) filter (where o.status = 'BILLED' and as_of - o.bill_date between 61 and 90), 0) as a61,
               coalesce(sum(o.gross - o.paid) filter (where o.status = 'BILLED' and as_of - o.bill_date > 90), 0) as a90
          from ais_wb_orders o where o.customer_id = k.id) b
      where k.tenant_id = t),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'list_price', i.list_price, 'unit_cost', i.unit_cost, 'on_hand', i.qty_on_hand) order by i.sku), '[]'::jsonb)
      from ais_wb_items i where i.tenant_id = t),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'seq', x.seq, 'kind', x.kind, 'ref_no', x.ref_no, 'doc_date', x.doc_date, 'customer_id', x.customer_id, 'customer', k.name,
        'item_id', x.item_id, 'item', i.name, 'qty', x.qty, 'po_price', x.po_price, 'amount', x.amount, 'note', x.note, 'status', x.status) order by x.seq), '[]'::jsonb)
      from ais_wb_tasks x join ais_wb_customers k on k.id = x.customer_id left join ais_wb_items i on i.id = x.item_id where x.tenant_id = t),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'seq', o.seq, 'task_id', o.task_id, 'customer_id', o.customer_id, 'customer', k.name, 'item', i.name, 'qty', o.qty, 'unit_price', o.unit_price,
        'net', o.net, 'vat', o.vat, 'gross', o.gross, 'order_date', o.order_date, 'status', o.status, 'price_flag', o.price_flag, 'limit_flag', o.limit_flag,
        'balance_seen', o.balance_seen, 'exposure_seen', o.exposure_seen, 'hold_reason', o.hold_reason, 'entered_by_me', o.entered_by = auth.uid(),
        'self_approved', o.self_approved, 'decision_note', o.decision_note, 'ship_date', o.ship_date, 'bill_date', o.bill_date,
        'invoice_no', case when o.invoice_no is null then null else 'INV-' || o.invoice_no end, 'paid', o.paid) order by o.seq), '[]'::jsonb)
      from ais_wb_orders o join ais_wb_customers k on k.id = o.customer_id join ais_wb_items i on i.id = o.item_id where o.tenant_id = t),
    'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'received_on', r.received_on, 'amount', r.amount, 'customer', k.name,
        'invoice_no', 'INV-' || o.invoice_no) order by r.received_on, r.id), '[]'::jsonb)
      from ais_wb_receipts r join ais_wb_orders o on o.id = r.order_id join ais_wb_customers k on k.id = o.customer_id where r.tenant_id = t)
  ) into res;
  return res;
end;
$$ language plpgsql volatile security definer set search_path = public;

-- ---------- step 1: enter the order from the customer's purchase order ----------
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
  select * into it from ais_wb_items where id = p_item and tenant_id = c.tenant;
  if not found then raise exception 'Choose an item from the price list.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Enter the unit price shown on the purchase order.'; end if;

  n := round(p_qty * p_price, 2); v := round(n * 0.12, 2);
  select coalesce(max(seq), 0) + 1 into seqn from ais_wb_orders where tenant_id = c.tenant;
  insert into ais_wb_orders (tenant_id, seq, task_id, customer_id, item_id, qty, unit_price, net, vat, gross, cogs, order_date, entered_by, price_flag)
  values (c.tenant, seqn, x.id, x.customer_id, it.id, p_qty, p_price, n, v, n + v, round(p_qty * it.unit_cost, 2), x.doc_date, auth.uid(), p_price <> it.list_price)
  returning id into oid;
  update ais_wb_tasks set status = 'ORDERED' where id = x.id;
  return oid;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 2: the credit check, against the customer's live balance ----------
create or replace function ais_wb_credit_check(p_order uuid)
returns jsonb as $$
declare
  c record; o ais_wb_orders%rowtype; k ais_wb_customers%rowtype; bal numeric; com numeric; expo numeric; why text := '';
begin
  select * into c from ais__wb_context(true);
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'That order does not belong to your company.'; end if;
  if o.status <> 'ENTERED' then raise exception 'The credit check has already been run on this order.'; end if;
  select * into k from ais_wb_customers where id = o.customer_id;
  select coalesce(sum(gross - paid) filter (where status = 'BILLED'), 0), coalesce(sum(gross) filter (where status = 'SHIPPED'), 0)
    into bal, com from ais_wb_orders where customer_id = o.customer_id and id <> o.id;
  expo := bal + com + o.gross;
  if expo > k.credit_limit then why := 'Over the credit limit: ' || to_char(expo, 'FM999,999,990.00') || ' against ' || to_char(k.credit_limit, 'FM999,999,990.00'); end if;
  if o.price_flag then why := case when why = '' then '' else why || '. ' end || 'The unit price is not the approved list price'; end if;
  update ais_wb_orders set balance_seen = bal + com, exposure_seen = expo, limit_flag = expo > k.credit_limit,
         status = case when why = '' then 'CREDIT_OK' else 'HELD' end, hold_reason = nullif(why, '') where id = o.id;
  return jsonb_build_object('ok', why = '', 'balance', bal + com, 'exposure', expo, 'credit_limit', k.credit_limit, 'reason', nullif(why, ''));
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 3a: approve a held order (the credit manager's job) ----------
create or replace function ais_wb_approve(p_order uuid, p_reason text)
returns void as $$
declare
  c record; o ais_wb_orders%rowtype; own boolean;
begin
  select * into c from ais__wb_context(true);
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'That order does not belong to your company.'; end if;
  if o.status <> 'HELD' then raise exception 'Only an order held by the credit check needs approval.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the approval (at least ten characters).'; end if;
  own := o.entered_by = auth.uid();
  if own and not c.solo then raise exception 'You entered this order, so a different person must approve it (segregation of duties).'; end if;
  update ais_wb_orders set status = 'APPROVED', approved_by = auth.uid(), self_approved = own, decision_note = trim(p_reason) where id = o.id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 3b: reject an order ----------
create or replace function ais_wb_reject(p_order uuid, p_reason text)
returns void as $$
declare
  c record; o ais_wb_orders%rowtype;
begin
  select * into c from ais__wb_context(true);
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'That order does not belong to your company.'; end if;
  if o.status in ('SHIPPED', 'BILLED', 'REJECTED') then raise exception 'This order can no longer be rejected.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the rejection (at least ten characters).'; end if;
  update ais_wb_orders set status = 'REJECTED', decision_note = trim(p_reason) where id = o.id;
  update ais_wb_tasks set status = 'REJECTED' where id = o.task_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 4: ship (cost of sales out of inventory) ----------
create or replace function ais_wb_ship(p_order uuid)
returns uuid as $$
declare
  c record; o ais_wb_orders%rowtype; it ais_wb_items%rowtype; sd date; e uuid;
begin
  select * into c from ais__wb_context(true);
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'That order does not belong to your company.'; end if;
  if o.status = 'ENTERED' then raise exception 'Run the credit check before shipping.'; end if;
  if o.status = 'HELD' then raise exception 'The credit check held this order. It needs an approval before it can ship.'; end if;
  if o.status not in ('CREDIT_OK', 'APPROVED') then raise exception 'This order cannot be shipped (it is %).', lower(o.status); end if;
  select * into it from ais_wb_items where id = o.item_id for update;
  if it.qty_on_hand < o.qty then raise exception 'Only % in stock; this order needs %.', it.qty_on_hand, o.qty; end if;
  sd := ais__wb_next_weekday(o.order_date + 1);
  e := ais__post_entry_src(c.tenant, sd, 'Cost of sales, delivery of order SO-' || o.seq || ' (' || o.qty || ' x ' || it.sku || ')', 'ais_wb_orders', o.id,
        jsonb_build_array(jsonb_build_object('acct', '5000', 'debit', o.cogs, 'credit', 0), jsonb_build_object('acct', '1200', 'debit', 0, 'credit', o.cogs)));
  update ais_wb_items set qty_on_hand = qty_on_hand - o.qty where id = it.id;
  update ais_wb_orders set status = 'SHIPPED', ship_date = sd, ship_entry = e where id = o.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 5: bill (receivable, sales, VAT) ----------
create or replace function ais_wb_bill(p_order uuid)
returns uuid as $$
declare
  c record; o ais_wb_orders%rowtype; cu ais_wb_customers%rowtype; k ais_wb_task_keys%rowtype; no int; e uuid; ptype text; i uuid;
begin
  select * into c from ais__wb_context(true);
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'That order does not belong to your company.'; end if;
  if o.status <> 'SHIPPED' then raise exception 'You can only bill an order that has shipped. Billing before delivery would record revenue that has not been earned.'; end if;
  select * into cu from ais_wb_customers where id = o.customer_id;
  -- the next number in the sales invoice sequence, continuing from the ledger so the sequence has no gap
  select coalesce(max((substring(memo from 'INV-([0-9]+)'))::int), 9000) + 1 into no
    from journal_entries where tenant_id = c.tenant and memo like 'Sales invoice INV-%';
  e := ais__post_entry_src(c.tenant, o.ship_date, 'Sales invoice INV-' || no || ' — ' || cu.name, 'ais_wb_orders', o.id,
        jsonb_build_array(jsonb_build_object('acct', '1100', 'debit', o.gross, 'credit', 0), jsonb_build_object('acct', '4000', 'debit', 0, 'credit', o.net),
                          jsonb_build_object('acct', '2200', 'debit', 0, 'credit', o.vat)));
  update ais_wb_orders set status = 'BILLED', bill_date = o.ship_date, invoice_no = no, bill_entry = e where id = o.id;
  update ais_wb_tasks set status = 'DONE' where id = o.task_id;

  -- an exception that slipped through is now something the Audit seat can find:
  -- a limit or price exception the student approved for themselves, or a trap the system cannot see (the duplicate purchase order)
  select * into k from ais_wb_task_keys where task_id = o.task_id;
  ptype := case when o.self_approved and o.limit_flag then 'CREDIT_LIMIT'
                when o.self_approved and o.price_flag then 'PRICE_MISMATCH'
                when k.trap = 'DUP_INVOICE' then 'DUP_INVOICE'
                else null end;
  select id into i from ais_instances where tenant_id = c.tenant;
  if ptype is not null and i is not null then
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail)
    values (i, c.tenant, e, ptype, jsonb_build_object('source', 'workbench', 'order', o.seq, 'invoice', no, 'amount', o.gross, 'self_approved', o.self_approved));
  end if;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 6: record the cash received against one invoice ----------
create or replace function ais_wb_receive(p_task uuid, p_order uuid, p_amount numeric)
returns uuid as $$
declare
  c record; x ais_wb_tasks%rowtype; o ais_wb_orders%rowtype; cu ais_wb_customers%rowtype; e uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_wb_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'RECEIPT' then raise exception 'This card is a purchase order, not a remittance.'; end if;
  if x.status <> 'NEW' then raise exception 'This remittance has already been recorded.'; end if;
  select * into o from ais_wb_orders where id = p_order and tenant_id = c.tenant;
  if not found then raise exception 'Choose the invoice the customer is paying.'; end if;
  if o.status <> 'BILLED' then raise exception 'That order has not been billed yet, so there is no invoice to pay.'; end if;
  if o.customer_id <> x.customer_id then raise exception 'That invoice belongs to a different customer than the remittance.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount received.'; end if;
  if p_amount > o.gross - o.paid then raise exception 'The customer only owes % on that invoice.', to_char(o.gross - o.paid, 'FM999,999,990.00'); end if;
  if p_amount <> x.amount then raise exception 'The remittance advice shows %. Enter the amount actually received.', to_char(x.amount, 'FM999,999,990.00'); end if;
  select * into cu from ais_wb_customers where id = x.customer_id;
  e := ais__post_entry_src(c.tenant, x.doc_date, 'Cash receipt ' || x.ref_no || ' — ' || cu.name || ' (INV-' || o.invoice_no || ')', 'ais_wb_receipts', x.id,
        jsonb_build_array(jsonb_build_object('acct', '1000', 'debit', p_amount, 'credit', 0), jsonb_build_object('acct', '1100', 'debit', 0, 'credit', p_amount)));
  insert into ais_wb_receipts (tenant_id, task_id, order_id, amount, received_on, entered_by, entry_id) values (c.tenant, x.id, o.id, p_amount, x.doc_date, auth.uid(), e);
  update ais_wb_orders set paid = paid + p_amount where id = o.id;
  update ais_wb_tasks set status = 'DONE' where id = x.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the student's score for the desk (max 6 per card), shown by the same rule as the document inbox ----------
create or replace function ais_wb_my_score()
returns jsonb as $$
declare
  c record; pts numeric := 0; mx numeric := 0; rws jsonb := '[]'::jsonb; x record; o ais_wb_orders%rowtype; p numeric; msg text;
begin
  select * into c from ais__wb_context(false);
  if not ais__results_visible(c.inst) then return jsonb_build_object('visible', false); end if;
  for x in select t.*, k.trap, k.why from ais_wb_tasks t join ais_wb_task_keys k on k.task_id = t.id where t.tenant_id = c.tenant order by t.seq loop
    mx := mx + 6; p := 0;
    o := null;
    select * into o from ais_wb_orders where task_id = x.id;
    if x.kind = 'RECEIPT' then
      p := case when x.status = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded correctly.' else 'Not recorded.' end;
    elsif x.trap is null then
      p := case when o.status = 'BILLED' then 6 else 0 end;
      msg := case when p = 6 then 'Processed through to the bill.' when o.status = 'REJECTED' then 'Rejected, but this was a valid order.' else 'Not completed.' end;
    else
      if o.id is null or o.status = 'REJECTED' then p := 6; msg := case when o.id is null then 'Not processed, so it was not released.' else 'Correct: you stopped it.' end;
      elsif o.status in ('BILLED', 'SHIPPED') and not o.self_approved and o.approved_by is not null then p := 3; msg := 'Released with a second person''s approval. The control worked, but check that it should have been released.';
      elsif o.status in ('BILLED', 'SHIPPED') then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; it was not released.'; end if;
    end if;
    pts := pts + p;
    rws := rws || jsonb_build_object('seq', x.seq, 'ref_no', x.ref_no, 'points', p, 'max', 6, 'message', msg, 'why', x.why);
  end loop;
  return jsonb_build_object('visible', true, 'points', pts, 'max', mx, 'rows', rws);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- privileges ----------
revoke execute on function ais__wb_seed(uuid, date), ais__wb_context(boolean), ais__wb_next_weekday(date) from public, anon, authenticated;
revoke execute on function ais_wb_state(), ais_wb_enter_order(uuid, uuid, uuid, numeric, numeric), ais_wb_credit_check(uuid), ais_wb_approve(uuid, text), ais_wb_reject(uuid, text),
  ais_wb_ship(uuid), ais_wb_bill(uuid), ais_wb_receive(uuid, uuid, numeric), ais_wb_my_score() from public, anon;
grant execute on function ais_wb_state(), ais_wb_enter_order(uuid, uuid, uuid, numeric, numeric), ais_wb_credit_check(uuid), ais_wb_approve(uuid, text), ais_wb_reject(uuid, text),
  ais_wb_ship(uuid), ais_wb_bill(uuid), ais_wb_receive(uuid, uuid, numeric), ais_wb_my_score() to authenticated;
