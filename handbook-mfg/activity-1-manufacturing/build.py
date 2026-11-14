#!/usr/bin/env python3
"""Builds the student handout and the teacher key for Activity 1 Manufacturing (Bamboo Basket Works, November 2026).
Every figure comes from the answer-key run in supabase/tests/mfg_practice_set1_key.sql (also pinned by tests/mfgPracticeCheck.test.ts)."""
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
S.append('<div class="k">JJ AND CO. · MANUFACTURING ERP · ACTIVITY 1 MANUFACTURING</div><h1>Bamboo Basket Works</h1><p class="note" style="font-size:12pt">One month of a small manufacturer: November 2026.</p>')
S.append('<dl class="meta"><dt>Duration</dt><dd>1 month, November 2 – November 30, 2026</dd>'
         '<dt>Company</dt><dd>Your own (solo) Manufacturing company, Standard costing</dd>'
         '<dt>Modules covered</dt><dd>Master Data, Costing, Finance, Purchasing, Inventory, Production, Shipping, Sales, Period End, Reports</dd>'
         '<dt>Currency / tax</dt><dd>Philippine peso (₱); 12% VAT on invoices and on the vendor invoice</dd>'
         '<dt>Before you start</dt><dd>Read the Manufacturing handbook chapters for the screens you use</dd>'
         '<dt>How it is graded</dt><dd>Your teacher checks your company directly. There is nothing to hand in.</dd></dl>')
S.append(part("1. Overview", "You run a small basket and plant-stand workshop for one month. Every step feeds the next: master data becomes a cost, a purchase becomes stock, stock becomes work in process, finished goods become a delivery, a delivery becomes an invoice, and at the end you settle and close the month. Enter everything as written and the month ends in a net profit. A net loss means something was entered wrongly."))
S.append('<div class="box"><b>How you will be checked.</b> Your teacher opens the Teacher page, finds your company and clicks <b>Check</b>. The check compares your company with this exercise and reports, line by line, what matches and what does not. It looks at: company setup (vendors, customers, work centers, activity rates, overhead rate); items, bills of materials, routings and the released standard costs; the two purchase orders and the one vendor invoice; the two production orders; the two sales invoices and their dates; stock on hand; every ledger balance; the two journal vouchers; and whether November is closed. Anything that does not match comes with a hint. Fix it and ask for another check.</div>')
S.append(part("2. Read this before you start", "SEVEN THINGS THAT TRIP PEOPLE UP"))
S.append("<ol>"
  "<li><b>Tick the final confirmation on the last operation</b> of each production order. Without it the order cannot be settled.</li>"
  "<li><b>Type the date on every form.</b> Receipts, deliveries, confirmations, invoices and vouchers post on the date you enter. The dates in the tables are the dates to type, even though your real calendar date is different.</li>"
  "<li><b>Names and SKUs must match exactly</b> (Bamboo pole, BAM-POLE…). The check finds items by SKU.</li>"
  "<li><b>Standard costs come from Costing.</b> After you release the two cost estimates the Laundry basket must show ₱599.15 and the Plant stand ₱563.85. If not, a bill of materials, routing, rate or the overhead rate is off; fix it before buying anything.</li>"
  "<li><b>The rattan on the first order is over-used on purpose.</b> The material issue proposes the standard quantity; change the Rattan strip to 78 kg (the standard is 75). That creates a material usage variance for you to find in the reports.</li>"
  "<li><b>Create each invoice on the Shipping screen</b> with the invoice date and due date in the tables, then <b>Send invoice</b> on the Sales screen. Do not use \"Convert to invoice\" and do not leave the default dates.</li>"
  "<li><b>Do not invoice the Laguna Bamboo order.</b> Only the Pasig Packaging order gets a vendor invoice. The bamboo and rattan receipt stays on Goods received, not invoiced.</li>"
  "<li><b>Settle and close November last.</b> Closing locks the books through November 30, so anything dated on or before then is refused afterwards. Payroll and employees are not part of this exercise.</li></ol>")

S.append(part("3. Step by step", "The steps run in order. Dates are 2026. Where a form shows today's date, change it to the date in the table."))
S.append("<h3>A. Set up the company (November 2)</h3>")
S.append(table(["Step", "Where", "What to do"], [
  ["A1", "Your Manufacturing company", "Work in your own Manufacturing company (you set it up the first time you opened the Manufacturing ERP; each student has one). It must be <b>empty</b>: no items, vendors, customers or orders yet. Its costing method must be <b>Standard</b>. If you already filled it with other practice, ask your teacher to clear it first."],
  ["A2", "Vendors and customers", "There is no separate vendor screen. You type a <b>new vendor's name</b> on the purchase order form (part B). Customers are added on <b>Sales → Customers → New customer</b>: <b>Greenleaf Home Store</b> and <b>Cebu Gift Shop</b>."],
]))
S.append("<h3>A3. Items (Master Data → Items → Add item)</h3><p>Fill SKU, Name, Unit of measure, Item type, Make or buy and, for bought items, Planned price. Leave everything else as it is.</p>")
S.append(table(["SKU", "Name", "Unit", "Item type", "Make or buy", "Planned price"], [
  ["BAM-POLE", "Bamboo pole", "PC", "Raw material", "Buy", "45"], ["RAT-STR", "Rattan strip", "KG", "Raw material", "Buy", "160"],
  ["LAC-CL", "Clear lacquer", "L", "Raw material", "Buy", "280"], ["CTN-GB", "Gift carton", "PC", "Packaging", "Buy", "30"],
  ["BSK-LD", "Laundry basket", "PC", "Finished good", "Make", "0"], ["STD-PL", "Plant stand", "PC", "Finished good", "Make", "0"]]))
S.append("<h3>A4. Work centers (Master Data → Work centers → Add work center)</h3><p>Create <b>Weaving</b> and <b>Finishing</b>: type only the name. Leave the shifts, hours, utilization, efficiency and working days as the form fills them in.</p>")
S.append("<h3>A5. Activity rates (Master Data → Activity rates → Add rate)</h3><p>Four rates, all <b>from the month starting 2026-11-01</b>. Use only the activities <b>Direct labor</b> and <b>Machine time</b>; do not enter a Setup rate.</p>")
S.append(table(["Work center", "Direct labor, per hour", "Machine time, per hour"], [["Weaving", "80", "25"], ["Finishing", "80", "40"]]))
S.append("<h3>A6. Overhead (Master Data → Costing sheet)</h3><p>Click the pencil on the <b>Fixed overhead</b> row and set <b>Plus ₱ per hour</b> to <b>30</b>. Leave the rest. Do not change <i>Variable overhead</i>.</p>")
S.append("<h3>A7. Bills of materials (Master Data → Bills of materials → New BOM)</h3><p>Choose the item, change <b>Valid from</b> to <b>2026-11-01</b>, add the four components (the unit fills in by itself), then <b>Save draft</b> and <b>Activate</b> (confirm the pop-up).</p>")
S.append(table(["Product", "Bamboo pole", "Rattan strip", "Clear lacquer", "Gift carton"], [["BSK-LD Laundry basket", "4 PC", "1.5 KG", "0.1 L", "1 PC"], ["STD-PL Plant stand", "6 PC", "0.5 KG", "0.25 L", "1 PC"]]))
S.append("<h3>A8. Routings (Master Data → Routings → New routing)</h3><p>Choose the item, enter the two operations (op number, what is done, work center, then the minutes), <b>Save draft</b>, then <b>Activate</b>. Leave teardown, queue and move at 0.</p>")
S.append(table(["Product", "Op", "What is done", "Work center", "Setup min", "Run min / unit", "Labor min / unit", "Machine min / unit"], [
  ["BSK-LD", "10", "Weave the basket", "Weaving", "30", "42", "42", "12"], ["BSK-LD", "20", "Lacquer and pack", "Finishing", "15", "15", "15", "15"],
  ["STD-PL", "10", "Cut and assemble the stand", "Weaving", "30", "30", "30", "24"], ["STD-PL", "20", "Lacquer and pack", "Finishing", "12", "18", "18", "18"]]))
S.append("<h3>A9. Cost estimates (Costing → New estimate)</h3>")
S.append(table(["Item to cost", "Lot size", "Costing date", "Then", "You should see"], [
  ["Laundry basket", "50", "2026-11-02", "<b>Work out the cost</b>, then <b>Mark this cost</b>, then <b>Release as standard cost</b> (confirm each pop-up)", "Unit cost ₱599.15"],
  ["Plant stand", "20", "2026-11-02", "the same three buttons", "Unit cost ₱563.85"]]))
S.append("<p>The release takes effect from today's date automatically. If either unit cost is different, a bill of materials, routing, activity rate or the overhead rate is off: fix it before buying anything.</p>")
S.append("<p><b>A10. Starting cash</b> (Finance → New journal voucher). Voucher date <b>2026-11-02</b>, reference <b>Capital</b>, particulars <i>Owner puts in the starting cash</i>. On line 1 type the account as <b>1000 — Cash</b> with a <b>debit of 100,000</b>; on line 2 <b>3000 — Owner's Equity</b> with a <b>credit of 100,000</b>. The Debit and Credit boxes are to the right of each line: scroll the form sideways. When it says <i>Out of balance ₱0.00</i> in green, click <b>Submit / post voucher</b>.</p>")

S.append("<h3>B. Buy (November 3 – 10)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Nov 3", "Purchasing → New purchase order", "Type the new vendor <b>Laguna Bamboo Traders</b>, order date Nov 3, expected Nov 6. Line 1: <b>Bamboo pole, 400, price 47</b>. Line 2: <b>Rattan strip, 120, price 165</b>. The price box fills in the planned price: type over it. Total ₱38,600."],
  ["Nov 3", "Purchasing → New purchase order", "New vendor <b>Pasig Packaging Supply</b>, order date Nov 3, expected Nov 9. <b>Gift carton, 100, price 30</b> and <b>Clear lacquer, 30, price 290</b>. Total ₱11,700."],
  ["Nov 6", "Purchasing → Receive (on PO-0001)", "Receipt date <b>Nov 6</b>, take everything, <b>Receive into stock</b>."],
  ["Nov 9", "Purchasing → Receive (on PO-0002)", "Receipt date <b>Nov 9</b>, take everything, <b>Receive into stock</b>."],
  ["Nov 10", "Purchasing → Enter vendor invoice", "Purchase order <b>PO-0002</b>, vendor's invoice number <b>PPS-4471</b>, invoice date <b>Nov 10</b>, due <b>Dec 10</b>, VAT <b>12</b>. Check it shows subtotal ₱11,700 plus VAT ₱1,404 = ₱13,104, then <b>Match and post</b>."]]))
S.append(tip("Check Inventory → Stock now: 400 poles, 120 kg rattan, 30 L lacquer, 100 cartons. Do not enter an invoice for PO-0001."))

S.append("<h3>C. Make (November 11 – 25)</h3>")
S.append("<p><b>Order 1: Laundry basket.</b> Production → <b>New production order</b>: item Laundry basket, quantity <b>50</b>, starts <b>Nov 11</b>, finishes <b>Nov 18</b>. Leave <i>Backflush</i> unticked. <b>Create order</b>, then <b>Release</b> it (confirm), then:</p>")
S.append(table(["Date", "Step", "Enter"], [
  ["Nov 12", "Materials → Issue material to the order", "Date <b>Nov 12</b>. Leave every quantity as proposed <b>except Rattan strip: type 78</b> (the standard is 75)."],
  ["Nov 14", "Confirm production", "Operation <b>10 Weave the basket</b>. Good units <b>50</b>, scrapped <b>0</b>, labor hours <b>35</b>, machine hours <b>10</b>, setup hours <b>0.5</b>, date Nov 14."],
  ["Nov 17", "Confirm production", "Operation <b>20 Lacquer and pack</b>. Good units <b>48</b>, scrapped <b>2</b>, why scrapped <i>Lacquer blistered two baskets</i>, labor <b>13</b>, machine <b>12</b>, setup <b>0.25</b>, date Nov 17. <b>Tick \"This is the final confirmation\".</b>"],
  ["Nov 18", "Finished goods into stock", "Type the quantity <b>48</b> (the box starts empty), date <b>Nov 18</b>, <b>Receive into stock</b>."],
  ["Nov 25", "Settle order (button at the top right)", "Settlement date <b>Nov 25</b>, <b>Settle order</b>."]]))
S.append("<p><b>Order 2: Plant stand.</b> New production order: quantity <b>20</b>, starts <b>Nov 12</b>, finishes <b>Nov 19</b>. Create, release, then:</p>")
S.append(table(["Date", "Step", "Enter"], [
  ["Nov 13", "Issue material to the order", "Date <b>Nov 13</b>, every quantity exactly as proposed."],
  ["Nov 16", "Confirm production", "Operation <b>10</b>: good <b>20</b>, scrapped 0, labor <b>10</b>, machine <b>8</b>, setup <b>0.5</b>, date Nov 16."],
  ["Nov 18", "Confirm production", "Operation <b>20</b>: good <b>20</b>, scrapped 0, labor <b>6</b>, machine <b>6</b>, setup <b>0.2</b>, date Nov 18, <b>tick the final confirmation</b>."],
  ["Nov 19", "Finished goods into stock", "Quantity <b>20</b>, date <b>Nov 19</b>, Receive into stock."],
  ["Nov 25", "Settle order", "Settlement date <b>Nov 25</b>. The button appears only after the final confirmation and the receipt."]]))
S.append(tip("Order 1 should show 48 good and 2 scrap; Order 2 finishes with nothing left in process. Inventory → Stock shows 48 baskets and 20 stands. If the Settle order button is missing, the final confirmation was not ticked."))

S.append("<h3>D. Sell (November 19 – 27)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Nov 19", "Sales → Sales Orders → New sales order", "Customer <b>Greenleaf Home Store</b>, date Nov 19. Line 1: <b>Laundry basket, 30, unit price 780</b>. Line 2 (<b>Add line</b>): <b>Plant stand, 10, unit price 850</b>. <b>Tax rate 12</b>. Save (total ₱35,728), then <b>Confirm</b>."],
  ["Nov 20", "Shipping → click SO-0001", "Delivery date <b>Nov 20</b>, then <b>Post delivery</b>."],
  ["Nov 21", "Shipping → click SO-0001 again", "Invoice date <b>Nov 21</b>, invoice due <b>Dec 21</b>, then <b>Create invoice for what was delivered</b>."],
  ["Nov 21", "Sales → Invoices", "On INV-0001 click <b>Send invoice</b> and confirm. (Do <b>not</b> use \"Convert to invoice\" on the sales order.)"],
  ["Nov 25", "Sales → Sales Orders → New sales order", "Customer <b>Cebu Gift Shop</b>, date Nov 25, <b>Laundry basket, 15, price 790</b>, tax rate 12 (₱13,272). Save, <b>Confirm</b>."],
  ["Nov 26", "Shipping → click SO-0002", "Delivery date <b>Nov 26</b>, <b>Post delivery</b>."],
  ["Nov 27", "Shipping, then Sales → Invoices", "Invoice date <b>Nov 27</b>, due <b>Dec 27</b>, <b>Create invoice for what was delivered</b>; then <b>Send invoice</b> on INV-0002."]]))
S.append(tip("Leave the <i>Approval threshold</i> box on Sales → Invoices empty, or large documents will wait for your teacher."))

S.append("<h3>E. A manual voucher and the month end (November 28 – 30)</h3>")
S.append(table(["Date", "Where", "What to do"], [
  ["Nov 28", "Finance → New journal voucher", "Date <b>Nov 28</b>, reference <b>Workshop rent</b>, particulars <i>Workshop rent for November paid in cash</i>. Line 1 <b>5100 — Operating Expenses</b> debit <b>6,000</b>; line 2 <b>1000 — Cash</b> credit <b>6,000</b>. Submit / post voucher."],
  ["Nov 30", "Period End", "On the <b>November 2026</b> row click <b>Settle…</b>, read the checks, then <b>Post the month-end entries</b>. Then click <b>Close month</b>. (October 2026 also appears as an open month with nothing in it: leave it.)"]]))

S.append(part("4. Look at your books", "Do these before you tell your teacher you are done."))
S.append("<ul><li><b>Reports → Trial balance</b>: total debits equal total credits.</li><li><b>Reports → Books integrity check</b>: all checks pass.</li><li><b>Reports → Statement of comprehensive income</b> for November: you should have a net profit. Find the cost of poor quality in <b>Reports → Scrap loss in pesos</b> (the two spoiled baskets) and the material usage variance (the extra 3 kg of rattan) under <b>Analytics → Variance</b>.</li><li><b>Reports → Goods received, not invoiced</b>: the Laguna Bamboo receipt of ₱38,600.</li><li><b>Reports → Receivables and payables ageing</b>: the two invoices, not yet due.</li></ul>")
S.append(part("5. Compare with the answer key", "Only after your teacher has checked your company."))
S.append("<p>When your teacher is happy with your work, they release the <b>Activity 1 answer key</b> to you. A card then appears on the Manufacturing home page.</p><ol><li>Click <b>Open the Activity 1 answer key</b>. The system makes a separate company called <i>Activity 1 answer key</i> and posts the whole month exactly as the exercise says, with November closed. It is <b>read-only</b>: you can look at everything and post nothing.</li><li>Use the company switcher at the top to move between your own company and the answer key. Compare Items, standard costs, Inventory, Finance vouchers, Reports (trial balance, income statement, work in process, goods received not invoiced) and Period End.</li></ol>")
S.append(tip("Your own company is never touched. If a figure differs, find the first screen where the two companies disagree and look at the document behind it."))
S.append(warn("Do not delete or edit posted documents to fix a mistake. If something is wrong, reverse the document (Inventory → Documents, or Finance → the voucher) and enter it again; both stay on record. If the month is already closed, ask your teacher to reopen it."))
open(os.path.join(HERE, "student.html"), "w").write(doc("Activity 1 Manufacturing", "".join(S)))

# ======================================================================== TEACHER KEY
T = []
T.append('<div class="k">TEACHER KEY · ACTIVITY 1 MANUFACTURING</div><h1>Bamboo Basket Works: answer key</h1>')
T.append('<p class="note">Every figure below comes from running the whole exercise through the real posting functions (answer-key script <code>supabase/tests/mfg_practice_set1_key.sql</code>) and is pinned by <code>tests/mfgPracticeCheck.test.ts</code>.</p>')
T.append(part("How to check a student", ""))
T.append("<ol><li>Open the <b>Teacher</b> page and find the student's Manufacturing company.</li><li>Click <b>Check</b>. Choose <i>Activity 1 Manufacturing — Bamboo Basket Works, November 2026</i>.</li><li>Every failed check shows what was expected, what was found and a hint. Fix, then check again.</li></ol>")
T.append(table(["Check group", "What it covers"], [
  ["Company setup", "vendors, customers, work centers, the four activity rates, the ₱30 overhead rate"],
  ["Items and costing", "six items, two active bills of materials, two active routings, two released estimates, standard costs ₱599.15 and ₱563.85"],
  ["Purchasing", "two purchase orders (₱38,600 and ₱11,700, fully received) and one vendor invoice (₱13,104, Nov 10, due Dec 10)"],
  ["Production", "50 planned / 48 good / 2 scrap; 20 / 20 / 0; both settled"],
  ["Sales", "invoices ₱35,728 (Nov 21, due Dec 21) and ₱13,272 (Nov 27, due Dec 27)"],
  ["Stock on hand", "80 poles, 32 kg rattan, 20 L lacquer, 30 cartons, 3 baskets, 10 stands"],
  ["Ledger balances", "every account below, and net profit"],
  ["Month end", "two manual vouchers posted (₱106,000 of debits) and November closed"]]))
T.append(part("Expected ledger balances at the end"))
T.append(table(["Account", "Balance"], [
  ["1000 Cash", "94,000.00 Dr"], ["1100 Accounts Receivable", "49,000.00 Dr"], ["1160 Input Tax (VAT)", "1,404.00 Dr"], ["1200 Raw Materials Inventory", "14,320.00 Dr"],
  ["1220 Finished Goods Inventory", "7,435.95 Dr"], ["1230 Packaging &amp; Supplies", "900.00 Dr"], ["2000 Accounts Payable", "13,104.00 Cr"],
  ["2050 Goods Received / Invoice Received", "38,600.00 Cr"], ["2200 VAT Payable", "5,250.00 Cr"], ["3000 Owner's Equity", "100,000.00 Cr"], ["4000 Sales Revenue", "43,750.00 Cr"],
  ["5000 Cost of Goods Sold", "36,013.55 Dr"], ["5100 Operating Expenses", "6,000.00 Dr"], ["5700 Applied Direct Labor", "5,236.00 Cr (expected: there is no payroll run in this set)"],
  ["5710 Applied Machine Overhead", "1,170.00 Cr"], ["5720 Applied Fixed Overhead", "1,963.50 Cr"], ["<b>Net profit for November</b>", "<b>10,105.95</b>"]]))
T.append(part("What each mistake looks like"))
T.append(table(["Slip", "Shows up as"], [
  ["Invoice left at the default date (today)", "The invoice check fails on its date; the month cannot close with the right sales; Period End also warns about an earlier month."],
  ["Rattan issued at the standard 75 kg", "1200 Raw Materials and 5000 Cost of Goods Sold are off; Rattan stock is 35 kg instead of 32."],
  ["Planned prices or rates typed wrongly", "The standard cost checks (₱599.15, ₱563.85) fail first, then the ledger."],
  ["Laguna order also invoiced", "2050 GR/IR is nil, 2000 Accounts Payable is higher, and the vendor-invoice count is 2."],
  ["Month not closed, or closed before the voucher", "The month-end check fails, or the vouchers check shows one voucher."]]))
T.append(part("Before the class starts: every student needs an EMPTY Manufacturing company"))
T.append("<p>A student has only one Manufacturing company, and Activity 1 must start in an empty one. If a student already put the demo company or other practice into theirs, click <b>Reset</b> next to their company on the Teacher page. It permanently erases everything in it and gives the student a fresh, empty company with the same name, fiscal year and costing method (Standard). Their account is untouched. Do this before they start, not after.</p>")
T.append(part("The answer-key company for students"))
T.append("<p>Students cannot see the answer key until you release it. In the <b>Check</b> window, scroll to <b>Answer key for students</b>: <i>Release the key to this student</i> (after you have checked them), or <i>Release the key to the whole class</i>. You can take it back the same way. A released student clicks <b>Open the Activity 1 answer key</b> on the Manufacturing home page. The system makes them a separate, read-only company (they hold only the Auditor role) with the whole exercise posted and November closed; their own company is never changed.</p>")
T.append(warn("Before this can be used: apply migrations 0050 to 0055 and deploy (the Check button, the answer key and the new Invoice date field on Shipping all need them). Students need the Invoice date field to date their invoices correctly."))
open(os.path.join(HERE, "teacher-key.html"), "w").write(doc("Activity 1 Manufacturing — Teacher key", "".join(T)))
print("ok")
