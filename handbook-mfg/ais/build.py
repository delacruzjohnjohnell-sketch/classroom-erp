#!/usr/bin/env python3
"""Builds the three AIS Edition PDFs as HTML: student handout, practice set (paper version), teacher key.
Run:  python3 build.py   then render each html with Chrome headless (see render.sh).
The document packets and keys are the real ones from the live 'sinag-revenue-jan-2027' instance; the desk cards come from migrations 0076-0081."""
import html, os, re
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
def esc(s): return html.escape(str(s), quote=False)
def D(x): return Decimal(str(x))
def r2(x): return D(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
def m(x): return f"{r2(x):,.2f}"

CSS = """
@page { size: A4; margin: 16mm 15mm 16mm 15mm; }
* { box-sizing:border-box; } body { font-family: -apple-system,'Helvetica Neue',Arial,sans-serif; color:#18202e; font-size:10.5pt; line-height:1.45; }
h1,h2,h3,h4 { margin:0; } .cover { height:250mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }
.cover .k { color:#6a45d6; font-weight:700; letter-spacing:.14em; font-size:10pt; } .cover h1 { font-size:34pt; line-height:1.1; margin:10px 0 14px; } .cover p { font-size:12.5pt; color:#4a566a; max-width:150mm; }
.cover .who { margin-top:30px; font-size:10.5pt; color:#4a566a; border-top:1px solid #d7dde6; padding-top:10px; max-width:150mm; }
.toc { page-break-after:always; } .toc h2 { font-size:20pt; margin-bottom:8px; } .toc li { margin:5px 0; list-style:none; } .toc span { color:#6a45d6; font-weight:700; display:inline-block; width:9mm; }
.chap { page-break-before:always; } .chap.first { page-break-before:auto; }
.tag { color:#6a45d6; font-weight:700; letter-spacing:.1em; font-size:8.5pt; } h2.t { font-size:21pt; margin:2px 0 6px; } .intro { color:#4a566a; font-size:11.5pt; margin-bottom:10px; }
h3 { font-size:13pt; margin:16px 0 4px; break-after:avoid; } h4 { font-size:11pt; margin:10px 0 3px; break-after:avoid; }
table { width:100%; border-collapse:collapse; margin:8px 0 12px; font-size:9.5pt; break-inside:avoid; } th { background:#efeafc; text-align:left; } th,td { border:1px solid #d7dde6; padding:4px 7px; vertical-align:top; }
td.n,th.n { text-align:right; } .tip,.warn,.key { border-radius:5px; padding:7px 10px; margin:10px 0; font-size:9.8pt; break-inside:avoid; }
.tip { background:#eaf7ee; border-left:4px solid #2e9e5b; } .warn { background:#fff5e0; border-left:4px solid #e0a020; } .key { background:#fdecef; border-left:4px solid #d9344f; }
.what { background:#f5f3ff; border-left:4px solid #6a45d6; border-radius:5px; padding:6px 12px; margin:10px 0; break-inside:avoid; } .what h4 { margin:2px 0 4px; color:#4a2fb0; } .what p { margin:4px 0; }
ol,ul { padding-left:20px; margin:6px 0 10px; } li { margin:3px 0; }
.doc { border:1.5px solid #8b93a3; border-radius:4px; margin:8px 0; break-inside:avoid; } .doc .h { background:#eef0f4; font-weight:700; padding:3px 8px; border-bottom:1px solid #8b93a3; font-size:9.5pt; }
.doc table { margin:0; border:none; } .doc td { border:none; border-bottom:1px dotted #c3c8d2; padding:2px 8px; } .doc td:first-child { width:42%; color:#5a6578; }
.card { border:1.5px solid #8b93a3; border-radius:5px; padding:8px 11px; margin:10px 0; break-inside:avoid; } .card .ct { font-weight:700; font-size:11pt; } .card .meta { color:#5a6578; font-size:9pt; }
.ans { border:1px dashed #8b93a3; border-radius:4px; padding:6px 9px; margin-top:7px; font-size:9.5pt; } .line { border-bottom:1px solid #8b93a3; height:15px; margin:3px 0; } .box { display:inline-block; width:11px; height:11px; border:1.3px solid #333; margin:0 3px -1px 8px; vertical-align:baseline; }
figure { margin:8px 0 14px; break-inside:avoid; } figure img { width:100%; border:1px solid #d7dde6; border-radius:5px; display:block; } figcaption { font-size:8.5pt; color:#6b778a; margin-top:3px; }
.sheet { page-break-before:always; } .small { font-size:9pt; color:#5a6578; } .num { font-variant-numeric: tabular-nums; }
"""

def shot(name, cap):
    if not os.path.exists(os.path.join(HERE, "shots", name + ".jpg")): raise SystemExit("missing screenshot " + name)
    return f'<figure><img src="shots/{name}.jpg"><figcaption>{esc(cap)}</figcaption></figure>'

def page(title, body): return f'<!doctype html><html><head><meta charset="utf-8"><title>{esc(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'
def cover(kind, title, sub, who): return f'<section class="cover"><div class="k">JJ AND CO. · ACCOUNTING INFORMATION SYSTEMS · {esc(kind)}</div><h1>{title}</h1><p>{sub}</p><div class="who">{who}</div></section>'
def toc(items): return '<section class="toc"><h2>What\'s inside</h2><ul>' + "".join(f'<li><span>{i+1}</span><b>{esc(t)}</b></li>' for i, t in enumerate(items)) + '</ul></section>'
def chap(n, tag, title, intro, body, first=False): return f'<section class="chap{" first" if first else ""}"><div class="tag">{n} · {esc(tag)}</div><h2 class="t">{esc(title)}</h2><div class="intro">{intro}</div>{body}</section>'
def tip(t): return f'<div class="tip"><b>TIP</b> {t}</div>'
def warn(t): return f'<div class="warn"><b>NOTE</b> {t}</div>'
def keybox(t): return f'<div class="key"><b>TEACHER</b> {t}</div>'
def what(title, text): return f'<div class="what"><h4>What is {esc(title)}?</h4><p>{text}</p></div>'
def table(head, rows, right=()):
    h = "".join(f'<th class="{"n" if i in right else ""}">{c}</th>' for i, c in enumerate(head))
    r = "".join("<tr>" + "".join(f'<td class="{"n num" if i in right else ""}">{c}</td>' for i, c in enumerate(row)) + "</tr>" for row in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table>"
def steps(items): return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"
def bullets(items): return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
def lines(n): return "".join('<div class="line"></div>' for _ in range(n))
def docbox(typ, fields): return f'<div class="doc"><div class="h">{esc(typ)}</div><table>' + "".join(f"<tr><td>{esc(k)}</td><td>{esc(v)}</td></tr>" for k, v in fields) + "</table></div>"

CHART = [("1000", "Cash in Bank"), ("1100", "Accounts Receivable"), ("1110", "Allowance for Doubtful Accounts"), ("1160", "Input Tax (VAT)"), ("1200", "Merchandise Inventory"), ("1500", "Fixed Assets"),
         ("1590", "Accumulated Depreciation"), ("2000", "Accounts Payable"), ("2050", "Goods Received / Invoice Received (GR/IR)"), ("2100", "SSS Payable"), ("2110", "PhilHealth Payable"),
         ("2120", "Pag-IBIG Payable"), ("2130", "Withholding Tax Payable"), ("2200", "VAT Payable"), ("2300", "Accrued Expenses"), ("3000", "Owner's Equity"), ("4000", "Sales Revenue"),
         ("4010", "Sales Returns and Allowances"), ("4100", "Gain on Disposal of Assets"), ("5000", "Cost of Goods Sold"), ("5100", "Operating Expenses"), ("5110", "Bad Debts Expense"),
         ("5300", "Payroll Expense"), ("5310", "Payroll Tax Expense (Employer Share)"), ("5400", "Depreciation Expense"), ("5900", "Purchase Discounts and Adjustments")]
def chart_table():
    half = (len(CHART) + 1) // 2
    rows = [[CHART[i][0], CHART[i][1], CHART[i + half][0] if i + half < len(CHART) else "", CHART[i + half][1] if i + half < len(CHART) else ""] for i in range(half)]
    return table(["Code", "Account", "Code", "Account"], rows)

# ============================================================== the 13 document packets (real, from the live set)
SO = lambda no, d, cust, item, q, p, tot, lim, bal, ap: ("Sales order", [("Order no.", no), ("Date", d), ("Customer", cust), ("Item", item), ("Quantity ordered", q), ("Unit price", p), ("Order total (incl. 12% VAT)", tot), ("Customer credit limit", lim), ("Balance owed before this order", bal), ("Credit approval", ap)])
DR = lambda no, d, item, q: ("Delivery receipt", [("DR no.", no), ("Date delivered", d), ("Item", item), ("Quantity delivered", q), ("Signed", "Received by: customer's storekeeper (signed)")])
INV = lambda no, d, cust, q, p, net, vat, tot, prep="A. Santos (billing clerk)", appr="L. Reyes (sales manager)": ("Sales invoice", [("Invoice no.", no), ("Invoice date", d), ("Customer", cust), ("Quantity billed", q), ("Unit price", p), ("Net sales", net), ("VAT 12%", vat), ("Total due", tot), ("Prepared by", prep), ("Approved by", appr), ("Terms", "30 days")])
DAL, LUC, MTG, BSS = "Dalisay Wholesale (San Jose City)", "Lucena Rice Mart (Lucena City)", "Mang Tomas Grocery (Cabanatuan City)", "Bagong Silang Store (Talavera, Nueva Ecija)"
SIN, JAS, DIN, MAL = "Sinandomeng rice, 50 kg sack", "Jasmine rice, 50 kg sack", "Dinorado rice, 50 kg sack", "Premium Malagkit, 25 kg sack"
APPR = "Credit manager L. Reyes"
J_SALE = lambda g, n, v, c: [("1100", g, ""), ("4000", "", n), ("2200", "", v), ("5000", c, ""), ("1200", "", c)]
DOCS = [
 (1, "Credit sale: 20 sacks to Dalisay Wholesale", "2027-01-05", [SO("SO-3147", "2027-01-04", DAL, SIN, "20", "1,950.00", "43,680.00", "300,000.00", "0.00", APPR), DR("DR-5309", "2027-01-05", SIN, "20"), INV("INV-7120", "2027-01-05", "Dalisay Wholesale", "20", "1,950.00", "39,000.00", "4,680.00", "43,680.00")],
  "POST", None, "Every document agrees: the order is within the 300,000.00 credit limit and approved, the goods were delivered and signed for (20 sacks), and the invoice bills the same quantity at the list price. Record the sale (A/R, sales, output VAT) and the cost of the goods sold.", J_SALE("43,680.00", "39,000.00", "4,680.00", "30,400.00")),
 (2, "Credit sale: 65 sacks to Dalisay Wholesale", "2027-01-08", [SO("SO-3360", "2027-01-07", DAL, JAS, "65", "2,050.00", "149,240.00", "400,000.00", "0.00", APPR), DR("DR-5669", "2027-01-08", JAS, "65"), INV("INV-7196", "2027-01-08", "Dalisay Wholesale", "65", "2,050.00", "133,250.00", "15,990.00", "149,240.00")],
  "POST", None, "A clean three-document match: authorized order, signed delivery receipt and a matching invoice. Post it.", J_SALE("149,240.00", "133,250.00", "15,990.00", "104,650.00")),
 (3, "Credit sale: 60 sacks to Mang Tomas Grocery", "2027-01-11", [SO("SO-3745", "2027-01-10", MTG, JAS, "60", "2,050.00", "137,760.00", "110,000.00", "0.00", "(blank)"), DR("DR-5831", "2027-01-11", JAS, "60"), INV("INV-7591", "2027-01-11", "Mang Tomas Grocery", "60", "2,050.00", "123,000.00", "14,760.00", "137,760.00")],
  "HOLD", "CREDIT_LIMIT", "The order total of 137,760.00 is above the customer's 110,000.00 credit limit and the credit approval line is blank. Nobody authorized exceeding the limit, so the sale should be held for approval.", None),
 (4, "Credit sale: 50 sacks to Lucena Rice Mart", "2027-01-12", [SO("SO-3766", "2027-01-11", LUC, DIN, "50", "2,250.00", "126,000.00", "400,000.00", "0.00", APPR), ("Delivery receipt", [("DR no.", "—"), ("Status", "NOT ATTACHED: the warehouse could not find a signed delivery receipt for this order")]), INV("INV-7708", "2027-01-12", "Lucena Rice Mart", "50", "2,250.00", "112,500.00", "13,500.00", "126,000.00")],
  "HOLD", "NO_SHIPPING_NOTICE", "There is an invoice but no signed delivery receipt, so there is no proof that the 50 sacks left the warehouse. Revenue must not be recorded for goods that may not have been shipped.", None),
 (5, "Invoice INV-7094: 20 sacks to Bagong Silang Store", "2027-01-13", [SO("SO-3760", "2027-01-06", BSS, MAL, "20", "1,450.00", "32,480.00", "300,000.00", "0.00", APPR), DR("DR-5249", "2027-01-07", MAL, "20"), INV("INV-7094", "2027-01-13", "Bagong Silang Store", "20", "1,450.00", "29,000.00", "3,480.00", "32,480.00"), ("Invoice register extract", [("Invoice no.", "INV-7094"), ("Customer", "Bagong Silang Store"), ("Amount", "32,480.00"), ("Already posted on", "2027-01-07"), ("Status", "POSTED to the ledger")])],
  "HOLD", "DUP_INVOICE", "The register shows INV-7094 for 32,480.00 was already posted on January 7. This is the same invoice, billed again on January 13. Posting it would record the sale twice.", None),
 (6, "Credit sale: 70 sacks billed to Lucena Rice Mart", "2027-01-14", [SO("SO-3781", "2027-01-13", LUC, DIN, "70", "2,250.00", "176,400.00", "400,000.00", "0.00", APPR), DR("DR-5435", "2027-01-14", DIN, "60"), INV("INV-7328", "2027-01-14", "Lucena Rice Mart", "70", "2,250.00", "157,500.00", "18,900.00", "176,400.00")],
  "HOLD", "QTY_MISMATCH", "The delivery receipt shows 60 sacks delivered, but the invoice bills 70. Ten sacks are being billed that were never shipped.", None),
 (7, "Credit sale: 60 sacks to Bagong Silang Store", "2027-01-15", [SO("SO-3308", "2027-01-14", BSS, JAS, "60", "2,050.00", "147,840.00", "400,000.00", "0.00", APPR), DR("DR-5868", "2027-01-15", JAS, "60"), INV("INV-7676", "2027-01-15", "Bagong Silang Store", "60", "2,200.00", "132,000.00", "15,840.00", "147,840.00"), ("Approved price list", [("Item", JAS), ("Approved unit price", "2,050.00"), ("Effective", "2027-01-01")])],
  "HOLD", "PRICE_MISMATCH", "The invoice charges 2,200.00 per sack but the approved price list says 2,050.00. The customer is being overbilled and the price was not authorized.", None),
 (8, "Collection from Dalisay Wholesale", "2027-01-18", [("Official receipt", [("OR no.", "OR-2225"), ("Received from", "Dalisay Wholesale"), ("Amount", "98,009.00"), ("In payment of", "Invoice dated 2027-01-05"), ("Issued by", "Cashier R. Dizon")]), ("Bank deposit slip", [("Date", "2027-01-18"), ("Deposited to", "Sinag operating account"), ("Amount", "98,009.00"), ("Validated by bank", "Yes")]), ("Customer ledger card", [("Customer", "Dalisay Wholesale"), ("Balance before this payment", "98,009.00"), ("Payment applied", "98,009.00")])],
  "POST", None, "The receipt, the validated deposit slip and the customer's ledger card all show 98,009.00. Debit cash in bank and credit accounts receivable.", [("1000", "98,009.00", ""), ("1100", "", "98,009.00")]),
 (9, "Sales return: 3 sacks from Mang Tomas Grocery", "2027-01-20", [("Receiving report", [("RR no.", "RR-985"), ("Returned by", "Mang Tomas Grocery"), ("Item", MAL), ("Quantity received back", "3"), ("Condition", "Damaged in transit; inspected by the warehouse head")]), ("Credit memo", [("CM no.", "CM-838"), ("Customer", "Mang Tomas Grocery"), ("Quantity", "3"), ("Net", "4,350.00"), ("VAT 12%", "522.00"), ("Credit total", "4,872.00"), ("Approved by", "Sales manager L. Reyes (signed)")])],
  "POST", None, "The goods came back (receiving report) and an approved credit memo supports reducing the customer's balance by 4,872.00. Record the return and put the goods back into inventory at cost.", [("4010", "4,350.00", ""), ("2200", "522.00", ""), ("1100", "", "4,872.00"), ("1200", "3,390.00", ""), ("5000", "", "3,390.00")]),
 (10, "Sales return: 15 sacks from Lucena Rice Mart", "2027-01-21", [("Receiving report", [("RR no.", "RR-935"), ("Returned by", "Lucena Rice Mart"), ("Item", MAL), ("Quantity received back", "15")]), ("Credit memo", [("CM no.", "—"), ("Status", "NONE: the billing clerk prepared a journal entry to credit the customer 24,360.00 directly")])],
  "HOLD", "NO_CREDIT_MEMO", "A return reduces what the customer owes, so it needs a credit memo approved by the sales manager. There is none, only a request to credit 24,360.00 directly.", None),
 (11, "Credit sale: 50 sacks to Mang Tomas Grocery", "2027-01-31", [SO("SO-3684", "2027-01-28", MTG, DIN, "50", "2,250.00", "126,000.00", "400,000.00", "0.00", APPR), DR("DR-5506", "2027-02-02", DIN, "50"), INV("INV-7171", "2027-01-31", "Mang Tomas Grocery", "50", "2,250.00", "112,500.00", "13,500.00", "126,000.00")],
  "HOLD", "CUTOFF", "The goods were delivered on February 2, but the invoice is dated January 31 and would put the revenue in January. The sale belongs to the next period.", None),
 (12, "Credit sale: 45 sacks to Mang Tomas Grocery", "2027-01-26", [SO("SO-3512", "2027-01-25", MTG, SIN, "45", "1,950.00", "98,280.00", "350,000.00", "0.00", APPR), DR("DR-5322", "2027-01-26", SIN, "45"), INV("INV-7817", "2027-01-26", "Mang Tomas Grocery", "45", "1,950.00", "87,750.00", "10,530.00", "98,280.00", "M. Cruz (billing clerk)", "M. Cruz (billing clerk)")],
  "HOLD", "SOD", "M. Cruz both prepared and approved this invoice. One person should not be able to create and authorize the same sale.", None),
 (13, "Credit sale: 45 sacks to Bagong Silang Store", "2027-01-27", [SO("SO-3422", "2027-01-26", BSS, JAS, "45", "2,050.00", "103,320.00", "103,320.00", "0.00", APPR), DR("DR-5661", "2027-01-27", JAS, "45"), INV("INV-7460", "2027-01-27", "Bagong Silang Store", "45", "2,050.00", "92,250.00", "11,070.00", "103,320.00")],
  "POST", None, "The order total of 103,320.00 equals the credit limit exactly. It is within the limit, the credit manager approved it, and the delivery receipt and invoice match. This is a valid sale, so it should be posted, not held.", J_SALE("103,320.00", "92,250.00", "11,070.00", "72,450.00")),
]
CONTROLS = [("CREDIT_LIMIT", "Credit limit exceeded without authorization"), ("NO_SHIPPING_NOTICE", "Billed with no shipping notice"), ("NO_RECEIVING_REPORT", "Three-way match failed: no receiving report"), ("DUP_INVOICE", "Duplicate invoice"),
            ("PRICE_MISMATCH", "Price differs from the approved price list"), ("QTY_MISMATCH", "Quantity billed differs from quantity shipped"), ("SOD", "Segregation of duties violation"), ("NO_AUTHORIZATION", "Missing approval signature"),
            ("CUTOFF", "Cutoff error: recorded in the wrong period"), ("NO_CREDIT_MEMO", "Return without an approved credit memo"), ("UNAPPROVED_VENDOR", "Supplier not on the approved vendor list"), ("MATH_ERROR", "Arithmetic error on the document"),
            ("GHOST_EMPLOYEE", "Pay to a person who is not on the HR master file"), ("TERMINATED_PAID", "Pay to an employee who has left"), ("IMPLAUSIBLE_HOURS", "Hours claimed are not plausible"), ("UNAUTH_OVERTIME", "Overtime paid without an approved overtime slip"),
            ("UNAUTH_RATE", "Pay rate changed without an approved personnel action"), ("CAPEX_ERROR", "Capital and expense misclassified")]
CLABEL = dict(CONTROLS)
ACCT = dict(CHART)

# ============================================================== desk cards (from migrations 0076-0081)
SALES_CUST = [("Santos Trading", "250,000.00"), ("Dalisay Wholesale", "200,000.00"), ("Lucena Rice Mart", "120,000.00"), ("Mang Tomas Grocery", "60,000.00"), ("Kabisig Sari-sari", "50,000.00")]
ITEMS = [("RICE-P50", "Sinag Premium Rice, 50 kg sack", "2,050.00", "1,640.00", 400), ("RICE-R50", "Sinag Regular Rice, 50 kg sack", "1,850.00", "1,480.00", 600), ("RICE-B50", "Sinag Brown Rice, 50 kg sack", "2,300.00", "1,840.00", 120)]
SALES = [
 (1, "ORDER", "Santos Trading", "Premium", 40, 2050, "PO-4410", "2027-01-04", "Standing customer, pays in 30 days.", None, "A normal order inside the credit limit at the list price. Process it all the way to the bill."),
 (2, "ORDER", "Lucena Rice Mart", "Regular", 30, 1850, "PO-1187", "2027-01-05", "", None, "A normal order inside the credit limit at the list price."),
 (3, "ORDER", "Mang Tomas Grocery", "Premium", 50, 2050, "PO-0932", "2027-01-07", "The buyer phoned: \"Please rush it, I will settle the credit with you later.\"", "CREDIT_LIMIT", "The order is about 114,800 against a 60,000 credit limit. Only the credit manager, a different person, may release it. A rushed customer is not an authorization."),
 (4, "ORDER", "Dalisay Wholesale", "Brown", 25, 2100, "PO-7741", "2027-01-08", "The PO shows 2,100.00 a sack. The approved price list says 2,300.00.", "PRICE_MISMATCH", "The PO price is below the approved list price and no one authorized a discount. Billing at the lower price loses revenue; the price needs an authorized approval."),
 (5, "ORDER", "Kabisig Sari-sari", "Premium", 20, 2050, "PO-0215", "2027-01-09", "", None, "Inside the 50,000 limit on its own (45,920). Once billed and unpaid it uses most of the limit, which matters for the next card."),
 (6, "ORDER", "Kabisig Sari-sari", "Regular", 10, 1850, "PO-0219", "2027-01-11", "Small order. On its own it is far below the limit.", "CREDIT_LIMIT", "On its own the order (20,720) is small, but the customer still owes 45,920 from the earlier order, so the total (66,640) passes the 50,000 limit. The check must use the live balance, not just this order."),
 (7, "ORDER", "Santos Trading", "Premium", 40, 2050, "PO-4410", "2027-01-12", "The customer faxed its purchase order again, as a reminder.", "DUP_INVOICE", "The PO number is the same as card 1 (PO-4410): the same order sent twice. Processing it bills the customer twice for one delivery. Reject it as a duplicate."),
 (8, "RECEIPT", "Santos Trading", "", 0, 91840.00, "OR-5201", "2027-01-19", "Remittance advice: payment of the Santos Trading invoice in full.", None, "Apply the full payment to the Santos Trading invoice from card 1 (91,840.00)."),
 (9, "RECEIPT", "Lucena Rice Mart", "", 0, 30125.50, "OR-5202", "2027-01-21", "Remittance advice: partial payment on account.", None, "Apply the part payment (30,125.50) to the Lucena Rice Mart invoice from card 2; the rest stays on the customer's balance."),
]
LIST = {"Premium": (2050, 1640, "RICE-P50"), "Regular": (1850, 1480, "RICE-R50"), "Brown": (2300, 1840, "RICE-B50")}
PURCH = [
 (1, "PURCHASE", "Nueva Ecija Rice Mill", "Premium", "PO-A101", 200, 1640, "RR-3301", 200, "2027-01-06", "V-5521", 200, 1640, "2027-01-07", "Regular supplier. The purchase order, receiving report and invoice agree.", None, "All three documents agree on quantity and price, and the vendor is approved. Receive it, enter the invoice, run the match, and post it."),
 (2, "PURCHASE", "Tarlac Grain Co.", "Regular", "PO-A102", 300, 1480, "RR-3302", 300, "2027-01-08", "V-2207", 300, 1480, "2027-01-09", "", None, "All three documents agree. A clean purchase."),
 (3, "PURCHASE", "Nueva Ecija Rice Mill", "Brown", "PO-A103", 100, 1840, "RR-3303", 100, "2027-01-10", "V-5530", 100, 1980, "2027-01-11", "The invoice price is higher than the price on the purchase order.", "PRICE_MISMATCH", "The vendor billed 1,980.00 a sack against the 1,840.00 agreed on the purchase order, so 14,000 would be overpaid. Pay the purchase order price: have the vendor correct the invoice, do not just accept it."),
 (4, "PURCHASE", "Tarlac Grain Co.", "Regular", "PO-A104", 150, 1480, "RR-3304", 120, "2027-01-12", "V-2214", 150, 1480, "2027-01-13", "The receiving report counted fewer sacks than the invoice bills.", "QTY_MISMATCH", "The warehouse received 120 sacks but the invoice bills 150. You pay only for what arrived: 30 sacks (44,400 before VAT) would be paid for goods that were never delivered."),
 (5, "PURCHASE", "Mindoro Farm Coop", "Premium", "PO-A105", 80, 1640, None, None, None, "V-0091", 80, 1640, "2027-01-14", "There is a purchase order and an invoice, but the receiving report is not attached.", "NO_RECEIVING_REPORT", "No receiving report means no proof the rice arrived. Without it the invoice must not be paid: ask the warehouse whether the goods were actually received."),
 (6, "PURCHASE", "Golden Harvest Trading (NOT on the approved vendor list)", "Premium", "— none —", None, None, None, None, None, "V-0310", 60, 1500, "2027-01-15", "A new supplier offers a low price. There is no purchase order and the supplier is not on the approved vendor list.", "UNAPPROVED_VENDOR", "The vendor is not on the approved list and nobody issued a purchase order. This is how fictitious or kickback suppliers get paid. It needs vendor approval and a purchase order first."),
 (7, "PURCHASE", "Nueva Ecija Rice Mill", "Premium", "PO-A101", 200, 1640, "RR-3301", 200, "2027-01-06", "V-5521", 200, 1640, "2027-01-16", "A copy of the vendor invoice arrived again by email, marked \"second notice\".", "DUP_INVOICE", "Invoice V-5521 and purchase order PO-A101 are the same as card 1: a duplicate. Posting it would pay the same 200 sacks twice. Reject it."),
 (8, "PAYMENT", "Nueva Ecija Rice Mill", "", "CHK-8801", None, None, None, None, None, "", None, None, "2027-01-23", "Payment voucher: pay Nueva Ecija Rice Mill invoice V-5521 in full (367,360.00).", None, "Pay invoice V-5521 from card 1 in full (367,360.00)."),
 (9, "PAYMENT", "Tarlac Grain Co.", "", "CHK-8802", None, None, None, None, None, "", None, None, "2027-01-24", "Payment voucher: pay Tarlac Grain Co. invoice V-2207 in full (497,280.00).", None, "Pay invoice V-2207 from card 2 in full (497,280.00)."),
]
EMP = [("E-01", "Maria Reyes", 30000, "Active"), ("E-02", "Jose Santos", 28000, "Active"), ("E-03", "Ana Dizon", 35000, "Active"), ("E-04", "Paolo Lim", 25000, "Active"), ("E-05", "Liza Cruz", 40000, "Active"), ("E-06", "Ramon Mendoza", 32000, "Resigned (December)"), ("E-07", "Grace Tan", 26000, "Active")]
PAY = [
 (1, "TIME", "Maria Reyes", "160 regular hours. Approved timecard, signed by the supervisor.", None, "A normal timecard for an employee on file."),
 (2, "TIME", "Jose Santos", "160 regular hours.", None, "A normal timecard."),
 (3, "TIME", "Ana Dizon", "160 regular hours, 10 overtime hours. An approved overtime slip is stapled to the card.", None, "Overtime with an approved overtime slip is paid at 125%. Nothing is wrong here."),
 (4, "TIME", "Paolo Lim", "160 regular hours, 45 overtime hours. There is no overtime slip with the card.", "UNAUTH_OVERTIME", "45 hours of overtime with no approved overtime slip. Overtime is paid only when a manager approved it in advance; without the slip the extra pay is unauthorized."),
 (5, "RATE_CHANGE", "Liza Cruz", "The department head asks for Liza Cruz's pay to go from 40,000 to 62,000 a month. There is no personnel action form.", "UNAUTH_RATE", "A 55% raise with no approved personnel action form. Pay rates change only through an approved form from HR, otherwise anyone could raise their own pay."),
 (6, "TIME", "Liza Cruz", "160 regular hours. Her normal timecard for the month.", None, "A normal timecard. Its pay depends on what you did with the rate change on card 5."),
 (7, "TIME", "R. Villar", "160 regular hours. A timecard signed by the warehouse supervisor. Nobody in HR has a file for this name.", "GHOST_EMPLOYEE", "There is no HR record for this person: a possible ghost employee. Pay goes only to people on the HR master file, who have been hired through HR, and never on a supervisor's word alone."),
 (8, "TIME", "Ramon Mendoza", "160 regular hours. A full-month timecard submitted by his old supervisor.", "TERMINATED_PAID", "Ramon Mendoza resigned in December and is marked inactive in the HR file. Paying a full month to someone who has left is a classic payroll fraud."),
 (9, "TIME", "Grace Tan", "310 regular hours in one month.", "IMPLAUSIBLE_HOURS", "There are only about 720 hours in a month and a normal month is around 160. 310 regular hours is not plausible and needs the supervisor to correct or explain it before anyone is paid for it."),
 (10, "RUN", "January 2027 payroll", "When every card above is decided: post the payroll vouchers, then pay the net pay.", None, "Post the vouchers once every card is decided, then pay the net pay."),
]
FA = [
 (1, "INVOICE", "Delivery truck", "Isuzu Cabanatuan", "FA-A-1101", "2027-01-04", 1250000, "A new delivery truck for the business. It will last about five years.", "CAPITALIZE", "A truck is used for years and costs far above the 15,000 policy limit: capitalize it and depreciate it over its life."),
 (2, "INVOICE", "Three office laptops", "PC Express", "FA-A-1102", "2027-01-06", 135000, "Three laptops, 45,000 each, for the office staff. They will be used for about three years.", "CAPITALIZE", "Each laptop (45,000) is above the 15,000 policy limit and lasts several years: capitalize."),
 (3, "INVOICE", "Stapler, folders and two office chairs", "National Book Store", "FA-A-1103", "2027-01-11", 3200, "Small office items.", "EXPENSE", "The whole purchase is only 3,200, well under the 15,000 policy limit: expense it."),
 (4, "INVOICE", "Forklift annual service and repairs", "Hi-Lift Services", "FA-A-1104", "2027-01-13", 85000, "Oil, filters, new tyres and a hydraulic hose on the old forklift. The forklift does not last any longer or work any better afterwards.", "EXPENSE", "Routine repairs and servicing keep an asset running; they do not add an asset or extend its life. Even at 85,000 they are an expense. Capitalizing them overstates assets and profit."),
 (5, "INVOICE", "Warehouse extension", "Luzon Builders", "FA-A-1105", "2027-01-18", 600000, "A new storage room built onto the warehouse. It adds floor space and will stand for about twenty years.", "CAPITALIZE", "It adds a lasting asset (more floor space for twenty years): capitalize. Expensing it would understate assets and profit this month."),
]
AR_PAPER = D("8032265.70")

def sales_calc(c):
    seq, kind, cust, item, q, price, ref, d, note, trap, why = c
    net = r2(q * price); vat = r2(net * D("0.12")); cost = r2(q * LIST[item][1])
    return net, vat, net + vat, cost
def purch_calc(c):
    seq, kind, vendor, item, ref, pq, pp, rrn, rrq, rrd, ino, iq, ip, d, note, trap, why = c
    net = r2(iq * ip); vat = r2(net * D("0.12")); return net, vat, net + vat
def pay_calc(gross):
    gross = r2(gross); sss_ee = min(D(1350), r2(gross * D("0.045"))); sss_er = min(D(2850), r2(gross * D("0.095"))); ph = r2(gross * D("0.025")); pag = D(100)
    taxable = gross - sss_ee - ph - pag; wht = r2(max(D(0), taxable - D(20833)) * D("0.15"))
    return dict(gross=gross, sss_ee=sss_ee, sss_er=sss_er, ph=ph, pag=pag, wht=wht, er_total=sss_er + ph + pag, net=gross - sss_ee - ph - pag - wht)
def pay_gross(ot_hours, rate): return r2(D(rate) + D(ot_hours) * (D(rate) / D(160)) * D("1.25"))

# ============================================================== 1. STUDENT HANDOUT
def build_handout():
    ch = []
    ch.append(chap(1, "WELCOME", "What the AIS edition is for",
      "AIS stands for <b>Accounting Information System</b>. In this edition you do not only record transactions: you process them under controls, and then you audit them. The same company's books are used by both jobs, so what one seat does, the other seat tests.",
      what("an accounting information system", "A system of people, documents, rules and software that captures business events (a sale, a purchase, a payday), checks them against <b>controls</b>, and turns them into the records and statements managers and auditors rely on. A good system does not only add up numbers. It makes sure the right things are recorded, once, in the right period, with the right approval.") +
      "<h3>Two seats</h3>" + table(["Seat", "Your job", "You are graded on"], [
        ["<b>Accounting</b>", "Process the company's transactions. Review document packets and decide to post or hold; work the Sales, Purchases, Payroll, Fixed assets and Close desks.", "Posting valid items correctly and stopping the ones that fail a control."],
        ["<b>Audit</b>", "After the Accounting phase closes, test the posted books: run analytic tests, draw samples, keep workpapers, report findings, reverse entries that should not stand.", "Finding the problems that were hidden in the books, reporting them with the right type, and not accusing items that are fine."]]) +
      "<h3>How the two seats fit together</h3>" + bullets([
        "The <b>Accounting phase</b> comes first. Your teacher or your partner closes it. Once closed, the books are locked through the lock date and nobody can post into that period again.",
        "Then the <b>Audit phase</b> opens. The auditor tests what the accountant posted. Anything the accountant released wrongly is a hidden problem for the auditor to find.",
        "Your teacher may put one student on each seat (a pair) or one student on both. Working in a pair is the better practice, because the auditor really is independent of the person who recorded the transactions."]) +
      tip("Everything in this edition is practice. Mistakes are how you learn what each control is for. Read the explanation after every decision, especially the ones you got wrong."), first=True))
    ch.append(chap(2, "GETTING STARTED", "Signing in and finding your way",
      "You use the same Classroom ERP site as the other editions. After you sign in you choose the AIS edition and your company.",
      steps(["Open <b>classroom-erp.vercel.app</b> and sign in with the school email your teacher gave you.", "On the chooser page pick the violet <b>AIS</b> card. If it is greyed out, your teacher has not opened the edition yet.", "If you belong to more than one company, use the company name at the top of the left menu to switch. Inside AIS the list shows only AIS companies.", "Your menu shows the pages for the seat you hold. <b>Accounting</b> sees Document inbox, General ledger, and the five desks. <b>Audit</b> sees Audit room. Everyone sees Workspace and Messages."]) +
      shot("workspace", "The Workspace page: your company, your seat or seats, the practice set and its progress, and who else is in the company. Your screen shows your own company's name.") + "<h3>The left menu</h3>" + table(["Page", "Seat", "What it is"], [
        ["Workspace", "Both", "Your starting page: the company, your seat, and where you are in the round."],
        ["Document inbox", "Accounting", "Thirteen document packets to review. Post or hold each one."],
        ["Sales desk", "Accounting", "The revenue cycle: customer orders, credit check, shipping, billing, cash received."],
        ["Purchases desk", "Accounting", "The expenditure cycle: receiving, vendor invoices, three-way match, payables, payments."],
        ["Payroll desk", "Accounting", "Timecards and pay changes, checks against the HR file, payroll vouchers, net pay."],
        ["Fixed assets desk", "Accounting", "Capital or expense, depreciation, and the sale of an old asset."],
        ["Close and statements", "Accounting", "Adjusting entries, closing entries, trial balance, income statement, balance sheet."],
        ["General ledger", "Accounting", "Every journal entry posted in the company, with search."],
        ["Audit room", "Audit", "Ledger, Tests, Sampling, Workpapers, Findings, Close the audit."]]) +
      shot("ledger", "The General ledger: the trial balance at the top, then every journal entry with its lines. Entries cannot be edited or deleted; a mistake is corrected with a reversing entry.") + "<h3>Practice round or graded round</h3>" + table(["", "Practice round", "Graded round"], [
        ["Wrong journal on a valid document", "Refused, with a hint after two refusals. Each refusal costs a point.", "Posts exactly as you entered it. No second chance."],
        ["Do you see points?", "Yes, straight away.", "No. Points appear only when the Accounting phase closes."],
        ["Use it for", "Learning.", "Assessment."]]) +
      warn("Your teacher chooses the mode when the practice set is assigned. The desks follow the same rule for showing your score.")))
    ch.append(chap(3, "ACCOUNTING SEAT", "The Document inbox",
      "Thirteen packets of paper documents from Sinag Rice Trading Co. for January 2027. For each packet you decide: <b>post</b> it (with the correct journal entry) or <b>hold</b> it (naming the control that failed).",
      "<h3>How to work a packet</h3>" + steps(["Open <b>Document inbox</b> and click a packet, or press <b>Review the next document</b>.", "Read <b>every page</b> of the packet. Compare the sales order, the delivery receipt and the invoice line by line: customer, quantities, prices, dates, approvals.", "If everything agrees and is authorized, choose <b>Post</b> and key the journal entry: pick an account, enter the debit or credit, until debits equal credits.", "If something fails a control, choose <b>Hold</b> and pick the control that failed from the list (grouped by Hall's categories).", "Press the decision button. In a practice round you learn the result at once; read the explanation."]) +
      shot("inbox", "The Document inbox: thirteen packets, each waiting for your decision. The progress bar and the Decided counter show how far you are.") + shot("packet", "A document packet. Read every page on the left, then make your decision on the right: Post it to the ledger, or Hold it because a control failed.") + "<h3>What to look for</h3>" + table(["Control", "Ask yourself"], [
        ["Authorization", "Did the right person approve it? Is the credit limit respected? Is the approval line signed?"],
        ["Existence", "Is there proof the goods really shipped (a signed delivery receipt)?"],
        ["Accuracy", "Do quantities and prices on the invoice agree with the delivery receipt and the price list?"],
        ["Completeness and validity", "Is this invoice already in the books (a duplicate)?"],
        ["Timing (cutoff)", "Does the delivery date belong in the period the invoice is dated in?"],
        ["Segregation of duties", "Did one person both prepare and approve it?"],
        ["Returns", "Is there an approved credit memo before the customer's balance is reduced?"]]) +
      what("a journal entry for a credit sale", "When a sale is on credit you record <b>three</b> things at once: the receivable you will collect (debit Accounts Receivable for the total), the sale itself (credit Sales Revenue for the amount before tax), and the VAT you owe the government (credit VAT Payable). You also record the cost of what you handed over: debit Cost of Goods Sold and credit Merchandise Inventory at what the rice cost you.") +
      tip("A packet can look perfect except for one small thing. One packet is a valid sale that sits exactly on the credit limit. Holding a valid sale is also a mistake.")))
    ch.append(chap(4, "ACCOUNTING SEAT", "The Sales desk (revenue cycle)", "Nine customer cards for January 2027. You work them in order, and each step you take posts a real entry to the ledger.",
      "<h3>The steps for a purchase order card</h3>" + steps(["<b>Enter the order</b>: copy the customer, item, quantity and unit price from the customer's purchase order into the form.", "<b>Run the credit check</b>: the system adds up what the customer already owes, plus anything shipped but not billed, plus this order, and compares it to the credit limit. It also compares your price to the price list.", "If the check <b>holds</b> the order, decide: <b>approve</b> it (you must write a reason) or <b>reject</b> it (also with a reason).", "<b>Ship</b>: the system posts the cost of the goods (debit Cost of Goods Sold, credit Inventory) and lowers stock.", "<b>Bill the customer</b>: the system posts the receivable, the sale and the VAT, and numbers the invoice."]) +
      shot("sales", "The Sales desk: nine customer cards. The action button on each card shows the next step you may take.") + "<h3>For a remittance advice card</h3>" + steps(["Press <b>Record the cash</b>.", "Choose the invoice the customer is paying and enter the amount actually received.", "The system posts debit Cash in Bank, credit Accounts Receivable, and reduces the customer's balance."]) +
      what("a credit check", "Before you ship goods on credit you check that the customer can be trusted with more credit. The test is: <b>what they already owe, plus this new order, must not be above their credit limit</b>. The key word is <i>already owe</i>. A small order can still be too much if the customer has a large unpaid balance.") +
      what("segregation of duties", "No single person should be able to start, approve and complete a transaction. In this desk the person who entered an order cannot approve its exception unless the company allows solo work. If you approve your own exception, the books mark it as a self-approval, and an auditor will look for exactly that.") +
      "<h3>The system will refuse</h3>" + bullets(["Shipping before the credit check, or while the order is held.", "Shipping more than you have in stock.", "Billing before shipping (the revenue would not be earned yet).", "Entering an order whose price or quantity is not what the purchase order says.", "Collecting more than a customer owes."]) +
      warn("The system does not refuse everything. It holds an order that is over the limit or at the wrong price, but it will not stop you approving it. It does not flag a duplicate purchase order at all. Stopping a bad order is worth as many points as processing a good one, and an order you never opened scores nothing.")))
    ch.append(chap(5, "ACCOUNTING SEAT", "The Purchases desk (expenditure cycle)", "Nine vendor cards. Seven are purchase packets (purchase order, receiving report and vendor invoice) and two are payment vouchers.",
      "<h3>The steps for a purchase packet</h3>" + steps(["<b>Record the receipt</b>: copy the quantity the warehouse counted on the receiving report. The system posts debit Inventory and credit GR/IR (goods received, invoice not yet received) and raises stock.", "<b>Enter the vendor invoice</b> exactly as it is printed: invoice number, quantity billed, unit price.", "<b>Run the three-way match</b>: the system compares the purchase order, the receiving report and the invoice, and checks that the vendor is on the approved list.", "If the match <b>holds</b> the invoice, <b>approve</b> or <b>reject</b> it with a written reason.", "<b>Post to payables</b>: the system clears GR/IR for what was received, books the input VAT, books any price or quantity difference to Purchase Discounts and Adjustments, and credits Accounts Payable."]) +
      shot("purchases", "The Purchases desk: for each purchase packet the purchase order, the receiving report and the vendor invoice are shown side by side, so you can compare quantity and price before you start. Amber figures are the invoice figures to check.") + "<h3>For a payment voucher</h3>" + steps(["Press <b>Pay the vendor</b>.", "Choose the posted invoice and enter the authorized amount.", "The system posts debit Accounts Payable, credit Cash in Bank."]) +
      what("the three-way match", "Before you pay a supplier you check that three independent documents agree: <b>what you ordered</b> (purchase order), <b>what actually arrived</b> (receiving report), and <b>what the supplier is charging</b> (invoice). If the invoice bills more than arrived, or at a higher price than agreed, you are about to overpay. If there is no receiving report, you cannot be sure the goods came at all.") +
      what("GR/IR", "<b>Goods Received / Invoice Received</b> is a temporary liability account. When goods arrive before the invoice, you owe for them but do not yet have the supplier's bill. GR/IR holds that obligation until the invoice arrives and clears it into Accounts Payable.") +
      tip("Never pay for more than arrived, at more than was agreed, to a vendor nobody approved, or twice.")))
    ch.append(chap(6, "ACCOUNTING SEAT", "The Payroll desk", "Ten cards for the January 2027 payroll: timecards, a pay-rate change request, and the payroll run.",
      "<h3>The steps</h3>" + steps(["For each timecard or rate change press <b>Check against the HR file</b>. The system checks that the person is on the HR master file, still employed, that the hours are possible, that overtime has an approved slip, and that a pay-rate change has an approved personnel action form.", "If the check holds a card, <b>approve</b> or <b>reject</b> it with a written reason. A rejected card goes back to the supervisor and is not paid in this run.", "When every card is decided, <b>post the payroll</b>: the system makes one voucher per employee.", "Then <b>pay the net pay</b>: debit Accrued Expenses (net pay payable), credit Cash in Bank."]) +
      shot("payroll", "The Payroll desk: each timecard or pay-rate change is checked against the HR file. A card the check holds must be approved or rejected with a written reason.") + what("a payroll voucher", "For each employee, the pay is more than one number. <b>Gross pay</b> is the expense. From it the company holds back the employee's SSS, PhilHealth and Pag-IBIG contributions and withholding tax (all liabilities to pay to the government), and the rest is <b>net pay</b>. The company also owes its own <b>employer share</b> of the contributions, which is another expense. The voucher records all of that in one balanced entry.") +
      what("a ghost employee", "A name on the payroll that does not belong to a real, currently working person. Someone inside the company creates or keeps the name and collects the pay. The main defense is simple: pay only people who are on the HR master file, and keep HR separate from the people who approve timecards.") +
      warn("Contribution and tax rates in this desk are simplified classroom rates, not the legal tables.")))
    ch.append(chap(7, "ACCOUNTING SEAT", "The Fixed assets desk", "Five vendor invoices to classify, then the January depreciation, then the sale of an old forklift.",
      "<h3>Company policy</h3>" + bullets(["Spend <b>above 15,000</b> that <b>adds an asset or makes it last longer</b> is <b>capitalized</b>: put on the register and depreciated.", "Routine repairs, servicing and small items are <b>expensed</b> this month."]) +
      "<h3>The steps</h3>" + steps(["For each of the five invoices press <b>Capitalize</b> or <b>Expense</b>. The system posts exactly what you chose.", "When all five are decided, <b>run January depreciation</b>: the system computes straight-line depreciation for every asset in service by the 15th.", "Then <b>record the sale</b> of the old forklift. The system removes its cost and accumulated depreciation and records the gain."]) +
      shot("assets", "The Fixed assets desk: choose Capitalize or Expense for each invoice. The register of assets sits below the cards.") + what("capitalizing", "Recording a cost as an <b>asset</b> instead of an expense because it will help the business for several years. Its cost is then spread over its useful life as depreciation. If you expense something that should be capitalized, this month's profit is too low. If you capitalize a repair, assets and profit are too high.") +
      what("straight-line depreciation", "Cost, less any salvage value, divided by the number of months of useful life. A 1,250,000 truck with a 60-month life loses 20,833.33 of book value every month. The charge is debit Depreciation Expense, credit Accumulated Depreciation.") +
      tip("You cannot run depreciation until every invoice is decided, and you cannot record the sale until depreciation is run. Both rules exist so the register is up to date.")))
    ch.append(chap(8, "ACCOUNTING SEAT", "Closing the books and reading the statements", "The last job of the period: two adjusting entries, the closing entries, and then you read the financial statements.",
      "<h3>The steps</h3>" + steps(["<b>Allowance for doubtful accounts</b>: policy is that 2% of the receivable balance at month end will not be collected. Work out 2% of the balance on the screen, to the centavo, and enter it. The system refuses a wrong figure and does not tell you the right one.", "<b>Accrued electricity</b>: the January bill of 18,000 arrives in February. Decide to <b>accrue</b> it in January or <b>skip</b> it.", "<b>Closing entries</b>: once both adjustments are in, the system closes revenue and expenses to the owner's equity account."]) +
      shot("close", "Close and statements: the three period-end steps at the top, and the trial balance and income statement updating below as you work.") + "<h3>Reading the statements</h3>" + bullets(["The <b>trial balance</b> must have equal debit and credit totals.", "The <b>income statement</b> shows revenue minus expenses: net income.", "The <b>balance sheet</b> must balance: assets equal liabilities plus equity. Before closing, the period's net income appears as a separate line in equity. After closing it is inside the equity account."]) +
      what("an adjusting entry", "At the end of a period some things have changed even though no document arrived: an expense was used but not billed yet, or an asset is worth less than the books say. An adjusting entry brings the books up to date so the statements tell the truth for that period.") +
      what("accrual accounting", "You record expenses in the period they are <b>used</b> and revenue in the period it is <b>earned</b>, not when cash moves. January's electricity belongs in January even if the bill comes in February.") +
      tip("Watch the statements change after each step. That is the point of doing the steps in order.")))
    ch.append(chap(9, "AUDIT SEAT", "The Audit room",
      "After the Accounting phase closes, the audit starts. The books are locked through the lock date. Your job is to test what was posted, document your work, report what is wrong, and reverse entries that should not stand. Hidden problems have been planted in the ledger: find as many as you can, and report only what you can support.",
      "<h3>The six tabs</h3>" + table(["Tab", "What you do there"], [
        ["Ledger", "Search every entry. Open an entry to see its lines. Use <b>Vouch</b> to see the supporting documents for desk entries. Use <b>Report</b> to start a finding."],
        ["Tests", "Run analytic tests over the whole population: duplicates, round amounts, weekend postings, after-hours postings, amounts just below the approval limit, gaps in invoice numbers, and the Benford first-digit test."],
        ["Sampling", "Draw a random sample or a monetary-unit sample, vouch each item, mark it Pass or Exception (with a note)."],
        ["Workpapers", "Write down your objective, what you did, and your conclusion. Link a sample. <b>Sign</b> it when complete: a signed workpaper is frozen."],
        ["Findings", "Report each problem with its condition, criteria, cause, effect and recommendation. Reverse the wrongly posted entry from here."],
        ["Close the audit", "End your work and reveal what was planted and how you did."]]) +
      shot("audit-ledger", "The Audit room opens on the ledger. The six tabs run across the top. Use Report on any entry to start a finding.") + shot("audit-tests", "Running a test: the weekend-postings test flags four of 303 entries and says why. A flag is a lead, not a conclusion.") + what("an analytic test", "A scan of <b>every</b> entry for a pattern that often means trouble. It does not prove fraud or error. It gives you a short list of entries worth looking at. Examples: the same amount billed to the same customer twice within a week; amounts that are exactly round; entries posted on a Saturday night; amounts just under the limit where approval is needed.") +
      what("Benford's law", "In natural business numbers the first digit is not evenly spread: about 30% start with 1 and fewer than 5% start with 9. If the first digits of a population are too even, or too heavy on one digit, someone may have invented numbers. The test reports a <b>mean absolute deviation</b>: the smaller, the more natural the numbers.") +
      shot("audit-sampling", "Sampling: choose a method and a sample size (or a seed, so the same sample can be drawn again), then vouch each item and mark it Pass or Exception.") + shot("audit-finding", "Reporting a finding: choose the type of exception, then write the condition, criteria, cause, effect and recommendation.") + what("a finding", "A reported problem written so that someone else can act on it: the <b>condition</b> (what you found), the <b>criteria</b> (what it should have been), the <b>cause</b>, the <b>effect</b>, and your <b>recommendation</b>. You also choose the finding type from the list.") +
      "<h3>Reversing an entry</h3><p>You cannot change a posted entry, and the period is closed. To make a wrong entry not stand, post an equal and opposite entry dated <b>after</b> the lock date, with a reason of at least ten characters. Both stay in the ledger.</p>" +
      "<h3>How you are scored</h3>" + bullets(["<b>6 points</b> for each planted problem you find and report with the right type; <b>3</b> if you pointed at the right entry but chose the wrong type; <b>+2</b> if you also reversed it.", "<b>−2</b> for each finding on an entry that was fine (a false accusation).", "A test result is a lead, not a conclusion: always look at the entry before you report it."]) +
      warn("Some entries look odd but are normal. A round-amount cash receipt, for example, is not always a problem. Vouch before you report.")))
    ch.append(chap(10, "REFERENCE", "Glossary and chart of accounts",
      "Short definitions for the words you will meet, and the accounts you will use.",
      table(["Term", "Meaning"], [
        ["Control", "A rule or check that stops or catches an error or fraud."],
        ["Authorization", "Approval by the right person before something happens."],
        ["Cutoff", "Putting a transaction in the right period."],
        ["Duplicate", "The same transaction recorded twice."],
        ["Segregation of duties (SoD)", "Different people for starting, approving, recording and holding assets."],
        ["Credit memo", "A document reducing what a customer owes, usually for returned goods."],
        ["Receiving report", "The warehouse's record of what actually arrived."],
        ["Three-way match", "Purchase order, receiving report and invoice agree before payment."],
        ["Accrual", "Recording an expense or revenue before cash moves, because it belongs to the period."],
        ["Allowance for doubtful accounts", "A reserve that lowers receivables for amounts unlikely to be collected."],
        ["Planted exception", "A problem hidden in the books on purpose, for the auditor to find."],
        ["Workpaper", "The auditor's record of work done, conclusions and evidence."],
        ["Sample", "A part of a population examined in place of all of it."],
        ["Reversal", "An equal and opposite entry that cancels a wrong one."]]) + "<h3>Chart of accounts</h3>" + chart_table()))
    names = ["What the AIS edition is for", "Signing in and finding your way", "The Document inbox", "The Sales desk", "The Purchases desk", "The Payroll desk", "The Fixed assets desk", "Closing the books and reading the statements", "The Audit room", "Glossary and chart of accounts"]
    body = cover("STUDENT HANDOUT", "Working in the<br>AIS Edition", "A guide to the Accounting seat and the Audit seat: how to process a company's transactions under controls, and how to test them afterwards.", "For students. Keep this beside you while you work. Your teacher will tell you which company, which practice set, and which round (practice or graded) you are in.") + toc(names) + "".join(ch)
    return page("AIS Edition: Student Handout", body)

# ============================================================== 2. PRACTICE SET (paper version)
def jtable(n=6):
    return '<table><thead><tr><th>Account code</th><th>Account name</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>' + "".join("<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>" for _ in range(n)) + "</tbody></table>"
def control_list():
    return "".join(f'<span style="display:inline-block;width:49%;font-size:9pt"><span class="box"></span>{esc(l)}</span>' for _, l in CONTROLS[:12])
def build_practice():
    out = [cover("PRACTICE SET", "Sinag Rice Trading Co.<br>January 2027", "A paper practice set for the AIS edition: thirteen document packets, then the Sales, Purchases, Payroll, Fixed assets and period-end close exercises. Work in pencil. Answer sheets are on the pages after each part.", "Name: ____________________________ &nbsp; Section: __________ &nbsp; Date: ____________<br><br>This is the <b>paper version</b>. The on-screen set generates its own figures for each company, so the numbers there will differ. The method, the controls and the traps are the same.")]
    out.append(toc(["How to use this practice set", "Part A: Document packets (13)", "Part B: Sales desk cards (9)", "Part C: Purchases desk cards (9)", "Part D: Payroll cards (10)", "Part E: Fixed assets (7)", "Part F: Period-end close", "Part G: Audit exercise forms", "Chart of accounts"]))
    out.append(chap(1, "INSTRUCTIONS", "How to use this practice set", "The company is Sinag Rice Trading Co., a rice wholesaler. The period is January 2027. VAT is 12%. Approved list prices and credit limits are given where you need them.",
      steps(["Read each part's instructions before you start.", "For every item decide what the company should do. Write your decision and, where asked, the journal entry or the control that failed.", "Use the chart of accounts at the end for account codes.", "When you finish a part, hand in the answer sheet. Your teacher marks it against the key.", "Marks: <b>6 points per item</b> in every part. Stopping a bad item you worked is worth the same as processing a good one."]) +
      tip("Do not look for a pattern in how many items are good or bad. Real documents are not arranged for you.") + chart_table(), first=True))
    a = ["<p>Each packet contains the documents the Accounting seat sees on screen. For each packet decide <b>POST</b> or <b>HOLD</b>. If POST, write the journal entry. If HOLD, tick the one control that failed.</p>"]
    for seq, title, d, docs, dec, ctrl, expl, jr in DOCS:
        a.append(f'<div class="card"><div class="ct">Packet {seq}: {esc(title)}</div><div class="meta">Dated {d}</div>' + "".join(docbox(t, f) for t, f in docs) + '</div>')
    out.append(chap(2, "PART A", "Document packets", "Thirteen packets. Read every document in a packet before you decide.", "".join(a)))
    sh = ['<p class="small">For each packet: circle POST or HOLD. If POST, fill the journal. If HOLD, tick the failed control. One line to explain your reason.</p>']
    for seq, title, d, docs, dec, ctrl, expl, jr in DOCS:
        sh.append(f'<div class="card"><div class="ct">Packet {seq}: {esc(title)}</div><div class="ans"><b>Decision:</b> &nbsp; POST &nbsp;&nbsp; / &nbsp;&nbsp; HOLD</div>' + jtable(5) + '<div class="small" style="margin-top:4px">If HOLD, which control failed? (tick one)</div>' + control_list() + '<div class="small" style="margin-top:6px">Why?</div>' + lines(1) + '</div>')
    out.append(f'<section class="sheet"><div class="tag">PART A · ANSWER SHEET</div><h2 class="t">Document packets: answers</h2>{"".join(sh)}</section>')
    cust = table(["Customer", "Credit limit"], [[c, l] for c, l in SALES_CUST], right=(1,)) + table(["SKU", "Item", "List price", "Cost", "In stock"], [list(map(str, i)) for i in ITEMS], right=(2, 3, 4))
    b = ["<p><b>How the desk works.</b> For every purchase order card: enter it, run the credit check (what the customer already owes + shipped but not billed + this order, against the limit; and the unit price against the list), approve or reject anything held, ship, bill. For every remittance: record the cash. The customers start with <b>no balance</b>; balances come from the cards you bill, in order. VAT is 12% of the net amount.</p>", cust,
         warn("A card you reject is not shipped or billed. A card you approve despite a hold must be approved by a person other than the one who entered it. Write who approved it.")]
    for c in SALES:
        seq, kind, cu, it, q, price, ref, d, note, trap, why = c
        body = f'<b>{esc(cu)}</b> orders <b>{q}</b> × Sinag {it} Rice, 50 kg sack at <b>{m(price)}</b> each.' if kind == "ORDER" else f'<b>{esc(cu)}</b> remits <b>{m(price)}</b>.'
        b.append(f'<div class="card"><div class="ct">Card {seq}: {"Purchase order" if kind == "ORDER" else "Remittance advice"} {esc(ref)}</div><div class="meta">Dated {d}</div><p>{body}</p>{("<p><i>" + esc(note) + "</i></p>") if note else ""}</div>')
    out.append(chap(3, "PART B", "Sales desk cards", "Nine customer cards. Work them in order.", "".join(b)))
    bs = ['<p class="small">For each card write what you did and the numbers.</p>']
    for c in SALES:
        seq, kind, cu, it, q, price, ref, d, note, trap, why = c
        if kind == "ORDER":
            bs.append(f'<div class="card"><div class="ct">Card {seq}: {esc(ref)} {esc(cu)}</div><div class="ans">Net ________ VAT ________ Total ________ &nbsp;&nbsp; Customer already owes ________ &nbsp; Exposure after this order ________<br>Credit check: &nbsp; PASS &nbsp; / &nbsp; HOLD &nbsp;&nbsp;&nbsp; Price ok? &nbsp; YES &nbsp; / &nbsp; NO<br>Your action: &nbsp; Shipped and billed &nbsp; / &nbsp; Approved by ________ &nbsp; / &nbsp; Rejected</div><div class="small">Reason (always for approve or reject):</div>{lines(1)}</div>')
        else:
            bs.append(f'<div class="card"><div class="ct">Card {seq}: {esc(ref)} {esc(cu)}</div><div class="ans">Invoice paid: ________ &nbsp; Amount ________ &nbsp; Balance of that invoice after ________ &nbsp; Entry: Dr ________ Cr ________</div></div>')
    out.append(f'<section class="sheet"><div class="tag">PART B · ANSWER SHEET</div><h2 class="t">Sales desk: answers</h2>{"".join(bs)}</section>')
    vend = table(["Vendor", "On the approved vendor list?"], [["Nueva Ecija Rice Mill", "Yes"], ["Tarlac Grain Co.", "Yes"], ["Mindoro Farm Coop", "Yes"], ["Golden Harvest Trading", "<b>No</b>"]])
    c_ = ["<p><b>How the desk works.</b> For every purchase packet: record the receipt of goods (from the receiving report), enter the vendor invoice as printed, run the three-way match (PO vs receiving report vs invoice, and the vendor against the approved list), approve or reject anything held, then post to payables. Every payment voucher: pay the vendor. VAT is 12%.</p>", vend]
    for p in PURCH:
        seq, kind, vendor, item, ref, pq, pp, rrn, rrq, rrd, ino, iq, ip, d, note, trap, why = p
        if kind == "PURCHASE":
            rows = [["Purchase order " + ref, "none" if pq is None else f"{pq} sacks at {m(pp)}"], ["Receiving report " + (rrn or ""), "NOT ATTACHED" if rrq is None else f"{rrq} sacks received on {rrd}"], ["Vendor invoice " + ino, f"{iq} sacks at {m(ip)} each, dated {d}"]]
            c_.append(f'<div class="card"><div class="ct">Card {seq}: {esc(vendor)} · Sinag {item} Rice</div>{table(["Document", "What it says"], rows)}{("<p><i>" + esc(note) + "</i></p>") if note else ""}</div>')
        else:
            c_.append(f'<div class="card"><div class="ct">Card {seq}: Payment voucher {esc(ref)} · {esc(vendor)}</div><div class="meta">Dated {d}</div><p><i>{esc(note)}</i></p></div>')
    out.append(chap(4, "PART C", "Purchases desk cards", "Nine vendor cards. Work them in order.", "".join(c_)))
    cs = ['<p class="small">Fill the match for each purchase, then your decision. Where you post, write the journal entry the system would make.</p>']
    for p in PURCH:
        seq, kind, vendor, item, ref, pq, pp, rrn, rrq, rrd, ino, iq, ip, d, note, trap, why = p
        if kind == "PURCHASE":
            cs.append(f'<div class="card"><div class="ct">Card {seq}: {esc(vendor)} {esc(ino)}</div><div class="ans">Quantity: PO ____ RR ____ Invoice ____ &nbsp;&nbsp; Price: PO ____ Invoice ____ &nbsp;&nbsp; Vendor approved? YES / NO<br>Match: &nbsp; PASS &nbsp; / &nbsp; HOLD &nbsp;&nbsp;&nbsp; Action: &nbsp; Posted &nbsp; / &nbsp; Approved by ________ &nbsp; / &nbsp; Rejected</div>{jtable(4)}<div class="small">Reason:</div>{lines(1)}</div>')
        else:
            cs.append(f'<div class="card"><div class="ct">Card {seq}: Payment {esc(ref)}</div><div class="ans">Invoice paid ________ &nbsp; Amount ________ &nbsp; Entry: Dr ________ Cr ________ &nbsp; Still owed to this vendor ________</div></div>')
    out.append(f'<section class="sheet"><div class="tag">PART C · ANSWER SHEET</div><h2 class="t">Purchases desk: answers</h2>{"".join(cs)}</section>')
    emp = table(["Code", "Employee", "Monthly rate", "HR status"], [[a_, b_, m(c2), d_] for a_, b_, c2, d_ in EMP], right=(2,))
    dd = ["<p><b>How the desk works.</b> Check each timecard or rate change against the HR file and its approvals: Is the person on the HR file? Still employed? Are the hours possible? Is there an approved overtime slip? Is there an approved personnel action form for a rate change? Approve or reject what is held. Then work out the payroll for the cards you accept.</p>",
          "<p><b>Rates used:</b> overtime = monthly rate ÷ 160 × 1.25 per hour. Employee SSS 4.5% of gross (maximum 1,350). Employer SSS 9.5% (maximum 2,850). PhilHealth 2.5% each for employee and employer. Pag-IBIG 100 each. Withholding tax 15% of (gross − employee SSS − PhilHealth − Pag-IBIG − 20,833), never below zero. Net pay = gross − employee contributions − withholding tax.</p>", emp]
    for seq, kind, name, text, trap, why in PAY:
        lbl = {"TIME": "Timecard", "RATE_CHANGE": "Pay-rate change request", "RUN": "Payroll run"}[kind]
        dd.append(f'<div class="card"><div class="ct">Card {seq}: {lbl} · {esc(name)}</div><p>{esc(text)}</p></div>')
    out.append(chap(5, "PART D", "Payroll cards", "Ten cards for the January 2027 payroll.", "".join(dd)))
    ds = ['<p class="small">For each card: your check result, your action, and for each card you pay, the amounts.</p>']
    for seq, kind, name, text, trap, why in PAY:
        if kind == "RUN":
            ds.append(f'<div class="card"><div class="ct">Card {seq}: Payroll run</div><div class="ans">Number of vouchers posted ____ &nbsp; Total net pay ________ &nbsp; Entry to pay the net pay: Dr ________ Cr ________</div></div>')
        else:
            ds.append(f'<div class="card"><div class="ct">Card {seq}: {esc(name)}</div><div class="ans">Check: &nbsp; CLEAN &nbsp; / &nbsp; HELD because ______________________ &nbsp;&nbsp; Action: &nbsp; Accepted &nbsp; / &nbsp; Approved by ________ &nbsp; / &nbsp; Rejected<br>If paid: Gross ________ Employee deductions ________ Net ________</div></div>')
    out.append(f'<section class="sheet"><div class="tag">PART D · ANSWER SHEET</div><h2 class="t">Payroll: answers</h2>{"".join(ds)}</section>')
    ee = ["<p><b>Policy.</b> Spend above 15,000 that adds an asset or extends its life is capitalized. Routine repairs, servicing and small items are expensed. Depreciation is straight line, no salvage value, a full month if the asset is in service by the 15th, nothing otherwise. The old forklift (FA-001) cost 478,500.00 in February 2022, life 60 months, with accumulated depreciation of 470,525.00 at 31 December 2026.</p>"]
    for seq, kind, title, vendor, inv, d, net, note, correct, why in FA:
        ee.append(f'<div class="card"><div class="ct">Card {seq}: {esc(title)}</div><div class="meta">Invoice {inv} from {esc(vendor)} · {d}</div><p>Amount before VAT: <b>{m(net)}</b>. <i>{esc(note)}</i></p></div>')
    ee.append('<div class="card"><div class="ct">Card 6: January 2027 depreciation</div><p>After the five invoices are decided, compute the January depreciation for every asset. Useful lives: truck 60 months, laptops 36 months, warehouse extension 240 months.</p></div>')
    ee.append('<div class="card"><div class="ct">Card 7: Sale of the old forklift</div><p>The 2022 forklift is sold on 29 January for <b>18,000.00</b> cash, after January depreciation is recorded.</p></div>')
    out.append(chap(6, "PART E", "Fixed assets", "Five invoices, the depreciation run, and a disposal.", "".join(ee)))
    es = ['<p class="small">Cards 1 to 5: tick your decision and write the debit account. Card 6: the amount per asset. Card 7: the journal entry.</p>']
    for seq, kind, title, vendor, inv, d, net, note, correct, why in FA:
        es.append(f'<div class="card"><div class="ct">Card {seq}: {esc(title)}</div><div class="ans"><span class="box"></span>Capitalize &nbsp; <span class="box"></span>Expense &nbsp;&nbsp; Debit account: ________ &nbsp; Reason: ______________________________</div></div>')
    es.append('<div class="card"><div class="ct">Card 6: depreciation</div><div class="ans">Truck ________ &nbsp; Laptops ________ &nbsp; Forklift ________ &nbsp; Others ________ &nbsp; Total ________</div></div>')
    es.append(f'<div class="card"><div class="ct">Card 7: sale of the forklift</div>{jtable(5)}<div class="ans">Net book value at sale ________ &nbsp; Gain or loss ________</div></div>')
    out.append(f'<section class="sheet"><div class="tag">PART E · ANSWER SHEET</div><h2 class="t">Fixed assets: answers</h2>{"".join(es)}</section>')
    ff = [f'<p>The receivable balance at 31 January is <b>{m(AR_PAPER)}</b>.</p>', '<div class="card"><div class="ct">Step 1: Allowance for doubtful accounts</div><p>Policy: 2% of the receivable balance will not be collected. Compute the allowance to the centavo and write the adjusting entry.</p></div>',
          '<div class="card"><div class="ct">Step 2: Accrued electricity</div><p>The electric company\'s bill for January usage, 18,000.00, arrives on 3 February. Nothing has been recorded. Do you accrue it in January, or record it when it is paid? Write the entry if you accrue it, and explain your decision.</p></div>',
          '<div class="card"><div class="ct">Step 3: Closing entries</div><p>Explain which accounts are closed, to which account, and what the closing entry does to the income statement accounts.</p></div>',
          '<div class="card"><div class="ct">Step 4: Read the statements</div><p>Without a computer, explain how you would check that (a) the trial balance balances, and (b) the balance sheet balances before and after the closing entries.</p></div>']
    out.append(chap(7, "PART F", "Period-end close", "Two adjusting entries, the closing entries, and checking the statements.", "".join(ff)))
    fs = [f'<div class="card"><div class="ct">Step 1</div><div class="ans">2% × {m(AR_PAPER)} = ________________ &nbsp;&nbsp; Entry: Dr ____ ________ &nbsp; Cr ____ ________</div></div>',
          f'<div class="card"><div class="ct">Step 2</div><div class="ans"><span class="box"></span>Accrue &nbsp; <span class="box"></span>Skip &nbsp;&nbsp; Entry: Dr ________ Cr ________ &nbsp; Amount ________</div>{lines(3)}</div>',
          f'<div class="card"><div class="ct">Step 3</div>{lines(4)}</div>', f'<div class="card"><div class="ct">Step 4</div>{lines(5)}</div>']
    out.append(f'<section class="sheet"><div class="tag">PART F · ANSWER SHEET</div><h2 class="t">Period-end close: answers</h2>{"".join(fs)}</section>')
    gg = ['<p>For the audit seat on paper. Use these forms to document tests and findings the way the on-screen Audit room does.</p>', '<h3>Audit tests (what you would run)</h3>' + table(["Test", "What it looks for", "Your result"], [["Duplicates", "Same customer, same amount, within 7 days of an earlier entry", ""], ["Round amounts", "Amount an exact multiple of 10,000", ""], ["Weekend postings", "Created on a Saturday or Sunday", ""], ["After hours", "Created before 08:00 or after 18:00", ""], ["Just below the limit", "Amount 95% to 99.5% of the approval limit (150,000)", ""], ["Gaps in invoice numbers", "Missing numbers in the invoice sequence", ""], ["First-digit (Benford)", "Mean absolute deviation of the first digits", ""]]),
          '<h3>Workpaper</h3><div class="card"><div class="ans">Ref ______ &nbsp; Title ______________________________ &nbsp; Prepared by __________ &nbsp; Date ________<br>Objective:</div>' + lines(2) + '<div class="small">What I did:</div>' + lines(3) + '<div class="small">Conclusion:</div>' + lines(2) + '</div>',
          '<h3>Finding</h3><div class="card"><div class="ans">Entry / document: ____________________________ &nbsp; Type: ____________________________ &nbsp; Severity: LOW / MODERATE / HIGH</div><div class="small">Condition (what I found):</div>' + lines(2) + '<div class="small">Criteria (what it should be):</div>' + lines(1) + '<div class="small">Cause:</div>' + lines(1) + '<div class="small">Effect:</div>' + lines(1) + '<div class="small">Recommendation:</div>' + lines(2) + '<div class="ans">Reverse the entry? &nbsp; YES (date ________ reason ____________________) &nbsp; / &nbsp; NO</div></div>',
          '<h3>Finding types</h3>' + table(["Type", "When to use it"], [[l, ""] for _, l in CONTROLS])]
    out.append(chap(8, "PART G", "Audit exercise forms", "Blank forms for the Audit seat.", "".join(gg)))
    out.append(chap(9, "REFERENCE", "Chart of accounts", "Account codes used in this practice set.", chart_table()))
    return page("AIS Edition: Practice Set", "".join(out))

# ============================================================== 3. TEACHER KEY
def j_rows(jr): return table(["Account", "Debit", "Credit"], [[f"{a} {ACCT.get(a, '')}", d, c] for a, d, c in jr], right=(1, 2))
def build_key():
    out = [cover("TEACHER KEY", "AIS Edition<br>Teacher Key", "Answers for every part of the practice set, the hidden traps on every on-screen desk, how scoring works, and how to run a round.", "Confidential: do not hand to students. The figures here match the paper practice set. On-screen companies generate their own figures for the document inbox and the audit population; the desks use these figures exactly.")]
    out.append(toc(["Running a round", "Scoring rules", "Part A key: document packets", "Part B key: Sales desk", "Part C key: Purchases desk", "Part D key: Payroll", "Part E key: Fixed assets", "Part F key: Period-end close", "The audit: what is planted and how it is scored", "Common mistakes and marking tips"]))
    out.append(chap(1, "SETUP", "Running a round", "A round takes one company, one practice set, and one or two students.",
      "<h3>Setup</h3>" + steps(["Open the AIS edition for students (Choose ERP, teacher toggle).", "Go to <b>AIS companies</b> and create a company. Choose a pair (one Accounting student, one Audit student) or turn on solo.", "Import the practice set if it is not in the list, then assign it. Choose <b>practice</b> (feedback at once, wrong journals refused) or <b>graded</b> (decisions final, points hidden until close). Set the lock date (2027-01-31 for the January set).", "Students work the document inbox and any desks you want them to do. The desks create their cards the first time a student opens them.", "When the Accounting seat has finished, close the Accounting phase. The books lock and the Audit seat's population includes everything posted, including wrongly released items.", "After the Audit seat closes the audit, use <b>Class gradebook</b> and the planted-exception review to see results."]) +
      "<h3>Pairs or solo</h3>" + table(["", "Pair (recommended)", "Solo"], [["Independence", "The auditor did not post the entries.", "One student does both jobs."], ["Approvals on the desks", "Only another Accounting-seat holder could approve. In a pair with one Accounting seat an exception cannot be legitimately approved, so the right answer is to reject.", "A student can approve their own exception, but it is recorded as a self-approval and planted."]]) +
      warn("If a company has been run once, make a new company for the next round: the document inbox and every desk create their data once per company."), first=True))
    out.append(chap(2, "SCORING", "Scoring rules", "How points are given in each part.",
      "<h3>Document inbox (6 points per packet)</h3>" + table(["Result", "Practice round", "Graded round"], [["Valid packet posted with the right journal", "6, minus 1 for each refused try (floor of 1)", "6"], ["Valid packet posted with a wrong journal", "Refused; the wrong tries cost points", "3 (it posts as entered)"], ["Valid packet held", "0", "0"], ["Failing packet held, right control", "6", "6"], ["Failing packet held, wrong control", "3", "3"], ["Failing packet posted", "0 (and it becomes an item for the auditor)", "0"]]) +
      "<h3>The desks (6 points per card)</h3>" + table(["Card", "Result", "Points"], [["Clean card", "Processed through to the end", "6"], ["Clean card", "Rejected or not finished", "0"], ["Trap card", "Worked and rejected or stopped", "6"], ["Trap card", "Released with a second person's approval", "3 (the control worked; judge whether it should have been released)"], ["Trap card", "Released with no second approval (or self-approved)", "0 and planted for the auditor"], ["Trap card", "Never opened", "0"], ["Payment, cash, depreciation, sale, closing", "Done correctly", "6"]]) +
      "<h3>Fixed assets and the accrual</h3><p>A capital-or-expense decision scores 6 if right, 0 if wrong, and a wrong decision is planted as a <b>Capital and expense misclassified</b> finding for the audit. Skipping the January accrual scores 0 and is planted as a cutoff error.</p>" +
      "<h3>Audit seat</h3>" + bullets(["6 per planted problem found with the right type; 3 for the right entry with the wrong type; +2 if also reversed.", "−2 per false positive (a finding on an entry that is not planted).", "Maximum = 6 × planted problems + 2 × those with an entry."]) +
      tip("Scores are hidden in graded rounds until the Accounting phase closes. The desks follow the same rule.")))
    a = []
    for seq, title, d, docs, dec, ctrl, expl, jr in DOCS:
        a.append(f'<div class="card"><div class="ct">Packet {seq}: {esc(title)}</div><div class="meta">{d}</div><p><b>Decision: {dec}</b>{(" · control: <b>" + esc(CLABEL[ctrl]) + "</b>") if ctrl else ""}</p><p>{esc(expl)}</p>' + (j_rows(jr) if jr else "") + "</div>")
    summary = table(["Packet", "Decision", "Control"], [[str(s), dec, CLABEL[c] if c else "—"] for s, t, d, docs, dec, c, e, j in DOCS])
    out.append(chap(3, "PART A KEY", "Document packets", "Five valid packets (1, 2, 8, 9, 13) and eight that fail a control. Packet 13 sits exactly on the credit limit and is valid. Packets 8 and 9 are valid and not credit sales.", summary + "".join(a)))
    bk = ["<p>All customers start with no balance. Order of processing matters for card 6, because it depends on card 5 having been billed and still unpaid. <b>In the classroom model, a rejected order is not shipped or billed.</b></p>"]
    for c in SALES:
        seq, kind, cu, it, q, price, ref, d, note, trap, why = c
        if kind == "ORDER":
            net, vat, gross, cost = sales_calc(c)
            ship = f"Dr 5000 Cost of Goods Sold {m(cost)} / Cr 1200 Inventory {m(cost)}"; bill = f"Dr 1100 A/R {m(gross)} / Cr 4000 Sales {m(net)} / Cr 2200 VAT {m(vat)}"
            if trap == "CREDIT_LIMIT" and seq == 3: res = "Credit check HOLDS: exposure 114,800.00 against limit 60,000.00. Correct action: reject."
            elif trap == "PRICE_MISMATCH": res = "Credit check HOLDS: unit price 2,100.00 is not the list price 2,300.00. Correct action: reject."
            elif trap == "CREDIT_LIMIT": res = "Credit check HOLDS: customer already owes 45,920.00 (card 5), plus this order 20,720.00 = 66,640.00 against the 50,000.00 limit. Correct action: reject."
            elif trap == "DUP_INVOICE": res = "Credit check PASSES (the system does not flag the duplicate). Correct action: reject as a duplicate of card 1 (same PO number PO-4410)."
            else: res = "Credit check passes. Ship and bill."
            tail = f'<p class="small">Postings: ship: {ship}; bill: {bill}.</p>' if trap is None else f'<p class="small">If wrongly released the postings are: ship: {ship}; bill: {bill}; and the entry is planted as <b>{esc(CLABEL[trap])}</b>.</p>'
            bk.append(f'<div class="card"><div class="ct">Card {seq}: {esc(ref)} · {esc(cu)}</div><p>Net {m(net)} · VAT {m(vat)} · Total {m(gross)} · Cost {m(cost)}</p><p><b>{res}</b></p>{tail}<p>{esc(why)}</p></div>')
        else:
            bk.append(f'<div class="card"><div class="ct">Card {seq}: {esc(ref)} · {esc(cu)}</div><p>Receipt of <b>{m(price)}</b>: Dr 1000 Cash in Bank / Cr 1100 Accounts Receivable.</p><p>{esc(why)}</p></div>')
    bk.append(keybox("A student who approves a held order can only legitimately do so if another person entered it. In a solo company the approval is recorded as a self-approval, the card scores 0, and the entry becomes a planted exception for the audit."))
    out.append(chap(4, "PART B KEY", "Sales desk", "Maximum 54 points (9 cards × 6).", "".join(bk)))
    ck = ["<p>The receipt is posted from the receiving report. The invoice posting clears GR/IR for what was received at the purchase order price, books input VAT, and sends any price or over-billed quantity difference to 5900.</p>"]
    for p in PURCH:
        seq, kind, vendor, item, ref, pq, pp, rrn, rrq, rrd, ino, iq, ip, d, note, trap, why = p
        if kind == "PURCHASE":
            net, vat, gross = purch_calc(p)
            if pp is not None and rrq is not None:
                cleared = r2(min(iq, rrq) * pp); var = net - cleared
                post = f"Dr 2050 GR/IR {m(cleared)}, Dr 1160 Input VAT {m(vat)}" + (f", Dr 5900 {m(var)}" if var > 0 else (f", Cr 5900 {m(-var)}" if var < 0 else "")) + f" / Cr 2000 Accounts Payable {m(gross)}"
                rec = f"Receipt: Dr 1200 Inventory {m(r2(rrq * pp))} / Cr 2050 GR/IR {m(r2(rrq * pp))}"
            else:
                post = f"Dr 1200 Inventory {m(net)}, Dr 1160 Input VAT {m(vat)} / Cr 2000 Accounts Payable {m(gross)}"; rec = "No receipt can be recorded (no receiving report)"
            res = {"PRICE_MISMATCH": "Match HOLDS: invoice price differs from the PO price. Correct action: reject (have the vendor correct the invoice).", "QTY_MISMATCH": "Match HOLDS: 150 billed, 120 received. Correct action: reject.",
                   "NO_RECEIVING_REPORT": "Match HOLDS: no receiving report on file. Correct action: reject.", "UNAPPROVED_VENDOR": "Match HOLDS: vendor not approved, no purchase order, no receiving report. Correct action: reject.",
                   "DUP_INVOICE": "Match PASSES (the system does not see the duplicate: the same vendor invoice number V-5521 as card 1). Correct action: reject."}.get(trap, "Match passes. Post it.")
            ck.append(f'<div class="card"><div class="ct">Card {seq}: {esc(vendor)} · {esc(ino)}</div><p>Net {m(net)} · VAT {m(vat)} · Gross {m(gross)}</p><p><b>{res}</b></p><p class="small">{rec}. If posted: {post}.</p><p>{esc(why)}</p></div>')
        else:
            ck.append(f'<div class="card"><div class="ct">Card {seq}: {esc(ref)} · {esc(vendor)}</div><p>Dr 2000 Accounts Payable / Cr 1000 Cash in Bank for the authorized amount.</p><p>{esc(why)}</p></div>')
    out.append(chap(5, "PART C KEY", "Purchases desk", "Maximum 54 points (9 cards × 6).", "".join(ck)))
    dk = ["<p>Rejecting a card means it goes back to the supervisor and is not paid in this run. The correct run accepts cards 1, 2, 3 and 6 and rejects cards 4, 5, 7, 8 and 9, so Liza Cruz is paid at her old rate of 40,000.</p>"]
    pay_rows = []; tot_net = D(0)
    for nm, rate, ot in [("Maria Reyes", 30000, 0), ("Jose Santos", 28000, 0), ("Ana Dizon", 35000, 10), ("Liza Cruz", 40000, 0)]:
        g = pay_gross(ot, rate); cc = pay_calc(g); tot_net += cc["net"]
        pay_rows.append([nm, m(g), m(cc["sss_ee"]), m(cc["ph"]), m(cc["pag"]), m(cc["wht"]), m(cc["net"]), m(cc["er_total"])])
    dk.append("<h3>The correct payroll (four vouchers)</h3>" + table(["Employee", "Gross", "SSS (ee)", "PhilHealth (ee)", "Pag-IBIG (ee)", "Withholding tax", "Net pay", "Employer share"], pay_rows, right=(1, 2, 3, 4, 5, 6, 7)) + f"<p><b>Total net pay: {m(tot_net)}</b>. Overtime for Ana Dizon: 35,000 ÷ 160 × 1.25 × 10 = 2,734.38.</p>")
    dk.append("<h3>Voucher entry (one per employee)</h3><p>Dr 5300 Payroll Expense (gross), Dr 5310 Payroll Tax Expense (employer share) / Cr 2100 SSS Payable (employee + employer), Cr 2110 PhilHealth Payable (both), Cr 2120 Pag-IBIG Payable (both), Cr 2130 Withholding Tax Payable, Cr 2300 Accrued Expenses (net pay). Payment: Dr 2300 / Cr 1000 for the total net pay.</p>")
    for seq, kind, name, text, trap, why in PAY:
        res = "Post the payroll vouchers, then pay the net pay." if kind == "RUN" else ("Clean. Check passes and it is paid." if trap is None else f"Check HOLDS. Correct action: reject. Planted if released on one's own approval: {esc(CLABEL.get(trap, trap))}.")
        dk.append(f'<div class="card"><div class="ct">Card {seq}: {esc(name)}</div><p><b>{res}</b></p><p>{esc(why)}</p></div>')
    out.append(chap(6, "PART D KEY", "Payroll", "Maximum 60 points (10 cards × 6).", "".join(dk) + keybox("The finding types for payroll problems are: pay to a person not on the HR master file, pay to an employee who has left, hours claimed not plausible, overtime paid without an approved slip, and pay rate changed without an approved personnel action. A self-approved raise is planted on the employee's voucher once their pay is posted.")))
    ek = []
    for seq, kind, title, vendor, inv, d, net, note, correct, why in FA:
        vat = r2(net * D("0.12")); dr = "1500 Fixed Assets" if correct == "CAPITALIZE" else "5100 Operating Expenses"
        ek.append(f'<div class="card"><div class="ct">Card {seq}: {esc(title)} · <b>{correct}</b></div><p>Dr {dr} {m(net)}, Dr 1160 Input VAT {m(vat)} / Cr 2000 Accounts Payable {m(net + vat)}</p><p>{esc(why)}</p></div>')
    dep = [("Forklift FA-001 (2022)", r2(D(478500) / 60)), ("Delivery truck", r2(D(1250000) / 60)), ("Three laptops", r2(D(135000) / 36)), ("Warehouse extension", D(0))]
    dep_rows = [[n_, m(a_), "Fully depreciates this month: 478,500.00 − 470,525.00 = 7,975.00" if "Forklift" in n_ else ("In service 18 January, after the 15th: no depreciation this month" if "Warehouse" in n_ else "In service by the 15th: full month")] for n_, a_ in dep]
    total_dep = sum(a_ for _, a_ in dep)
    ek.append("<h3>Card 6: January depreciation</h3>" + table(["Asset", "January charge", "Reason"], dep_rows, right=(1,)) + f"<p><b>Total {m(total_dep)}:</b> Dr 5400 Depreciation Expense / Cr 1590 Accumulated Depreciation. (The routine repair, if wrongly capitalized, would add a depreciable asset and increase this total.)</p>")
    ek.append("<h3>Card 7: sale of the forklift</h3><p>After January depreciation the forklift is fully depreciated (cost 478,500.00, accumulated 478,500.00, net book value 0.00). Proceeds 18,000.00, so the gain is 18,000.00.</p>" + table(["Account", "Debit", "Credit"], [["1000 Cash in Bank", "18,000.00", ""], ["1590 Accumulated Depreciation", "478,500.00", ""], ["1500 Fixed Assets", "", "478,500.00"], ["4100 Gain on Disposal of Assets", "", "18,000.00"]], right=(1, 2)))
    ek.append(keybox("Maximum 42 points (7 cards × 6). A wrong capital-or-expense decision scores 0 and is planted as a misclassification finding. The opening balance entry for the forklift is created automatically the first time the Fixed assets desk is opened."))
    out.append(chap(7, "PART E KEY", "Fixed assets", "Five decisions, one run, one disposal.", "".join(ek)))
    allow = r2(AR_PAPER * D("0.02"))
    fk = [f"<h3>Step 1: allowance</h3><p>2% × {m(AR_PAPER)} = <b>{m(allow)}</b>. Dr 5110 Bad Debts Expense {m(allow)} / Cr 1110 Allowance for Doubtful Accounts {m(allow)}. The on-screen desk refuses any other figure without revealing the right one; the receivable balance on screen differs by company.</p>",
          "<h3>Step 2: accrued electricity</h3><p><b>Accrue.</b> Dr 5100 Operating Expenses 18,000.00 / Cr 2300 Accrued Expenses 18,000.00, dated at the end of January. The electricity was used in January, so the expense and the liability belong in January (accrual accounting). Skipping scores 0 and is planted as a cutoff error.</p>",
          "<h3>Step 3: closing entries</h3><p>Every revenue account (Sales Revenue, Sales Returns and Allowances, Gain on Disposal) and every expense account is brought to zero by closing it to 3000 Owner's Equity. The net result is the net income for the month. After closing, the income statement accounts have no balance and the net income is part of equity.</p>",
          "<h3>Step 4: checking the statements</h3><p>(a) Add the debit column and the credit column of the trial balance: they must be equal. (b) Total assets must equal total liabilities plus equity. Before closing, the month's net income is shown as its own line inside equity; after closing it is inside the 3000 balance. The check passes in both states.</p>"]
    out.append(chap(8, "PART F KEY", "Period-end close", "Maximum 18 points (3 steps × 6).", "".join(fk)))
    ak = ["<h3>The seeded population</h3><p>When the practice set is assigned, the system generates a sales population of about 300 entries for January 2027 (invoice numbers run in date order), with the following planted problems. The numbers are fixed; the entries differ by company.</p>" +
          table(["Planted problem", "Count", "How an auditor finds it"], [["Duplicate invoices (same number, customer and amount re-posted two working days later)", "3", "Duplicates test"], ["Round amounts (gross a multiple of 10,000)", "6", "Round amounts test"], ["Weekend postings (created Saturday or Sunday around 02:00)", "4", "Weekend / after hours tests"], ["Just below the approval limit (95.5% to 99.5% of 150,000)", "5", "Just-below-limit test"], ["Missing invoice numbers (one finding of type 'Missing document numbers')", "4 numbers, 1 finding", "Gaps test"]], right=(1,)),
          "<h3>What else the auditor may find</h3>" + bullets(["<b>Exceptions the Accounting student released.</b> Any failing packet that was posted instead of held becomes a planted exception.", "<b>Desk exceptions.</b> From the desks: a self-approved over-limit sale or wrong-price sale, a processed duplicate PO, a self-approved purchase exception (price, quantity, no receiving report, unapproved vendor), a processed duplicate vendor invoice, self-approved payroll exceptions and an unapproved raise that was paid, a capital/expense misclassification, and an unaccrued January expense.", "<b>Noise.</b> Round-amount cash receipts can flag an entry that is not planted. A test result is a lead, not a conclusion, and a false accusation costs 2 points."]),
          "<h3>Scoring</h3><p>Each planted problem is worth 6 points when found with the right type, 3 when the right entry is reported with the wrong type, and +2 when the entry is also reversed. Each finding on an unplanted entry costs 2 points. The maximum is 6 per planted problem plus 2 per planted problem that has an entry.</p>",
          "<h3>Where to look as the teacher</h3>" + bullets(["<b>Class gradebook</b>: a score per student, with a detection matrix (which planted problem types each student found) and a desk matrix (how each student decided each packet).", "<b>Audit: planted exceptions and results</b> inside each company: what was planted, and what was found."]),
          keybox("Audit students working from the paper forms (Part G of the practice set) should be marked on: a test chosen for each risk, an explanation of why an item is or is not a problem, a clearly written condition, criteria, cause, effect and recommendation, and a reversal only for entries that should not stand.")]
    out.append(chap(9, "AUDIT", "What is planted and how it is scored", "The auditor's side of the round.", "".join(ak)))
    out.append(chap(10, "MARKING TIPS", "Common mistakes and marking tips", "Patterns seen in classes, and how to mark them.",
      bullets(["<b>Holding the exact-limit sale</b> (packet 13). The limit is a ceiling, not a trigger: an order equal to the limit is allowed.", "<b>Posting a packet because every number looks right.</b> Check the approval line, the dates, the signed delivery receipt and the price list.", "<b>Mixing up quantity billed and quantity delivered</b> (packet 6) or invoice date and delivery date (packet 11).", "<b>Forgetting the cost-of-sales entry</b> when posting a sale, and the VAT on returns (packet 9).", "<b>Approving their own exception</b> on a desk. Explain segregation of duties: the control only works when a different person decides.", "<b>Capitalizing a large repair</b> because the amount is big. Size does not decide it; whether it adds an asset or extends life does.", "<b>Skipping the accrual</b> because no bill has arrived. Ask: was the electricity used in January?", "<b>Treating a test result as a finding.</b> An analytic test is a list of leads; vouch the entry first.", "<b>Forgetting a reversal date.</b> It must be after the lock date.", "<b>Not opening a card.</b> A trap card nobody opened scores nothing: stopping a bad item requires looking at it."]) +
      tip("Use the explanation shown after each decision on screen as a discussion starter. In a graded round it appears only after the Accounting phase closes; go through it together then.")))
    return page("AIS Edition: Teacher Key", "".join(out))

if __name__ == "__main__":
    for name, fn in (("student-handout", build_handout), ("practice-set", build_practice), ("teacher-key", build_key)):
        open(os.path.join(HERE, name + ".html"), "w").write(fn())
        print("wrote", name + ".html")
