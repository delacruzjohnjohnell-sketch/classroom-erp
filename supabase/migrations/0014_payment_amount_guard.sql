-- ============================================================
-- Classroom ERP — upgrade migration 0014
-- AUDIT.md, missing features: "invoicePayments/billPayments aren't
-- validated against the remaining balance in the UI beyond a `max`
-- attribute on the input — a determined user could overpay via
-- devtools."
--
-- The UI already blocks this (RecordPaymentForm caps the input and
-- disables submit above the balance) but that's client-side only.
-- This adds the real guard: a trigger that rejects the insert at the
-- database level, so it holds even against a hand-crafted API call.
--
-- record_invoice_payment()/record_bill_payment() both insert into
-- invoice_payments/bill_payments BEFORE posting any journal entry,
-- so when this trigger raises, the whole RPC call rolls back
-- atomically — no journal entry is left half-posted.
-- ============================================================

create or replace function guard_invoice_payment_amount()
returns trigger as $$
declare
  inv_total numeric;
  already_paid numeric;
begin
  select total into inv_total from invoices where id = new.invoice_id;
  select coalesce(sum(amount), 0) into already_paid from invoice_payments where invoice_id = new.invoice_id;

  if already_paid + new.amount > inv_total + 0.01 then
    raise exception 'Payment of % would exceed the invoice balance (total %, already paid %).',
      new.amount, inv_total, already_paid;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_guard_invoice_payment before insert on invoice_payments
  for each row execute function guard_invoice_payment_amount();

create or replace function guard_bill_payment_amount()
returns trigger as $$
declare
  bill_total numeric;
  already_paid numeric;
begin
  select total into bill_total from bills where id = new.bill_id;
  select coalesce(sum(amount), 0) into already_paid from bill_payments where bill_id = new.bill_id;

  if already_paid + new.amount > bill_total + 0.01 then
    raise exception 'Payment of % would exceed the bill balance (total %, already paid %).',
      new.amount, bill_total, already_paid;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_guard_bill_payment before insert on bill_payments
  for each row execute function guard_bill_payment_amount();
