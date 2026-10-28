#!/usr/bin/env python3
"""Builds handbook.html for the Manufacturing ERP handbook. Screenshots come from ./shots (jpg)."""
import os, html
from howto import HOWTO

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")

def esc(s): return html.escape(s, quote=False)

def shot(name, cap):
    if not os.path.exists(os.path.join(SHOTS, name + ".jpg")):
        raise SystemExit("missing screenshot " + name)
    return f'<figure><img src="shots/{name}.jpg"><figcaption>{esc(cap)}</figcaption></figure>'

def tip(t): return f'<div class="tip"><b>TIP</b> {t}</div>'
def warn(t): return f'<div class="warn"><b>NOTE</b> {t}</div>'
def table(head, rows):
    h = "".join(f"<th>{c}</th>" for c in head)
    r = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table>"
def steps(items): return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"
def bullets(items): return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"

chapters = []
def chapter(title, tag, intro, body):
    chapters.append((title, tag, intro, body))

# ---------------------------------------------------------------- 1
chapter("Getting Started", "SIGN IN · CHOOSE ERP · COMPANY",
 "The Manufacturing ERP runs beside the Standard ERP inside the same Classroom ERP site. You sign in once, then pick which one to work in.",
 "".join([
  "<h3>Signing in and choosing the ERP</h3>",
  steps(["Open <b>classroom-erp.vercel.app</b> and sign in with the school email your teacher gave you.",
         "On the chooser page pick <b>Manufacturing ERP</b> (the Standard ERP is the trading/service version).",
         "Your teacher decides when Manufacturing is open to students. If the card is greyed out, ask your teacher to open it."]),
  "<h3>Your company</h3>",
  "<p>Everything you do belongs to one <b>company</b>. There are two kinds:</p>",
  table(["Kind", "Who creates it", "Who works in it"], [
    ["Solo company", "You, the first time you open the Manufacturing ERP (one per student)", "Only you. You hold every role."],
    ["Team company", "The teacher, from <b>Team companies</b>", "A team of students. Each member holds one or more roles (see the Teams and Roles chapter)."]]),
  "<p>The <b>company switcher</b> in the top bar lists every company you can open. The company name and your name are always visible there so you know whose books you are in.</p>",
  "<h3>The screen layout</h3>",
  bullets(["<b>Left sidebar</b> — one entry per module, in the order of the manufacturing cycle (Master Data → Costing → Planning → Purchasing → Inventory → Production → Shop Floor → Quality → Shipping → Sales → Finance → Period End → Analytics, then Banking, Fixed Assets, Payroll, Reports, Settings).",
           "<b>Search box</b> — finds customers, vendors, items and invoices across the company.",
           "<b>Company switcher</b> — move between the companies you can open (your own, and any team company or answer key you have been given).",
           "<b>Switch ERP</b> and <b>Sign out</b> — at the bottom of the sidebar."]),
  shot("dashboard-empty", "A brand-new company: nothing is posted yet, so every figure is zero."),
  tip("Work from top to bottom through the sidebar the first time. Master data first, then plan, buy, make, ship, bill, and finally close the month."),
 ]))

# ---------------------------------------------------------------- 2
chapter("Dashboard", "SIDEBAR → DASHBOARD",
 "The dashboard is the company's health check. It summarises what the books and the factory floor currently say.",
 "".join([
  shot("dashboard", "Dashboard of the demo company after a month of activity."),
  bullets(["<b>Key figures</b> — revenue, cost, inventory value and work in process, taken from the same books as the reports.",
           "<b>Shortcuts</b> — jump to open purchase orders, production orders, quality lots and unpaid invoices.",
           "<b>Recent activity</b> — the latest documents posted by you or your team."]),
  tip("If a dashboard figure surprises you, open Reports → Books integrity check. Every figure comes from the same ledger, so the reports always agree with each other."),
 ]))

# ---------------------------------------------------------------- 3
chapter("Master Data", "SIDEBAR → MASTER DATA",
 "Master Data is the dictionary of the factory: what you buy and make, how it is made, where, and at what cost. Set it up before posting any transaction. It has eleven tabs.",
 "".join([
  "<h3>Items</h3><p>Raw materials, packaging, semi-finished and finished goods. Each item has a SKU, a unit, a type, and a standard cost. Finished goods link to a bill of materials and a routing.</p>",
  shot("master-items", "Items: the register of everything stocked or made."),
  "<h3>Bills of materials</h3><p>The recipe of a finished good: which components, how many per unit, and the expected scrap. Production orders and planning explode these.</p>",
  shot("master-boms", "Bills of materials."),
  "<h3>Routings</h3><p>The sequence of operations for a product, the work centre used by each, and the setup and run time per unit.</p>",
  shot("master-routings", "Routings: operations in order."),
  "<h3>Work centers</h3><p>Machines or labour groups where operations are done, with capacity and the cost rates that production confirmations apply.</p>",
  shot("master-workcenters", "Work centers."),
  "<h3>Activity rates</h3><p>The planned peso rates per labour hour, machine hour and overhead basis used for standard costing.</p>",
  shot("master-rates", "Activity rates."),
  "<h3>Calendar</h3><p>Working days and holidays. Planning and scheduling skip non-working days.</p>",
  shot("master-calendar", "The working calendar."),
  "<h3>Units and Conversions</h3><p>Units of measure (pc, kg, sheet…) and the factors that convert one into another, for example buying in boxes and consuming in pieces.</p>",
  shot("master-units", "Units of measure."),
  shot("master-conversions", "Unit conversions."),
  "<h3>Locations</h3><p>Warehouses and bins where stock is kept. Every stock figure is per item per location.</p>",
  shot("master-locations", "Storage locations."),
  "<h3>Cost centers</h3><p>The departments to which costs are charged and reported.</p>",
  shot("master-costcenters", "Cost centers."),
  "<h3>Costing sheet</h3><p>The layout that builds a product's cost: materials, labour, machine, overhead and the surcharges applied to each.</p>",
  shot("master-costingsheet", "The costing sheet."),
  warn("Your teacher can load a ready-made demo company into your company for practice. Changing master data (such as a standard cost) is recorded in the audit trail."),
 ]))

# ---------------------------------------------------------------- 4
chapter("Costing", "SIDEBAR → COSTING",
 "Costing answers 'what should one unit cost?' before you make it. A cost estimate prices a lot of a product from its bill of materials, routing and activity rates.",
 "".join([
  shot("costing", "Cost estimates: unit cost, lot cost, status and warnings."),
  steps(["Click <b>New estimate</b>.", "Choose the item, the lot size and the costing date.", "Review the unit cost and any warnings (a missing price or rate shows here).", "Release the estimate so it can serve as the item's standard cost when the company uses Standard costing."]),
  table(["Column", "Meaning"], [["Estimate", "The estimate number."], ["Lot size", "Quantity the cost is spread over."], ["Unit cost / Lot cost", "Result per piece and for the whole lot."], ["Warnings", "Missing prices, rates or routings that make the number unreliable."], ["Method", "Standard or actual costing, as set by the teacher in Settings."]]),
  tip("A big gap between the standard and what production really cost shows up later as a variance in Analytics → Variance and in the period-end close."),
 ]))

# ---------------------------------------------------------------- 5
chapter("Planning", "SIDEBAR → PLANNING (MRP)",
 "Planning looks at demand and stock, then tells you what to make and what to buy, and when. It has seven views.",
 "".join([
  "<h3>Planned orders</h3><p>Suggested production orders: item, quantity, start and finish dates and how many days late each is.</p>",
  shot("planning-planned", "Planned orders."),
  "<h3>Requisitions</h3><p>Suggested purchases: the item, quantity, the date to order by and the date it is needed.</p>",
  shot("planning-reqs", "Purchase requisitions."),
  "<h3>Exceptions</h3><p>Messages that need a decision, such as an order that is late or a requirement that cannot be met.</p>",
  shot("planning-exceptions-top", "Exception messages."),
  "<h3>Forecast</h3><p>Expected future sales per item, which planning uses together with real sales orders.</p>",
  shot("planning-forecast-top", "Forecast."),
  "<h3>Capacity</h3><p>Hours required against hours available per work centre per period, so you can see overload before it happens.</p>",
  shot("planning-capacity-top", "Capacity load by work centre."),
  shot("planning-capacity-scrolled", "Capacity detail, scrolled."),
  "<h3>Planning grid</h3><p>Week-by-week projected stock for each item: demand, supply and projected balance.</p>",
  shot("planning-grid-top", "The planning grid."),
  shot("planning-grid-scrolled", "The planning grid, scrolled."),
  "<h3>Gantt</h3><p>A timeline of the planned and released orders.</p>",
  shot("planning-gantt", "Gantt chart of orders."),
  tip("Convert a planned order into a production order, and a requisition into a purchase order, instead of re-typing them."),
 ]))

# ---------------------------------------------------------------- 6
chapter("Purchasing", "SIDEBAR → PURCHASING",
 "Buying from vendors: create the purchase order, receive the goods into stock, then enter the vendor's invoice.",
 "".join([
  shot("purchasing", "Purchase orders with received quantities and status."),
  steps(["<b>New purchase order</b> — pick the vendor, items, quantities and prices.", "<b>Receive into stock</b> — when goods arrive, record the receipt. Stock goes up and the books show 'Goods received / invoice received'.", "Enter the <b>vendor invoice</b>. The system does a three-way match of order, receipt and invoice; a difference above the tolerance is held for the teacher.", "Pay the vendor from Banking."]),
  shot("purchasing-scrolled", "Order lines and receiving."),
  warn("An invoice that differs from the order or the receipt by more than the tolerance in Settings is put on hold. See Reports → Three-way match exceptions."),
 ]))

# ---------------------------------------------------------------- 7
chapter("Inventory", "SIDEBAR → INVENTORY",
 "Where your stock is. Every movement is a numbered stock document and writes its journal voucher automatically.",
 "".join([
  "<h3>Stock</h3>", shot("inventory-stock", "Stock on hand per item and location, with value."),
  "<h3>Availability</h3><p>What is on hand, reserved and expected, so you know what can still be promised.</p>", shot("inventory-availability", "Availability."),
  "<h3>Lots</h3><p>Batches with expiry dates for traceability, from supplier lot through to customer delivery.</p>", shot("inventory-lots", "Lots and expiry."),
  "<h3>Documents</h3><p>The list of every stock document (receipt, issue, transfer, delivery, adjustment) and the voucher it wrote.</p>", shot("inventory-documents", "Stock documents."),
  "<h3>Move stock</h3><p>Transfer between locations, adjust after a count, or scrap.</p>", shot("inventory-move", "Moving and adjusting stock."),
  tip("Stock cannot go below zero unless your teacher allows it in Settings. If an issue is refused, check the stock first."),
 ]))

# ---------------------------------------------------------------- 8
chapter("Production", "SIDEBAR → PRODUCTION",
 "Making things. A production order consumes materials, labour and machine time and produces finished goods.",
 "".join([
  shot("production", "Production orders: planned, good and scrap quantities, target cost and work in process."),
  steps(["<b>New production order</b> (or convert a planned order).", "Issue the materials. The cost moves from raw materials to <b>Work in process</b>.", "Confirm operations on the Shop Floor: good pieces, scrap and hours.", "Receive the finished goods into stock.", "<b>Settle</b> the order. The difference against the standard becomes a variance."]),
  table(["Column", "Meaning"], [["Planned / Good / Scrap", "What you intended, what passed, what was lost."], ["In stock", "Finished quantity already received."], ["Target cost", "The standard cost of the planned quantity."], ["In process now", "Cost charged to the order not yet moved to finished goods."]]),
 ]))

# ---------------------------------------------------------------- 9
chapter("Shop Floor", "SIDEBAR → SHOP FLOOR",
 "The day-to-day view for supervisors and operators: what to work on, how machines performed, and what stopped them.",
 "".join([
  "<h3>Dispatch</h3><p>The work list per work centre, in priority order, with the quantity still to make and the hours left.</p>", shot("shopfloor-dispatch", "Dispatch list."),
  "<h3>Downtime</h3><p>Record stoppages with a reason and hours, so lost time is visible.</p>", shot("shopfloor-downtime", "Downtime log."),
  "<h3>OEE</h3><p>Overall equipment effectiveness: availability × performance × quality for each machine.</p>", shot("shopfloor-oee", "OEE."),
  "<h3>Machines &amp; upkeep</h3><p>Machine register and upkeep (maintenance) tasks. Linking a machine to a work centre lets the system charge machine cost at real depreciation.</p>", shot("shopfloor-upkeep", "Machines and upkeep."),
 ]))

# ---------------------------------------------------------------- 10
chapter("Quality", "SIDEBAR → QUALITY",
 "Inspect what comes in and what goes out, and follow up failures until they are closed.",
 "".join([
  "<h3>Inspection lots</h3><p>Created automatically from receipts and production. Record the result and the <b>decision</b>: accept, scrap or return to vendor. A scrap or return writes its stock document and voucher.</p>", shot("quality-lots", "Inspection lots."),
  "<h3>Inspection plans</h3><p>What to check for each item and the limits.</p>", shot("quality-plans", "Inspection plans."),
  "<h3>Non-conformance reports</h3><p>Open a report for a defect, record the root cause and what happened to the goods, and use <b>Close the report</b> when finished. The loss in pesos is shown for each.</p>", shot("quality-ncr", "Non-conformance reports (NCR)."),
 ]))

# ---------------------------------------------------------------- 11
chapter("Shipping", "SIDEBAR → SHIPPING",
 "Delivering what customers ordered and billing them for it.",
 "".join([
  shot("shipping", "Sales orders to ship, with delivered and invoiced quantities."),
  steps(["Open the sales order and press <b>Deliver now</b>. Stock goes down and cost of goods sold is recorded.", "Press <b>Create invoice for what was delivered</b>. Receivable and revenue are recorded, and the invoice due date is set from the customer's terms.", "Collect payment from Banking."]),
  tip("You can deliver in parts. The order shows Ordered, Delivered and Invoiced so nothing is billed twice."),
 ]))

# ---------------------------------------------------------------- 12
chapter("Sales", "SIDEBAR → SALES",
 "Customers, sales orders and invoices.",
 "".join([
  shot("sales", "Sales orders and customers."),
  bullets(["Create the customer, then the sales order with items, quantities and prices.", "Shipping delivers and invoices it.", "Unpaid invoices appear in Reports → Receivables ageing."]),
 ]))

# ---------------------------------------------------------------- 13
chapter("Finance", "SIDEBAR → FINANCE",
 "The ledger. Every posting in the books is a numbered journal voucher (JV-2026-00001…). Documents write theirs automatically; you prepare the adjusting ones.",
 "".join([
  "<h3>Journal vouchers</h3>", shot("finance-vouchers", "The voucher register."),
  "<p>Filter by date, type, status and source. Click a voucher to open the printable version.</p>",
  shot("voucher-view", "A posted voucher: accounts, debit and credit, particulars, the supporting document and signature lines."),
  "<h3>Preparing a voucher</h3>",
  steps(["Click <b>New journal voucher</b>.", "Set the date, period, kind and a reference.", "Write the particulars: what the entry is for and why.", "Add at least two lines with an account and an amount. Debits must equal credits.", "<b>Save draft</b> to continue later, or <b>Submit / post voucher</b>."]),
  shot("voucher-form", "The new voucher form."),
  table(["Status", "Meaning"], [["Draft", "Saved, not yet in the books."], ["Waiting for approval", "Submitted. Another person (the finance manager or the teacher) must approve; you cannot approve your own."], ["Posted", "In the books."], ["Reversed", "Cancelled by a reversing voucher; both stay on record."]]),
  "<h3>Chart of accounts</h3>", shot("finance-accounts", "The chart of accounts."),
  "<h3>Recurring entries</h3><p>Entries that repeat every month (rent, depreciation), posted for you.</p>", shot("finance-recurring", "Recurring entries."),
  warn("Postings to a control account such as Accounts Receivable by hand need an override and are flagged."),
 ]))

# ---------------------------------------------------------------- 14
chapter("Period End", "SIDEBAR → PERIOD END",
 "Closing the month locks the books through its last day. Do it in order.",
 "".join([
  shot("period-months", "Months, their status and the close button."),
  steps(["Finish and post every document dated in the month.", "<b>Settle production orders</b> so labour and machine cost are charged at what really happened.", "Machine cost is settled against the <b>real depreciation</b> of the machine; the difference is posted as a variance.", "Close the variances according to the setting (to Cost of Goods Sold or to inventory).", "Check Reports → Books integrity check.", "Press <b>Close month</b>."]),
  "<h3>Cost of goods manufactured and sold</h3>", shot("period-cogm", "The CGM and CGS statement for the month."),
  warn("A closed month cannot take new postings. Ask your teacher if a month must be reopened."),
 ]))

# ---------------------------------------------------------------- 15
chapter("Analytics", "SIDEBAR → ANALYTICS",
 "Six management views built from the same books.",
 "".join([
  "<h3>Profitability</h3>", shot("analytics-profit", "Profit by product and customer."),
  "<h3>Variance</h3><p>Standard versus actual: price, usage, efficiency, machine and overhead volume.</p>", shot("analytics-variance", "Variance analysis."),
  "<h3>Inventory</h3>", shot("analytics-inventory", "Inventory analysis: slow-moving and dead stock."),
  "<h3>Suppliers</h3>", shot("analytics-suppliers", "Supplier performance."),
  "<h3>Production</h3>", shot("analytics-production", "Production performance."),
  "<h3>Cost by lot size</h3>", shot("analytics-lot", "How unit cost changes with lot size."),
 ]))

# ---------------------------------------------------------------- 16
chapter("Banking, Fixed Assets, Payroll and Settings", "SIDEBAR → BANKING · FIXED ASSETS · PAYROLL · SETTINGS",
 "Four supporting modules reached from the lower part of the sidebar.",
 "".join([
  "<h3>Banking</h3><p>Bank accounts and transactions, with ledger balance, statement balance and the unreconciled count. Use <b>Auto-match</b> to pair bank lines with the books.</p>", shot("banking", "Banking."),
  "<h3>Fixed Assets</h3><p>The register of machines, vehicles and equipment, with cost, accumulated depreciation and net book value. Depreciation feeds machine cost.</p>", shot("fixed-assets", "Fixed asset register."),
  "<h3>Payroll</h3><p>Five tabs: Employees, Time &amp; Attendance, Leave, Loans and Payroll. Hourly employees are paid from the hours logged.</p>",
  shot("payroll-employees", "Employees."), shot("payroll-time", "Time and attendance."), shot("payroll-leave", "Leave."), shot("payroll-loans", "Loans."), shot("payroll-run", "Payroll runs and 13th month pay."),
  "<h3>Settings</h3><p>Read-only for students; your teacher controls them so every company is graded the same way. It shows the costing method, the fiscal year start, how variances close, the vendor-invoice tolerance and the account each posting uses.</p>", shot("settings", "Company settings and posting accounts."),
 ]))

# ---------------------------------------------------------------- 17
chapter("Reports", "SIDEBAR → REPORTS",
 "Reports in the layout a finance department files: company, title, period, currency, brackets for negatives, notes and signature lines. Each can be printed or saved as CSV.",
 "".join([
  table(["Group", "Reports"], [["Financial statements (PAS 1)", "Financial position, comprehensive income, cash flows (PAS 7), trial balance, cost of goods manufactured and sold, receivables and payables ageing, journal vouchers"],
    ["Inventories and production", "Schedule of inventories (PAS 2), stock card, work in process, scrap loss, lots and expiry, slow-moving stock, profitability and variances"],
    ["Purchasing", "Goods received not invoiced (GR/IR), three-way match exceptions"],
    ["Control", "Books integrity check, audit trail, machine cost, is the standard cost still right?"]]),
  "<h3>Statement of financial position</h3>", shot("rpt-position", "With the option to compare against the previous month-end."),
  "<h3>Statement of comprehensive income</h3>", shot("rpt-income", "Profit or loss for a period."),
  "<h3>Statement of cash flows</h3>", shot("rpt-cashflow", "PAS 7, indirect method."),
  "<h3>Trial balance</h3>", shot("rpt-trial", "Debits equal credits."),
  "<h3>Receivables and payables ageing</h3>", shot("rpt-ageing", "Who owes what and how overdue."),
  "<h3>Schedule of inventories</h3>", shot("rpt-schedule", "General ledger against stock records."),
  "<h3>Stock card</h3>", shot("rpt-stockcard", "Choose an item to see its movements."),
  "<h3>Work in process</h3>", shot("rpt-wip", "Valuation and ageing."),
  "<h3>Scrap loss</h3>", shot("rpt-scrap", "Scrap in pesos."),
  "<h3>Goods received, not invoiced</h3>", shot("rpt-grir", "Value of receipts awaiting an invoice."),
  "<h3>Three-way match exceptions</h3>", shot("rpt-match", "Invoices that failed the match."),
  "<h3>Books integrity check</h3>", shot("rpt-integrity", "Automatic checks that the ledger and sub-ledgers agree."),
  "<h3>Audit trail</h3>", shot("rpt-audit", "Changes to master data and control events."),
  "<h3>Machine cost</h3>", shot("rpt-machine", "Real depreciation against cost applied."),
 ]))

# ---------------------------------------------------------------- 18
chapter("Teams and Roles", "SIDEBAR → TEAM COMPANIES (TEACHER)",
 "In a team company the work is divided among roles and the system enforces separation of duties. The teacher creates the team company and assigns the roles.",
 "".join([
  table(["Role", "What it does"], [
    ["Purchasing officer", "Creates purchase orders and enters vendor invoices and landed costs."],
    ["Warehouse clerk", "Receives goods, adjusts and moves stock, issues materials and delivers to customers."],
    ["Production planner", "Runs planning, production orders, the shop floor, and the items, bills of materials and routings."],
    ["Quality inspector", "Records inspections and decisions and closes non-conformance reports."],
    ["Sales and shipping clerk", "Delivers goods and raises sales invoices."],
    ["Accountant", "Prepares journal vouchers, enters vendor invoices, works on costing and settles orders and the month."],
    ["Finance manager", "Everything the accountant does, plus approves vouchers (never their own) and closes the month."],
    ["Auditor", "Reads everything and posts nothing."]]),
  warn("A member with no role can only look. Whoever prepares a voucher cannot approve it."),
  "<h3>Teacher: opening Manufacturing and creating a team company</h3>",
  "<p>On the teacher's chooser page, <b>Open it for students</b> makes Manufacturing available. Until then students see the card greyed out.</p>",
  shot("teacher-choose", "The teacher's chooser page with the Open it for students switch and links to class overview, comparison and Team companies."),
  shot("teacher-teams", "The Team companies screen."),
  steps(["Click to create a team company and name it.", "Add students and tick their roles.", "Open the books of the team at any time to check their work."]),
  "<h3>Teacher: comparing every company</h3><p>The class comparison puts every Manufacturing company side by side: sales, margin, inventory, good units, scrap %, variances, months closed and whether the books tie. Click a column to sort, or jump to a company's Analytics or Period end.</p>",
  shot("teacher-compare", "Manufacturing class comparison."),
  shot("teacher-team-new", "Creating a team company."), shot("teacher-team-add", "Adding a student and roles."), shot("teacher-team-members", "Members and roles."), shot("teacher-team-list", "The list of team companies."),
 ]))

# ---------------------------------------------------------------- 19
chapter("Month in the Life: a Worked Cycle", "PUTTING IT TOGETHER",
 "The order of work for one month, with where to do each step.",
 steps(["<b>Master Data</b>: items, bills of materials, routings, work centers, rates.",
        "<b>Costing</b>: estimate the cost of each product.",
        "<b>Planning</b>: run requirements; convert planned orders and requisitions.",
        "<b>Purchasing</b>: purchase order → receive → vendor invoice.",
        "<b>Quality</b>: inspect receipts and decide.",
        "<b>Production</b>: issue materials, confirm operations on the Shop Floor, receive finished goods.",
        "<b>Shipping</b>: deliver and invoice.",
        "<b>Banking</b>: collect and pay.",
        "<b>Payroll</b> and <b>Fixed Assets</b>: post payroll and depreciation.",
        "<b>Finance</b>: adjusting vouchers.",
        "<b>Period End</b>: settle, close variances, close the month.",
        "<b>Reports</b>: print the statements and the integrity check."]) )

# ---------------------------------------------------------------- 20
chapter("Troubleshooting and FAQ", "HELP",
 "The most common questions.",
 table(["Problem", "What to do"], [
  ["I cannot see Manufacturing ERP.", "Your teacher has not opened it yet."],
  ["I cannot press Approve on my voucher.", "By design: someone else must approve it."],
  ["Stock issue refused.", "Stock would go below zero. Receive or adjust stock first."],
  ["Vendor invoice on hold.", "It differs from the order or receipt beyond the tolerance; the teacher decides."],
  ["The month will not close.", "Run Books integrity check and settle open production orders first."],
  ["Reports do not agree with each other.", "They should always agree. Run the integrity check and tell your teacher."],
  ["I posted something wrong.", "Do not delete it. Reverse the voucher or the document; both stay on record."]]))

# ---------------------------------------------------------------- html
css = """
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#1b2433; font-size:10.5pt; line-height:1.45; }
.cover { height: 255mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }
.cover .k { color:#2f5bea; letter-spacing:.12em; font-weight:700; font-size:10pt; }
.cover h1 { font-size:38pt; margin:6px 0 10px; line-height:1.1; }
.cover p { font-size:13pt; color:#4a566a; max-width:140mm; }
.cover dl { margin-top:30px; display:grid; grid-template-columns:30mm 1fr; gap:6px; font-size:10.5pt; }
.cover dt { color:#6b778a; } .cover dd { margin:0; font-weight:600; }
.toc { page-break-after:always; }
.toc h2 { font-size:20pt; } .toc li { margin:5px 0; list-style:none; } .toc span { color:#2f5bea; font-weight:700; display:inline-block; width:8mm; }
.chap { page-break-before:always; }
.tag { color:#2f5bea; font-weight:700; letter-spacing:.1em; font-size:8.5pt; }
h2.t { font-size:22pt; margin:2px 0 6px; }
.intro { color:#4a566a; font-size:11.5pt; margin-bottom:10px; }
h3 { font-size:13pt; margin:16px 0 4px; break-after:avoid; }
figure { margin:8px 0 12px; break-inside:avoid; }
figure img { width:100%; border:1px solid #d7dde6; border-radius:5px; display:block; }
figcaption { font-size:8.5pt; color:#6b778a; margin-top:3px; }
table { width:100%; border-collapse:collapse; margin:8px 0 12px; font-size:9.5pt; break-inside:avoid; }
th { background:#eef2fb; text-align:left; } th,td { border:1px solid #d7dde6; padding:5px 8px; vertical-align:top; }
.tip,.warn { border-radius:5px; padding:7px 10px; margin:10px 0; font-size:9.5pt; break-inside:avoid; }
.tip { background:#eaf7ee; border-left:4px solid #2e9e5b; } .warn { background:#fff5e0; border-left:4px solid #e0a020; }
h3.hw { color:#2f5bea; border-top:2px solid #2f5bea; padding-top:8px; margin-top:22px; }
.legend { font-size:9.5pt; color:#4a566a; margin:2px 0 8px; }
.howto { border:1px solid #d7dde6; border-radius:6px; padding:6px 12px 4px; margin:10px 0; break-inside:avoid; }
.howto h4 { margin:4px 0 4px; font-size:11pt; } .howto b { color:#0b3fbf; } .howto i { color:#7a3b00; }
ol,ul { padding-left:20px; margin:6px 0 10px; } li { margin:3px 0; }
"""
out = ['<!doctype html><html><head><meta charset="utf-8"><title>Running the Manufacturing ERP</title><style>' + css + '</style></head><body>']
out.append('<section class="cover"><div class="k">JJ AND CO. · MANUFACTURING ERP</div><h1>Running the<br>Manufacturing ERP</h1><p>A module-by-module student handbook for every screen and tab of the Manufacturing ERP, from your first login to closing the month.</p><dl><dt>App</dt><dd>classroom-erp.vercel.app</dd><dt>Audience</dt><dd>Students, company teams and teachers</dd><dt>Covers</dt><dd>Every sidebar module, roles, vouchers, period end, reports and FAQ</dd></dl></section>')
out.append('<section class="toc"><h2>What\'s inside</h2><ul>' + "".join(f'<li><span>{i+1}</span><b>{esc(c[0])}</b></li>' for i, c in enumerate(chapters)) + '</ul></section>')
for i, (title, tag, intro, body) in enumerate(chapters):
    out.append(f'<section class="chap"><div class="tag">{i+1} · {esc(tag)}</div><h2 class="t">{esc(title)}</h2><div class="intro">{intro}</div>{body}' + (f'<h3 class="hw">Step by step</h3><p class="legend">Click the <b>bold</b> words. <i>Italic</i> words are boxes you fill in.</p>' + "".join(HOWTO[title]) if title in HOWTO else '') + '</section>')
out.append('</body></html>')
open(os.path.join(HERE, "handbook.html"), "w").write("\n".join(out))
print("ok", len(chapters), "chapters")
