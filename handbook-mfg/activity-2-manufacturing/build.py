#!/usr/bin/env python3
"""Builds the student handout and the teacher key for Activity 2 Manufacturing (Rattan Furniture Works, December 2026 and January 2027).
Every figure comes from the answer-key run (supabase/migrations/0061_mfg_answer_key_activity_2.sql, pinned by tests/mfgPracticeCheck.test.ts and the stored
set in migration 0060) and was reproduced to the centavo by a real click-through of the screens (see ACTIVITY_2_PLAN.md, 'Stage 5 pilot')."""
import os, html

HERE = os.path.dirname(os.path.abspath(__file__))
def esc(s): return html.escape(s, quote=False)

def table(head, rows, cls=""):
    h = "".join(f"<th>{c}</th>" for c in head)
    r = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f'<table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table>'
def tip(t): return f'<div class="tip"><b>TIP</b> {t}</div>'
def warn(t): return f'<div class="warn"><b>WATCH</b> {t}</div>'
def part(title, note=""): return f'<h2>{title}</h2>' + (f'<p class="note">{note}</p>' if note else "")

CSS = """
@page { size: A4; margin: 15mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#1b2433; font-size:10pt; line-height:1.42; }
h1 { font-size:24pt; margin:0 0 4px; } h2 { font-size:14pt; margin:20px 0 4px; border-bottom:2px solid #2f5bea; padding-bottom:2px; break-after:avoid; }
h3 { font-size:11pt; margin:12px 0 3px; break-after:avoid; }
.k { color:#2f5bea; letter-spacing:.12em; font-weight:700; font-size:9pt; }
.meta { display:grid; grid-template-columns:34mm 1fr; gap:3px 8px; margin:10px 0 14px; font-size:9.5pt; } .meta dt { color:#6b778a; } .meta dd { margin:0; font-weight:600; }
.note { color:#4a566a; margin:2px 0 6px; }
table { width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:9pt; break-inside:avoid; }
th { background:#eef2fb; text-align:left; } th,td { border:1px solid #d7dde6; padding:4px 7px; vertical-align:top; }
td.n, th.n { text-align:right; white-space:nowrap; }
.tip,.warn { border-radius:5px; padding:6px 10px; margin:8px 0; font-size:9pt; break-inside:avoid; }
.tip { background:#eaf7ee; border-left:4px solid #2e9e5b; } .warn { background:#fff5e0; border-left:4px solid #e0a020; }
ol,ul { padding-left:18px; margin:5px 0 8px; } li { margin:2px 0; }
.box { border:1px solid #d7dde6; border-radius:6px; padding:8px 12px; margin:8px 0; background:#f7f9fd; break-inside:avoid; }
.pb { page-break-before:always; }
"""

def doc(title, body):
    return f'<!doctype html><html><head><meta charset="utf-8"><title>{esc(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'

# ======================================================================== STUDENT HANDOUT
S = []
S.append('<div class="k">JJ AND CO. · MANUFACTURING ERP · ACTIVITY 2 MANUFACTURING</div><h1>Rattan Furniture Works</h1><p class="note" style="font-size:12pt">A full manufacturing operation over two months: December 2026 and January 2027.</p>')
S.append('<dl class="meta"><dt>Duration</dt><dd>2 months, December 1, 2026 – January 31, 2027</dd>'
         '<dt>Company</dt><dd>A NEW Manufacturing company of your own (Standard costing). Activity 1 stays untouched.</dd>'
         '<dt>Modules covered</dt><dd>Master Data, Costing, Sales, Planning (MRP), Purchasing, Inventory, Production, Shop Floor, Quality, Shipping, Finance, Fixed Assets, Period End, Reports</dd>'
         '<dt>Currency / tax</dt><dd>Philippine peso (₱); 12% VAT on invoices, vendor invoices and the freight bill</dd>'
         '<dt>Before you start</dt><dd>Finish Activity 1 and read the Manufacturing handbook chapters for the screens you use</dd>'
         '<dt>How it is graded</dt><dd>Your teacher checks your company directly. There is nothing to hand in.</dd></dl>')
S.append(part("1. Overview", "You run a small furniture workshop that makes rattan chairs and side tables. Chairs and tables are built in two levels: a wooden frame is made first, then the frame is woven, upholstered, varnished and boxed into the finished piece. This time you do not type every purchase order by hand: you take the customers' orders, run planning (MRP), and let it tell you what to make and what to buy. Along the way you also receive goods into quarantine and inspect them, pay freight, correct a wrong confirmation, buy a machine, log a breakdown and close months in order."))
S.append('<div class="box"><b>How you will be checked.</b> Your teacher opens the Teacher page, finds your company and clicks <b>Check</b>. The check compares your company with this exercise and reports, line by line, what matches and what does not: company setup, items, bills of materials, routings and standard costs, purchase orders, vendor invoices and bills, batches, inspection lots and the non-conformance report, production orders, invoices, payments, the loom, downtime, reversals, stock, every ledger balance, the manual vouchers and whether both months are closed. Each miss comes with a hint. Fix it and ask for another check.</div>')
S.append(part("2. Read this before you start", "TEN THINGS THAT TRIP PEOPLE UP"))
S.append("<ol>"
  "<li><b>Start a NEW company.</b> Use <b>+ New company</b> next to the company switcher (you may own up to five). Name it anything you like, Standard costing. It must be empty. Do not do this exercise in your Activity 1 company.</li>"
  "<li><b>Type the date on every form.</b> Receipts, issues, confirmations, deliveries, invoices, payments, vouchers, reversals, settlements and depreciation all post on the date you enter, and most forms start with <b>today's real date</b>. The dates in the tables are the dates to type.</li>"
  "<li><b>The date box of \"Issue material to the order\" is the important one.</b> That button posts immediately. Set the Date <i>first</i>, then click it. If you post a wrong date, use <b>Reverse</b> on that document and issue again.</li>"
  "<li><b>Names and SKUs must match exactly</b> (Frame wood, FRM-WD…). The check finds items by SKU and vendors and customers by name.</li>"
  "<li><b>Standard costs come from Costing.</b> After you release the four cost estimates they must show: Chair frame ₱475.75, Table frame ₱840.50, Rattan chair ₱1,244.45, Side table ₱1,344.00. If not, a bill, routing, rate or the overhead rate is off; fix it before buying anything.</li>"
  "<li><b>Tick the final confirmation on the last operation</b> of every production order (choose operation 20 for chairs and tables to see the box). Without it the order cannot be settled.</li>"
  "<li><b>Enter the rattan vendor's January invoice last</b>, after the 4 kg of replacement rattan has been received and inspected. Otherwise it bills only what had arrived and you must void it.</li>"
  "<li><b>Close October and November first.</b> Period End lists October 2026 and November 2026 as open months with nothing important in them. Months close oldest first, so settle and close both before December. The screen warns \"This month is not over yet\"; go on.</li>"
  "<li><b>Create each invoice on the Shipping screen</b> (invoice date and due date first), then <b>Send invoice</b> on Sales. Do not use \"Convert to invoice\".</li>"
  "<li><b>Do not use Payroll, Banking or the maintenance log.</b> They are not part of this exercise.</li></ol>")

# ---- PART A
S.append(part("3. Step by step", "The steps run in order. Dates are 2026 until the January section."))
S.append("<h3>A. Set up the company (December 1)</h3>")
S.append("<p><b>A1. New company.</b> Click <b>+ New company</b>, type a company name, leave the fiscal year start (January 1, 2026), choose <b>Standard costing</b>, then <b>Create my Manufacturing company</b>.</p>")
S.append("<h3>A2. Items (Master Data → Items → Add item)</h3><p>Fill SKU, Name, Unit of measure, Item type and Make or buy. For <b>bought</b> items fill <b>Purchase lead time (days)</b> 3 and the Planned price; for <b>made</b> items fill <b>Production lead time (days)</b>. Leave the rest as it is, with these exceptions: Varnish ticks <b>Track batches / lots</b>; the two frames get <b>Usual storage location RM-STORE</b> (so the next order finds them).</p>")
S.append(table(["SKU", "Name", "Unit", "Item type", "Make / buy", "Lead time (days)", "Planned price"], [
  ["FRM-WD", "Frame wood", "BF", "Raw material", "Buy", "3", "95"], ["RAT-STR", "Rattan strip", "KG", "Raw material", "Buy", "3", "160"],
  ["FAB-CL", "Cushion fabric", "M", "Raw material", "Buy", "3", "120"], ["FOM-CS", "Foam cushion", "PC", "Raw material", "Buy", "3", "85"],
  ["VAR-GL", "Varnish", "L", "Raw material (track batches)", "Buy", "3", "320"], ["SCR-WD", "Wood screws", "PC", "Raw material", "Buy", "3", "1"],
  ["CTN-BX", "Carton box", "PC", "Packaging", "Buy", "3", "40"],
  ["FRM-CH", "Chair frame", "PC", "Semi-finished (RM-STORE)", "Make", "2", "—"], ["FRM-TB", "Table frame", "PC", "Semi-finished (RM-STORE)", "Make", "2", "—"],
  ["CHR-RT", "Rattan chair", "PC", "Finished good", "Make", "3", "—"], ["TBL-SD", "Side table", "PC", "Finished good", "Make", "3", "—"]]))
S.append("<h3>A3. Work centers (Master Data → Work centers → Add work center)</h3><p>Create <b>Frame shop</b>, <b>Weaving</b> and <b>Finishing</b>: type only the name and leave shifts, hours, utilization and days as the form fills them in.</p>")
S.append("<h3>A4. Activity rates (Master Data → Activity rates → Add rate)</h3><p>Six rates, all <b>from the month starting 2026-12-01</b>. Use only <b>Direct labor</b> and <b>Machine time</b>.</p>")
S.append(table(["Work center", "Direct labor, per hour", "Machine time, per hour"], [["Frame shop", "80", "30"], ["Weaving", "80", "25"], ["Finishing", "80", "40"]]))
S.append("<h3>A5. Overhead (Master Data → Costing sheet)</h3><p>Click the pencil on the <b>Fixed overhead</b> row and set <b>Plus ₱ per hour</b> to <b>30</b>. Leave the rest.</p>")
S.append("<h3>A6. Bills of materials (Master Data → Bills of materials → New BOM)</h3><p>Choose the item, set <b>Valid from</b> to <b>2026-12-01</b>, add the components (the unit fills in by itself), <b>Save draft</b>, then <b>Activate</b> (confirm the pop-up). Make the frames first.</p>")
S.append(table(["Product", "Components"], [
  ["FRM-CH Chair frame", "Frame wood 3 BF · Varnish 0.25 L · Wood screws 8 PC"],
  ["FRM-TB Table frame", "Frame wood 6 BF · Varnish 0.4 L · Wood screws 12 PC"],
  ["CHR-RT Rattan chair", "Chair frame 1 PC · Rattan strip 2 KG · Cushion fabric 0.5 M · Foam cushion 1 PC · Carton box 1 PC"],
  ["TBL-SD Side table", "Table frame 1 PC · Rattan strip 1.5 KG · Carton box 1 PC"]]))
S.append("<h3>A7. Routings (Master Data → Routings → New routing)</h3><p>Choose the item, enter the operations (op number, what is done, work center, then the minutes), <b>Save draft</b>, then <b>Activate</b>. Leave teardown, queue and move at 0.</p>")
S.append(table(["Product", "Op", "What is done", "Work center", "Setup min", "Run min / unit", "Labor min / unit", "Machine min / unit"], [
  ["FRM-CH", "10", "Cut and join the frame", "Frame shop", "30", "48", "48", "24"],
  ["FRM-TB", "10", "Cut and join the frame", "Frame shop", "30", "60", "60", "30"],
  ["CHR-RT", "10", "Weave and upholster", "Weaving", "30", "90", "90", "45"], ["CHR-RT", "20", "Varnish and pack", "Finishing", "24", "30", "30", "30"],
  ["TBL-SD", "10", "Weave the top", "Weaving", "30", "60", "60", "30"], ["TBL-SD", "20", "Varnish and pack", "Finishing", "30", "36", "36", "36"]]))
S.append("<h3>A8. Cost estimates (Costing → New estimate)</h3><p>Do them in this order. Costing date <b>2026-12-01</b>. Each: <b>Work out the cost</b>, <b>Mark this cost</b>, <b>Release as standard cost</b> (confirm each pop-up).</p>")
S.append(table(["Item to cost", "Lot size", "You should see"], [["Chair frame", "20", "Unit cost ₱475.75"], ["Table frame", "10", "Unit cost ₱840.50"], ["Rattan chair", "20", "Unit cost ₱1,244.45"], ["Side table", "10", "Unit cost ₱1,344.00"]]))
S.append("<p><b>A9. Starting cash</b> (Finance → New journal voucher). Voucher date <b>2026-12-01</b>, reference <b>Capital</b>, particulars <i>Owner puts in the starting cash</i>. Line 1 <b>1000 — Cash</b> debit <b>500,000</b>; line 2 <b>3000 — Owner's Equity</b> credit <b>500,000</b>. Type the account exactly as shown, then <b>Submit / post voucher</b>.</p>")
S.append("<p><b>A10. Customers</b> (Sales → Customers → New customer): <b>Greenleaf Home Store</b>, <b>Cebu Gift Shop</b>, <b>Davao Rattan Depot</b>.</p>")

# ---- PART B
S.append("<h3>B. Customers' orders (December 2 – 3)</h3>")
S.append("<p>Sales → Sales Orders → New sales order. Tax rate <b>12</b> on each, then Save and <b>Confirm</b>.</p>")
S.append(table(["Date", "Customer", "Lines", "Total"], [
  ["Dec 2", "Greenleaf Home Store", "Rattan chair 40 @ 1,850 · Side table 10 @ 1,500", "₱99,680.00"],
  ["Dec 2", "Cebu Gift Shop", "Rattan chair 30 @ 1,900", "₱63,840.00"],
  ["Dec 3", "Davao Rattan Depot", "Side table 20 @ 1,450", "₱32,480.00"]]))

# ---- PART C
S.append("<h3>C. Plan with MRP (December 1 run)</h3>")
S.append("<ol><li><b>Planning</b> → <b>Plan from 2026-12-01</b> → <b>Run planning</b>. You should see <b>4 planned orders</b> and <b>7 requisitions</b>.</li>"
         "<li><b>Planned orders</b>: you should have Chair frame 70, Table frame 30, Rattan chair 70, Side table 30. Tick the box at the top of the table, then <b>Make selected</b>. They become production orders PRD-0001 to PRD-0004.</li>"
         "<li><b>Purchase requisitions</b>: seven lines (Carton box 100, Cushion fabric 35, Foam cushion 70, Rattan strip 185, Frame wood 390, Varnish 29.5, Wood screws 920). Tick the lines of one vendor, click <b>Create purchase order…</b>, type the <b>new vendor's name</b> in the box under the vendor list, and type over the prices.</li></ol>")
S.append(table(["Vendor (new)", "Tick these requisitions", "Prices", "PO total"], [
  ["Laguna Rattan and Timber", "Rattan strip, Frame wood, Wood screws", "Rattan 160 · Frame wood 98 · Screws 1", "₱68,740.00"],
  ["Pasig Fabric and Foam", "Cushion fabric, Foam cushion, Carton box", "Fabric 120 · Foam 85 · Carton 40", "₱14,150.00"],
  ["Batangas Coatings", "Varnish", "Varnish 320", "₱9,440.00"]]))
S.append(tip("The purchase orders carry today's real date: leave it. They appear on the Purchasing page as PO-0001, PO-0002 and PO-0003. The frame wood price 98 is higher than the planned 95 on purpose: it creates a purchase price variance."))

# ---- PART D
S.append("<h3>D. Receive the goods (December 2 – 8)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Dec 2", "Purchasing → Receive (PO-0001)", "Receipt date <b>Dec 2</b>. Change the Rattan strip 'Now' box from 185 to <b>140</b> (only part arrived). Frame wood and screws as proposed. Receive into stock."],
  ["Dec 3", "Purchasing → Receive (PO-0002)", "Receipt date <b>Dec 3</b>, take everything, Receive into stock."],
  ["Dec 3", "Purchasing → Receive (PO-0003)", "Receipt date <b>Dec 3</b>. Varnish is tracked by lot: <b>Lot no. VAR-1226-A</b>, <b>expiry 2027-12-31</b>. Receive into stock."],
  ["Dec 8", "Purchasing → Receive (PO-0001 again)", "Receipt date <b>Dec 8</b>, the remaining <b>45</b> kg of rattan (the box shows it). Receive into stock."]]))

# ---- PART E
S.append("<h3>E. Make the frames, then the furniture (December 3 – 13)</h3>")
S.append("<p>Production → click the order, <b>Release</b> (confirm). Then, in each order: set the Date in <b>Materials</b> and click <b>Issue material to the order</b> (leave every quantity as proposed); <b>Confirm production</b> for each operation; and <b>Finished goods into stock</b> (type the quantity: the box starts empty).</p>")
S.append(table(["Order", "Issue date", "Confirmation(s)", "Receive"], [
  ["Chair frame, 70", "Dec 3", "Op 10: good 70, scrapped 0, labor 56, machine 28, setup 0.5, date Dec 5, <b>final</b>", "70 on Dec 5"],
  ["Table frame, 30", "Dec 3", "Op 10: good 30, labor 30, machine 15, setup 0.5, date Dec 5, <b>final</b>", "30 on Dec 5"],
  ["Rattan chair, 70", "Dec 6", "Op 10: good 70, labor 105, machine 52.5, setup 0.5, date Dec 9<br>Op 20: good <b>68</b>, scrapped <b>2</b>, why <i>Varnish ran on two chairs</i>, labor 35, machine 35, setup 0.4, date Dec 10, <b>final</b>", "68 on Dec 10"],
  ["Side table, 30", "Dec 11", "Op 10: good 30, labor 30, machine 15, setup 0.5, date Dec 12<br>Op 20: good 30, labor 18, machine 18, setup 0.5, date Dec 13, <b>final</b>", "30 on Dec 13"]]))
S.append(warn("Make the <b>Side table</b> order only after the Dec 8 rattan has arrived: it needs 45 kg that was not in stock before. The Rattan chair uses exactly the 140 kg you received on Dec 2. The confirmation form keeps the hours of the last one you posted: type every box."))

# ---- PART F
S.append("<h3>F. Vendor invoices and payments (December 4 – 29)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Dec 4", "Purchasing → Enter vendor invoice", "PO-0002 · invoice number <b>PFF-0841</b> · invoice date Dec 4 · due <b>Jan 3, 2027</b> · VAT 12. Check ₱14,150 + ₱1,698 = ₱15,848. Match and post."],
  ["Dec 4", "same", "PO-0003 · <b>BC-5532</b> · Dec 4 · due Jan 3, 2027 · total ₱10,572.80."],
  ["Dec 9", "same", "PO-0001 · <b>LRT-2210</b> · Dec 9 · due <b>Jan 8, 2027</b> · total ₱76,988.80."],
  ["Dec 28", "Purchasing → Pay (VI-0002)", "Amount ₱15,848 (all of it), date <b>Dec 28</b>, method Bank transfer."],
  ["Dec 29", "Purchasing → Pay (VI-0001)", "Part payment: <b>₱50,000</b>, date <b>Dec 29</b>, Bank transfer. ₱26,988.80 stays owing."]]))

# ---- PART G
S.append("<h3>G. Deliver, invoice and collect (December 15 – 30)</h3>")
S.append("<p>Shipping → click the sales order. Type the <b>Delivery date</b>, the quantities, then <b>Post delivery</b>. Click the order again, type the <b>Invoice date</b> and <b>Invoice due</b>, then <b>Create invoice for what was delivered</b>. On Sales → Invoices click <b>Send invoice</b> (confirm).</p>")
S.append(table(["Order", "Deliver", "Delivery & invoice date", "Due", "Invoice"], [
  ["Cebu Gift Shop (SO-0002)", "Rattan chair <b>28</b> of 30 (stock is short by 2)", "Dec 15", "Jan 14, 2027", "₱59,584.00"],
  ["Greenleaf Home Store (SO-0001)", "Chair 40 · Table 10", "Dec 16", "Jan 15, 2027", "₱99,680.00"],
  ["Davao Rattan Depot (SO-0003)", "Side table 20", "Dec 17", "Jan 16, 2027", "₱32,480.00"]]))
S.append("<p><b>Customer payments</b> (Sales → Invoices → Details → Record payment, method Bank transfer): on <b>Dec 30</b> Greenleaf pays <b>all ₱99,680</b>; Davao pays <b>₱20,000</b> (partial). Cebu pays nothing yet.</p>")

# ---- PART H
S.append("<h3>H. The loom, a breakdown and the rent (December)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Dec 1", "Fixed Assets → New fixed asset", "<b>Weaving loom</b>, purchase date 2026-12-01, cost <b>120,000</b>, salvage <b>12,000</b>, life <b>36</b> months. Save. (The purchase of the loom itself is a voucher, next row.)"],
  ["Dec 1", "Finance → New journal voucher", "Date <b>2026-12-01</b>, reference <b>Loom</b>, particulars <i>Bought a weaving loom for cash</i>: <b>1500 — Fixed Assets</b> debit 120,000; <b>1000 — Cash</b> credit 120,000."],
  ["Dec 31", "Fixed Assets → Record 1 month dep.", "Date <b>2026-12-31</b> (it proposes it). ₱3,000."],
  ["Dec 31", "Shop Floor → Machines &amp; upkeep → Plan (Weaving)", "Fixed asset <b>Weaving loom</b>, service every <b>30</b> machine hours. Save plan."],
  ["Dec 9", "Shop Floor → Downtime", "Work centre <b>Weaving</b>, day <b>2026-12-09</b>, hours <b>3</b>, reason <b>Breakdown</b>, note <i>Loom belt snapped</i>. Log it."],
  ["Dec 28", "Finance → New journal voucher", "Reference <b>Workshop rent</b>, particulars <i>Workshop rent for December paid in cash</i>: <b>5100 — Operating Expenses</b> debit 24,000; <b>1000 — Cash</b> credit 24,000."]]))

# ---- PART I
S.append("<h3>I. Settle the orders and close the months up to December (December 31)</h3>")
S.append(table(["Where", "What to do"], [
  ["Production → each of the four orders", "Click <b>Settle order</b>, type the settlement date <b>2026-12-31</b>, <b>Settle order</b>. The status becomes Technically complete."],
  ["Period End → October 2026", "<b>Settle…</b> → <b>Post the month-end entries</b> → <b>Close month</b>. (Nothing to post; the screen says the month is not over yet: go on.)"],
  ["Period End → November 2026", "The same three steps."],
  ["Period End → December 2026", "<b>Settle…</b>, read the month-end entries (machine cost at the real depreciation and the cost variances), <b>Post the month-end entries</b>, then <b>Close month</b>."]]))
S.append(tip("After December every stock quantity should be nil: the 70 chair frames went into the 68 good and 2 scrapped chairs, and everything else bought was used. You made 68 chairs and delivered 68, so Cebu is still owed 2."))

# ---- PART J
S.append("<h3>J. January 2027</h3>")
S.append("<p><b>J1. Quality set-up</b> (Quality → Plans and settings). Item <b>Rattan strip</b>: tick <b>Inspect when it is bought</b> → <b>Save these settings</b>. <b>Add a characteristic</b>: <b>Moisture</b>, unit <b>%</b>, minimum <b>8</b>, maximum <b>12</b> → <b>Save the plan</b>.</p>")
S.append("<p><b>J2. A new order</b> (Sales → New sales order, then Confirm): Jan 4, <b>Greenleaf Home Store</b>, Rattan chair 24 @ 1,850 and Side table 6 @ 1,500, tax 12, total <b>₱59,808.00</b>.</p>")
S.append("<p><b>J3. Plan again.</b> Planning → Plan from <b>2027-01-04</b> → Run planning. Expect planned orders Chair frame 26, Table frame 6, Rattan chair 26, Side table 6, and requisitions Frame wood 114, Rattan strip 61, Wood screws 280, Cushion fabric 13, Foam cushion 26, Carton box 32, Varnish 8.9. <b>Make</b> the four planned orders (tick the box in the header, or use <b>Make it</b> on each). Create the three purchase orders with the existing vendors; this time <b>Frame wood costs 100</b>, rattan 160, screws 1, fabric 120, foam 85, carton 40, varnish 320. Totals: ₱21,440, ₱5,050, ₱2,848.</p>")
S.append(table(["Date", "Where", "What to do"], [
  ["Jan 6", "Purchasing → Receive (rattan, wood, screws order)", "Date <b>Jan 6</b>. The rattan line goes to <b>QUARANTINE</b> by itself because it is inspected. Receive into stock."],
  ["Jan 6", "Purchasing → Receive (fabric, foam, cartons)", "Date <b>Jan 6</b>, everything, Receive."],
  ["Jan 7", "Purchasing → Receive (varnish)", "Date <b>Jan 7</b>, <b>Lot VAR-0127-B</b>, expiry <b>2028-01-31</b>. Receive."],
  ["Jan 7", "Quality → Inspection lots → the waiting rattan lot (61 kg)", "Measured moisture <b>13.5</b> → <b>Save measurements</b>. Decision: Accept <b>57</b>, Return to vendor <b>4</b>, root cause <b>Material</b>, date <b>2027-01-07</b>, note <i>Rattan too damp on 4 bundles</i> → <b>Record decision</b>. The 4 kg goes back on the order."],
  ["Jan 7", "Quality → Non-conformances → the report", "Corrective action <i>Vendor will redeliver 4 kg; moisture to be measured on arrival</i> → <b>Close the report</b>."],
  ["Jan 8", "Purchasing → Add landed cost", "Vendor <b>Laguna Rattan and Timber</b>, invoice no. <b>LRT-F-77</b>, what <i>Trucking from Laguna</i>, date Jan 8, due <b>Feb 7</b>, amount before VAT <b>1,300</b>, VAT 12, spread by value. Under <i>Which receipts is it for?</i> leave ticked <b>only the Frame wood and Wood screws lines of the Jan 6 receipt</b> (untick all the others). Post landed cost. The bill is ₱1,456."],
  ["Jan 8", "Purchasing → Enter vendor invoice", "The varnish order, number <b>BC-6001</b>, date Jan 8, due Feb 7, and change the billed price from 320 to <b>340</b>. It goes <b>ON HOLD</b> (price differs). Click <b>Reject</b>, reason <i>Billed at 340 but the order price is 320</i>, date <b>Jan 9</b>."],
  ["Jan 9", "same", "Enter it again: <b>BC-6001A</b>, date Jan 9, due <b>Feb 8</b>, price 320 as ordered. Total ₱3,189.76."]]))
S.append("<h3>K. Make in January (January 8 – 14)</h3>")
S.append(table(["Order", "Issue date", "Confirmation(s)", "Receive"], [
  ["Chair frame, 26", "Jan 8", "Op 10: good 26, labor 21, machine 10.4, setup 0.5, date Jan 9, <b>final</b>", "26 on Jan 9"],
  ["Table frame, 6", "Jan 8", "Op 10: good 6, labor 6, machine 3, setup 0.5, date Jan 9, <b>final</b>", "6 on Jan 9"],
  ["Rattan chair, 26", "Jan 10", "Op 10 first with a mistake: good 26, labor <b>90</b>, machine 19.5, setup 0.5, date Jan 11. Then on the page <b>Reverse</b> that confirmation (reason <i>Wrong labour hours typed</i>, date <b>2027-01-11</b>). Post it again with labor <b>39</b>.<br>Op 20: good 26, labor 13, machine 13, setup 0.4, date Jan 12, <b>final</b>", "26 on Jan 12"]]))
S.append(table(["Date", "Where", "What to do"], [
  ["Jan 12", "Purchasing → Receive (rattan order again)", "Date <b>Jan 12</b>: the 4 kg replacement (goes to QUARANTINE)."],
  ["Jan 12", "Quality → the waiting lot (4 kg)", "Moisture <b>10</b>, Save measurements, accept <b>4</b>, date <b>2027-01-12</b>, Record decision."],
  ["Jan 13", "Production → Side table, 6", "Issue Jan 13 · Op 10 good 6, labor 6, machine 3, setup 0.5, Jan 14 · Op 20 good 6, labor 3.6, machine 3.6, setup 0.5, Jan 14, <b>final</b> · Receive 6 on Jan 14."]]))

S.append("<h3>L. Invoices, deliveries and money in January</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Jan 15", "Purchasing → Enter vendor invoice", "Rattan order: number <b>JAN-PO-0004</b>, date Jan 15, due <b>Feb 14</b> — total ₱24,012.80. Fabric order: <b>JAN-PO-0005</b>, Jan 15, due Feb 14 — total ₱5,656.00."],
  ["Jan 16", "Shipping → Cebu order (the 2 chairs still owed)", "Deliver <b>2</b> on Jan 16; invoice date Jan 16, due <b>Feb 15</b>; Create invoice; Send invoice. ₱4,256.00."],
  ["Jan 17", "Shipping → Greenleaf's January order", "Deliver <b>24 chairs and 6 tables</b> on Jan 17; invoice Jan 17, due <b>Feb 16</b>; Send invoice. ₱59,808.00."],
  ["Jan 20", "Sales → Details → Record payment", "Cebu's December invoice: <b>all</b> ₱59,584. Davao's: the <b>remaining ₱12,480</b>. Bank transfer, date <b>Jan 20</b>."],
  ["Jan 22", "Purchasing → Pay", "The rattan December invoice: the remaining <b>₱26,988.80</b>. The varnish December invoice: <b>₱10,572.80</b>. Date <b>Jan 22</b>."],
  ["Jan 31", "Fixed Assets → Record 1 month dep.", "Date <b>2027-01-31</b>. ₱3,000."],
  ["Jan 28", "Finance → New journal voucher", "Workshop rent for January: 5100 debit 24,000 / 1000 credit 24,000."],
  ["Jan 25", "Finance → New journal voucher", "Reference <b>Facebook ads</b>, <i>Online ads paid in cash</i>: <b>5100</b> debit 5,000 / <b>1000</b> credit 5,000. This is the wrong account."],
  ["Jan 26", "Finance → click that voucher → Reverse voucher", "Reversal date <b>2027-01-26</b>, reason <i>Should be Marketing Expense</i>, Post the reversal. Then a new voucher dated Jan 26, reference <b>Facebook ads</b>, <i>Online ads paid in cash, to Marketing</i>: <b>5200 — Marketing Expense</b> debit 5,000 / <b>1000 — Cash</b> credit 5,000."],
  ["Jan 31", "Production → each of the four January orders", "Settle order, date <b>2027-01-31</b>."],
  ["Jan 31", "Period End → January 2027", "Settle…, Post the month-end entries, Close month."]]))

S.append(part("4. Look at your books", "Do these before you tell your teacher you are done."))
S.append("<ul><li><b>Reports → Trial balance</b>: total debits equal total credits.</li><li><b>Reports → Books integrity check</b>: all checks pass.</li><li><b>Reports → Statement of comprehensive income</b> for December and January: net profit about ₱46,000 over the two months.</li><li><b>Purchasing</b>: find the held invoice that you rejected, and the landed-cost bill.</li><li><b>Quality</b>: the two inspection lots and the closed report. <b>Shop Floor</b>: the downtime and the loom's service plan.</li><li><b>Reports</b> for the scrap loss in pesos (the two spoiled chairs) and the machine cost at real depreciation.</li></ul>")
S.append(part("5. Compare with the answer key", "Only after your teacher has checked your company."))
S.append("<p>When your teacher is happy with your work, they release the <b>Activity 2 answer key</b> to you. A card then appears on the Manufacturing home page. Click <b>Open the Activity 2 answer key</b>: the system makes a separate, read-only company called <i>Activity 2 answer key</i>, with both months done exactly as written and closed. Use the company switcher at the top to move between it and your own company, and compare the items, standard costs, stock, vouchers, reports and trial balance.</p>")
S.append(tip("Your own company is never touched. If a figure differs, find the first screen where the two companies disagree and look at the document behind it."))
S.append(warn("Do not delete or edit posted documents to fix a mistake. Reverse the document (Production or Inventory documents, or Finance → the voucher; a vendor invoice is voided on Purchasing) and enter it again. If a month is already closed, ask your teacher to reopen it."))
open(os.path.join(HERE, "student.html"), "w").write(doc("Activity 2 Manufacturing", "".join(S)))

# ======================================================================== TEACHER KEY
T = []
T.append('<div class="k">TEACHER KEY · ACTIVITY 2 MANUFACTURING</div><h1>Rattan Furniture Works: answer key</h1>')
T.append('<p class="note">Every figure below comes from running the whole exercise through the real posting functions (migration 0061 posts it; the stored answer set is migration 0060) and was reproduced to the centavo by a real click-through of the screens as a student.</p>')
T.append(part("How to check a student", ""))
T.append("<ol><li>Open the <b>Teacher</b> page and find the student's Manufacturing company (the new one, not the Activity 1 company).</li><li>Click <b>Check</b>. Choose <i>Activity 2 Manufacturing — Rattan Furniture Works, December 2026 and January 2027</i>.</li><li>Every failed check shows what was expected, what was found and a hint. Fix, then check again. About 110 checks are made.</li></ol>")
T.append(table(["Check group", "What it covers"], [
  ["Company setup", "3 vendors, 3 customers, 3 work centers, 6 activity rates, ₱30 overhead rate"],
  ["Items and costing", "11 items, 4 bills of materials, 4 routings, 4 released estimates; standard costs ₱475.75 / ₱840.50 / ₱1,244.45 / ₱1,344.00"],
  ["Purchasing", "6 purchase orders (₱68,740, ₱14,150, ₱9,440, ₱21,440, ₱5,050, ₱2,848, all fully received); 7 vendor invoices incl. one REJECTED (₱3,389.12); 7 bills incl. the ₱1,456 freight; two batches with expiry"],
  ["Quality", "rattan inspected on receipt; plan Moisture 8–12; two lots (61 → 57 accepted, 4 returned; 4 → 4 accepted); one closed non-conformance report (Material, 4 kg)"],
  ["Production", "8 orders: 70/68/2 chairs, 26/26 chairs, frames 70, 30, 26, 6, tables 30, 6; all settled"],
  ["Sales", "5 invoices: ₱59,584 · ₱99,680 · ₱32,480 (December), ₱4,256 · ₱59,808 (January) with their dates"],
  ["Payments / Corrections", "4 payments received (₱191,744) and 4 made (₱103,409.60); 1 reversed confirmation; 1 reversed voucher"],
  ["Fixed assets / Shop floor", "Weaving loom ₱120,000, salvage ₱12,000, 36 months, ₱6,000 depreciation; 3 h breakdown on Weaving"],
  ["Stock on hand", "nil for every item (everything bought was used or sold)"],
  ["Ledger balances", "every account below, and net profit"],
  ["Month end", "6 manual vouchers (₱678,000 of debits) and December 2026 and January 2027 closed"]]))
T.append(part("Expected ledger balances at the end"))
T.append(table(["Account", "Balance"], [
  ["1000 Cash", "415,334.40 Dr"], ["1100 Accounts Receivable", "64,064.00 Dr (Cebu's and Greenleaf's January invoices)"], ["1160 Input Tax (VAT)", "14,756.16 Dr"],
  ["1500 Fixed Assets", "120,000.00 Dr"], ["1590 Accumulated Depreciation", "6,000.00 Cr"], ["2000 Accounts Payable", "34,314.56 Cr"], ["2200 VAT Payable", "27,408.00 Cr"],
  ["3000 Owner's Equity", "500,000.00 Cr"], ["4000 Sales Revenue", "228,400.00 Cr"], ["5000 Cost of Goods Sold", "173,968.00 Dr"], ["5100 Operating Expenses", "48,000.00 Dr (two months' rent)"],
  ["5200 Marketing Expense", "5,000.00 Dr"], ["5700 Applied Direct Labor", "29,472.00 Cr"], ["5710 Applied Machine Overhead", "4,476.00 Cr"], ["5720 Applied Fixed Overhead", "11,052.00 Cr"],
  ["<b>Net profit, December and January</b>", "<b>46,432.00</b>"]]))
T.append(part("What each mistake looks like"))
T.append(table(["Slip", "Shows up as"], [
  ["Material issue posted with today's date (the date box left alone)", "The order's cost lands in October 2026; the October close shows entries and December's cost of goods and variances differ. Reverse the issue and post it again with the date."],
  ["Rattan invoice entered before the 4 kg redelivery", "A voided invoice and bill appear (not counted against the student) but the payable is wrong until the full ₱24,012.80 invoice is entered."],
  ["Receipt of rattan into the normal store instead of Quarantine", "No inspection lot; the quality group fails and the stock is usable without a decision."],
  ["Vendor invoice posted at 340 with no hold (a manager override)", "The vendor-invoice and bill checks fail; 5500 Purchase Price Variance and 2000 differ."],
  ["Landed cost spread over every receipt (all boxes left ticked)", "5000 / inventory differ slightly; the freight bill is right but the allocation is not."],
  ["Wrong voucher left in place instead of reversed", "The reversed-voucher check fails and 5100 is ₱53,000 instead of ₱48,000."],
  ["Months closed out of order", "Period End refuses: October and November must be closed before December."],
  ["Invoices left at the default (today's) dates", "The invoice checks fail on their dates."]]))
T.append(part("Before the class starts"))
T.append("<p>Each student starts Activity 2 in a <b>new</b> company (+ New company; up to five per student). If a student made a mess, click <b>Reset</b> next to that company on the Teacher page (it permanently erases it and gives back a fresh empty one), or delete it and let the student start another. Activity 1's company is not involved.</p>")
T.append(part("The answer-key company for students"))
T.append("<p>Students cannot see the answer key until you release it. In the <b>Check</b> window, pick the Activity 2 set, then scroll to <b>Answer key for students</b>: release it to this student or to the whole class (you can take it back). A released student clicks <b>Open the Activity 2 answer key</b> on the Manufacturing home page: a separate read-only company with both months done and closed. The Activity 1 key is released separately.</p>")
T.append(warn("Scope note: payroll, banking and the maintenance log are left out on purpose (payroll belongs to the Standard ERP; the maintenance log refuses future dates). Work centers keep their default hours and days."))
open(os.path.join(HERE, "teacher-key.html"), "w").write(doc("Activity 2 Manufacturing — Teacher key", "".join(T)))
print("ok")
