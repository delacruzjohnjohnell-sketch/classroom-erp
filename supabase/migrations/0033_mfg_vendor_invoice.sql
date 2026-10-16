-- ============================================================
-- Classroom ERP — migration 0033 (Manufacturing ERP, Phase 4c: vendor invoice with three-way match, landed cost, accounts payable)
--
-- Needs 0023–0032. ADDITIVE ONLY: new tables and functions, one new column on a Manufacturing table
-- (mfg_company_settings.match_tolerance_pct), and one Manufacturing function redefined with the same signature
-- (mfg_reconciliation). No Standard table, function, policy or trigger is changed.
--
--   three-way match   the purchase order says what was ordered and at what price, the goods receipts say what arrived, and the
--                     vendor's invoice says what is being billed. mfg_post_vendor_invoice compares the three line by line against
--                     the company's tolerance (the teacher sets it, default 2 %). Inside tolerance the invoice is posted at once;
--                     outside it the invoice is HELD with the reason, and only the teacher can release it (or the student rejects it).
--   posting           Dr GR/IR (the receipt value, at the order price) · Dr/Cr Purchase Price Variance (invoice price less order
--                     price) · Dr Input VAT · Cr Accounts Payable. A row is also written to the existing bills table (status
--                     'received') so the existing record_bill_payment, payables aging and bank matching work unchanged. The Standard
--                     post_bill is NOT used: it would debit Raw Materials a second time.
--   landed cost       freight, customs and handling are spread over receipt lines by value, quantity, weight or volume.
--                     Standard costing: the allocation is a purchase price variance (stock stays at standard).
--                     Actual costing: it is added to the cost of the stock still on hand (moving average goes up).
--   void              mfg_void_vendor_invoice / mfg_void_landed_cost post the exact opposite entry (the Standard void_bill would be
--                     refused by the control-account guard) and are allowed only while nothing has been paid.
--
-- ROLLBACK (drops only what this file created; then re-run 0031 to restore mfg_reconciliation):
--   drop function if exists mfg_void_landed_cost(uuid, date, text), mfg_post_landed_cost(uuid, text, date, date, text, numeric, numeric, text, jsonb, text),
--     mfg_void_vendor_invoice(uuid, date, text), mfg_reject_held_invoice(uuid, text), mfg_approve_held_invoice(uuid),
--     mfg_post_vendor_invoice(uuid, text, date, date, numeric, jsonb, text), mfg__vi_post(uuid, uuid), mfg_po_match(uuid),
--     set_mfg_match_tolerance(uuid, numeric);
--   drop table if exists mfg_landed_cost_lines, mfg_landed_cost_vouchers, mfg_vendor_invoice_lines, mfg_vendor_invoices;
--   alter table mfg_company_settings drop column if exists match_tolerance_pct;
-- ============================================================

-- ---------- the tolerance ----------
alter table mfg_company_settings add column if not exists match_tolerance_pct numeric(6, 2) not null default 2
  check (match_tolerance_pct >= 0 and match_tolerance_pct <= 50);

-- ---------- tables ----------
create table if not exists mfg_vendor_invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- VI-0001
  vendor_id        uuid not null references vendors(id) on delete cascade,
  po_id            uuid not null references purchase_orders(id) on delete cascade,
  vendor_ref       text not null,                                   -- the number printed on the vendor's invoice
  invoice_date     date not null,
  due_date         date,
  status           text not null default 'HELD' check (status in ('HELD', 'POSTED', 'REJECTED', 'VOID')),
  tax_rate         numeric(7, 3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal         numeric(18, 2) not null default 0,
  tax_amount       numeric(18, 2) not null default 0,
  total            numeric(18, 2) not null default 0,
  tolerance_pct    numeric(6, 2) not null,                          -- the tolerance in force when it was entered
  hold_reason      text,
  note             text,                                            -- why it was rejected or voided
  bill_id          uuid references bills(id) on delete set null,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  approved_by      uuid,
  approved_at      timestamptz,
  idempotency_key  text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists mfg_vendor_invoices_idx on mfg_vendor_invoices (tenant_id, status);
create index if not exists mfg_vendor_invoices_po on mfg_vendor_invoices (po_id);
create unique index if not exists mfg_vendor_invoices_key on mfg_vendor_invoices (tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists mfg_vendor_invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  invoice_id   uuid not null references mfg_vendor_invoices(id) on delete cascade,
  line_no      int not null,
  po_line_id   uuid not null,
  item_id      uuid not null references items(id) on delete cascade,
  qty          numeric(18, 6) not null check (qty > 0),
  unit_price   numeric(18, 6) not null check (unit_price >= 0),
  amount       numeric(18, 2) not null,                             -- round(qty × unit_price, 2)
  po_price     numeric(18, 6) not null,                             -- the order price at the time
  received_qty numeric(18, 6) not null,                             -- received less already invoiced, at the time
  qty_var_pct  numeric(9, 2) not null default 0,                    -- billed above what is open to invoice
  price_var_pct numeric(9, 2) not null default 0,
  within_tolerance boolean not null,
  unique (invoice_id, line_no)
);

create table if not exists mfg_landed_cost_vouchers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- LC-0001
  vendor_id        uuid not null references vendors(id) on delete cascade,
  vendor_ref       text not null,
  description      text,
  voucher_date     date not null,
  due_date         date,
  basis            text not null check (basis in ('VALUE', 'QTY', 'WEIGHT', 'VOLUME')),
  amount           numeric(18, 2) not null check (amount > 0),      -- before VAT
  tax_rate         numeric(7, 3) not null default 0,
  tax_amount       numeric(18, 2) not null default 0,
  total            numeric(18, 2) not null,
  status           text not null default 'POSTED' check (status in ('POSTED', 'VOID')),
  note             text,
  bill_id          uuid references bills(id) on delete set null,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  idempotency_key  text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create unique index if not exists mfg_landed_cost_vouchers_key on mfg_landed_cost_vouchers (tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists mfg_landed_cost_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  voucher_id   uuid not null references mfg_landed_cost_vouchers(id) on delete cascade,
  line_no      int not null,
  doc_line_id  uuid not null,                                       -- the goods-receipt line it is spread over
  item_id      uuid not null references items(id) on delete cascade,
  weight       numeric(18, 6) not null default 0,
  volume       numeric(18, 6) not null default 0,
  base_value   numeric(18, 6) not null,                             -- the number the spread used
  alloc_amount numeric(18, 2) not null,
  capitalised  numeric(18, 2) not null default 0,                   -- the part added to stock cost (actual costing)
  unique (voucher_id, line_no)
);

alter table mfg_vendor_invoices enable row level security;
alter table mfg_vendor_invoice_lines enable row level security;
alter table mfg_landed_cost_vouchers enable row level security;
alter table mfg_landed_cost_lines enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_vendor_invoices', 'mfg_vendor_invoice_lines', 'mfg_landed_cost_vouchers', 'mfg_landed_cost_lines'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

drop trigger if exists trg_mfg_vi_number on mfg_vendor_invoices;
create trigger trg_mfg_vi_number before insert on mfg_vendor_invoices
  for each row execute function mfg_assign_number('vendor_invoice', 'VI');
drop trigger if exists trg_mfg_lc_number on mfg_landed_cost_vouchers;
create trigger trg_mfg_lc_number before insert on mfg_landed_cost_vouchers
  for each row execute function mfg_assign_number('landed_cost', 'LC');
drop trigger if exists trg_mfg_no_edit_vi_line on mfg_vendor_invoice_lines;
create trigger trg_mfg_no_edit_vi_line before update or delete on mfg_vendor_invoice_lines
  for each row execute function mfg_block_mutation();
drop trigger if exists trg_mfg_no_edit_lc_line on mfg_landed_cost_lines;
create trigger trg_mfg_no_edit_lc_line before update or delete on mfg_landed_cost_lines
  for each row execute function mfg_block_mutation();

-- ---------- the teacher's tolerance ----------
create or replace function set_mfg_match_tolerance(target_tenant uuid, pct numeric)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change this setting.'; end if;
  perform assert_mfg_tenant(target_tenant);
  if pct is null or pct < 0 or pct > 50 then raise exception 'The tolerance must be between 0 and 50 percent.'; end if;
  update mfg_company_settings set match_tolerance_pct = round(pct, 2) where tenant_id = target_tenant;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (target_tenant, 'match_tolerance_changed', jsonb_build_object('pct', round(pct, 2)), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- what is ordered, received and invoiced, line by line ----------
create or replace function mfg_po_match(p_po uuid)
returns table (po_line_id uuid, item_id uuid, description text, ordered numeric, received numeric, invoiced numeric, open_to_invoice numeric, po_price numeric) as $$
begin
  if not exists (select 1 from purchase_orders where id = p_po and (tenant_id = my_tenant_id() or is_teacher())) then
    raise exception 'That purchase order was not found.';
  end if;
  return query
  select l.id, li.item_id, l.description, l.qty,
         coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = l.id), 0),
         coalesce((select sum(vl.qty) from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id where vl.po_line_id = l.id and vi.status = 'POSTED'), 0),
         greatest(coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = l.id), 0)
                - coalesce((select sum(vl.qty) from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id where vl.po_line_id = l.id and vi.status = 'POSTED'), 0), 0),
         l.unit_cost
    from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id
   where l.purchase_order_id = p_po order by l.id;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- posting a stored invoice (used on entry and when the teacher releases a held one) ----------
create or replace function mfg__vi_post(p_inv uuid, p_approver uuid)
returns void as $$
declare
  i mfg_vendor_invoices; l record; v_ap uuid; v_vat uuid; v_clear numeric := 0; v_amt numeric := 0; v_ppv numeric; v_bill uuid; v_je uuid; v_lines jsonb;
begin
  select * into i from mfg_vendor_invoices where id = p_inv for update;
  select id into v_ap from accounts where tenant_id = i.tenant_id and code = '2000';
  select id into v_vat from accounts where tenant_id = i.tenant_id and code = '1160';
  if v_ap is null or v_vat is null then raise exception 'The chart of accounts needs Accounts Payable (2000) and Input VAT (1160).'; end if;
  for l in select * from mfg_vendor_invoice_lines where invoice_id = p_inv loop
    v_amt := v_amt + l.amount;
    v_clear := v_clear + round(l.qty * l.po_price, 2);
  end loop;
  v_ppv := v_amt - v_clear;

  insert into bills (tenant_id, vendor_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (i.tenant_id, i.vendor_id, i.invoice_date, i.due_date, i.total, i.tax_rate, i.tax_amount, 'received') returning id into v_bill;
  insert into bill_lines (bill_id, description, qty, unit_cost)
  select v_bill, 'Billed: ' || it.name || ' (' || i.vendor_ref || ')', vl.qty, vl.unit_price
    from mfg_vendor_invoice_lines vl join items it on it.id = vl.item_id where vl.invoice_id = p_inv order by vl.line_no;

  v_lines := jsonb_build_array(jsonb_build_object('key', 'GR_IR', 'debit', v_clear));
  if v_ppv > 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'debit', v_ppv);
  elsif v_ppv < 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'credit', -v_ppv); end if;
  if i.tax_amount > 0 then v_lines := v_lines || jsonb_build_object('account_id', v_vat, 'debit', i.tax_amount); end if;
  v_lines := v_lines || jsonb_build_object('account_id', v_ap, 'credit', i.total);
  v_je := mfg__post_entry(i.tenant_id, i.invoice_date, 'Vendor invoice ' || i.document_number || ' (' || i.vendor_ref || ')', 'bills', v_bill, v_lines);

  update mfg_vendor_invoices
     set status = 'POSTED', bill_id = v_bill, journal_entry_id = v_je, approved_by = p_approver,
         approved_at = case when p_approver is not null then now() end
   where id = p_inv;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- entering a vendor invoice: match, then post or hold ----------
create or replace function mfg_post_vendor_invoice(p_po uuid, p_vendor_ref text, p_date date, p_due date, p_tax_rate numeric, p_lines jsonb, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  po purchase_orders; tol numeric; ln jsonb; pl record; v_inv uuid; v_ref text := trim(coalesce(p_vendor_ref, ''));
  q numeric; price numeric; rec numeric; billed numeric; open_q numeric; qv numeric; pv numeric; line_ok boolean;
  v_n int := 0; v_sub numeric := 0; v_amt numeric; v_tax numeric; v_rate numeric := coalesce(p_tax_rate, 0); reasons text[] := '{}'; threshold numeric; v_total numeric;
  v_dup text; v_date date := coalesce(p_date, current_date); v_name text;
begin
  if p_key is not null then
    select id into v_inv from mfg_vendor_invoices where tenant_id = v_t and idempotency_key = p_key;
    if v_inv is not null then return v_inv; end if;
  end if;
  select * into po from purchase_orders where id = p_po and tenant_id = v_t;
  if po.id is null then raise exception 'That purchase order was not found.'; end if;
  if v_ref = '' then raise exception 'Enter the number printed on the vendor''s invoice.'; end if;
  if v_rate < 0 or v_rate > 100 then raise exception 'The VAT rate must be between 0 and 100 percent.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Enter the quantity and price billed on at least one line.'; end if;
  select document_number into v_dup from mfg_vendor_invoices
   where tenant_id = v_t and vendor_id = po.vendor_id and lower(vendor_ref) = lower(v_ref) and status in ('HELD', 'POSTED') limit 1;
  if v_dup is not null then raise exception 'This vendor has already billed invoice number "%" (%). The same invoice can''t be entered twice.', v_ref, v_dup; end if;
  select match_tolerance_pct into tol from mfg_company_settings where tenant_id = v_t;

  insert into mfg_vendor_invoices (tenant_id, vendor_id, po_id, vendor_ref, invoice_date, due_date, tax_rate, tolerance_pct, idempotency_key)
  values (v_t, po.vendor_id, p_po, v_ref, v_date, p_due, v_rate, coalesce(tol, 2), p_key) returning id into v_inv;

  for ln in select * from jsonb_array_elements(p_lines) loop
    q := coalesce(nullif(ln->>'qty', '')::numeric, 0);
    if q = 0 then continue; end if;
    if q < 0 then raise exception 'A billed quantity can''t be negative.'; end if;
    price := coalesce(nullif(ln->>'unit_price', '')::numeric, 0);
    if price < 0 then raise exception 'A billed price can''t be negative.'; end if;
    select l.*, li.item_id into pl from purchase_order_lines l join mfg_po_line_items li on li.po_line_id = l.id
     where l.id = nullif(ln->>'po_line_id', '')::uuid and l.purchase_order_id = p_po;
    if pl.id is null then raise exception 'One of the lines is not on this purchase order.'; end if;
    select name into v_name from items where id = pl.item_id;
    select coalesce(sum(qty_change), 0) into rec from mfg_material_doc_lines where po_line_id = pl.id;
    select coalesce(sum(vl.qty), 0) into billed from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id where vl.po_line_id = pl.id and vi.status = 'POSTED';
    open_q := greatest(rec - billed, 0);
    qv := case when open_q = 0 then case when q > 0 then 100 else 0 end else round((q - open_q) / open_q * 100, 2) end;
    pv := case when pl.unit_cost = 0 then case when price > 0 then 100 else 0 end else round((price - pl.unit_cost) / pl.unit_cost * 100, 2) end;
    line_ok := qv <= coalesce(tol, 2) and abs(pv) <= coalesce(tol, 2);
    if qv > coalesce(tol, 2) then
      reasons := reasons || format('%s: the invoice bills %s but only %s received and not yet invoiced (%s%% over, limit %s%%)', v_name, q, open_q, qv, coalesce(tol, 2));
    end if;
    if abs(pv) > coalesce(tol, 2) then
      reasons := reasons || format('%s: the invoice price %s differs from the order price %s by %s%% (limit %s%%)', v_name, price, pl.unit_cost, pv, coalesce(tol, 2));
    end if;
    v_n := v_n + 1;
    v_amt := round(q * price, 2);
    v_sub := v_sub + v_amt;
    insert into mfg_vendor_invoice_lines (tenant_id, invoice_id, line_no, po_line_id, item_id, qty, unit_price, amount, po_price, received_qty, qty_var_pct, price_var_pct, within_tolerance)
    values (v_t, v_inv, v_n, pl.id, pl.item_id, q, price, v_amt, pl.unit_cost, open_q, qv, pv, line_ok);
  end loop;
  if v_n = 0 then raise exception 'Enter the quantity and price billed on at least one line.'; end if;

  v_tax := round(v_sub * v_rate / 100, 2);
  v_total := v_sub + v_tax;
  select approval_threshold into threshold from tenants where id = v_t;
  if threshold is not null and v_total > threshold then
    reasons := array_append(reasons, 'The total is above your company''s approval limit, so your teacher must approve it');
  end if;
  update mfg_vendor_invoices set subtotal = v_sub, tax_amount = v_tax, total = v_total, hold_reason = nullif(array_to_string(reasons, '; '), '') where id = v_inv;
  if array_length(reasons, 1) is null then
    perform mfg__vi_post(v_inv, null);
  end if;
  return v_inv;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_approve_held_invoice(p_inv uuid)
returns void as $$
declare
  i mfg_vendor_invoices;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can release an invoice that is on hold.'; end if;
  select * into i from mfg_vendor_invoices where id = p_inv;
  if i.id is null then raise exception 'That vendor invoice was not found.'; end if;
  perform assert_mfg_tenant(i.tenant_id);
  if i.status <> 'HELD' then raise exception 'That invoice is not on hold (it is %).', lower(i.status); end if;
  perform mfg__vi_post(p_inv, auth.uid());
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (i.tenant_id, 'held_invoice_released', jsonb_build_object('invoice', i.document_number, 'reason', i.hold_reason), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_reject_held_invoice(p_inv uuid, p_reason text)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  i mfg_vendor_invoices;
begin
  select * into i from mfg_vendor_invoices where id = p_inv and tenant_id = v_t for update;
  if i.id is null then raise exception 'That vendor invoice was not found.'; end if;
  if i.status <> 'HELD' then raise exception 'Only an invoice on hold can be rejected (this one is %).', lower(i.status); end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are rejecting it — the reason stays on the record.'; end if;
  update mfg_vendor_invoices set status = 'REJECTED', note = trim(p_reason) where id = p_inv;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_void_vendor_invoice(p_inv uuid, p_date date default current_date, p_reason text default null)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  i mfg_vendor_invoices; v_paid numeric;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding it — the reason stays on the record.'; end if;
  select * into i from mfg_vendor_invoices where id = p_inv and tenant_id = v_t for update;
  if i.id is null then raise exception 'That vendor invoice was not found.'; end if;
  if i.status <> 'POSTED' then raise exception 'Only a posted invoice can be voided (this one is %).', lower(i.status); end if;
  if v_date < i.invoice_date then raise exception 'The void can''t be dated before the invoice (%).', to_char(i.invoice_date, 'Mon DD, YYYY'); end if;
  select coalesce(sum(amount), 0) into v_paid from bill_payments where bill_id = i.bill_id;
  if v_paid <> 0 then raise exception 'A payment of % has been made on this invoice, so it can''t be voided. Only an unpaid invoice can be.', v_paid; end if;
  perform mfg__reverse_entry(v_t, i.journal_entry_id, v_date, 'Void of vendor invoice ' || i.document_number, 'mfg_vendor_invoices', i.id);
  update bills set status = 'void' where id = i.bill_id;
  update mfg_vendor_invoices set status = 'VOID', note = trim(p_reason) where id = p_inv;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'vendor_invoice_voided', jsonb_build_object('invoice', i.document_number, 'reason', p_reason), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- landed cost ----------
-- p_lines: [{"doc_line_id": goods-receipt line, "weight": kg, "volume": m3}, …]. The vendor's freight invoice is entered together with
-- its spread, so there is no separate clearing step.
create or replace function mfg_post_landed_cost(p_vendor uuid, p_ref text, p_date date, p_due date, p_basis text, p_amount numeric, p_tax_rate numeric,
                                                p_description text, p_lines jsonb, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  v_date date := coalesce(p_date, current_date);
  v_ref text := trim(coalesce(p_ref, '')); v_rate numeric := coalesce(p_tax_rate, 0);
  v_id uuid; v_dup text; ln jsonb; dl record; v_n int := 0; v_base numeric; v_total_base numeric := 0; v_tax numeric; v_total numeric;
  bases numeric[] := '{}'; allocs numeric[] := '{}'; rows jsonb := '[]'::jsonb; i int; v_sum numeric := 0; v_max int := 1; v_maxb numeric := -1;
  v_ap uuid; v_vat uuid; v_bill uuid; v_je uuid; v_lines jsonb; v_cap_total numeric := 0; v_onhand numeric; k text;
  v_keys jsonb := '{}'::jsonb; v_cap_item jsonb := '{}'::jsonb; v_item_cap numeric; v_avg numeric; v_key text; v_cap_line numeric; r2 jsonb;
begin
  if p_key is not null then
    select id into v_id from mfg_landed_cost_vouchers where tenant_id = v_t and idempotency_key = p_key;
    if v_id is not null then return v_id; end if;
  end if;
  if p_basis not in ('VALUE', 'QTY', 'WEIGHT', 'VOLUME') then raise exception 'Choose how to spread the cost: by value, quantity, weight or volume.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount on the freight or customs invoice (before VAT).'; end if;
  if v_rate < 0 or v_rate > 100 then raise exception 'The VAT rate must be between 0 and 100 percent.'; end if;
  if v_ref = '' then raise exception 'Enter the number printed on the vendor''s invoice.'; end if;
  if not exists (select 1 from vendors where id = p_vendor and tenant_id = v_t) then raise exception 'Choose the vendor who billed the cost.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one goods-receipt line to spread the cost over.'; end if;
  select d.document_number into v_dup from (
    select document_number from mfg_landed_cost_vouchers where tenant_id = v_t and vendor_id = p_vendor and lower(vendor_ref) = lower(v_ref) and status = 'POSTED'
    union all
    select document_number from mfg_vendor_invoices where tenant_id = v_t and vendor_id = p_vendor and lower(vendor_ref) = lower(v_ref) and status in ('HELD', 'POSTED')
  ) d limit 1;
  if v_dup is not null then raise exception 'This vendor has already billed invoice number "%" (%). The same invoice can''t be entered twice.', v_ref, v_dup; end if;
  select id into v_ap from accounts where tenant_id = v_t and code = '2000';
  select id into v_vat from accounts where tenant_id = v_t and code = '1160';
  if v_ap is null or v_vat is null then raise exception 'The chart of accounts needs Accounts Payable (2000) and Input VAT (1160).'; end if;

  -- pass 1: what each line counts for in the spread
  for ln in select * from jsonb_array_elements(p_lines) loop
    select dl2.id, dl2.item_id, dl2.qty_change, dl2.total_cost into dl
      from mfg_material_doc_lines dl2 join mfg_material_documents d on d.id = dl2.doc_id
     where dl2.id = nullif(ln->>'doc_line_id', '')::uuid and dl2.tenant_id = v_t and d.doc_type = 'GR' and dl2.qty_change > 0
       and not exists (select 1 from mfg_material_documents rv where rv.reversal_of = d.id);
    if dl.id is null then raise exception 'One of the lines is not a goods receipt line that can still take freight (it may have been reversed).'; end if;
    v_base := case p_basis when 'VALUE' then dl.total_cost when 'QTY' then dl.qty_change
                           when 'WEIGHT' then coalesce(nullif(ln->>'weight', '')::numeric, 0) else coalesce(nullif(ln->>'volume', '')::numeric, 0) end;
    if v_base < 0 then raise exception 'Weights and volumes can''t be negative.'; end if;
    v_n := v_n + 1;
    bases := bases || v_base;
    v_total_base := v_total_base + v_base;
    rows := rows || jsonb_build_object('doc_line_id', dl.id, 'item_id', dl.item_id, 'weight', coalesce(nullif(ln->>'weight', '')::numeric, 0), 'volume', coalesce(nullif(ln->>'volume', '')::numeric, 0));
  end loop;
  if v_total_base <= 0 then raise exception 'There is nothing to spread the cost by: enter the % for the lines you chose.', lower(p_basis); end if;

  -- the spread, to the centavo: the leftover cents go to the line with the biggest share
  for i in 1 .. v_n loop
    allocs := allocs || round(p_amount * bases[i] / v_total_base, 2);
    v_sum := v_sum + allocs[i];
    if bases[i] > v_maxb then v_maxb := bases[i]; v_max := i; end if;
  end loop;
  allocs[v_max] := allocs[v_max] + (round(p_amount, 2) - v_sum);

  v_tax := round(round(p_amount, 2) * v_rate / 100, 2);
  v_total := round(p_amount, 2) + v_tax;
  insert into mfg_landed_cost_vouchers (tenant_id, vendor_id, vendor_ref, description, voucher_date, due_date, basis, amount, tax_rate, tax_amount, total, idempotency_key)
  values (v_t, p_vendor, v_ref, nullif(trim(p_description), ''), v_date, p_due, p_basis, round(p_amount, 2), v_rate, v_tax, v_total, p_key) returning id into v_id;

  -- under actual costing the cost joins the stock still on hand; everything else is a purchase price variance
  for i in 1 .. v_n loop
    r2 := rows->(i - 1);
    v_cap_line := 0;
    if v_method = 'ACTUAL' then
      select coalesce(sum(qty), 0) into v_onhand from mfg_stock where tenant_id = v_t and item_id = (r2->>'item_id')::uuid;
      if v_onhand > 0 then v_cap_line := allocs[i]; end if;
    end if;
    insert into mfg_landed_cost_lines (tenant_id, voucher_id, line_no, doc_line_id, item_id, weight, volume, base_value, alloc_amount, capitalised)
    values (v_t, v_id, i, (r2->>'doc_line_id')::uuid, (r2->>'item_id')::uuid, (r2->>'weight')::numeric, (r2->>'volume')::numeric, bases[i], allocs[i], v_cap_line);
    if v_cap_line > 0 then
      v_cap_item := jsonb_set(v_cap_item, array[r2->>'item_id'], to_jsonb(coalesce((v_cap_item->>(r2->>'item_id'))::numeric, 0) + v_cap_line));
      select mfg__inv_key(m.item_type) into v_key from mfg_item_master m where m.item_id = (r2->>'item_id')::uuid;
      v_keys := jsonb_set(v_keys, array[v_key], to_jsonb(coalesce((v_keys->>v_key)::numeric, 0) + v_cap_line));
      v_cap_total := v_cap_total + v_cap_line;
    end if;
  end loop;
  for k in select jsonb_object_keys(v_cap_item) loop
    v_item_cap := (v_cap_item->>k)::numeric;
    select coalesce(sum(qty), 0) into v_onhand from mfg_stock where tenant_id = v_t and item_id = k::uuid;
    select moving_avg_cost into v_avg from mfg_item_master where item_id = k::uuid;
    v_avg := round(v_avg + v_item_cap / v_onhand, 6);
    update mfg_item_master set moving_avg_cost = v_avg where item_id = k::uuid;
    update items set unit_cost = v_avg where id = k::uuid;
  end loop;

  insert into bills (tenant_id, vendor_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (v_t, p_vendor, v_date, p_due, v_total, v_rate, v_tax, 'received') returning id into v_bill;
  insert into bill_lines (bill_id, description, qty, unit_cost) values (v_bill, 'Landed cost: ' || coalesce(nullif(trim(p_description), ''), 'freight and handling') || ' (' || v_ref || ')', 1, round(p_amount, 2));

  v_lines := '[]'::jsonb;
  for k in select jsonb_object_keys(v_keys) loop
    v_lines := v_lines || jsonb_build_object('key', k, 'debit', (v_keys->>k)::numeric);
  end loop;
  if round(p_amount, 2) - v_cap_total > 0 then v_lines := v_lines || jsonb_build_object('key', 'PPV', 'debit', round(p_amount, 2) - v_cap_total); end if;
  if v_tax > 0 then v_lines := v_lines || jsonb_build_object('account_id', v_vat, 'debit', v_tax); end if;
  v_lines := v_lines || jsonb_build_object('account_id', v_ap, 'credit', v_total);
  v_je := mfg__post_entry(v_t, v_date, 'Landed cost ' || (select document_number from mfg_landed_cost_vouchers where id = v_id) || ' (' || v_ref || ')', 'bills', v_bill, v_lines);
  update mfg_landed_cost_vouchers set bill_id = v_bill, journal_entry_id = v_je where id = v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_void_landed_cost(p_voucher uuid, p_date date default current_date, p_reason text default null)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  c mfg_landed_cost_vouchers; v_paid numeric; r record; v_onhand numeric; v_avg numeric;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding it — the reason stays on the record.'; end if;
  select * into c from mfg_landed_cost_vouchers where id = p_voucher and tenant_id = v_t for update;
  if c.id is null then raise exception 'That landed cost was not found.'; end if;
  if c.status <> 'POSTED' then raise exception 'Only a posted landed cost can be voided (this one is %).', lower(c.status); end if;
  if v_date < c.voucher_date then raise exception 'The void can''t be dated before the landed cost (%).', to_char(c.voucher_date, 'Mon DD, YYYY'); end if;
  select coalesce(sum(amount), 0) into v_paid from bill_payments where bill_id = c.bill_id;
  if v_paid <> 0 then raise exception 'A payment of % has been made on this invoice, so it can''t be voided. Only an unpaid invoice can be.', v_paid; end if;

  for r in select item_id, sum(capitalised) as cap from mfg_landed_cost_lines where voucher_id = p_voucher group by item_id having sum(capitalised) > 0 loop
    select coalesce(sum(qty), 0) into v_onhand from mfg_stock where tenant_id = v_t and item_id = r.item_id;
    if v_onhand <= 0 then
      raise exception 'The goods this cost was added to are no longer in stock, so it can''t be taken back out of their cost. Leave it in place.';
    end if;
    select moving_avg_cost into v_avg from mfg_item_master where item_id = r.item_id;
    v_avg := greatest(round(v_avg - r.cap / v_onhand, 6), 0);
    update mfg_item_master set moving_avg_cost = v_avg where item_id = r.item_id;
    update items set unit_cost = v_avg where id = r.item_id;
  end loop;
  perform mfg__reverse_entry(v_t, c.journal_entry_id, v_date, 'Void of landed cost ' || c.document_number, 'mfg_landed_cost_vouchers', c.id);
  update bills set status = 'void' where id = c.bill_id;
  update mfg_landed_cost_vouchers set status = 'VOID', note = trim(p_reason) where id = p_voucher;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the books check now knows about invoices and payables ----------
create or replace function mfg_reconciliation(p_tenant uuid default null)
returns table (area text, account_code text, account_name text, subledger numeric, ledger numeric, difference numeric) as $$
declare
  t uuid := coalesce(p_tenant, my_tenant_id());
  v_method text;
begin
  select costing_method into v_method from mfg_company_settings where tenant_id = t;
  return query
  with gl_bal as (
    select a.id, a.code, a.name, coalesce(sum(jl.debit - jl.credit), 0) as bal
      from accounts a left join journal_lines jl on jl.account_id = a.id
     where a.tenant_id = t group by a.id, a.code, a.name
  ), keyed as (
    select d.key, g.code, g.name, g.bal from mfg_account_determination d join gl_bal g on g.id = d.account_id where d.tenant_id = t
  ), stock as (
    select mfg__inv_key(m.item_type) as key,
           coalesce(sum(s.qty * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end), 0) as val
      from mfg_stock s join mfg_item_master m on m.item_id = s.item_id where s.tenant_id = t group by 1
  ), pairs(a_name, a_key) as (values ('Raw materials', 'RM_INVENTORY'), ('Packaging & supplies', 'PACKAGING_INVENTORY'), ('Finished goods', 'FG_INVENTORY')),
  grir as (
    select coalesce((select sum(dl.qty_change * pl.unit_cost) from mfg_material_doc_lines dl join purchase_order_lines pl on pl.id = dl.po_line_id where dl.tenant_id = t), 0)
         - coalesce((select sum(round(vl.qty * vl.po_price, 2)) from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id
                      where vl.tenant_id = t and vi.status = 'POSTED'), 0) as val
  ), ap as (
    select coalesce((select sum(b.total) from bills b where b.tenant_id = t and b.status = 'received'), 0)
         - coalesce((select sum(p.amount) from bill_payments p join bills b on b.id = p.bill_id where b.tenant_id = t and b.status = 'received'), 0) as val
  )
  select p.a_name, k.code, k.name, round(coalesce(s.val, 0), 2), round(k.bal, 2), round(coalesce(s.val, 0) - k.bal, 2)
    from pairs p join keyed k on k.key = p.a_key left join stock s on s.key = p.a_key
  union all
  select 'Work in process', k.code, k.name, round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0), 2), round(k.bal, 2),
         round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0) - k.bal, 2)
    from keyed k where k.key = 'WIP'
  union all
  select 'Received, not yet invoiced (GR/IR)', k.code, k.name, round((select val from grir), 2), round(-k.bal, 2), round((select val from grir) + k.bal, 2)
    from keyed k where k.key = 'GR_IR'
  union all
  select 'Accounts payable', g.code, g.name, round((select val from ap), 2), round(-g.bal, 2), round((select val from ap) + g.bal, 2)
    from gl_bal g where g.code = '2000';
end;
$$ language plpgsql stable set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__vi_post(uuid, uuid) from public, anon, authenticated;
revoke execute on function set_mfg_match_tolerance(uuid, numeric) from public, anon;
revoke execute on function mfg_po_match(uuid) from public, anon;
revoke execute on function mfg_post_vendor_invoice(uuid, text, date, date, numeric, jsonb, text) from public, anon;
revoke execute on function mfg_approve_held_invoice(uuid) from public, anon;
revoke execute on function mfg_reject_held_invoice(uuid, text) from public, anon;
revoke execute on function mfg_void_vendor_invoice(uuid, date, text) from public, anon;
revoke execute on function mfg_post_landed_cost(uuid, text, date, date, text, numeric, numeric, text, jsonb, text) from public, anon;
revoke execute on function mfg_void_landed_cost(uuid, date, text) from public, anon;
revoke execute on function mfg_reconciliation(uuid) from public, anon;
grant execute on function set_mfg_match_tolerance(uuid, numeric) to authenticated;
grant execute on function mfg_po_match(uuid) to authenticated;
grant execute on function mfg_post_vendor_invoice(uuid, text, date, date, numeric, jsonb, text) to authenticated;
grant execute on function mfg_approve_held_invoice(uuid) to authenticated;
grant execute on function mfg_reject_held_invoice(uuid, text) to authenticated;
grant execute on function mfg_void_vendor_invoice(uuid, date, text) to authenticated;
grant execute on function mfg_post_landed_cost(uuid, text, date, date, text, numeric, numeric, text, jsonb, text) to authenticated;
grant execute on function mfg_void_landed_cost(uuid, date, text) to authenticated;
grant execute on function mfg_reconciliation(uuid) to authenticated;
