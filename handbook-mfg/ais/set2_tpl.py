#!/usr/bin/env python3
"""AIS Practice Set 2: Pinagpala Hardware and Construction Supply, February 2027 (purchases, payments, payroll, fixed assets, month-end).

Builds the importer file for ais_set_import: {id, title, topic, summary, meta, txns:[{seq, template:{title, date, company, docs, vars}, key}]}.
Like Set 1, every transaction is a template: quantities, amounts and document numbers are drawn per company from its seed, so two pairs of students never
hold the same numbers. The fixed parts are the traps (dates, approval limits, who signed).

  python3 set2_tpl.py            write set2-pinagpala.json and run the local checks (200 random draws: journals balance, every trap still holds)
  python3 set2_tpl.py --check    checks only
"""
import json, random, re, sys
from decimal import Decimal, ROUND_HALF_UP

COMPANY = "Pinagpala Hardware and Construction Supply"
SET_ID = "pinagpala-expenditure-feb-2027"

LPC, BRS, NEP, CLP, RJT = "Luzon Portland Cement Corp.", "Bataan Rebar and Steel", "Nueva Ecija Paint Depot", "Central Luzon PVC Supply", "RJ Trading"
CEM, REB, GIS, PVC, PNT = "Portland cement, 40 kg bag", "Rebar 10 mm x 6 m", "GI sheet 0.4 mm x 8 ft", "PVC pipe 4 in x 3 m", "Latex paint, 4 L can"
BUYER, SUP, GM = "R. Bautista (purchasing clerk)", "Purchasing supervisor E. Villanueva", "General Manager T. Pineda"
FIN = "Finance manager C. Ramos"
POLICY = {"type": "Purchasing policy (in force)", "fields": {
    "Approval limits": "Purchasing supervisor up to 50,000.00 per order; General Manager above 50,000.00",
    "Same item, same supplier": "Orders within 3 days are added together when applying the limit",
    "Price tolerance": "An invoice price up to 2% above the PO price is accepted",
    "Suppliers": f"Approved supplier list: {LPC}; {BRS}; {NEP}; {CLP}"}}
CUSTOMERS = ["Kabayan Builders", "Santos Construction", "Villar Contractors", "Dela Rosa Hardware", "Cabanatuan Homes Development", "Mercado Renovations",
             "Nueva Ecija Roofing", "Pangilinan Builders", "Gapan Contractors Inc.", "JM Tile and Paint"]


class T:
    """One transaction template."""
    def __init__(s, title, date):
        s.title, s.date, s.vars, s.docs, s.key, s.rules = title, date, [], [], None, []
    def rng(s, n, lo, hi, st=1, fmt=None):
        s.vars.append({"name": n, "range": [lo, hi, st], **({"fmt": fmt} if fmt else {})}); return s
    def const(s, n, v, fmt="money"): return s.rng(n, v, v, 1, fmt)
    def pick(s, n, items): s.vars.append({"name": n, "pick": items}); return s
    def mul(s, n, a, b, fmt="money"): s.vars.append({"name": n, "op": "mul", "a": a, "b": b, **({"fmt": fmt} if fmt else {})}); return s
    def sub(s, n, a, b, fmt="money"): s.vars.append({"name": n, "op": "sub", "a": a, "b": b, **({"fmt": fmt} if fmt else {})}); return s
    def pct(s, n, a, p, fmt="money"): s.vars.append({"name": n, "op": "pct", "a": a, "pct": p, **({"fmt": fmt} if fmt else {})}); return s
    def add(s, n, *terms, fmt="money"): s.vars.append({"name": n, "op": "add", "terms": list(terms), **({"fmt": fmt} if fmt else {})}); return s
    def doc(s, typ, fields): s.docs.append({"type": typ, "fields": fields}); return s
    def post(s, why, *journal): s.key = {"decision": "POST", "explanation": why, "journal": [dict(j) for j in journal]}; return s
    def hold(s, tag, why): s.key = {"decision": "HOLD", "failed_control": tag, "explanation": why}; return s
    def rule(s, fn): s.rules.append(fn); return s
    def money(s, qty, price, pre=""):
        """net, VAT 12% and gross for a quantity variable and a unit price, names prefixed by pre."""
        return s.mul(pre + "net", qty, price).pct(pre + "vat", pre + "net", 12).add(pre + "gross", pre + "net", pre + "vat")

DR = lambda acct, v: {"acct": acct, "dr": v}
CR = lambda acct, v: {"acct": acct, "cr": v}
J_PUR = lambda net="net", vat="vat", gross="gross", inv="1200": [DR(inv, net), DR("1160", vat), CR("2000", gross)]

def po(t, no, date, vendor, item, qty, price, total, appr, prep=BUYER, note=None):
    f = {"PO no.": no, "Date": date, "Supplier": vendor, "Item": item, "Quantity ordered": qty, "Unit price": price, "Order total (incl. 12% VAT)": total, "Prepared by": prep, "Approved by": appr}
    if note: f["Note"] = note
    t.doc("Purchase order", f)
def rr(t, no, date, item, qty, by="Warehouse head M. Sison", note=None):
    f = {"RR no.": no, "Date received": date, "Item": item, "Quantity received": qty, "Received by": by}
    if note: f["Note"] = note
    t.doc("Receiving report", f)
def inv(t, no, date, vendor, item, qty, price, net, vat, gross, terms="30 days"):
    t.doc("Supplier invoice", {"Invoice no.": no, "Invoice date": date, "Supplier": vendor, "Item": item, "Quantity billed": qty, "Unit price": price,
                               "Net amount": net, "VAT 12%": vat, "Total due": gross, "Terms": terms})

TX = []
def new(title, date):
    t = T(title, date); TX.append(t); return t

# =============================================================== A. PURCHASES AND PAYMENTS (17)
t = new("Purchase: {{q}} bags of cement from Luzon Portland", "2027-02-02")
t.rng("q", 250, 450, 50).money("q", 245).rng("po", 4400, 4499).rng("rr", 3000, 3099).rng("inv", 20400, 20499)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-01-28", LPC, CEM, "{{q}}", "245.00", "{{gross}}", GM)
rr(t, "RR-{{rr}}", "2027-02-02", CEM, "{{q}}"); inv(t, "LP-{{inv}}", "2027-02-02", LPC, CEM, "{{q}}", "245.00", "{{net}}", "{{vat}}", "{{gross}}")
t.post("The order ({{net}} net) was approved by the General Manager, as the policy requires above 50,000.00. {{q}} bags were received and {{q}} billed at the PO price. Record the inventory, the input VAT and the payable.", *J_PUR())

t = new("Purchase: partial delivery of rebar ({{r}} of {{ord}} received)", "2027-02-03")
t.rng("r", 150, 240, 30).rng("bo", 60, 120, 30).add("ord", "r", "bo", fmt=None).money("r", 285).mul("onet", "ord", 285).pct("ovat", "onet", 12).add("ogross", "onet", "ovat")
t.rng("po", 4400, 4499).rng("rr", 3100, 3199).rng("inv", 7700, 7799)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-01-29", BRS, REB, "{{ord}}", "285.00", "{{ogross}}", GM)
rr(t, "RR-{{rr}}", "2027-02-03", REB, "{{r}}", note="{{bo}} pieces on back order, to follow"); inv(t, "BR-{{inv}}", "2027-02-03", BRS, REB, "{{r}}", "285.00", "{{net}}", "{{vat}}", "{{gross}}")
t.post("Only {{r}} of the {{ord}} pieces ordered arrived, and the supplier billed only the {{r}} received. That is correct: record the {{r}} received and leave the {{bo}} on back order. Do not hold a clean partial delivery.", *J_PUR())

t = new("Purchase: rebar invoice with no receiving report", "2027-02-04")
t.rng("q", 100, 175, 25).money("q", 285).rng("po", 4400, 4499).rng("inv", 7800, 7899)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-01-30", BRS, REB, "{{q}}", "285.00", "{{gross}}", SUP)
t.doc("Receiving report", {"RR no.": "—", "Status": "NOT ATTACHED: the warehouse has no record of this delivery"}); inv(t, "BR-{{inv}}", "2027-02-04", BRS, REB, "{{q}}", "285.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("NO_RECEIVING_REPORT", "There is an order and an invoice but no receiving report. Without proof that the {{q}} pieces were received, the liability must not be recorded.")

t = new("Purchase: GI sheets billed above the PO price", "2027-02-05")
t.rng("q", 80, 115, 5).money("q", 420, "p").money("q", 455, "i").rng("po", 4400, 4499).rng("rr", 3200, 3299).rng("inv", 5500, 5599)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-01", CLP, GIS, "{{q}}", "420.00", "{{pgross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-05", GIS, "{{q}}"); inv(t, "CL-{{inv}}", "2027-02-05", CLP, GIS, "{{q}}", "455.00", "{{inet}}", "{{ivat}}", "{{igross}}")
t.hold("PRICE_MISMATCH", "The PO price is 420.00 and the invoice charges 455.00, which is 8.3% higher and above the 2% tolerance. The price was not authorized.")

t = new("Purchase: GI sheets, price slightly above the PO", "2027-02-06")
t.rng("q", 80, 115, 5).money("q", 420, "p").money("q", 428, "i").rng("po", 4400, 4499).rng("rr", 3200, 3299).rng("inv", 5600, 5699)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-02", CLP, GIS, "{{q}}", "420.00", "{{pgross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-06", GIS, "{{q}}"); inv(t, "CL-{{inv}}", "2027-02-06", CLP, GIS, "{{q}}", "428.00", "{{inet}}", "{{ivat}}", "{{igross}}")
t.post("The invoice price (428.00) is 1.9% above the PO price (420.00), which is inside the 2% tolerance. Post it at the invoice amounts. This is a trap for students who hold every price difference.", *J_PUR("inet", "ivat", "igross"))

t = new("Purchase: PVC pipe, {{q}} billed but {{r}} received", "2027-02-08")
t.rng("q", 100, 150, 10).rng("short", 10, 30, 5).sub("r", "q", "short", fmt=None).money("q", 330).rng("po", 4400, 4499).rng("rr", 3300, 3399).rng("inv", 5700, 5799)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-03", CLP, PVC, "{{q}}", "330.00", "{{gross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-08", PVC, "{{r}}"); inv(t, "CL-{{inv}}", "2027-02-08", CLP, PVC, "{{q}}", "330.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("QTY_MISMATCH", "The supplier billed {{q}} pipes but the receiving report shows {{r}}. {{short}} pipes are being billed that were never received.")

t = new("Purchase: invoice number written two ways", "2027-02-09")
t.rng("q", 100, 200, 20).money("q", 245).rng("po", 4400, 4499).rng("rr", 3400, 3499).rng("inv", 20500, 20599)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-04", LPC, CEM, "{{q}}", "245.00", "{{gross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-09", CEM, "{{q}}"); inv(t, "LP-{{inv}}", "2027-02-09", LPC, CEM, "{{q}}", "245.00", "{{net}}", "{{vat}}", "{{gross}}")
t.doc("Invoice register extract", {"Invoice no.": "LP{{inv}}", "Supplier": LPC, "Amount": "{{gross}}", "Already posted on": "2027-02-05", "Status": "POSTED to the ledger"})
t.hold("DUP_INVOICE", "The register has LP{{inv}} for the same supplier and the same amount ({{gross}}), posted on February 5. LP-{{inv}} is the same invoice with a hyphen. Posting it would record the purchase twice.")

t = new("Purchase: paint from a supplier not on the list", "2027-02-10")
t.rng("q", 50, 80, 10).money("q", 610).rng("po", 4400, 4499).rng("rr", 3500, 3599).rng("inv", 93, 99)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-05", RJT, PNT, "{{q}}", "610.00", "{{gross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-10", PNT, "{{q}}"); inv(t, "RJ-00{{inv}}", "2027-02-10", RJT, PNT, "{{q}}", "610.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("UNAPPROVED_VENDOR", "RJ Trading is not on the approved supplier list. The goods may be fine, but nobody authorized a new supplier, so the invoice must be held for approval.")

t = new("Purchase: three paint orders just under the limit (the third)", "2027-02-11")
t.rng("q", 70, 81, 1).money("q", 610).mul("agg", "net", 3).rng("po", 4412, 4490).sub("p1", "po", 2, fmt=None).sub("p2", "po", 1, fmt=None).rng("rr", 3600, 3699).rng("inv", 3300, 3399)
t.doc(POLICY["type"], POLICY["fields"])
po(t, "PO-{{po}}", "2027-02-11", NEP, PNT, "{{q}}", "610.00", "{{gross}}", SUP, note="Same item and supplier as PO-{{p1}} (Feb 9) and PO-{{p2}} (Feb 10), same requester")
rr(t, "RR-{{rr}}", "2027-02-11", PNT, "{{q}}"); inv(t, "NP-{{inv}}", "2027-02-11", NEP, PNT, "{{q}}", "610.00", "{{net}}", "{{vat}}", "{{gross}}")
t.doc("Purchase order register extract", {"First order": "PO-{{p1}}, 2027-02-09, {{q}} cans, {{gross}} incl. VAT, approved by supervisor", "Second order": "PO-{{p2}}, 2027-02-10, {{q}} cans, {{gross}} incl. VAT, approved by supervisor", "Third order": "PO-{{po}}, 2027-02-11, {{q}} cans, {{gross}} incl. VAT, approved by supervisor"})
t.hold("NO_AUTHORIZATION", "Each order is {{net}} before VAT, just under the 50,000.00 supervisor limit. They are the same item, supplier and requester on three days, so the policy adds them to {{agg}}, which needed the General Manager. Splitting the order avoided that approval.")
t.rule(lambda v: v["net"] <= 50000 < v["agg"])

t = new("Purchase: cement invoice with an arithmetic error", "2027-02-12")
t.rng("q", 100, 200, 10).mul("cnet", "q", 245).pct("cvat", "cnet", 12).add("pgross", "cnet", "cvat").rng("err", 800, 1500, 100).sub("net", "cnet", "err").pct("vat", "net", 12).add("gross", "net", "vat")
t.rng("po", 4400, 4499).rng("rr", 3700, 3799).rng("inv", 20600, 20699)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-08", LPC, CEM, "{{q}}", "245.00", "{{pgross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-12", CEM, "{{q}}"); inv(t, "LP-{{inv}}", "2027-02-12", LPC, CEM, "{{q}}", "245.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("MATH_ERROR", "{{q}} bags at 245.00 is {{cnet}}, but the invoice shows a net amount of {{net}} (the VAT and total follow the wrong figure). Ask the supplier for a corrected invoice.")

t = new("Purchase: one person ordered, received and approved", "2027-02-15")
t.rng("q", 60, 120, 10).money("q", 330).rng("po", 4400, 4499).rng("rr", 3800, 3899).rng("inv", 5800, 5899)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-10", CLP, PVC, "{{q}}", "330.00", "{{gross}}", BUYER)
rr(t, "RR-{{rr}}", "2027-02-15", PVC, "{{q}}", by=BUYER); inv(t, "CL-{{inv}}", "2027-02-15", CLP, PVC, "{{q}}", "330.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("SOD", "R. Bautista prepared and approved the order and also signed the receiving report. One person must not order, approve and receive the same goods.")

t = new("Purchase: {{net}} order approved by the supervisor only", "2027-02-16")
t.rng("q", 200, 400, 50).money("q", 285).rng("po", 4400, 4499).rng("rr", 3900, 3999).rng("inv", 7900, 7999)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-11", BRS, REB, "{{q}}", "285.00", "{{gross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-16", REB, "{{q}}"); inv(t, "BR-{{inv}}", "2027-02-16", BRS, REB, "{{q}}", "285.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("NO_AUTHORIZATION", "The order is {{net}} before VAT. Above 50,000.00 it needs the General Manager, but only the supervisor signed. The approval is missing.")

t = new("Purchase: order exactly at the supervisor limit", "2027-02-17")
t.const("q", 50, None).const("net", 50000).pct("vat", "net", 12).add("gross", "net", "vat").rng("po", 4400, 4499).rng("rr", 4000, 4099).rng("inv", 3400, 3499)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-12", NEP, PNT, "{{q}}", "1,000.00", "{{gross}}", SUP)
rr(t, "RR-{{rr}}", "2027-02-17", PNT, "{{q}}"); inv(t, "NP-{{inv}}", "2027-02-17", NEP, PNT, "{{q}}", "1,000.00", "{{net}}", "{{vat}}", "{{gross}}")
t.post("The order is exactly {{net}} before VAT, which is within the supervisor limit (up to and including 50,000.00). Everything matches. Post it. Same lesson as a sale exactly at the credit limit.", *J_PUR())

t = new("Purchase: delegated approval while the GM was away", "2027-02-18")
t.rng("q", 250, 400, 50).money("q", 245).rng("po", 4400, 4499).rng("rr", 4100, 4199).rng("inv", 20700, 20799)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-13", LPC, CEM, "{{q}}", "245.00", "{{gross}}", "Finance manager C. Ramos (for the General Manager)")
rr(t, "RR-{{rr}}", "2027-02-18", CEM, "{{q}}"); inv(t, "LP-{{inv}}", "2027-02-18", LPC, CEM, "{{q}}", "245.00", "{{net}}", "{{vat}}", "{{gross}}")
t.doc("Delegation memo", {"From": GM, "To": FIN, "Covers": "2027-02-12 to 2027-02-19, purchase approvals up to 200,000.00", "Signed": "Yes"})
t.post("The order is {{net}} net and needs the General Manager, who was away. A signed memo delegated purchase approvals to the finance manager for these dates, up to 200,000.00. The approval is valid. Post it.", *J_PUR())

t = new("Payment: cement invoice paid inside the discount period", "2027-02-12")
t.rng("q", 300, 500, 50).money("q", 245).pct("disc", "net", 2).sub("cash", "gross", "disc").rng("cv", 2200, 2299).rng("inv", 20450, 20499)
t.doc("Check voucher", {"CV no.": "CV-{{cv}}", "Payee": LPC, "Invoice paid": "LP-{{inv}} dated 2027-02-02, total {{gross}}", "Terms": "2/10, n/30 on the net amount", "Paid on": "2027-02-12",
                        "Discount (2% of the net amount)": "{{disc}}", "Check amount": "{{cash}}", "Approved by": GM})
t.doc("Bank debit advice", {"Date": "2027-02-12", "Check cleared": "{{cash}}"})
t.post("The payment is on day 10, so the 2% discount on the net amount ({{disc}}) is taken. The payable of {{gross}} is cleared with {{cash}} cash and {{disc}} purchase discount.", DR("2000", "gross"), CR("1000", "cash"), CR("5900", "disc"))

t = new("Payment: an invoice paid a second time", "2027-02-19")
t.rng("q", 100, 200, 25).money("q", 285).rng("cv1", 2100, 2199).rng("cv2", 2230, 2299).rng("inv", 7700, 7799)
t.doc("Check voucher", {"CV no.": "CV-{{cv2}}", "Payee": BRS, "Invoice paid": "BR-{{inv}} dated 2027-02-03, total {{gross}}", "Check amount": "{{gross}}", "Approved by": GM})
t.doc("Payment register extract", {"Invoice": "BR-{{inv}}", "Paid on": "2027-02-11 by CV-{{cv1}}, {{gross}}", "Status": "PAID in full"})
t.hold("DUP_INVOICE", "The register shows BR-{{inv}} was paid in full on February 11 (CV-{{cv1}}). This voucher pays the same invoice again. It should be held and the first payment confirmed.")

t = new("Return to a supplier: {{q}} damaged GI sheets", "2027-02-22")
t.rng("q", 10, 30, 5).money("q", 420).rng("dm", 100, 199).rng("rs", 40, 99)
t.doc("Debit memo", {"DM no.": "DM-{{dm}}", "Supplier": CLP, "Item": GIS, "Quantity returned": "{{q}}", "Net": "{{net}}", "VAT 12%": "{{vat}}", "Total": "{{gross}}", "Approved by": GM})
t.doc("Return slip", {"Slip no.": "RS-0{{rs}}", "Goods released to the supplier's driver": "{{q}} sheets", "Signed by driver": "Yes"})
t.post("The goods left the warehouse (return slip signed by the driver) and the General Manager approved the debit memo. Reduce the payable by {{gross}} and take the inventory and the input VAT back out.", DR("2000", "gross"), CR("1200", "net"), CR("1160", "vat"))

# =============================================================== B. PAYROLL (8)
PER = "2027-02-01 to 2027-02-15"
def pay_vars(t, ot=None, hrs="hrs"):
    t.mul("reg", hrs, "rate")
    if ot: t.mul("otr", "rate", 1.25).mul("otp", ot, "otr").add("gross", "reg", "otp")
    else: t.add("gross", "reg")
    t.pct("sss", "gross", 4.5).pct("ph", "gross", 2.5).const("pi", 100).add("ded", "sss", "ph", "pi").sub("net", "gross", "ded")
def register(emp, hrs="{{hrs}}", rate="{{rate}}", ot="0"):
    return {"Employee": emp, "Period": PER, "Regular hours": hrs, "Rate per hour": rate, "Overtime hours (125%)": ot, "Gross pay": "{{gross}}", "SSS": "{{sss}}", "PhilHealth": "{{ph}}", "Pag-IBIG": "{{pi}}", "Net pay": "{{net}}"}
def master(emp, rate="{{rate}}"): return {"Employee": emp, "Status": "Active", "Hourly rate": rate, "Hired": "2025-06-02"}
def timecard(emp, days="{{days}}", hrs="{{hrs}}"): return {"Employee": emp, "Days worked": days, "Hours": hrs, "Approved by": "Shop supervisor L. Mercado"}
J_PAY = [DR("5300", "gross"), CR("2100", "sss"), CR("2110", "ph"), CR("2120", "pi"), CR("1000", "net")]

t = new("Payroll: regular pay, J. Dela Cruz", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("rate", 90, 105, 5, "money"); pay_vars(t)
t.doc("HR master file extract", master("J. Dela Cruz")); t.doc("Payroll register line", register("J. Dela Cruz")); t.doc("Time record", timecard("J. Dela Cruz"))
t.post("The employee is on the HR master file, the time record shows {{hrs}} hours, the rate is the master rate and the deductions follow the register. Record the payroll.", *J_PAY)

t = new("Payroll: a name that is not on the HR file", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("rate", 90, 105, 5, "money").pick("g", [{"nm": "J. Manalo"}, {"nm": "R. Ocampo"}, {"nm": "F. Lazaro"}]); pay_vars(t)
t.doc("HR master file extract", {"Employee": "{{g.nm}}", "Status": "NOT FOUND: no such person on the HR master file"}); t.doc("Payroll register line", register("{{g.nm}}"))
t.hold("GHOST_EMPLOYEE", "{{g.nm}} is paid on the register but is not on the HR master file. Paying someone who is not an employee is the classic ghost employee.")

t = new("Payroll: paid after resigning", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("rate", 90, 105, 5, "money"); pay_vars(t)
t.doc("HR master file extract", {"Employee": "D. Soriano", "Status": "Resigned, last day 2027-01-31", "Hourly rate": "{{rate}}"}); t.doc("Payroll register line", register("D. Soriano"))
t.hold("TERMINATED_PAID", "D. Soriano resigned effective January 31 but is paid for February 1 to 15. The HR file was updated but payroll still paid the person.")

t = new("Payroll: hours that cannot be true", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("big", 280, 310, 10).rng("rate", 90, 105, 5, "money"); pay_vars(t, hrs="big")
t.doc("HR master file extract", master("P. Aquino")); t.doc("Payroll register line", register("P. Aquino", hrs="{{big}}")); t.doc("Time record", {**timecard("P. Aquino"), "Note": "The register pays {{big}} hours: nearly 20 hours every day, including the Sundays the store is closed"})
t.hold("IMPLAUSIBLE_HOURS", "The time record shows {{hrs}} hours but the register pays {{big}} for a 15-day period. The hours are not physically plausible and do not match the time record.")

t = new("Payroll: overtime with no approved slip", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("oth", 8, 16, 2).rng("rate", 90, 105, 5, "money"); pay_vars(t, ot="oth")
t.doc("HR master file extract", master("R. Tolentino")); t.doc("Payroll register line", register("R. Tolentino", ot="{{oth}}")); t.doc("Time record", timecard("R. Tolentino"))
t.doc("Overtime slip", {"Status": "NONE: no approved overtime slip for this employee in the period"})
t.hold("UNAUTH_OVERTIME", "The register pays {{oth}} hours of overtime at 125% but there is no approved overtime slip. Overtime must be authorized before it is paid.")

t = new("Payroll: a rate higher than the master file", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("mrate", 90, 100, 5, "money").rng("bump", 10, 20, 5, "money").add("rate", "mrate", "bump"); pay_vars(t)
t.doc("HR master file extract", {"Employee": "A. Navarro", "Status": "Active", "Hourly rate": "{{mrate}}", "Personnel action form for a rate change": "NONE on file"})
t.doc("Payroll register line", register("A. Navarro")); t.doc("Time record", timecard("A. Navarro"))
t.hold("UNAUTH_RATE", "The register pays {{rate}} an hour but the HR master rate is {{mrate}} and there is no approved personnel action. The rate change was not authorized.")

t = new("Payroll: approved overtime", "2027-02-15")
t.rng("days", 10, 12, 1).mul("hrs", "days", 8, fmt=None).rng("oth", 6, 12, 2).rng("rate", 90, 105, 5, "money"); pay_vars(t, ot="oth")
t.doc("HR master file extract", master("M. Castillo")); t.doc("Payroll register line", register("M. Castillo", ot="{{oth}}")); t.doc("Time record", timecard("M. Castillo"))
t.doc("Overtime slip", {"Employee": "M. Castillo", "Overtime hours": "{{oth}}", "Reason": "Delivery rush, Feb 8 and 9", "Approved by": "Shop supervisor L. Mercado (signed)"})
t.post("{{oth}} hours of overtime at 125% are supported by a signed slip. The pay is correct. Post it; do not hold a legitimate overtime payment.", *J_PAY)

t = new("Payroll: new hire, part of the period", "2027-02-15")
t.const("days", 7, None).const("hrs", 56, None).rng("rate", 85, 95, 5, "money"); pay_vars(t)
t.doc("HR master file extract", {"Employee": "K. Bernardo", "Status": "Active, hired 2027-02-08", "Hourly rate": "{{rate}}", "Personnel action form": "Signed, rate {{rate}}, start 2027-02-08"})
t.doc("Payroll register line", register("K. Bernardo")); t.doc("Time record", timecard("K. Bernardo"))
t.post("The new hire started on February 8 with a signed personnel action, so 56 hours (seven days) is the right pay for the period. Do not hold a mid-period start.", *J_PAY)

# =============================================================== C. FIXED ASSETS (4)
t = new("Fixed assets: a tire replacement booked as an asset", "2027-02-09")
t.rng("net", 12000, 18000, 500, "money").pct("vat", "net", 12).add("gross", "net", "vat").rng("inv", 1800, 1899)
t.doc("Supplier invoice", {"Invoice no.": "TT-{{inv}}", "Supplier": "Tires Today", "Description": "Four replacement tires for the delivery truck", "Net amount": "{{net}}", "VAT 12%": "{{vat}}", "Total": "{{gross}}"})
t.doc("Journal entry request", {"Requested by": "Bookkeeper", "Debit": "1500 Fixed Assets {{net}}", "Reason": "The truck is a fixed asset"})
t.hold("CAPEX_ERROR", "New tires keep the truck in working order. They do not extend its life or capacity, so they are a repair and maintenance expense, not a fixed asset.")

t = new("Fixed assets: a delivery motorcycle", "2027-02-15")
t.const("net", 100800).pct("vat", "net", 12).add("gross", "net", "vat").rng("po", 4420, 4429).rng("rr", 4200, 4299).rng("inv", 2200, 2299)
t.doc("Purchase order", {"PO no.": "PO-{{po}}", "Item": "Delivery motorcycle, 150 cc", "Order total (incl. 12% VAT)": "{{gross}}", "Approved by": GM})
t.doc("Receiving report", {"RR no.": "RR-{{rr}}", "Date": "2027-02-15", "Received by": "Warehouse head M. Sison", "Registered": "LTO registration attached"})
t.doc("Supplier invoice", {"Invoice no.": "MM-{{inv}}", "Supplier": "Central Luzon Motors", "Net amount": "{{net}}", "VAT 12%": "{{vat}}", "Total": "{{gross}}"})
t.post("A motorcycle with a long life, approved by the General Manager, received and registered. Capitalize it: fixed assets {{net}}, input VAT {{vat}} and the payable {{gross}}.", DR("1500", "net"), DR("1160", "vat"), CR("2000", "gross"))

t = new("Fixed assets: depreciation booked before the asset was in use", "2027-02-26")
t.const("cost", 100800).const("dep", 1400)
t.doc("Depreciation schedule", {"Asset": "Delivery motorcycle, cost {{cost}}", "Placed in service": "2027-02-24", "Policy": "Depreciation starts the month after the asset is placed in service", "February depreciation shown": "{{dep}} ({{cost}} over 72 months)"})
t.hold("CUTOFF", "The motorcycle went into service on February 24. By policy depreciation starts in March, so booking a month of depreciation ({{dep}}) in February charges the wrong period.")

t = new("Fixed assets: sale of an old delivery van at a gain", "2027-02-25")
t.rng("price", 60000, 80000, 5000).pct("vat", "price", 12).add("recv", "price", "vat").const("cost", 520000).const("acc", 468000).const("cv", 52000).sub("gain", "price", "cv").rng("or", 2300, 2399)
t.doc("Disposal approval", {"Asset": "Delivery van, cost {{cost}}", "Accumulated depreciation": "{{acc}}", "Carrying amount": "{{cv}}", "Approved by": GM})
t.doc("Official receipt", {"OR no.": "OR-{{or}}", "Buyer": "Gapan Haulers", "Sale price net of VAT": "{{price}}", "VAT 12%": "{{vat}}", "Amount received": "{{recv}}"})
t.doc("Bank deposit slip", {"Date": "2027-02-25", "Deposited to": "Operating account", "Amount": "{{recv}}", "Validated by bank": "Yes"})
t.post("Remove the van and its accumulated depreciation, record the cash and output VAT, and take the {{gain}} difference between the {{price}} price and the {{cv}} carrying amount as a gain on disposal.", DR("1000", "recv"), DR("1590", "acc"), CR("1500", "cost"), CR("2200", "vat"), CR("4100", "gain"))
t.rule(lambda v: v["price"] > v["cv"])

# =============================================================== D. MONTH-END (6)
t = new("Month-end: supplier invoice dated before the goods came", "2027-02-26")
t.rng("q", 150, 300, 50).money("q", 245).rng("po", 4425, 4499).rng("rr", 4300, 4399).rng("inv", 20800, 20899)
t.doc(POLICY["type"], POLICY["fields"]); po(t, "PO-{{po}}", "2027-02-20", LPC, CEM, "{{q}}", "245.00", "{{gross}}", GM)
rr(t, "RR-{{rr}}", "2027-03-02", CEM, "{{q}}", note="Delivered on March 2"); inv(t, "LP-{{inv}}", "2027-02-26", LPC, CEM, "{{q}}", "245.00", "{{net}}", "{{vat}}", "{{gross}}")
t.hold("CUTOFF", "The invoice is dated February 26 but the goods arrived on March 2. The inventory ({{net}}) and the payable ({{gross}}) belong to March. Recording them in February overstates both.")

t = new("Month-end: electricity for February, bill not yet received", "2027-02-28")
t.rng("amt", 12000, 18000, 1000, "money")
t.doc("Accrual memo", {"Expense": "Electricity, February 2027", "Basis": "Meter reading on 2027-02-28 and the January rate", "Estimated amount": "{{amt}}", "Prepared by": "Bookkeeper", "Approved by": f"{FIN} (signed)"})
t.post("The electricity was used in February, so the expense of {{amt}} belongs to February even though the bill comes in March. Record the approved accrual.", DR("5100", "amt"), CR("2300", "amt"))

t = new("Month-end: a manual entry with no approval", "2027-02-28")
t.rng("amt", 40000, 80000, 10000, "money")
t.doc("Journal entry request", {"Entry": "Debit 5100 Operating Expenses {{amt}}; credit 1000 Cash in Bank {{amt}}", "Description": "Owner's family expense", "Prepared by": "Bookkeeper", "Approved by": "(blank)"})
t.hold("NO_AUTHORIZATION", "A manual journal entry for {{amt}} with no approval, and the description shows a personal expense of the owner booked as a business expense. It must not be posted without authorization.")

t = new("Month-end: allowance for doubtful accounts", "2027-02-28")
t.rng("over", 60000, 100000, 10000, "money").pct("allow", "over", 25)
t.doc("Aging of receivables", {"Over 90 days": "{{over}}", "Policy": "Provide 25% of balances over 90 days", "Allowance needed": "{{allow}}", "Allowance now": "0.00"})
t.doc("Adjusting entry memo", {"Entry": "Debit 5110 Bad Debts Expense {{allow}}; credit 1110 Allowance {{allow}}", "Approved by": f"{FIN} (signed)"})
t.post("25% of {{over}} is {{allow}} and no allowance exists yet. The adjustment is approved and follows the policy. Record it.", DR("5110", "allow"), CR("1110", "allow"))

t = new("Month-end: the same person prepared and approved the entry", "2027-02-28")
t.rng("amt", 8000, 16000, 500, "money")
t.doc("Journal entry request", {"Entry": "Debit 1200 Merchandise Inventory {{amt}}; credit 5000 Cost of Goods Sold {{amt}}", "Description": "Inventory count adjustment", "Prepared by": FIN, "Approved by": FIN})
t.hold("SOD", "C. Ramos both prepared and approved the same entry. An adjustment to inventory and cost of goods sold needs a second person to approve it.")

t = new("Month-end: bank charges", "2027-02-28")
t.rng("fee", 650, 950, 50, "money")
t.doc("Bank statement extract", {"Date": "2027-02-28", "Service charge": "{{fee}}", "Account": "Operating account"})
t.doc("Journal entry memo", {"Entry": "Debit 5100 Operating Expenses {{fee}}; credit 1000 Cash in Bank {{fee}}", "Approved by": f"{FIN} (signed)"})
t.post("A small charge of {{fee}} that the bank statement supports, with an approved memo. Record it. Small clean items are posted, not held.", DR("5100", "fee"), CR("1000", "fee"))

# =============================================================== the importer file
def build():
    n_post = sum(1 for t in TX if t.key["decision"] == "POST")
    return {"id": SET_ID,
            "title": f"Expenditure, payroll and month-end controls ({COMPANY}, February 2027)",
            "topic": "Expenditure cycle, payroll, fixed assets and close",
            "summary": f"{len(TX)} documents at a hardware and construction supply store: purchases and payments, payroll, fixed assets and the month-end close. Review each packet, post the valid ones with the right journal and hold the ones that fail a control, naming the control. Harder than Set 1: partial deliveries, tolerances, delegated approvals, orders split to avoid a limit, a reformatted duplicate invoice, and clean documents that look wrong.",
            "meta": {"valid": n_post, "period": "2027-02", "vat_rate": 12, "documents": len(TX), "exceptions": len(TX) - n_post, "hall_topic": "Expenditure cycle, payroll, fixed assets, close",
                     "population": {"from": "2027-02-01", "to": "2027-02-26", "count": 400, "approval_limit": 50000, "customers": CUSTOMERS}},
            "txns": [{"seq": i + 1, "template": {"title": t.title, "date": t.date, "company": COMPANY, "docs": t.docs, "vars": t.vars}, "key": t.key} for i, t in enumerate(TX)]}

# ---- local engine (mirrors ais__resolve_vars / ais__subst) used for the checks
def val(vs, x): return Decimal(str(x)) if isinstance(x, (int, float)) else vs[x]
def resolve(t, rnd):
    vs = {}; fmt = {}
    for e in t.vars:
        n = e["name"]
        if "pick" in e: vs[n] = rnd.choice(e["pick"])
        elif "range" in e:
            lo, hi, st = (Decimal(str(z)) for z in e["range"]); k = int((hi - lo) / st) + 1
            vs[n] = lo + st * rnd.randrange(k)
        elif e["op"] == "mul": vs[n] = (val(vs, e["a"]) * val(vs, e["b"])).quantize(Decimal("0.01"), ROUND_HALF_UP)
        elif e["op"] == "sub": vs[n] = (val(vs, e["a"]) - val(vs, e["b"])).quantize(Decimal("0.01"), ROUND_HALF_UP)
        elif e["op"] == "pct": vs[n] = (val(vs, e["a"]) * Decimal(str(e["pct"])) / 100).quantize(Decimal("0.01"), ROUND_HALF_UP)
        elif e["op"] == "add": vs[n] = sum((val(vs, x) for x in e["terms"]), Decimal(0)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        if "fmt" in e: fmt[n] = e["fmt"]
    return vs, fmt
def text(s, vs, fmt):
    def one(m):
        raw = vs
        for p in m.group(1).split("."): raw = raw[p]
        if isinstance(raw, Decimal): return f"{raw:,.2f}" if fmt.get(m.group(1)) == "money" else (str(int(raw)) if raw == raw.to_integral() else str(raw.normalize()))
        return str(raw)
    return re.sub(r"\{\{([A-Za-z0-9_.]+)\}\}", one, s)
def walk(x, f):
    if isinstance(x, str): f(x)
    elif isinstance(x, dict):
        for k, v in x.items():
            if "{{" in k: raise ValueError(f"a variable in a field name is not substituted by the engine: {k}")
            walk(v, f)
    elif isinstance(x, list): [walk(v, f) for v in x]

def check(draws=200):
    rnd = random.Random(7); bad = 0
    for i, t in enumerate(TX, 1):
        names = [e["name"] for e in t.vars]
        if len(set(names)) != len(names): print(f"tx {i}: duplicate variable names"); bad += 1
        for d in range(draws):
            vs, fmt = resolve(t, rnd)
            try:
                walk({"title": t.title, "docs": t.docs, "key": t.key}, lambda s: text(s, vs, fmt))
            except KeyError as e:
                print(f"tx {i} {t.title}: unknown variable {e}"); bad += 1; break
            if t.key["decision"] == "POST":
                dr = sum(val(vs, l["dr"]) for l in t.key["journal"] if "dr" in l); cr = sum(val(vs, l["cr"]) for l in t.key["journal"] if "cr" in l)
                if dr != cr: print(f"tx {i} {t.title}: journal does not balance {dr} {cr}"); bad += 1; break
            if any(not r(vs) for r in t.rules): print(f"tx {i} {t.title}: a trap rule failed"); bad += 1; break
    posts = sum(1 for t in TX if t.key["decision"] == "POST")
    print(f"{len(TX)} templates ({posts} POST, {len(TX) - posts} HOLD), {draws} draws each, problems: {bad}")
    return bad

if __name__ == "__main__":
    bad = check()
    if "--check" not in sys.argv and not bad:
        for path in ("set2-pinagpala.json", "../../src/lib/aisSets/pinagpala-expenditure-feb-2027.json"):   # the second is the copy the app ships with
            json.dump(build(), open(path, "w"), indent=1, ensure_ascii=False)
        print("wrote set2-pinagpala.json and the app's copy")
    sys.exit(1 if bad else 0)
