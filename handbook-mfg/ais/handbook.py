#!/usr/bin/env python3
"""Builds handbook.html: 'Running the AIS Edition', the module-by-module handbook of how the Accounting Information Systems edition works (its mechanics) and how to use
every screen, for students and for the teacher. Screenshots come from ./shots (jpg); the CSS is the one build.py uses for the other AIS documents.
Run:  python3 handbook.py   then render with Chrome headless (see render.sh, which now lists 'handbook')."""
import html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CSS = re.search(r'CSS = """(.*?)"""', open(os.path.join(HERE, "build.py"), encoding="utf8").read(), re.S).group(1)
def esc(s): return html.escape(str(s), quote=False)

def shot(name, cap):
    if not os.path.exists(os.path.join(HERE, "shots", name + ".jpg")): raise SystemExit("missing screenshot " + name)
    return f'<figure><img src="shots/{name}.jpg"><figcaption>{esc(cap)}</figcaption></figure>'
def tip(t): return f'<div class="tip"><b>TIP</b> {t}</div>'
def warn(t): return f'<div class="warn"><b>NOTE</b> {t}</div>'
def what(title, body): return f'<div class="what"><h4>{title}</h4><p>{body}</p></div>'
def table(head, rows, cls=None):
    h = "".join(f"<th>{c}</th>" for c in head)
    r = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table>"
def steps(items): return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"
def bullets(items): return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
def how(title, items, note=None):
    n = f'<div class="warn"><b>NOTE</b> {note}</div>' if note else ""
    return f'<div class="howto"><h4>How to {title}</h4>{steps(items)}{n}</div>'

chapters = []
def chapter(title, tag, intro, body): chapters.append((title, tag, intro, "".join(body)))

# =========================================================================================================== PART 1: HOW THE SYSTEM WORKS
chapter("The Big Picture", "WHAT AIS IS · SEATS · PHASES",
 "AIS stands for Accounting Information System. In this edition you process a company's transactions under controls, and then audit the result.",
 [
 what("What is an accounting information system?", "A system of people, documents, rules and software that captures business events (a sale, a purchase, a payday), checks them against <b>controls</b>, and turns them into the records and statements that managers and auditors rely on. A good system does not only add up numbers: it makes sure the right things are recorded, once, in the right period, with the right approval."),
 "<h3>One company, two jobs (seats)</h3>",
 table(["Seat", "What the student does", "Where the menu takes them"], [
   ["<b>Accounting</b>", "Reviews document packets and decides to <b>post</b> or <b>hold</b>; works the Sales, Purchases, Payroll, Fixed assets and Close desks.", "Document inbox, the five desks, General ledger"],
   ["<b>Audit</b>", "After the Accounting phase closes, tests the posted books: analytic tests, samples, workpapers, findings, reversals.", "Audit room"]]),
 "<p>Both seats work in the <b>same company books</b>. What the Accounting seat posts is exactly what the Audit seat later tests. Everyone also sees <b>Workspace</b> and <b>Messages</b>. A teacher can put one student on each seat (a pair, which is the better practice because the auditor is truly independent), or one student on both (solo practice).</p>",
 "<h3>The two phases</h3>",
 table(["Phase", "What happens", "How it ends"], [
   ["1. Accounting", "The Accounting seat processes the practice set's documents and desk cards. Every step writes a real journal entry to the ledger.", "The Accounting phase is <b>closed</b>. The books are then locked through the <b>lock date</b>: nobody can post into that period again."],
   ["2. Audit", "The Audit seat tests the locked books for the problems that were hidden in them, documents the work and reports findings.", "The auditor uses <b>Close the audit</b>. The planted problems are revealed and the score is shown."]]),
 warn("A wrong decision in the Accounting phase is not undone by the system: a wrong POST still posts exactly as the student chose. That posted error is what the Audit seat later finds. This is how the two seats connect."),
 "<h3>Practice round or graded round</h3>",
 table(["", "Practice round", "Graded round"], [
   ["Wrong journal on a valid document", "Refused, with a hint after two refusals. Each refusal costs a point.", "Posts exactly as entered. No second chance."],
   ["Points visible", "Immediately, with an explanation after each decision.", "Only when the Accounting phase closes."],
   ["Segregation of duties", "Hard block: you cannot approve your own exception.", "Teacher's choice: <b>Allow but log</b> lets the violation happen so that the Audit seat can find it."],
   ["Use it for", "Learning.", "Assessment."]]),
 "<p>The teacher chooses the mode when the practice set is assigned. The desks follow the same rule for showing your score.</p>",
 tip("Everything in this edition is practice. Mistakes are how you learn what each control is for. Read the explanation after every decision, especially the ones you got wrong."),
 ])

chapter("How the Books Work", "LEDGER · POSTING · LOCK DATE · REVERSALS",
 "Behind every screen is one general ledger. These rules explain why the system behaves as it does.",
 [
 "<h3>One ledger, exact balance</h3>",
 bullets([
   "Every desk step, packet decision and closing step writes a <b>journal entry</b> with debit and credit lines to the company's ledger. There is no second set of books.",
   "An entry must balance <b>exactly</b>: total debits equal total credits, to the centavo. The AIS posting never absorbs small differences into a rounding account, because the errors students make are the very thing the auditor must be able to find.",
   "Entries <b>cannot be edited or deleted</b> once posted. A mistake is corrected with a reversing entry, and both stay in the ledger."]),
 "<h3>The lock date</h3>",
 "<p>When the Accounting phase closes, the books are locked through the <b>lock date</b> the teacher set. No entry can be posted dated on or before it. The Audit seat's reversals are dated <b>after</b> the lock date.</p>",
 "<h3>Seeds: the same set every time</h3>",
 "<p>A practice set can use a <b>seed</b>. A seed makes the generated details (which packets carry which errors, amounts and names) follow from the seed and the document numbers, never from a random draw. The same seed gives the same set, so a teacher can regrade work and give two students the same version.</p>",
 "<h3>What the system refuses, and what it does not</h3>",
 table(["The system refuses", "The system does <u>not</u> stop you (a control you must apply yourself)"], [
   ["Shipping before the credit check, or while an order is held.", "Approving an order that is over the credit limit or at the wrong price (it only holds the order and asks for a reason)."],
   ["Shipping more than is in stock.", "A duplicate customer purchase order (the system does not flag it at all)."],
   ["Billing before shipping.", "Approving your own exception when the company allows solo work (the books mark it as a self-approval)."],
   ["Entering an order whose price or quantity differs from the purchase order.", "Posting a document that should have been held, in a graded round."],
   ["Collecting more than a customer owes.", "Capitalizing a repair or expensing an asset (it posts what you chose)."],
   ["An entry whose debits and credits are not equal.", "Choosing the wrong control to hold a packet with (it tells you in a practice round)."]]),
 tip("Stopping a bad item is worth as many points as processing a good one, and an item you never opened scores nothing."),
 ])

chapter("Controls and Scoring", "HALL'S CONTROL CATEGORIES · HOW POINTS WORK",
 "Controls are the checks the work is built around. Points reward applying them and finding the cases where they failed.",
 [
 "<h3>The controls you apply</h3>",
 table(["Control", "Ask yourself"], [
   ["Authorization", "Did the right person approve it? Is the credit limit respected? Is the approval line signed?"],
   ["Existence", "Is there proof the goods really shipped (a signed delivery receipt) or arrived (a receiving report)?"],
   ["Accuracy", "Do quantities and prices on the invoice agree with the delivery receipt and the price list?"],
   ["Completeness and validity", "Is this invoice already in the books (a duplicate)? Is the vendor or employee on the approved list?"],
   ["Timing (cutoff)", "Does the delivery date belong in the period the invoice is dated in?"],
   ["Segregation of duties", "Did one person prepare, approve and record it?"],
   ["Returns", "Is there an approved credit memo before the customer's balance is reduced?"]]),
 "<h3>How points are given</h3>",
 table(["Seat or desk", "Scoring"], [
   ["Document inbox", "Up to <b>6 points per document</b>: the decision, the journal entry for a post, or the right control for a hold. A valid document that you hold wrongly also loses points."],
   ["Desks (Sales, Purchases, Payroll, Fixed assets, Close)", "Each card scores for the right action, and stopping a bad card scores as much as processing a good one. Hidden traps sit in the cards. In a graded round the score appears when the Accounting phase closes."],
   ["Practice round", "A refused wrong journal costs <b>1 point</b>; after two refusals a hint appears."],
   ["Audit seat", "<b>6</b> for each planted problem found with the right finding type; <b>3</b> if the right entry was pointed at but the wrong type chosen; <b>+2</b> if the entry was also reversed; <b>−2</b> for each finding on an entry that was fine (a false accusation). There is also a separate <b>process score</b> for the quality of the audit work itself (tests run, samples, signed workpapers)."]]),
 warn("Some entries look odd but are normal. A test result is a lead, not a conclusion: always look at the entry and vouch it before you report it."),
 ])

# =========================================================================================================== PART 2: STUDENT SCREENS
chapter("Signing In and the Workspace", "SIGN IN · CHOOSE AIS · WORKSPACE",
 "You use the same Classroom ERP site as the other editions. After signing in you choose the AIS edition and your company.",
 [
 how("sign in and open AIS", [
   "Open <b>classroom-erp.vercel.app</b> and sign in with the school email your teacher gave you. (A new account waits for your teacher's approval and sees a waiting page until it is approved.)",
   "On the chooser page click the violet <b>AIS</b> card. If it is greyed out, your teacher has not opened the edition yet, or has not given you this system.",
   "If you belong to more than one company, use the company name at the top of the left menu to switch. Inside AIS the list shows only AIS companies."]),
 "<p>Your menu shows the pages for the seat you hold. Accounting sees Document inbox, General ledger and the five desks; Audit sees the Audit room; everyone sees Workspace and Messages.</p>",
 shot("workspace", "The Workspace: your company, your seat or seats, the practice set and its progress, and who else is in the company."),
 table(["Menu page", "Seat", "What it is"], [
   ["Workspace", "Both", "Your starting page: the company, your seat, and where you are in the round."],
   ["Document inbox", "Accounting", "Thirteen document packets to review. Post or hold each one."],
   ["Sales desk", "Accounting", "The revenue cycle: customer orders, credit check, shipping, billing, cash received."],
   ["Purchases desk", "Accounting", "The expenditure cycle: receiving, vendor invoices, three-way match, payables, payments."],
   ["Payroll desk", "Accounting", "Timecards and pay changes, checks against the HR file, payroll vouchers, net pay."],
   ["Fixed assets desk", "Accounting", "Capital or expense, depreciation, and the sale of an old asset."],
   ["Close and statements", "Accounting", "Adjusting entries, closing entries, trial balance, income statement, balance sheet."],
   ["General ledger", "Accounting", "Every journal entry posted in the company, with search."],
   ["Audit room", "Audit", "Ledger, Tests, Sampling, Workpapers, Findings, Close the audit."],
   ["Messages", "Both", "Messages with your teacher."]]),
 "<p>The <b>Workspace</b> also tells you the practice set assigned to your company, the mode (practice or graded), and the lock date. Check it first: it tells you which round you are in.</p>",
 ])

chapter("The Document Inbox", "ACCOUNTING SEAT · POST OR HOLD",
 "Thirteen packets of paper documents from Sinag Rice Trading Co. for January 2027. For each packet you decide: post it with the correct journal entry, or hold it and name the control that failed.",
 [
 shot("inbox", "The inbox: thirteen packets, each waiting for your decision. The progress bar and the Decided counter show how far you are."),
 how("work a packet", [
   "Open <b>Document inbox</b> and click a packet, or click <b>Review the next document</b>.",
   "Read every page of the packet. Compare the sales order, delivery receipt and invoice line by line: customer, quantities, prices, dates, approvals.",
   "If everything agrees and is authorized, choose <b>Post</b> and key the journal entry: pick an account, enter the debit or credit, and repeat until debits equal credits.",
   "If something fails a control, choose <b>Hold</b> and pick the control that failed from the list (grouped by Hall's categories).",
   "Press the decision button. In a practice round you learn the result at once; read the explanation."]),
 shot("packet", "A document packet: read every page on the left, then decide on the right."),
 what("A journal entry for a credit sale", "When a sale is on credit you record the receivable you will collect (debit <b>Accounts Receivable</b> for the total), the sale itself (credit <b>Sales Revenue</b> for the amount before tax) and the VAT you owe (credit <b>VAT Payable</b>). You also record what the goods cost you: debit <b>Cost of Goods Sold</b> and credit <b>Merchandise Inventory</b>."),
 tip("A packet can look perfect except for one small thing. One packet is a valid sale that sits exactly on the credit limit. Holding a valid sale is also a mistake."),
 ])

chapter("The Sales Desk", "ACCOUNTING SEAT · REVENUE CYCLE",
 "Nine customer cards for January 2027. Each step you take posts a real entry to the ledger.",
 [
 shot("sales", "The Sales desk: nine customer cards. The action button on each card shows the next step you may take."),
 how("work a purchase order card", [
   "<b>Enter the order</b>: copy the customer, item, quantity and unit price from the customer's purchase order into the form.",
   "<b>Run the credit check</b>: the system adds what the customer already owes, plus anything shipped but not billed, plus this order, and compares it to the credit limit. It also compares your price to the price list.",
   "If the check holds the order, decide: <b>approve</b> it (you must write a reason) or <b>reject</b> it (also with a reason).",
   "<b>Ship</b>: the system posts the cost of the goods (debit Cost of Goods Sold, credit Inventory) and lowers stock.",
   "<b>Bill the customer</b>: the system posts the receivable, the sale and the VAT, and numbers the invoice."]),
 how("record a customer's payment (remittance advice card)", [
   "Press <b>Record the cash</b>.",
   "Choose the invoice the customer is paying and enter the amount actually received.",
   "The system posts debit Cash in Bank, credit Accounts Receivable, and reduces the customer's balance."]),
 what("What is a credit check?", "Before you ship goods on credit you check that the customer can be trusted with more credit. What they already owe, plus this new order, must not be above their <b>credit limit</b>. A small order can still be too much if the customer has a large unpaid balance."),
 what("What is segregation of duties?", "No single person should be able to start, approve and complete a transaction. The person who entered an order cannot approve its exception unless the company allows solo work. If you approve your own exception, the books mark it as a <b>self-approval</b>, and an auditor will look for exactly that."),
 ])

chapter("The Purchases Desk", "ACCOUNTING SEAT · EXPENDITURE CYCLE",
 "Nine vendor cards: seven purchase packets (purchase order, receiving report and vendor invoice) and two payment vouchers.",
 [
 shot("purchases", "The Purchases desk: the purchase order, receiving report and vendor invoice side by side. Amber figures are the invoice figures to check."),
 how("work a purchase packet", [
   "<b>Record the receipt</b>: copy the quantity the warehouse counted on the receiving report. The system posts debit Inventory and credit GR/IR and raises stock.",
   "Enter the vendor invoice exactly as printed: invoice number, quantity billed, unit price.",
   "<b>Run the three-way match</b>: the system compares the purchase order, the receiving report and the invoice, and checks that the vendor is on the approved list.",
   "If the match holds the invoice, approve or reject it with a written reason.",
   "<b>Post to payables</b>: the system clears GR/IR for what was received, books the input VAT, books any price or quantity difference to Purchase Discounts and Adjustments, and credits Accounts Payable."]),
 how("pay a vendor (payment voucher card)", [
   "Press <b>Pay the vendor</b>.",
   "Choose the posted invoice and enter the authorized amount.",
   "The system posts debit Accounts Payable, credit Cash in Bank."]),
 what("What is the three-way match?", "Before you pay a supplier you check that three independent documents agree: what you ordered (purchase order), what arrived (receiving report) and what the supplier charges (invoice). If the invoice bills more than arrived, or at a higher price than agreed, you are about to overpay. With no receiving report you cannot be sure the goods came at all."),
 what("What is GR/IR?", "Goods Received / Invoice Received is a temporary liability. When goods arrive before the invoice, you owe for them but do not yet have the bill. GR/IR holds that obligation until the invoice arrives and clears it into Accounts Payable."),
 tip("Never pay for more than arrived, at more than was agreed, to a vendor nobody approved, or twice."),
 ])

chapter("The Payroll Desk", "ACCOUNTING SEAT · TIMECARDS · HR FILE",
 "Ten cards for the January 2027 payroll: timecards, a pay-rate change request and the payroll run.",
 [
 shot("payroll", "The Payroll desk: each timecard or pay-rate change is checked against the HR file."),
 how("process the payroll", [
   "For each timecard or rate change press <b>Check against the HR file</b>. The system checks that the person is on the HR master file and still employed, that the hours are possible, that overtime has an approved slip, and that a pay-rate change has an approved personnel action form.",
   "If the check holds a card, approve or reject it with a written reason. A rejected card goes back to the supervisor and is not paid in this run.",
   "When every card is decided, <b>post the payroll</b>: the system makes one voucher per employee.",
   "Then <b>pay the net pay</b>: debit Accrued Expenses (net pay payable), credit Cash in Bank."]),
 what("What is a payroll voucher?", "Gross pay is the expense. From it the company holds back the employee's SSS, PhilHealth and Pag-IBIG contributions and withholding tax (all liabilities owed to the government); the rest is <b>net pay</b>. The company also owes its own employer share of the contributions, which is another expense. The voucher records all of that in one balanced entry."),
 what("What is a ghost employee?", "A name on the payroll that does not belong to a real, currently working person. Someone inside the company creates or keeps the name and collects the pay. The main defense is to pay only people on the HR master file and to keep HR separate from the people who approve timecards."),
 warn("Contribution and tax rates in this desk are simplified classroom rates, not the legal tables."),
 ])

chapter("The Fixed Assets Desk", "ACCOUNTING SEAT · CAPITALIZE · DEPRECIATE · DISPOSE",
 "Five vendor invoices to classify, then the January depreciation, then the sale of an old forklift.",
 [
 shot("assets", "The Fixed assets desk: choose Capitalize or Expense for each invoice. The register of assets sits below."),
 "<p><b>Company policy:</b> spend above <b>15,000</b> that adds an asset or makes it last longer is <b>capitalized</b> (put on the register and depreciated). Routine repairs, servicing and small items are <b>expensed</b> this month.</p>",
 how("work the desk", [
   "For each of the five invoices press <b>Capitalize</b> or <b>Expense</b>. The system posts exactly what you chose.",
   "When all five are decided, run <b>January depreciation</b>: straight-line for every asset in service by the 15th.",
   "Then record the <b>sale of the old forklift</b>: the system removes its cost and accumulated depreciation and records the gain."],
   "You cannot run depreciation until every invoice is decided, and you cannot record the sale until depreciation is run, so the register is always up to date."),
 what("What is straight-line depreciation?", "Cost, less any salvage value, divided by the months of useful life. A 1,250,000 truck with a 60-month life loses 20,833.33 of book value every month. The charge is debit Depreciation Expense, credit Accumulated Depreciation."),
 what("What is capitalizing?", "Recording a cost as an asset instead of an expense because it will help the business for several years. If you expense something that should be capitalized, this month's profit is too low. If you capitalize a repair, assets and profit are too high."),
 ])

chapter("Close and Statements", "ACCOUNTING SEAT · ADJUST · CLOSE · READ THE STATEMENTS",
 "The last job of the period: two adjusting entries, the closing entries, and then you read the financial statements.",
 [
 shot("close", "Close and statements: the three period-end steps, with the trial balance and income statement updating as you work."),
 how("close the period", [
   "<b>Allowance for doubtful accounts</b>: policy is that 2% of the receivable balance at month end will not be collected. Work out 2% of the balance shown, to the centavo, and enter it. The system refuses a wrong figure and does not tell you the right one.",
   "<b>Accrued electricity</b>: the January bill of 18,000 arrives in February. Decide to accrue it in January or skip it.",
   "<b>Closing entries</b>: once both adjustments are in, the system closes revenue and expenses to the owner's equity account."]),
 "<h3>Reading the statements</h3>",
 bullets(["The <b>trial balance</b> must have equal debit and credit totals.",
          "The <b>income statement</b> shows revenue minus expenses: net income.",
          "The <b>balance sheet</b> must balance: assets equal liabilities plus equity. Before closing, the period's net income is a separate line in equity; after closing it is inside the equity account."]),
 what("What is an adjusting entry?", "At the end of a period some things have changed even though no document arrived: an expense was used but not billed yet, or an asset is worth less than the books say. An adjusting entry brings the books up to date so the statements tell the truth for the period."),
 what("What is accrual accounting?", "You record expenses in the period they are used and revenue in the period it is earned, not when cash moves. January's electricity belongs in January even if the bill comes in February."),
 shot("ledger", "The General ledger: the trial balance at the top, then every journal entry with its lines. Entries cannot be edited or deleted."),
 ])

chapter("The Audit Room", "AUDIT SEAT · TEST · SAMPLE · DOCUMENT · REPORT · REVERSE",
 "After the Accounting phase closes, the books are locked. The auditor tests what was posted, documents the work, reports what is wrong, and reverses entries that should not stand.",
 [
 shot("audit-ledger", "The Audit room opens on the ledger. The six tabs run across the top. Use Report on any entry to start a finding."),
 table(["Tab", "What you do there"], [
   ["Ledger", "Search every entry. Open an entry to see its lines. Use <b>Vouch</b> to see the supporting documents for desk entries and <b>Report</b> to start a finding."],
   ["Tests", "Run analytic tests over the whole population: duplicates, round amounts, weekend postings, after-hours postings, amounts just below the approval limit, gaps in invoice numbers, and the Benford first-digit test."],
   ["Sampling", "Draw a random or monetary-unit sample, vouch each item, and mark it Pass or Exception with a note."],
   ["Workpapers", "Write your objective, what you did, and your conclusion. Link a sample. Sign it when complete: a signed workpaper is frozen."],
   ["Findings", "Report each problem with its condition, criteria, cause, effect and recommendation, and the finding type. Reverse the wrongly posted entry from here."],
   ["Close the audit", "End your work and reveal what was planted and how you did."]]),
 shot("audit-tests", "Running a test: the weekend-postings test flags a few of 303 entries and says why. A flag is a lead, not a conclusion."),
 what("What is an analytic test?", "A scan of every entry for a pattern that often means trouble. It does not prove fraud or error; it gives a short list worth looking at. Examples: the same amount billed to the same customer twice in a week, exactly round amounts, entries posted on a Saturday night, amounts just under an approval limit."),
 what("What is Benford's law?", "In natural business numbers the first digit is not evenly spread: about 30% start with 1 and fewer than 5% with 9. If the first digits of a population are too even, or too heavy on one digit, someone may have invented numbers. The test reports a <b>mean absolute deviation</b>: the smaller, the more natural the numbers."),
 shot("audit-sampling", "Sampling: choose a method and a sample size (or a seed, so the same sample can be drawn again), then vouch each item and mark it Pass or Exception."),
 how("report a finding", [
   "Find the entry (from a test flag, a sample item or the ledger) and open it. Use <b>Vouch</b> to see the documents behind it.",
   "Click <b>Report</b>. Choose the <i>type of exception</i> from the list.",
   "Write the <i>condition</i> (what you found), the <i>criteria</i> (what it should have been), the <i>cause</i>, the <i>effect</i> and your <i>recommendation</i>.",
   "Save the finding."]),
 shot("audit-finding", "Reporting a finding: choose the type of exception, then write the five parts."),
 how("reverse an entry that should not stand", [
   "Open the finding (or the entry) and choose <b>Reverse</b>.",
   "Give a reason of at least ten characters. The reversing entry is dated after the lock date.",
   "Both the original and the reversal stay in the ledger."],
   "You cannot change a posted entry and the period is closed, so a reversal is the only correction."),
 how("finish the audit", [
   "Make sure your workpapers are signed and your findings are reported.",
   "Open <b>Close the audit</b> and confirm.",
   "The planted problems are revealed with how you did: found, wrong type, missed, and false reports."]),
 tip("Report only what you can support. A finding on an entry that was fine costs points."),
 ])

# =========================================================================================================== PART 3: TEACHER
chapter("For the Teacher: Setting Up Companies", "AIS COMPANIES · SEATS · PRACTICE SETS",
 "The teacher creates every AIS company, assigns a practice set and decides who holds which seat. Students cannot create AIS companies themselves.",
 [
 "<p>Teacher pages: <b>Accounting Information Systems companies</b> (<code>/ais/teams</code>), <b>Class gradebook</b> (<code>/ais/gradebook</code>) and <b>Class scores (Excel)</b> (<code>/teacher/scores</code>). The AIS card on the chooser is open to students only when you turn the edition on.</p>",
 how("create an AIS company", [
   "Open <b>Accounting Information Systems companies</b> and click <b>New AIS company</b>.",
   "Type the company name and check <i>Fiscal year starts</i>.",
   "Choose the <i>Accounting seat</i> and the <i>Audit seat</i> (both optional): two different students, because the auditor must be independent of the person who posted. You can allow one student to do both later (solo practice).",
   "Choose the <i>Practice set</i> (or <i>Assign later…</i>), the mode (<b>Practice: instant feedback</b> or <b>Graded: scores after close</b>), the date to <i>Lock the books on</i>, and a <i>Seed</i> if you want a repeatable set.",
   "Save. The company appears in the list with its seats and set."]),
 how("create many companies from a list", [
   "On <b>Accounting Information Systems companies</b> click <b>Create companies from a list</b>.",
   "Type one company per line as <i>Company name, Accounting student, Audit student</i> (the students' names as they appear in the system).",
   "Choose the <i>Practice set</i> (or <i>Do not assign one yet</i>), the mode (<b>Practice (feedback at once)</b> or <b>Graded (points after close)</b>) and <i>Books locked through</i>.",
   "Create. Check the companies that appear, then adjust any one of them."]),
 how("import a practice set", [
   "Click <b>Import a practice set</b>.",
   "Paste the contents of the set's <code>.json</code> file and import. A set is any number of transactions (5 to 500) tied to a topic; each has a packet and a hidden key (post or hold, the correct journal and the failed control).",
   "The set is now available when you create a company or assign a set."]),
 how("assign or change the practice set, mode, lock date and seed", [
   "Open the company and choose <b>Choose a practice set…</b>.",
   "Pick the set, the mode (practice or graded), the <i>Lock the books on</i> date and a seed if you want.",
   "Click <b>Assign this set</b>."]),
 how("decide who holds the seats and the segregation-of-duties rule", [
   "Open the company's <b>Who holds the seats</b> panel.",
   "Add a student with <b>Add a student</b> then <b>Add to the company</b>, and tick the seat or seats (or use <b>Solo practice</b>).",
   "Choose the <b>Segregation of duties</b> rule: block it, or <b>Allow but log</b>, so that violations exist for the auditor to find (usual in a graded round)."]),
 how("start a new round or clear the desks", [
   "<b>Start a new round…</b> begins another round on the company with a set, a mode, a lock date and a seed.",
   "<b>Reset the desks…</b> clears the Sales, Purchases, Payroll, Fixed assets and Close desks of what students did, so the cards start fresh. Confirm only when you mean it."],
   "AIS companies do not yet have a delete button on this page."),
 ])

chapter("For the Teacher: Keys, Gradebook and Scores", "ANSWER KEYS · PLANTED EXCEPTIONS · GRADEBOOK · EXCEL",
 "Everything the students hide from each other is visible to you, and the class results show what to teach next.",
 [
 table(["Where", "What you see"], [
   ["<b>Accounting: answer key and results</b> (on the company)", "For each document: the right decision, the correct journal, the failed control, what the student did and whether they got it right."],
   ["<b>Audit: planted exceptions and results</b> (on the company)", "Every problem planted in the books, by type, with the auditor's results: found, wrong type, missed, reversed, and findings <b>Reported, but not planted</b> (false accusations)."],
   ["<b>Class gradebook</b>", "For the class: a row per company and a table by exception type with <b>Found / planted</b>, <b>False reports</b> and the <b>Detection rate</b> (a low rate means the class does not yet know how to spot that kind of exception: a good topic for the next lesson). For the inbox: Right answer, Held with the right control, Held with another control, and what happened."],
   ["<b>Class scores (Excel)</b>", "One workbook for the whole class across the three editions: Summary, Standard, Manufacturing, AIS, Detail and Class insights."]]),
 how("read the class and teach from it", [
   "Open <b>Class gradebook</b> after the Audit phase closes.",
   "Look at the <i>Detection rate</i> by exception type. The lowest types are the next lecture.",
   "Look at <i>False reports</i>: students who accuse everything are guessing from the test flags without vouching.",
   "Open a single company's results to review one pair's decisions and give feedback."]),
 how("export the class scores", [
   "Click <b>Class scores (Excel)</b> on the teacher page or the AIS companies page.",
   "Wait for the file to download and open it. Each edition has its own sheet; <i>Class insights</i> summarizes the weakest areas."]),
 tip("Run the first round in practice mode so students see the explanations, then a graded round on a different seed so each pair gets a comparable but different set."),
 ])

chapter("A Whole Round, Step by Step", "FROM THE FIRST CLICK TO THE FINAL SCORE",
 "How a normal round runs from your teacher's setup to the final score.",
 [
 table(["Step", "Who", "What happens"], [
   ["1", "Teacher", "Creates the AIS company, picks the set, the mode, the lock date and the seats."],
   ["2", "Accounting student", "Opens Workspace, then works the Document inbox: post or hold each of the 13 packets."],
   ["3", "Accounting student", "Works the Sales, Purchases, Payroll and Fixed assets desks, always the next card the system offers."],
   ["4", "Accounting student", "Closes the period in Close and statements: two adjustments, the closing entries, then reads the statements."],
   ["5", "Accounting student or teacher", "Closes the Accounting phase. The books lock through the lock date. In a graded round the score now appears."],
   ["6", "Audit student", "Runs analytic tests, draws samples, vouches items, signs workpapers, reports findings, reverses wrong entries."],
   ["7", "Audit student", "Uses Close the audit. The planted problems are revealed and the score appears."],
   ["8", "Teacher", "Reads the answer key, the planted exceptions and the class gradebook, and exports the Excel scores."]]),
 ])

chapter("Troubleshooting and Glossary", "WHEN SOMETHING LOOKS WRONG · WORDS AND ACCOUNTS",
 "Common questions and the words and accounts you will meet.",
 [
 "<h3>Common questions</h3>",
 table(["Question", "Answer"], [
   ["The AIS card is greyed out.", "Your teacher has not opened the edition, or has not given you this system. Ask your teacher."],
   ["I see 'Waiting for your teacher's approval'.", "New accounts are approved by the teacher, who also chooses which systems you may use. The page opens them as soon as you are approved."],
   ["I cannot find the Audit room.", "Only the Audit seat sees it, and it opens after the Accounting phase closes. Ask your teacher which seat you hold."],
   ["The system refused my journal entry.", "Debits must equal credits exactly, and in a practice round the accounts and amounts must match the document. Read the message; after two refusals a hint appears."],
   ["I posted a wrong entry. How do I fix it?", "A posted entry cannot be edited or deleted. In the Accounting phase the correction is part of what the auditor later finds; in the Audit phase the auditor reverses it."],
   ["A button is greyed out on a card.", "The desks enforce an order (check before ship, ship before bill, all invoices decided before depreciation). Do the previous step first."],
   ["I do not see my points.", "In a graded round points appear only when the Accounting phase closes."],
   ["My test flagged an entry. Is it fraud?", "No: a flag is a lead. Vouch the entry and its documents before reporting it, or you lose points for a false accusation."]]),
 "<h3>Glossary</h3>",
 table(["Term", "Meaning"], [
   ["Control", "A rule or check that stops or catches an error or fraud."], ["Authorization", "Approval by the right person before something happens."],
   ["Cutoff", "Putting a transaction in the right period."], ["Duplicate", "The same transaction recorded twice."],
   ["Segregation of duties (SoD)", "Different people for starting, approving, recording and holding assets."], ["Credit memo", "A document reducing what a customer owes, usually for returned goods."],
   ["Receiving report", "The warehouse's record of what actually arrived."], ["Three-way match", "Purchase order, receiving report and invoice agree before payment."],
   ["Accrual", "Recording an expense or revenue before cash moves, because it belongs to the period."], ["Allowance for doubtful accounts", "A reserve that lowers receivables for amounts unlikely to be collected."],
   ["Planted exception", "A problem hidden in the books on purpose, for the auditor to find."], ["Workpaper", "The auditor's record of work done, conclusions and evidence."],
   ["Sample", "A part of a population examined in place of all of it."], ["Reversal", "An equal and opposite entry that cancels a wrong one."],
   ["Lock date", "The date through which the books are closed to new entries."], ["Seed", "A number that makes a generated set repeatable."]]),
 "<h3>Chart of accounts</h3>",
 table(["Code", "Account", "Code", "Account"], [
   ["1000", "Cash in Bank", "2200", "VAT Payable"], ["1100", "Accounts Receivable", "2300", "Accrued Expenses"],
   ["1110", "Allowance for Doubtful Accounts", "3000", "Owner's Equity"], ["1160", "Input Tax (VAT)", "4000", "Sales Revenue"],
   ["1200", "Merchandise Inventory", "4010", "Sales Returns and Allowances"], ["1500", "Fixed Assets", "4100", "Gain on Disposal of Assets"],
   ["1590", "Accumulated Depreciation", "5000", "Cost of Goods Sold"], ["2000", "Accounts Payable", "5100", "Operating Expenses"],
   ["2050", "Goods Received / Invoice Received (GR/IR)", "5110", "Bad Debts Expense"], ["2100", "SSS Payable", "5300", "Payroll Expense"],
   ["2110", "PhilHealth Payable", "5310", "Payroll Tax Expense (Employer Share)"], ["2120", "Pag-IBIG Payable", "5400", "Depreciation Expense"],
   ["2130", "Withholding Tax Payable", "5900", "Purchase Discounts and Adjustments"]]),
 ])

# =========================================================================================================== assemble
PARTS = {0: ("PART 1", "How the System Works"), 3: ("PART 2", "Using Every Screen (Students)"), 11: ("PART 3", "The Teacher's Side"), 13: ("PART 4", "Putting It Together and Help")}

def build():
    toc = "".join(f'<li><span>{i + 1}</span> {esc(t)}</li>' for i, (t, _, _, _) in enumerate(chapters))
    out = [f'<!doctype html><html><head><meta charset="utf-8"><title>Running the AIS Edition</title><style>{CSS} .howto {{ margin:10px 0; }} .howto h4 {{ color:#6a45d6; }} code {{ background:#f1f3f7; padding:0 4px; border-radius:3px; }}</style></head><body>']
    out.append('<section class="cover"><div class="k">JJ AND CO. · ACCOUNTING INFORMATION SYSTEMS · HANDBOOK</div><h1>Running the<br>AIS Edition</h1>'
               '<p class="sub">How the Accounting Information Systems edition works, and how to use every screen, for students (the Accounting seat and the Audit seat) and for the teacher.</p>'
               '<div class="who">App: classroom-erp.vercel.app<br>Audience: students and teachers<br>Covers: the big picture, the books and controls, scoring, every desk and the Audit room, teacher setup, gradebook and a worked round</div></section>')
    out.append(f'<section class="toc"><h2>What&rsquo;s inside</h2><ol>{toc}</ol></section>')
    for i, (title, tag, intro, body) in enumerate(chapters):
        if i in PARTS:
            out.append(f'<section class="chap"><div class="tag">{PARTS[i][0]}</div><h2 class="t">{esc(PARTS[i][1])}</h2></section>' if False else "")
        out.append(f'<section class="chap{" first" if i == 0 else ""}"><div class="tag">{i + 1} · {esc(tag)}</div><h2 class="t">{esc(title)}</h2><p class="intro">{intro}</p>{body}</section>')
    out.append("</body></html>")
    open(os.path.join(HERE, "handbook.html"), "w", encoding="utf8").write("".join(out))
    print("handbook.html built:", len(chapters), "chapters")

build()
