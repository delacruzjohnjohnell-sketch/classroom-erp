#!/usr/bin/env python3
"""Builds the team handout and the teacher key for Activity 3 Manufacturing (Capiz Lantern Works, February and March 2027).
Reads rows.json (written by `python3 gen.py handout`; one row per step: n, role, date, where, what) so the handout can never disagree with the answer key.
Writes student.html and teacher-key.html next to this file; the PDFs are made from them with headless Chrome (see ACTIVITY_3_PLAN.md)."""
import json, os, html, subprocess, sys
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, os.path.join(HERE, "gen.py"), "handout"], check=True, capture_output=True)
ROWS = json.load(open(os.path.join(HERE, "rows.json")))
esc = lambda s: html.escape(s, quote=False)

ROLES = OrderedDict([
    ("PURCHASING", ("Purchasing officer", "Vendors, purchase orders (from requisitions and by hand), vendor invoices, paying vendors.",
        "You receive requirements from Production's planning run and hand goods-to-be-received orders to the Warehouse. The Accountant handles landed cost; you pay what is due, and the Finance manager pays the large bills.")),
    ("WAREHOUSE", ("Warehouse clerk", "Goods receipts, issuing material to production orders, deliveries to customers, stock counts and moves between stores.",
        "You wait for Purchasing's order before a receipt, and for Production's release before you issue material. Quality decides what you received; Sales invoices what you deliver.")),
    ("PRODUCTION", ("Production planner", "Items, bills of materials, routings, work centers and stores; planning runs; production orders, confirmations, finished goods, downtime.",
        "Your planning run tells Purchasing what to buy. You release orders for the Warehouse to issue against, and your finished lamps go to Quality before Sales can ship them.")),
    ("QUALITY", ("Quality inspector", "Inspection plans, inspecting bought goods and every finished lamp, deciding accept / scrap / return / rework, closing non-conformance reports.",
        "You inspect what the Warehouse received and what Production finished. Nothing in QUARANTINE can be used or sold until you decide.")),
    ("SALES", ("Sales and shipping clerk", "Customers, sales orders, creating the invoice from a delivery and sending it.",
        "You take the orders that start the planning run. After the Warehouse delivers, you create and send the invoice; the Finance manager records the customer's payment.")),
    ("ACCOUNTANT", ("Accountant", "Activity rates, the overhead sheet, cost estimates, journal vouchers, vendor invoices at the start, landed cost, depreciation, settling the semi-finished orders.",
        "Production needs your standard costs before it plans. Your override vouchers wait for the Finance manager to approve (never the person who prepared them).")),
    ("FINANCE_MANAGER", ("Finance manager", "Everything the accountant does, plus approving vouchers and held invoices, reversing wrong vouchers, recording customer payments, paying big bills, settling the finished-lamp orders, settling and closing the month.",
        "You approve what others prepared, so you cannot approve your own work. Closing a month is the last step: months close oldest first.")),
])
RL = {k: v[0] for k, v in ROLES.items()}
by_role = {k: [r for r in ROWS if r["role"] == k] for k in ROLES}
cnt = Counter(r["role"] for r in ROWS)
pretty = lambda d: {"01": "Jan", "02": "Feb", "03": "Mar"}[d[5:7]] + " " + str(int(d[8:]))

CSS = """
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#1b2433; font-size:9.5pt; line-height:1.4; }
h1 { font-size:24pt; margin:0 0 4px; } h2 { font-size:14pt; margin:18px 0 4px; border-bottom:2px solid #2f5bea; padding-bottom:2px; break-after:avoid; }
h3 { font-size:11pt; margin:10px 0 3px; break-after:avoid; }
.k { color:#2f5bea; letter-spacing:.12em; font-weight:700; font-size:9pt; } .note { color:#4a566a; margin:2px 0 6px; }
table { width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:8.6pt; }
th { background:#eef2fb; text-align:left; } th,td { border:1px solid #d7dde6; padding:3px 6px; vertical-align:top; }
tr { break-inside:avoid; } td.n { text-align:right; white-space:nowrap; } td.d { white-space:nowrap; }
.tip,.warn,.box { border-radius:5px; padding:6px 10px; margin:8px 0; font-size:9pt; break-inside:avoid; }
.tip { background:#eaf7ee; border-left:4px solid #2e9e5b; } .warn { background:#fff5e0; border-left:4px solid #e0a020; } .box { border:1px solid #d7dde6; background:#f7f9fd; }
ol,ul { padding-left:18px; margin:5px 0 8px; } li { margin:2px 0; } .pb { page-break-before:always; }
"""
doc = lambda t, b: f'<!doctype html><html><head><meta charset="utf-8"><title>{esc(t)}</title><style>{CSS}</style></head><body>{b}</body></html>'
def table(head, rows, cls=""):
    return f'<table class="{cls}"><thead><tr>' + "".join(f"<th>{h}</th>" for h in head) + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td{c}>{v}</td>" for v, c in row) + "</tr>" for row in rows) + "</tbody></table>"
def steps_table(rs, with_role=False):
    head = ["#", "Date", "Screen"] + (["Role"] if with_role else []) + ["What to do"]
    body = [[(str(r["n"]), ' class="n"'), (pretty(r["date"]), ' class="d"'), (esc(r["where"]), "")] + ([(RL[r["role"]], "")] if with_role else []) + [(r["what"], "")] for r in rs]
    return table(head, body)

# ============================================================== STUDENT HANDOUT
S = []
S.append('<div class="k">JJ AND CO. · MANUFACTURING ERP · ACTIVITY 3 MANUFACTURING (TEAM)</div><h1>Capiz Lantern Works</h1>'
         '<p class="note" style="font-size:12pt">A real small factory run by a team over two months: February and March 2027. Each of you holds one or more roles, and every step below belongs to a role.</p>')
S.append('<div class="box"><b>Duration</b> 2 months · <b>Company</b> a TEAM company made by your teacher (Standard costing) · <b>Steps</b> ' + str(len(ROWS)) + ' in all, spread over the roles · '
         '<b>Currency / tax</b> Philippine peso, 12% VAT · <b>Checked</b> by your teacher on the company itself; nothing to hand in.</div>')
S.append("<h2>1. The business</h2><p>Capiz Lantern Works makes lamps from capiz shell: three semi-finished parts (small shade, large shade, brass base) become five lamps (small and large pendant, table lamp, floor lamp, four-arm chandelier). "
         "Ten materials are bought from five vendors, shells by the <b>bundle</b> (5 kg) but stocked by the <b>kg</b>. Six customers order lamps. The owner puts in ₱1,500,000 and buys a capiz cutting machine.</p>")
S.append("<h2>2. Your team and your roles</h2>"
         "<p>Your teacher decides how many of you there are and who holds which role, and can <b>change it at any time</b> (Teams screen). One person can hold several roles; several people can hold the same role. "
         "<b>Do only the steps of the roles you hold.</b> The system refuses anything else (for example, a warehouse clerk cannot create a purchase order) and tells you which role you would need.</p>")
S.append(table(["Role", "Steps", "What this role does"], [[(RL[k], ""), (str(cnt[k]), ' class="n"'), (esc(ROLES[k][1]), "")] for k in ROLES]))
S.append("<h2>3. Read this before you start</h2><ol>"
         "<li><b>Work in step order.</b> The # column is the order of the whole company. If the step just before yours belongs to another role and is not done yet, wait or ask that teammate.</li>"
         "<li><b>Type the date shown on every form.</b> Most forms start with today's date; the dates drive the books, the closing and the check. <b>Issue material</b> posts at once: set its Date first.</li>"
         "<li><b>Names and SKUs must match exactly.</b> The check finds items by SKU and vendors and customers by name.</li>"
         "<li><b>QUARANTINE.</b> Items that are inspected on receipt, and every finished lamp, go to the QUARANTINE store first. Nothing there can be used or sold until Quality has decided.</li>"
         "<li><b>Two people for approvals.</b> A voucher that needs approval (override ticked) and a vendor invoice on hold are approved or released by the Finance manager, never by the person who prepared them.</li>"
         "<li><b>Months close in order.</b> Settle every order, then the month, then close it. February must be closed before March is closed.</li>"
         "<li><b>Do not use Payroll, Banking or the maintenance log</b>: they are not part of this activity. Payroll is a plain journal voucher here.</li>"
         "<li><b>Do not delete or edit posted documents.</b> If a step says reverse, use Reverse; if you made a mistake, tell your teacher.</li></ol>")
S.append('<div class="tip"><b>TIP</b> The dates are in the future compared with today on purpose. The screens allow it, and the month-end check will say a month is not over yet: that is fine for this activity.</div>')
for k in ROLES:
    S.append(f'<div class="pb"></div><h2>Role: {RL[k]} — {cnt[k]} steps</h2>')
    S.append(f'<p><b>What you do.</b> {esc(ROLES[k][1])}</p><p><b>Hand-offs.</b> {esc(ROLES[k][2])}</p>')
    for month, label in (("2027-02", "February 2027"), ("2027-03", "March 2027")):
        rs = [r for r in by_role[k] if r["date"].startswith(month)]
        if rs:
            S.append(f"<h3>{label} — {len(rs)} steps</h3>")
            S.append(steps_table(rs))
S.append('<div class="pb"></div><h2>When you are finished</h2><p>Tell your teacher. The Check compares the whole company with the answer figures and shows, line by line, what does not match. '
         'When your teacher releases the answer key you can open it as a separate read-only company and compare each screen.</p>')
open(os.path.join(HERE, "student.html"), "w").write(doc("Activity 3 Manufacturing — Capiz Lantern Works (team handout)", "".join(S)))

# ============================================================== TEACHER KEY
T = []
T.append('<div class="k">JJ AND CO. · MANUFACTURING ERP · ACTIVITY 3 MANUFACTURING (TEAM) · TEACHER KEY</div><h1>Capiz Lantern Works — teacher key</h1>')
T.append(f'<p class="note">{len(ROWS)} steps over two months. The answer key was run through the real functions as one user holding every role (migration 0063) and its figures are stored for the Check (migration 0064).</p>')
T.append("<h2>1. Set up the team</h2><ol>"
         "<li>Teacher page → <b>New team company</b>: name it, fiscal year start <b>2026-01-01</b>, <b>Standard costing</b>. It must stay empty.</li>"
         "<li><b>Teams</b> screen: add each student and tick their roles. You can change members and roles later at any time; the books do not care who posts.</li>"
         "<li>The handout is written by ROLE. Give each student the pages of the roles they hold (each role starts on its own page).</li></ol>")
T.append(table(["Team size", "Suggested split"], [
    [("2", ""), ("A: Production, Warehouse, Quality, Purchasing. B: Sales, Accountant, Finance manager.", "")],
    [("3", ""), ("A: Production, Quality. B: Purchasing, Warehouse, Sales. C: Accountant, Finance manager.", "")],
    [("5", ""), ("Production + Quality · Purchasing · Warehouse + Sales · Accountant · Finance manager.", "")],
    [("7", ""), ("One role each.", "")]]))
T.append("<p><b>Rule that needs two people:</b> the Finance manager must not be the person who prepared a voucher or entered a held invoice. If one student holds both Accountant and Finance manager, those approval steps cannot be completed by them alone; give the roles to different students.</p>")
T.append("<h2>2. Key figures</h2>" + table(["Item", "Figure"], [
    [("Net profit, February + March 2027", ""), ("₱680,293.20", ' class="n"')],
    [("Sales orders / invoices", ""), ("13 / 15 (SO-0013 is shipped 18 of 20 small pendants, 2 were scrapped)", "")],
    [("Production orders", ""), ("34 (including one hand-made rush order for 6 small shades)", "")],
    [("Vendor invoices", ""), ("25 (VI-0018 is rejected, then entered again as VI-0021); 26 bills with the freight bill", "")],
    [("Inspection lots", ""), ("32 (the PEN-S lot is split: 46 accepted, 4 reworked, of which 2 accepted and 2 scrapped)", "")],
    [("Customer payments / vendor payments", ""), ("9 totalling ₱881,688.00 / 23 totalling ₱422,434.21", "")],
    [("Months", ""), ("February and March 2027 both closed", "")]]))
T.append("<h2>3. Things the activity is designed to teach</h2><ul>"
         "<li>Bundles bought, kilograms stocked; a revised bill of materials (small pendant gets 2 foam pads in March) and a new standard cost.</li>"
         "<li>Inspection on receipt and on every finished lamp; return to vendor, scrap, rework and non-conformance reports.</li>"
         "<li>A held vendor invoice released by the Finance manager, another rejected and entered again.</li>"
         "<li>Vouchers needing a second person; a wrong voucher reversed and entered again; a control account that only an override voucher may touch.</li>"
         "<li>Partial deliveries and partial payments; a rush purchase and a hand-made rush order after scrap.</li></ul>")
T.append("<h2>4. Common slips (and what the Check shows)</h2>" + table(["Slip", "What you will see"], [
    [("Material issued with today's date", ""), ("Costs land in the wrong month; the month will not close. Reverse the issue and post it again with the right date.", "")],
    [("Finished lamps received into the normal store", ""), ("No inspection lot; the Quality group fails.", "")],
    [("Vendor invoice entered before all goods were received", ""), ("A smaller invoice than the key; void it and enter it again.", "")],
    [("Wrong role tries a step", ""), ("The system refuses and names the role needed: change the member's roles on the Teams screen.", "")],
    [("Month closed before its orders are settled", ""), ("Period End warns; variances land in the next month.", "")]]))
T.append("<h2>5. Marking</h2><p>Open <b>Teacher</b> → the team's company → <b>Check</b>, choose <i>Activity 3 Manufacturing — Capiz Lantern Works</i>. Below the check results, <b>Who posted what</b> lists every member with their roles and the number of documents each posted, so the work can be graded fairly even when roles changed hands.</p>")
T.append('<div class="pb"></div><h2>6. The whole sequence</h2><p class="note">Every step in company order, with its role.</p>')
T.append(steps_table(ROWS, with_role=True))
open(os.path.join(HERE, "teacher-key.html"), "w").write(doc("Activity 3 Manufacturing — Teacher key", "".join(T)))
print("ok", len(ROWS), "steps")
