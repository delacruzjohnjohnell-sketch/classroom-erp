#!/usr/bin/env python3
"""Practice set 'Revenue cycle: credit and shipping controls' (Sinag Rice Trading Co., January 2027).

Writes ais_set_sinag_revenue.json (the set definition) and ../migrations/0070_ais_set_sinag_revenue.sql (imports it as the teacher).
Every transaction is a template: {{variables}} are filled per company from a seed, so each student's numbers differ.
13 documents: 5 valid (post) and 8 with a planted control failure (hold, naming the control).
Run:  python3 gen_ais_sinag_revenue.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

CUSTOMERS = [
    {"name": "Mang Tomas Grocery", "addr": "Cabanatuan City"},
    {"name": "Bagong Silang Store", "addr": "Talavera, Nueva Ecija"},
    {"name": "Lucena Rice Mart", "addr": "Lucena City"},
    {"name": "Dalisay Wholesale", "addr": "San Jose City"},
    {"name": "Mercado Foods Inc.", "addr": "Gapan City"},
]
PRODUCTS = [
    {"name": "Dinorado rice, 50 kg sack", "price": 2250, "cost": 1780},
    {"name": "Jasmine rice, 50 kg sack", "price": 2050, "cost": 1610},
    {"name": "Sinandomeng rice, 50 kg sack", "price": 1950, "cost": 1520},
    {"name": "Premium Malagkit, 25 kg sack", "price": 1450, "cost": 1130},
]

def v_cust(): return {"name": "cust", "pick": CUSTOMERS}
def v_prod(): return [{"name": "prod", "pick": PRODUCTS}, {"name": "unit", "op": "add", "terms": ["prod.price", 0], "fmt": "money"}]
def v_amounts(qty_range):
    return [
        {"name": "qty", "range": qty_range},
        {"name": "net", "op": "mul", "a": "qty", "b": "prod.price", "fmt": "money"},
        {"name": "vat", "op": "pct", "a": "net", "pct": 12, "fmt": "money"},
        {"name": "gross", "op": "add", "terms": ["net", "vat"], "fmt": "money"},
        {"name": "cost", "op": "mul", "a": "qty", "b": "prod.cost", "fmt": "money"},
    ]

def so(date, limit, approved="Credit manager L. Reyes", balance="0.00"):
    return {"type": "Sales order", "fields": {
        "Order no.": "SO-{{so}}", "Date": date, "Customer": "{{cust.name}} ({{cust.addr}})", "Item": "{{prod.name}}", "Quantity ordered": "{{qty}}",
        "Unit price": "{{unit}}", "Order total (incl. 12% VAT)": "{{gross}}", "Customer credit limit": limit, "Balance owed before this order": balance, "Credit approval": approved}}

def dr(date, qty="{{qty}}", received="Received by: customer's storekeeper (signed)"):
    return {"type": "Delivery receipt", "fields": {"DR no.": "DR-{{dr}}", "Date delivered": date, "Item": "{{prod.name}}", "Quantity delivered": qty, "Signed": received}}

def inv(date, no="INV-{{inv}}", qty="{{qty}}", price="{{unit}}", net="{{net}}", prepared="A. Santos (billing clerk)", approved="L. Reyes (sales manager)"):
    return {"type": "Sales invoice", "fields": {
        "Invoice no.": no, "Invoice date": date, "Customer": "{{cust.name}}", "Quantity billed": qty, "Unit price": price, "Net sales": net,
        "VAT 12%": "{{vat}}", "Total due": "{{gross}}", "Prepared by": prepared, "Approved by": approved, "Terms": "30 days"}}

SALE_JOURNAL = [
    {"acct": "1100", "dr": "gross"}, {"acct": "4000", "cr": "net"}, {"acct": "2200", "cr": "vat"},
    {"acct": "5000", "dr": "cost"}, {"acct": "1200", "cr": "cost"},
]
ID_VARS = [{"name": "so", "range": [3100, 3899, 1]}, {"name": "dr", "range": [5100, 5899, 1]}, {"name": "inv", "range": [7100, 7899, 1]}]

def sale(seq, date, title, vars_, docs, key):
    return {"seq": seq, "template": {"title": title, "date": date, "company": "Sinag Rice Trading Co.", "docs": docs, "vars": vars_}, "key": key}

txns = []

# 1 valid sale
txns.append(sale(1, "2027-01-05", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([20, 60, 5]), {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-04", "{{limit}}"), dr("2027-01-05"), inv("2027-01-05")],
    {"decision": "POST", "journal": SALE_JOURNAL,
     "explanation": "Every document agrees: the order is within the {{limit}} credit limit and approved, the goods were delivered and signed for ({{qty}} sacks), and the invoice bills the same quantity at the list price. Record the sale (A/R, sales, output VAT) and the cost of the goods sold."}))

# 2 valid sale
txns.append(sale(2, "2027-01-08", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([25, 70, 5]), {"name": "limit", "range": [300000, 450000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-07", "{{limit}}"), dr("2027-01-08"), inv("2027-01-08")],
    {"decision": "POST", "journal": SALE_JOURNAL,
     "explanation": "A clean three-document match: authorized order, signed delivery receipt and a matching invoice. Post it."}))

# 3 credit limit exceeded
txns.append(sale(3, "2027-01-11", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([60, 80, 5]), {"name": "limit", "range": [80000, 120000, 10000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-10", "{{limit}}", approved="(blank)"), dr("2027-01-11"), inv("2027-01-11")],
    {"decision": "HOLD", "failed_control": "CREDIT_LIMIT",
     "explanation": "The order total of {{gross}} is above the customer's {{limit}} credit limit and the credit approval line is blank. Nobody authorized exceeding the limit, so the sale should be held for approval."}))

# 4 no delivery receipt
txns.append(sale(4, "2027-01-12", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([20, 50, 5]), {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-11", "{{limit}}"),
     {"type": "Delivery receipt", "fields": {"DR no.": "—", "Status": "NOT ATTACHED: the warehouse could not find a signed delivery receipt for this order"}},
     inv("2027-01-12")],
    {"decision": "HOLD", "failed_control": "NO_SHIPPING_NOTICE",
     "explanation": "There is an invoice but no signed delivery receipt, so there is no proof that the {{qty}} sacks left the warehouse. Revenue must not be recorded for goods that may not have been shipped."}))

# 5 duplicate invoice
txns.append(sale(5, "2027-01-13", "Invoice INV-{{inv_ref_no}}: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([20, 60, 5]), {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS,
     {"name": "inv_ref_no", "range": [7000, 7099, 1]}],
    [so("2027-01-06", "{{limit}}"), dr("2027-01-07"),
     inv("2027-01-13", no="INV-{{inv_ref_no}}"),
     {"type": "Invoice register extract", "fields": {"Invoice no.": "INV-{{inv_ref_no}}", "Already posted on": "2027-01-07", "Customer": "{{cust.name}}", "Amount": "{{gross}}", "Status": "POSTED to the ledger"}}],
    {"decision": "HOLD", "failed_control": "DUP_INVOICE",
     "explanation": "The register shows INV-{{inv_ref_no}} for {{gross}} was already posted on January 7. This is the same invoice, billed again on January 13. Posting it would record the sale twice."}))

# 6 quantity billed more than shipped
txns.append(sale(6, "2027-01-14", "Credit sale: {{qty}} sacks billed to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([30, 70, 5]), {"name": "short", "op": "sub", "a": "qty", "b": 10},
     {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-13", "{{limit}}"), dr("2027-01-14", qty="{{short}}"), inv("2027-01-14")],
    {"decision": "HOLD", "failed_control": "QTY_MISMATCH",
     "explanation": "The delivery receipt shows {{short}} sacks delivered, but the invoice bills {{qty}}. Ten sacks are being billed that were never shipped."}))

# 7 price differs from the price list
txns.append(sale(7, "2027-01-15", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), {"name": "bad_price", "op": "add", "terms": ["prod.price", 150], "fmt": "money"},
     {"name": "qty", "range": [20, 60, 5]},
     {"name": "net", "op": "mul", "a": "qty", "b": "bad_price", "fmt": "money"}, {"name": "vat", "op": "pct", "a": "net", "pct": 12, "fmt": "money"},
     {"name": "gross", "op": "add", "terms": ["net", "vat"], "fmt": "money"}, {"name": "cost", "op": "mul", "a": "qty", "b": "prod.cost", "fmt": "money"},
     {"name": "limit", "range": [300000, 450000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-14", "{{limit}}"), dr("2027-01-15"),
     inv("2027-01-15", price="{{bad_price}}"),
     {"type": "Approved price list", "fields": {"Item": "{{prod.name}}", "Approved unit price": "{{unit}}", "Effective": "2027-01-01"}}],
    {"decision": "HOLD", "failed_control": "PRICE_MISMATCH",
     "explanation": "The invoice charges {{bad_price}} per sack but the approved price list says {{unit}}. The customer is being overbilled and the price was not authorized."}))

# 8 valid cash receipt
txns.append({"seq": 8, "template": {"title": "Collection from {{cust.name}}", "date": "2027-01-18", "company": "Sinag Rice Trading Co.",
    "vars": [v_cust(), {"name": "amt", "range": [60000, 160000, 5000], "fmt": "money"}, {"name": "or", "range": [2200, 2899, 1]}],
    "docs": [{"type": "Official receipt", "fields": {"OR no.": "OR-{{or}}", "Received from": "{{cust.name}}", "Amount": "{{amt}}", "In payment of": "Invoice dated 2027-01-05", "Issued by": "Cashier R. Dizon"}},
             {"type": "Bank deposit slip", "fields": {"Date": "2027-01-18", "Deposited to": "Sinag operating account", "Amount": "{{amt}}", "Validated by bank": "Yes"}},
             {"type": "Customer ledger card", "fields": {"Customer": "{{cust.name}}", "Balance before this payment": "{{amt}}", "Payment applied": "{{amt}}"}}]},
    "key": {"decision": "POST", "journal": [{"acct": "1000", "dr": "amt"}, {"acct": "1100", "cr": "amt"}],
            "explanation": "The receipt, the validated deposit slip and the customer's ledger card all show {{amt}}. Debit cash in bank and credit accounts receivable."}})

# 9 valid sales return with an approved credit memo
txns.append({"seq": 9, "template": {"title": "Sales return: {{rq}} sacks from {{cust.name}}", "date": "2027-01-20", "company": "Sinag Rice Trading Co.",
    "vars": [v_cust(), *v_prod(), {"name": "rq", "range": [3, 12, 1]},
             {"name": "net", "op": "mul", "a": "rq", "b": "prod.price", "fmt": "money"}, {"name": "vat", "op": "pct", "a": "net", "pct": 12, "fmt": "money"},
             {"name": "gross", "op": "add", "terms": ["net", "vat"], "fmt": "money"}, {"name": "cost", "op": "mul", "a": "rq", "b": "prod.cost", "fmt": "money"},
             {"name": "cm", "range": [410, 899, 1]}, {"name": "rr", "range": [610, 999, 1]}],
    "docs": [{"type": "Receiving report", "fields": {"RR no.": "RR-{{rr}}", "Returned by": "{{cust.name}}", "Item": "{{prod.name}}", "Quantity received back": "{{rq}}", "Condition": "Damaged in transit; inspected by the warehouse head"}},
             {"type": "Credit memo", "fields": {"CM no.": "CM-{{cm}}", "Customer": "{{cust.name}}", "Quantity": "{{rq}}", "Net": "{{net}}", "VAT 12%": "{{vat}}", "Credit total": "{{gross}}", "Approved by": "Sales manager L. Reyes (signed)"}}]},
    "key": {"decision": "POST", "journal": [{"acct": "4010", "dr": "net"}, {"acct": "2200", "dr": "vat"}, {"acct": "1100", "cr": "gross"}, {"acct": "1200", "dr": "cost"}, {"acct": "5000", "cr": "cost"}],
            "explanation": "The goods came back (receiving report) and an approved credit memo supports reducing the customer's balance by {{gross}}. Record the return and put the goods back into inventory at cost."}})

# 10 sales return without credit memo
txns.append({"seq": 10, "template": {"title": "Sales return: {{rq}} sacks from {{cust.name}}", "date": "2027-01-21", "company": "Sinag Rice Trading Co.",
    "vars": [v_cust(), *v_prod(), {"name": "rq", "range": [5, 20, 1]},
             {"name": "net", "op": "mul", "a": "rq", "b": "prod.price", "fmt": "money"}, {"name": "vat", "op": "pct", "a": "net", "pct": 12, "fmt": "money"},
             {"name": "gross", "op": "add", "terms": ["net", "vat"], "fmt": "money"}, {"name": "rr", "range": [610, 999, 1]}],
    "docs": [{"type": "Receiving report", "fields": {"RR no.": "RR-{{rr}}", "Returned by": "{{cust.name}}", "Item": "{{prod.name}}", "Quantity received back": "{{rq}}"}},
             {"type": "Credit memo", "fields": {"CM no.": "—", "Status": "NONE: the billing clerk prepared a journal entry to credit the customer {{gross}} directly"}}]},
    "key": {"decision": "HOLD", "failed_control": "NO_CREDIT_MEMO",
            "explanation": "A return reduces what the customer owes, so it needs a credit memo approved by the sales manager. There is none, only a request to credit {{gross}} directly."}})

# 11 cutoff
txns.append(sale(11, "2027-01-31", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([20, 60, 5]), {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-28", "{{limit}}"), dr("2027-02-02"), inv("2027-01-31")],
    {"decision": "HOLD", "failed_control": "CUTOFF",
     "explanation": "The goods were delivered on February 2, but the invoice is dated January 31 and would put the revenue in January. The sale belongs to the next period."}))

# 12 segregation of duties
txns.append(sale(12, "2027-01-26", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([20, 60, 5]), {"name": "limit", "range": [250000, 400000, 50000], "fmt": "money"}, *ID_VARS],
    [so("2027-01-25", "{{limit}}"), dr("2027-01-26"), inv("2027-01-26", prepared="M. Cruz (billing clerk)", approved="M. Cruz (billing clerk)")],
    {"decision": "HOLD", "failed_control": "SOD",
     "explanation": "M. Cruz both prepared and approved this invoice. One person should not be able to create and authorize the same sale."}))

# 13 valid sale exactly at the credit limit (a trap for over-holding)
txns.append(sale(13, "2027-01-27", "Credit sale: {{qty}} sacks to {{cust.name}}",
    [v_cust(), *v_prod(), *v_amounts([30, 70, 5]), {"name": "limit", "op": "add", "terms": ["gross", 0], "fmt": "money"}, *ID_VARS],
    [so("2027-01-26", "{{limit}}"), dr("2027-01-27"), inv("2027-01-27")],
    {"decision": "POST", "journal": SALE_JOURNAL,
     "explanation": "The order total of {{gross}} equals the credit limit exactly. It is within the limit, the credit manager approved it, and the delivery receipt and invoice match. This is a valid sale, so it should be posted, not held."}))

definition = {
    "id": "sinag-revenue-jan-2027",
    "title": "Revenue cycle: credit and shipping controls (Sinag Rice Trading Co., January 2027)",
    "topic": "Revenue cycle",
    "summary": "Thirteen sales-cycle documents at a rice wholesaler. Review each packet (sales order, delivery receipt, invoice and supporting records), post the valid ones with the right journal, and hold the ones that fail a control, naming the control. Tests credit authorization, shipping evidence, accuracy, cutoff, returns and segregation of duties.",
    "meta": {"hall_topic": "Revenue cycle", "documents": 13, "valid": 5, "exceptions": 8, "period": "2027-01", "vat_rate": 12},
    "txns": txns,
}

with open(os.path.join(HERE, "ais_set_sinag_revenue.json"), "w") as f:
    json.dump(definition, f, indent=1, ensure_ascii=False)

body = json.dumps(definition, ensure_ascii=False, separators=(",", ":"))
assert "$def$" not in body
sql = f"""-- ============================================================
-- Classroom ERP — migration 0070 (AIS edition: the first practice set)
--
-- Needs 0069. Imports the set 'sinag-revenue-jan-2027' (generated by supabase/seed/gen_ais_sinag_revenue.py) through ais_set_import, acting as the
-- teacher, exactly as the teacher's import screen will. Adds data only; changes no function or table.
--
-- ROLLBACK: delete from ais_sets where id = 'sinag-revenue-jan-2027';   (only while no company has been assigned the set)
-- ============================================================
do $do$
declare
  teacher uuid;
begin
  teacher := (select id from profiles where role = 'teacher' order by created_at limit 1);
  if teacher is null then raise exception 'A teacher account is needed to import the set.'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  perform ais_set_import($def${body}$def$::jsonb);
end $do$;
"""
with open(os.path.join(HERE, "..", "migrations", "0070_ais_set_sinag_revenue.sql"), "w") as f:
    f.write(sql)
print("ok:", len(txns), "transactions;", sum(1 for t in txns if t["key"]["decision"] == "POST"), "valid;", sum(1 for t in txns if t["key"]["decision"] == "HOLD"), "exceptions;", len(sql), "bytes of SQL")
