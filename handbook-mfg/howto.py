"""Step-by-step procedures for the Manufacturing handbook, one list of blocks per chapter (keyed by the chapter title used in build.py).
Convention: <b>bold</b> = something you CLICK (button, tab, sidebar item); <i>italic</i> = a box or choice you FILL IN."""

def how(title, steps, where=None, note=None):
    w = f'<p class="where"><b>Where:</b> {where}</p>' if where else ""
    n = f'<div class="warn"><b>NOTE</b> {note}</div>' if note else ""
    return f'<div class="howto"><h4>How to {title}</h4>{w}<ol>' + "".join(f"<li>{s}</li>" for s in steps) + f"</ol>{n}</div>"

SIDE = lambda name: f"Click <b>{name}</b> in the left sidebar."
MASTER = lambda tab: f"Click <b>Master Data</b> in the left sidebar, then the <b>{tab}</b> tab."

HOWTO = {}

HOWTO["Getting Started"] = [
 how("sign in and choose the ERP", [
   "Open <b>classroom-erp.vercel.app</b> in your browser.",
   "Type your school email in the <i>Email</i> box and your password in the <i>Password</i> box, then click <b>Sign in</b>.",
   "On the chooser page click the <b>Manufacturing ERP</b> card. (If it is greyed out your teacher has not opened it yet.)",
   "The Manufacturing dashboard opens. The sidebar on the left lists every module."]),
 how("create your own company (first time only)", [
   "After choosing <b>Manufacturing ERP</b> for the first time you are asked to create a company.",
   "Type a <i>Company name</i>. Leave <i>Fiscal year starts</i> as it is unless your teacher says otherwise.",
   "Choose the <i>Costing method</i> your teacher told you (<b>Standard costing</b> in the activities).",
   "Click the create button. The new company is empty and ready for Master Data."],
   note="Use a new, empty company for each activity."),
 how("switch between companies", [
   "Click the <b>company switcher</b> in the top bar (it shows the current company name).",
   "Click the company you want in the list. The page reloads with that company's books."]),
 how("load the demo company for practice", [
   "Open an <b>empty</b> company. The dashboard offers a demo company.",
   "Click the demo button and wait until the message says the demo company is ready.",
   "Look around: every module now has sample items, orders and postings."]),
 how("open an answer key (after your teacher releases it)", [
   "On the Manufacturing dashboard find the answer-key card for the activity you finished.",
   "Click its button to open the key. It opens as a separate read-only company.",
   "Compare each screen with yours, then use the <b>company switcher</b> to go back to your own company."]),
 how("sign out", ["Click <b>Sign out</b> at the bottom of the left sidebar."]),
]

HOWTO["Dashboard"] = [
 how("read the dashboard", [
   SIDE("Dashboard"),
   "Read the four coloured tiles at the top: <b>Good units made today</b>, <b>Open Production Orders</b>, <b>Inventory Value</b> and <b>Pending Purchase Orders</b>.",
   "Look at <b>Production Output</b> (last 7 days) and <b>Production by Product</b> (last 30 days).",
   "Scroll to <b>Ongoing Production Orders</b>, <b>Inventory Status</b> and <b>Needs Your Attention</b>. A red number means something is waiting for a decision."]),
 how("use Quick Actions", [
   "In the right-hand column click one of the tiles: <b>Create Production Order</b>, <b>Add Purchase Order</b>, <b>Adjust Inventory</b>, <b>Enter Vendor Invoice</b>, <b>Ship an Order</b> or <b>Manage BOM</b>.",
   "The matching screen opens so you can start the task at once."]),
 how("open something that needs attention", [
   "In <b>Needs Your Attention</b> click the line with a number above zero.",
   "The screen that solves it opens. When the number is back to 0 the line turns green."]),
]

HOWTO["Master Data"] = [
 how("add a unit of measure", [
   MASTER("Units"),
   "Click <b>Add unit</b>.",
   "Type the <i>Code</i> (for example KG) and the <i>Name</i> (for example Kilogram).",
   "Click <b>Save</b>."]),
 how("add a unit conversion (buy in bundles, stock in kilograms)", [
   MASTER("Conversions"),
   "Click <b>Add conversion</b>.",
   "Choose what it <i>Applies to</i>, then fill the unit you buy in, the factor, and the stock unit.",
   "Click <b>Save</b>."]),
 how("add a storage location", [
   MASTER("Locations"),
   "Click <b>Add location</b>.",
   "Type the <i>Code</i> and <i>Name</i>, and choose its kind (raw materials, finished goods, quarantine…).",
   "Click <b>Save</b>."]),
 how("add a cost center", [
   MASTER("Cost centers"),
   "Click <b>Add cost center</b>, type the <i>Code</i> and <i>Name</i>.",
   "Click <b>Save</b>."]),
 how("add a work center", [
   MASTER("Work centers"),
   "Click <b>Add work center</b>.",
   "Type the <i>Name</i>. Leave shifts, hours, utilization, efficiency and working days as they are unless told otherwise; choose a cost center if you use them.",
   "Click <b>Save</b>."]),
 how("find the hours a work center can run", [
   MASTER("Work centers"),
   "Scroll to the available-hours box. Choose the work center, then the <i>From</i> and <i>To</i> dates.",
   "Click <b>Calculate</b>. The hours account for shifts, utilization, working days and holidays."]),
 how("add a holiday", [
   MASTER("Calendar"),
   "Click <b>Add holiday</b>, pick the <i>Date</i> and type a <i>Name</i>.",
   "Click <b>Save</b>. Planning and scheduling skip that day."]),
 how("add an activity rate (peso per labor or machine hour)", [
   MASTER("Activity rates"),
   "Click <b>Add rate</b>.",
   "Choose the work center and the activity (direct labor or machine time).",
   "Type the first day of the month the rate starts (it must be the 1st) and the rate per hour in pesos.",
   "Click <b>Save</b>. Repeat for every work center and activity."]),
 how("set the fixed overhead rate (costing sheet)", [
   MASTER("Costing sheet"),
   "Find the overhead row and click its edit pencil.",
   "Type the pesos per hour and choose what it is counted on (for example labor hours).",
   "Click <b>Save</b>. To add another surcharge click <b>Add surcharge</b> instead."]),
 how("add an item", [
   MASTER("Items"),
   "Click <b>Add item</b>.",
   "Fill <i>SKU / code</i>, <i>Name</i> and <i>Unit of measure</i>. Choose the <i>Item type</i> (raw material, packaging, semi-finished or finished good) and <i>Make or buy</i>.",
   "For a bought item fill <i>Purchase lead time (days)</i> and <i>Planned price (₱)</i>. For a made item fill <i>Production lead time (days)</i>.",
   "If you buy it in another unit, choose it in <i>Buy it in (optional)</i> (the conversion must already exist).",
   "Choose the <i>Usual storage location</i> for semi-finished items. Tick <b>Track batches / lots</b> if the item has lot numbers or expiry dates.",
   "Click <b>Save item</b>."]),
 how("change or delete an item", [
   MASTER("Items"),
   "Click the edit pencil on the item's row, change what you need and click <b>Save item</b>.",
   "To remove a mistake click the bin on its row and confirm. An item that already has postings cannot be deleted."]),
 how("create a bill of materials (BOM)", [
   MASTER("Bills of materials"),
   "Click <b>New BOM</b>.",
   "Under the header choose <i>Item this makes</i>, leave <i>Alternative</i> at 1, type <i>Quantity made</i> (usually 1) and <i>Valid from</i> (the first day the recipe applies).",
   "Click <b>Add line</b> for each component: choose the <i>Item</i> and type the <i>Quantity</i> per unit made (the unit fills in by itself). Use <i>Scrap %</i> only if the set tells you to.",
   "Click <b>Save draft</b>.",
   "Check the lines, then click <b>Activate</b> and confirm. Only an active BOM is used by costing, planning and production."],
   note="An active BOM cannot be edited. To change a recipe click <b>New version</b>, edit the new draft, <b>Save draft</b> and <b>Activate</b> it."),
 how("revise a BOM (new version)", [
   MASTER("Bills of materials"),
   "Click the BOM's number to open it, then click <b>New version</b>.",
   "Change the lines and set <i>Valid from</i> to the date the change starts.",
   "Click <b>Save draft</b>, then <b>Activate</b>. Work out the new standard cost afterwards (see the Costing chapter)."]),
 how("explode a BOM or see where an item is used", [
   "Open the BOM (click its number).",
   "Type the <i>Quantity to make</i> and the date, then click <b>Explode</b> to see every component needed at every level.",
   "In the where-used section choose direct uses or all levels up to see which parents contain the item."]),
 how("create a routing", [
   MASTER("Routings"),
   "Click <b>New routing</b>.",
   "Choose the item the routing makes.",
   "Click <b>Add operation</b> for each step: type <i>What is done</i>, choose the <i>Work center</i>, then fill setup, run, labor and machine minutes.",
   "Click <b>Save draft</b>, then <b>Activate</b> and confirm."]),
]

HOWTO["Costing"] = [
 how("work out and release a standard cost", [
   SIDE("Costing"),
   "Click <b>New estimate</b>.",
   "Choose the <i>Item to cost</i>, type the <i>Lot size</i> and the costing date (the active BOM and routing on that date are used).",
   "Click <b>Work out the cost</b>. Read the unit cost and any warnings (a missing price or rate).",
   "Click <b>Mark this cost</b>.",
   "Click <b>Release as standard cost</b> and confirm. The entry shown under <i>Journal entry this will post</i> revalues stock."],
   note="Cost the semi-finished items (shades, bases) before the finished goods that use them."),
 how("check whether a standard cost is still right", [
   SIDE("Costing"),
   "Type the percentage difference to flag.",
   "Click <b>Check the standard costs</b>. Items whose current cost has drifted show with the difference."]),
 how("see what an estimate contains", [
   SIDE("Costing"),
   "Click the estimate's number in the list.",
   "Read where the cost comes from and every cost line.",
   "Click <b>All estimates</b> to go back."]),
]

HOWTO["Planning"] = [
 how("run planning (MRP)", [
   SIDE("Planning"),
   "Set <i>Plan from</i> (the first date to plan) and <i>Look ahead</i> (how far).",
   "Tick the forecast option if you want forecast demand counted as well as sales orders.",
   "Click <b>Run planning</b>. Suggestions nobody has converted are replaced by the new ones.",
   "Read the counts of planned orders to review, requisitions to buy and exceptions."]),
 how("turn planned orders into production orders", [
   SIDE("Planning"),
   "Open the planned-orders view.",
   "To make one order click <b>Make it</b> on its row.",
   "To make several tick their boxes and click <b>Make selected</b>. It is all or none.",
   "Check them under <b>Production</b> in the sidebar."]),
 how("move or delete a planned order", [
   "In the planned orders click <b>Move</b> on the row, type the new start and finish dates and confirm. The order becomes firm: the next run keeps it.",
   "To remove a suggestion click <b>Delete</b> on its row."]),
 how("turn requisitions into a purchase order", [
   SIDE("Planning"),
   "Open the requisitions view.",
   "Tick the boxes of the requisitions for <b>one vendor</b>.",
   "Click <b>Create purchase order…</b>.",
   "Choose the vendor (or type a new vendor's name), check <i>Needed on</i> and type the price of each line.",
   "Click <b>Create purchase order</b>. Receive the goods later on the <b>Purchasing</b> page."]),
 how("delete a requisition", ["In the requisitions view click <b>Delete</b> on the row (for example when you order that item by hand in another unit)."]),
 how("enter a forecast", [
   SIDE("Planning"),
   "Open the forecast view.",
   "Choose the <i>Item</i>, the <i>Month</i> and the expected sales (type 0 to clear one).",
   "Click <b>Save forecast</b>."]),
 how("read exceptions, capacity, the grid and the Gantt", [
   "Exceptions: each line is a decision (an order that is late, a need that cannot be met). Click a row to open that item's planning grid.",
   "Capacity: hours needed against hours available per work center; red means overload.",
   "Planning grid: choose an item to see demand, supply and projected stock week by week.",
   "Gantt: a timeline of planned and released orders."]),
]

HOWTO["Purchasing"] = [
 how("create a purchase order by hand", [
   SIDE("Purchasing"),
   "Click <b>New purchase order</b>.",
   "Choose the <i>Vendor</i> (or type a new name). Set the order date and the expected date.",
   "Choose the item, type <i>Qty</i> and the price each. If you buy in bundles, choose that unit on the line. Click <b>Add line</b> for more items.",
   "Check the total, then click <b>Create order</b>."]),
 how("receive goods into stock", [
   SIDE("Purchasing"),
   "Click <b>Receive</b> on the purchase order's row.",
   "Set the receipt date.",
   "In the <i>Now</i> column type the quantity that arrived for each line (leave the rest as 0 for a partial delivery). Choose where it goes <i>Into</i>. For an inspected item choose the <b>QUARANTINE</b> store.",
   "For a lot-tracked item fill the lot number and expiry date.",
   "Click <b>Receive into stock</b>."]),
 how("enter the vendor's invoice (three-way match)", [
   SIDE("Purchasing"),
   "Scroll to the vendor invoices and click <b>Enter vendor invoice</b>.",
   "Choose the purchase order. The lines show what was ordered, what arrived and what is already invoiced.",
   "Type the vendor's number in <i>Their invoice number</i>, the invoice date, the due date and the VAT %.",
   "Type the billed quantity and billed price from the invoice (the quantity that has arrived is filled in for you).",
   "Click <b>Match and post</b>. If it agrees within the tolerance it is posted and you owe the vendor; if not it goes <b>ON HOLD</b>."],
   note="Enter the invoice <b>after</b> the goods and any replacement delivery have been received."),
 how("deal with an invoice on hold", [
   "Find the invoice with the status On hold in the vendor invoices; the <i>Why</i> column tells you the difference.",
   "To accept the difference, the teacher or (in a team company) the Finance manager clicks <b>Release</b>. The person who entered the invoice cannot release it.",
   "To refuse it click <b>Reject</b>, type the reason and confirm. Then enter a corrected invoice with <b>Enter vendor invoice</b>."]),
 how("pay a vendor invoice", [
   "In the vendor invoices click <b>Pay</b> on the posted invoice.",
   "Check the amount (the balance is filled in; type less for a part payment), the date and the method.",
   "Click the record-payment button."]),
 how("void a vendor invoice entered by mistake", [
   "Click <b>Void</b> on the invoice (only while it has no payment).",
   "Type the date and the reason and confirm. Then enter the right invoice."]),
 how("add landed cost (freight, customs)", [
   SIDE("Purchasing"),
   "Scroll to the freight and customs section and click <b>Add landed cost</b>.",
   "Choose the vendor who billed it, type what it is, the invoice date, due date, amount before VAT and VAT %.",
   "Choose how to share it: by value, weight or volume.",
   "Tick only the receipt lines it belongs to.",
   "Click <b>Post landed cost</b>. The cost is added to those goods and you owe the freight vendor."]),
 how("delete a purchase order", ["Click <b>Delete</b> on a purchase order that has no receipts and confirm."]),
]

HOWTO["Inventory"] = [
 how("see what is in stock", [
   SIDE("Inventory"),
   "The <b>Stock on hand</b> tab lists every item by location with its value.",
   "Click <b>Availability</b> to see usable, reserved and projected stock."]),
 how("post an opening balance or a stock count difference", [
   SIDE("Inventory"),
   "Click the <b>Adjust and transfer</b> tab.",
   "Choose <i>What</i>: opening balance (adds stock) or stock count difference.",
   "Choose the <i>Item</i> and <i>Where</i>. Type the change in quantity (a minus sign takes stock away) and the cost of one unit.",
   "Set the date. For a lot-tracked item also type the lot number and expiry.",
   "Click <b>Post adjustment</b>."]),
 how("move stock between locations", [
   "On the <b>Adjust and transfer</b> tab go to the move-stock box.",
   "Choose the item, <i>From</i>, the destination, the quantity and the date.",
   "Click <b>Move stock</b>. Nothing is posted to the books; only the location changes."]),
 how("find a lot and trace it", [
   SIDE("Inventory"),
   "Click the <b>Lots &amp; expiry</b> tab.",
   "Choose the lot and the direction (backward shows where it came from, forward where it went).",
   "Click <b>Trace</b>."]),
 how("reverse a stock document", [
   SIDE("Inventory"),
   "Click the <b>Stock documents</b> tab.",
   "Click <b>Reverse</b> on the document, type the date and the reason, then confirm.",
   "The original stays on the record and shows Reversed; a new document undoes it."]),
]

HOWTO["Production"] = [
 how("create a production order by hand", [
   SIDE("Production"),
   "Click <b>New production order</b>.",
   "Choose the item to make, type the quantity and the start date (and finish date if you know it).",
   "Click <b>Create order</b>. Orders made from planning are already in the list."]),
 how("release an order", [
   "Click the order's number in the list to open it.",
   "Click <b>Release</b> and confirm. (If the order is above the approval threshold the teacher clicks <b>Approve and release</b>.)"]),
 how("issue material to an order", [
   "On the order's page scroll to the materials.",
   "Set the date <b>first</b>: the next click posts immediately.",
   "Leave the quantities as proposed and click <b>Issue material to the order</b>. Stock goes down and work in process goes up."],
   note="If you posted the wrong date, use <b>Reverse</b> on that document and issue again."),
 how("confirm production (post the work done)", [
   "On the order's page scroll to the operations and click <b>Confirm production</b>.",
   "Choose the operation. Type the good units and scrapped units (and why, if any were scrapped).",
   "Type labor, machine and setup hours, or click the button that uses the planned hours.",
   "On the <b>last</b> operation tick the final-confirmation box.",
   "Set the date and click <b>Post confirmation</b>. Repeat for each operation."]),
 how("put finished goods into stock", [
   "On the order's page find <b>Finished goods into stock</b>.",
   "Type the quantity, choose where it goes <i>Into</i> (use the <b>QUARANTINE</b> store for an item inspected when made), and fill lot number and expiry if lot-tracked.",
   "Click <b>Receive into stock</b>."]),
 how("settle and close an order", [
   "When all units are received click <b>Settle order</b>.",
   "Check the settlement date and click <b>Settle this order</b>. What is left in work in process is written to the variance accounts.",
   "Then click <b>Close order</b> and confirm to lock it."]),
 how("correct a mistake", [
   "To undo a confirmation or a document find it in the documents list, click <b>Reverse</b>, type the date and reason, and confirm. Then post the right one.",
   "To undo a settlement click <b>Undo settlement</b>. To abandon an order that has not started click <b>Cancel order</b> and confirm."]),
]

HOWTO["Shop Floor"] = [
 how("read the dispatch list and set priorities", [
   SIDE("Shop Floor"),
   "The <b>Dispatch list</b> tab shows operations ready to run; use the work-centre filter.",
   "To change the order of work type a new priority number for the order.",
   "Click <b>Confirm</b> on a ready operation to jump to the order and post it."]),
 how("log downtime", [
   SIDE("Shop Floor"),
   "Click the <b>Downtime</b> tab.",
   "Choose the work centre, the day, the hours stopped and the reason. Add a note if you like.",
   "Click <b>Log it</b>.",
   "To cancel a wrong entry click <b>Void</b> on it, type why and confirm."]),
 how("read OEE", [
   SIDE("Shop Floor"),
   "Click the <b>OEE</b> tab and choose how far to look back.",
   "Read availability, performance and quality per work centre; the biggest loss names the weakest."]),
 how("record machine service", [
   SIDE("Shop Floor"),
   "Click the <b>Machines &amp; upkeep</b> tab (the machine must exist under Fixed Assets first).",
   "To plan service click <b>Plan</b>, choose the fixed asset, type the service interval and click <b>Save plan</b>.",
   "After the work click <b>Service</b>, choose preventive service or repair, set the date and click <b>Record</b>."]),
]

HOWTO["Quality"] = [
 how("set up an inspection plan", [
   SIDE("Quality"),
   "Click the <b>Plans and settings</b> tab.",
   "Choose the item. Tick <b>bought</b> (inspect on arrival) and/or <b>made</b> (inspect when produced), then click <b>Save these settings</b>.",
   "Click <b>Add a characteristic</b>; type its name (for example Moisture), unit, minimum and maximum. Click <b>Remove</b> to delete a row.",
   "Click <b>Save the plan</b>. From now on that item must be received into the <b>QUARANTINE</b> store."]),
 how("inspect a lot and decide", [
   SIDE("Quality"),
   "On the <b>Inspection lots</b> tab click the lot that is waiting.",
   "Type the measured value for each characteristic and click <b>Save measurements</b>. The result shows pass or fail.",
   "Split the lot into accept into stock, scrap, return to vendor and rework; the quantities must add up to the lot.",
   "If anything is rejected choose the root cause. Set the date and type a note (required if you accept a result outside the limits).",
   "Click <b>Record decision</b>. Accepted goods move to the usual store; scrap and returns post to the books and raise a report."]),
 how("close a non-conformance report", [
   SIDE("Quality"),
   "Click the <b>Non-conformances</b> tab and click the open report.",
   "Type what was done to stop it happening again in the corrective action box.",
   "Click <b>Close the report</b>."]),
]

HOWTO["Shipping"] = [
 how("deliver a sales order", [
   SIDE("Shipping"),
   "Click the sales order's row to open it.",
   "Set the delivery date and choose the finished-goods store in <i>From</i>.",
   "In <i>Deliver now</i> type the quantity for each line (less than ordered for a part shipment).",
   "Click <b>Post delivery</b>. Stock goes out and cost of goods sold is posted."]),
 how("create the invoice for what was delivered", [
   "On the same order set the invoice date and due date.",
   "Click <b>Create invoice for what was delivered</b>. A draft invoice appears.",
   "Go to <b>Sales</b>, open the invoice and click <b>Send invoice</b> so it posts."]),
 how("reverse a delivery", [
   "In the deliveries list click <b>Reverse</b> on the delivery, type the date and reason, and confirm."]),
]

HOWTO["Sales"] = [
 how("add a customer", [
   SIDE("Sales"),
   "Open the <b>Customers</b> tab and click <b>New customer</b>.",
   "Type the name and email, then click <b>Save</b>."]),
 how("write a quote and turn it into a sales order", [
   "Open the <b>Quotes</b> tab and click <b>New quote</b>.",
   "Choose the customer, add lines with <b>Add line</b> (item, quantity, price) and set the tax rate. Click <b>Save</b>.",
   "When the customer agrees click <b>Accept</b>, then <b>Convert to Sales Order</b>."]),
 how("create a sales order", [
   "Open the <b>Sales orders</b> tab and click <b>New sales order</b>.",
   "Choose the customer, set the date and expected date, add lines (item, quantity, price) with <b>Add line</b> and type the tax rate (12 for VAT).",
   "Click <b>Save</b>, then <b>Confirm</b> on the order. A confirmed order is what planning counts as demand and what Shipping delivers."]),
 how("create and send an invoice", [
   "Preferred: deliver on the Shipping page and click <b>Create invoice for what was delivered</b>.",
   "Or open the <b>Invoices</b> tab and click <b>New invoice</b>, fill customer, dates and lines, and click <b>Save</b>.",
   "Click <b>Send invoice</b> on the invoice. It posts: accounts receivable, revenue and VAT."]),
 how("record a customer payment", [
   "Open the <b>Invoices</b> tab and click <b>Details</b> on the invoice.",
   "In the payment box type the amount (the balance is filled in; type less for a part payment), the date and the method (Cash, Check, Card or Bank transfer).",
   "Click the record-payment button. The invoice shows Paid in full when the balance reaches zero."]),
 how("void an invoice", [
   "Click <b>Void</b> on the invoice, choose the void date and confirm. A reversing entry is posted."]),
]

HOWTO["Finance"] = [
 how("post a journal voucher", [
   SIDE("Finance"),
   "On the <b>Journal vouchers</b> tab click <b>New journal voucher</b>.",
   "Set the voucher date and kind; type a reference and the particulars.",
   "For each line choose the account (type a code or a name), then type the debit or credit. Click <b>Add line</b> for more lines.",
   "Debits and credits must be equal. Click <b>Submit / post voucher</b>; it posts at once.",
   "To keep it for later click <b>Save draft</b> instead."]),
 how("post a voucher that needs approval", [
   "A voucher to a control account (accounts receivable, payable, inventory) or above the approval limit needs a second person.",
   "Tick the system-override / audit-adjustment box and type the reason (at least ten characters).",
   "Click <b>Submit for approval</b>."]),
 how("approve, send back or reverse a voucher", [
   "A teacher, or in a team company the Finance manager (never the person who prepared it), opens the voucher from the register.",
   "Click <b>Approve and post</b> to post it, or <b>Send back</b> and type what to fix.",
   "To undo a posted voucher click <b>Reverse voucher</b>, set the reversal date, type the reason and confirm. Then post the corrected voucher."]),
 how("add an account to the chart of accounts", [
   SIDE("Finance") + " Then click the <b>Chart of accounts</b> tab.",
   "Click <b>New account</b>.",
   "Type the code and name and choose the type; tick the bank-account box if it is one.",
   "Click <b>Save</b>."]),
 how("set up a recurring entry (rent, subscription)", [
   SIDE("Finance") + " Then click the <b>Recurring entries</b> tab.",
   "Click <b>New recurring entry</b>, type the memo, choose monthly or weekly, and the start (and end) date.",
   "Add the debit and credit lines and click <b>Save</b>.",
   "When it is due click <b>Post now</b>, check the date and confirm."]),
]

HOWTO["Period End"] = [
 how("settle a month", [
   SIDE("Period End"),
   "On the <b>Months</b> tab find the month and click <b>Settle…</b>. (Earlier months must be closed first.)",
   "Read the checks: must-fix items block you; look-at items are warnings (for example orders not settled yet).",
   "Review the entries it will post, type an optional note and click <b>Post the month-end entries</b>."]),
 how("close a month", [
   "After settling click <b>Close month</b> on the same row and confirm. Nothing more can be posted to that month.",
   "Months close oldest first. <b>Undo</b> reverses the settlement entries; <b>Re-open…</b> (teacher) opens a closed month again."]),
 how("check that the books agree with the production records", [
   SIDE("Period End"),
   "Find the agree-with-production-records box and click <b>Check</b>.",
   "Every line should show a difference of 0.00. A difference tells you which account or stock area to investigate."]),
 how("see the cost of goods manufactured", [
   SIDE("Period End") + " Click the <b>Cost of goods manufactured</b> tab.",
   "Choose the from-month and to-month. The statement runs from materials to finished goods to cost of goods sold."]),
]

HOWTO["Analytics"] = [
 how("read profitability and variances", [
   SIDE("Analytics"),
   "Choose the period at the top. Profitability by product shows sales, cost and margin %.",
   "In the variances section choose last 3, 6 or 12 months."]),
 how("study inventory, supplier and production performance", [
   "Inventory value, cover and ABC class: choose how far back to measure use (30, 90 or 180 days). Class A items hold most of the value.",
   "Supplier performance: orders, on-time, days late, price variance and rejected quantities per vendor.",
   "Production performance: good and scrap quantities, scrap % and lead days per product."]),
 how("see what one unit costs at different lot sizes", [
   "Choose a product you make and type lot sizes such as 1, 10, 100.",
   "Click <b>Work it out</b>. Nothing is saved; use it to decide the best lot size."]),
]

HOWTO["Banking, Fixed Assets, Payroll and Settings"] = [
 how("add a bank account and a bank transaction", [
   SIDE("Banking"),
   "Click <b>New bank account</b>, type the account name and save.",
   "Click <b>Add transaction</b>, set date, description, amount and type (deposit or withdrawal) and save.",
   "Click the auto-match button to match bank lines to ledger entries with the same amount; tick the rest as reconciled by hand."]),
 how("register a fixed asset and record depreciation", [
   SIDE("Fixed Assets"),
   "Click <b>New fixed asset</b>. Fill name, purchase date, cost, salvage value and useful life in months. Save.",
   "At each month-end click <b>Record 1 month dep.</b> on the asset, check the date and confirm."]),
 how("add an employee and run payroll", [
   SIDE("Payroll"),
   "On the employees tab click <b>New employee</b>; fill name, job title, pay type (monthly or hourly) and the rate. Save.",
   "For hourly staff click <b>Log hours</b> and enter the hours worked.",
   "To pay click <b>Run payroll</b>, choose the month and pay period, review the deductions and post."],
   note="Payroll is not part of the practice activities: they post wages with a journal voucher."),
 how("read the company settings (teacher changes them)", [
   SIDE("Settings"),
   "Read the costing method, fiscal year start, vendor invoice tolerance and the stock-below-zero rule.",
   "The teacher changes them with <b>Change costing method</b>, <b>Save tolerance</b> or <b>Save settings</b>."]),
]

HOWTO["Reports"] = [
 how("open a report", [
   SIDE("Reports"),
   "Click the report's name in the list. The groups are financial statements, inventories and production, purchasing, and controls.",
   "Set the dates: <i>From</i> and <i>As at</i> (or just <i>As at</i>).",
   "To keep it click <b>CSV</b> (a spreadsheet) or <b>Print</b>."]),
 how("find a stock card", [
   "Choose <b>Stock card</b>, choose the item and set the dates.",
   "Read each movement with its document, quantity, unit cost and running balance."]),
 how("run the books integrity check", [
   "Choose <b>Books integrity check</b>. Every row should say pass.",
   "A failed row names the area; fix the cause before you close the month."]),
]

HOWTO["Teams and Roles"] = [
 how("create a team company (teacher)", [
   "Click <b>Team companies →</b> on the Teacher page.",
   "Click <b>New team company</b>.",
   "Type the company name, set the fiscal year start (use 2026-01-01) and the costing method (standard costing).",
   "Click <b>Create</b>. Leave the company empty."]),
 how("add students and give roles (teacher)", [
   "Open the team's row under Team companies.",
   "Choose the student and click <b>Add to the team</b>.",
   "Tick the roles that student holds (Purchasing, Warehouse, Production, Quality, Sales, Accountant, Finance manager, Auditor).",
   "Click <b>Save roles</b>. You can change members and roles at any time."]),
 how("work as a team member", [
   "Open the team company from the <b>company switcher</b>. Your roles show under your name.",
   "Do only the steps of the roles you hold. If you try another one the system names the role you would need.",
   "Approvals (vouchers, held vendor invoices) are done by a different person from the one who prepared them."]),
]


# ---------------------------------------------------------------------------------------------
# Longer explanations (what the thing IS and why it matters) and where each how-to block goes.
# Order in the book: screenshot -> explanation -> step-by-step guide.
def what(title, *paras):
    return f'<div class="what"><h4>What is {title}?</h4>' + "".join(f"<p>{p}</p>" for p in paras) + "</div>"

EXPLAIN = {
 "start": '<p class="legend"><b>How to read the step-by-step boxes:</b> click the <b>bold</b> words (buttons, tabs, menu entries); <i>italic</i> words are boxes you fill in or choices you make.</p>' + what("the Manufacturing ERP and a company",
   "An <b>ERP</b> (enterprise resource planning system) is one program that holds everything a business does: buying, stocking, making, selling and accounting. The big idea is that you type a fact <b>once</b> and every other part of the business sees it. When the warehouse receives bolts, the stock count goes up, the purchase order shows the delivery, and the accountant's books show the new asset, all from one entry.",
   "A <b>company</b> in this system is a complete, separate set of books. Nothing you do in one company shows up in another. That is why each activity should start in a new, empty company: your mistakes in practice never touch a clean one.",
   "A <b>solo company</b> is yours alone and you can do every job in it. A <b>team company</b> is created by the teacher; each member holds roles (for example Purchasing or Accountant) and the system only lets you do what your role allows, just like in a real company."),
 "dash": what("the dashboard",
   "The dashboard is the manager's summary page. It does not let you enter data; it shows what the books and the factory floor currently say, so you can decide where to go next. <b>Inventory value</b> is the peso value of everything in stock. <b>Open production orders</b> are jobs that were started but not finished. <b>Pending purchase orders</b> are orders sent to vendors whose goods have not all arrived.",
   "The <b>Needs Your Attention</b> list is a to-do list written by the system: held vendor invoices, quality lots waiting for a decision, items below their safety stock, and so on. If a number there is above zero, somebody has work to do."),
 "items": what("an item",
   "An <b>item</b> is anything the company buys, makes or sells: a bolt, a sheet of steel, a half-finished frame, a finished lantern. Everything else in the system points to items, so items are the first thing you create.",
   "Each item has a <b>SKU</b> (a short unique code such as RM-STEEL), a <b>unit of measure</b> (how you count it: pieces, kilograms, meters) and an <b>item type</b>. <b>Raw materials</b> are bought and used up in production. <b>Packaging</b> is bought and used to pack goods. <b>Semi-finished goods</b> are made by the company and then used to make something else (a painted shade that goes into a lantern). <b>Finished goods</b> are what you sell.",
   "<b>Make or buy</b> tells planning how to get more of it: a <b>bought</b> item is ordered from a vendor using its <b>purchase lead time</b> (days the vendor takes); a <b>made</b> item is produced using its <b>production lead time</b>. <b>Safety stock</b> is the cushion you never want to dip below. <b>Planned price</b> is the price you expect to pay a vendor, and it feeds the cost of everything that uses the item. Tick <b>Track batches / lots</b> only when you must know exactly which batch went where, such as food with an expiry date."),
 "boms": what("a bill of materials (BOM)",
   "A <b>bill of materials</b> is the recipe of a product. It lists every component needed to make <b>one unit</b> of an item, and how many of each. A lantern might need 1 frame, 1 shade, 2 screws and 1 box. Without a BOM the system cannot calculate what a product costs, what to buy, or what to take out of stock when you produce.",
   "A BOM can have several levels. If the shade is itself made from paper and paint, the shade has its own BOM. The system follows these levels automatically when it <b>explodes</b> a BOM, which means listing everything needed down to raw materials.",
   "<b>Quantity made</b> is the number of finished units the recipe produces (normally 1). <b>Scrap %</b> adds an allowance for material that is normally wasted. <b>Valid from</b> is the date the recipe starts to apply, so a change in the recipe next month does not rewrite last month's costs. A BOM starts as a <b>draft</b>, which you can still edit, and only becomes usable when you <b>Activate</b> it. An active BOM is never edited; you create a <b>new version</b> instead, so history is kept."),
 "routings": what("a routing",
   "A <b>routing</b> is the method of making a product: the steps, in order, with the machine or work area used for each and the time each step takes. If the BOM says <i>what</i> goes into a product, the routing says <i>how and where</i> it is made.",
   "Each <b>operation</b> has a <b>setup</b> time (getting the machine ready, spent once per batch), a <b>run</b> time per unit, and the <b>labor</b> and <b>machine</b> minutes per unit. These minutes are multiplied by the hourly rates to give labor and machine cost, and they also tell planning how many hours the work centers need. Like a BOM, a routing is a draft until you <b>Activate</b> it."),
 "workcenters": what("a work center",
   "A <b>work center</b> is a place where work is done: a cutting machine, an assembly bench, a paint booth. It is the unit of capacity. The system needs to know how many hours it can run to warn you when you plan more work than it can handle.",
   "<b>Shifts per day</b> and <b>hours per shift</b> give the raw hours. <b>Utilization %</b> is the share of those hours the center is really working (breaks and waiting excluded). <b>Efficiency %</b> says how fast it runs compared with the standard time. <b>Available hours</b> is the result: how many productive hours the center can give in a period, after holidays and non-working days."),
 "rates": what("an activity rate",
   "An <b>activity rate</b> is the price of one hour of work. There are two kinds: <b>direct labor</b> (a worker's hour) and <b>machine time</b> (a machine's hour, covering power, wear and upkeep). When production confirms hours worked, the system multiplies them by these rates to charge cost to the order.",
   "Rates are set per work center and per month, which is why the start date must be the first of a month. Changing a rate for next month does not change cost already booked in earlier months."),
 "calendar": what("the working calendar",
   "The <b>calendar</b> tells planning which days work happens. Weekends are handled by each work center's working days; the calendar adds <b>holidays</b> on top. Planning and scheduling skip these days, so a lamp promised for a holiday is scheduled for the next working day."),
 "units": what("a unit of measure",
   "A <b>unit of measure</b> is how a quantity is counted: piece, kilogram, liter, meter, box. Every item has one stock unit and all stock quantities are kept in it. Create each unit once, then choose it on items."),
 "conversions": what("a unit conversion",
   "A <b>conversion</b> lets you buy in one unit and stock in another. A vendor may sell string by the bundle while you use it by the meter. If one bundle is 50 meters, you create the conversion <i>1 BDL = 50 M</i>. You then order bundles; the system receives meters into stock, and the cost per meter is worked out for you. Without the conversion the system would not know how many meters arrived."),
 "locations": what("a storage location",
   "A <b>location</b> is a place where stock sits: raw materials store, work-in-process area, finished goods store, <b>quarantine</b>. Stock is always counted per item <i>and</i> per location. Quarantine is special: goods that must be inspected are received there first and are not usable until quality accepts them."),
 "costcenters": what("a cost center",
   "A <b>cost center</b> is a department that costs are charged to and reported by, such as Production, Warehouse or Administration. Work centers can be linked to one, so reports can show what each department spent."),
 "costingsheet": what("the costing sheet",
   "The <b>costing sheet</b> is the rule that adds <b>overhead</b> to a product's cost. Overhead is cost that cannot be pointed to one unit directly, such as factory rent, supervision or electricity. The sheet says, for example, <i>add ₱20 for every labor hour</i>. That way each product carries a fair share of the factory's indirect cost, not only its materials and wages."),
 "costing": what("a cost estimate and the standard cost",
   "A <b>cost estimate</b> answers: <i>what should one unit of this product cost?</i> The system takes the active BOM (materials at planned prices), the active routing (hours times activity rates) and the costing sheet (overhead), and adds them up. It does this for the <b>lot size</b> you choose, because setup time is spread over the units in a batch.",
   "When you <b>release</b> the estimate it becomes the item's <b>standard cost</b>: the fixed, planned cost per unit. Under <b>standard costing</b> stock is always valued at the standard, and when production really costs more or less the difference is posted as a <b>variance</b>. Variances are how management learns whether the factory is working better or worse than planned.",
   "Always cost the inner levels first (semi-finished items), because the cost of a finished good includes the standard cost of the parts inside it."),
 "planned": what("planning (MRP) and a planned order",
   "<b>MRP</b> (material requirements planning) is the system's way of answering three questions: <i>what do we need, how much, and by when?</i> It looks at demand (confirmed sales orders and forecasts), subtracts what you already have and what is already on order, explodes the BOMs, and proposes what to make and what to buy.",
   "A <b>planned order</b> is a proposal to produce something. It is only a suggestion; nothing is committed until you convert it into a <b>production order</b>. A planned order you <b>move</b> or create yourself becomes <b>firm</b>, meaning the next planning run will keep it instead of replacing it."),
 "reqs": what("a purchase requisition",
   "A <b>requisition</b> is the proposal to buy: item, quantity, the date to order by (which already allows for the vendor's lead time) and the date it is needed. You turn requisitions into a real <b>purchase order</b> for one vendor at a time."),
 "exceptions": what("an exception message and the planning views",
   "An <b>exception</b> is a message from planning that something needs a human decision: an order that will finish late, demand that cannot be met in time, or an order that is no longer needed. Treat the list as the planner's daily to-do list.",
   "<b>Capacity</b> compares the hours the plan needs against the hours each work center has; a red bar means overload and you must move work or add shifts. The <b>planning grid</b> shows week by week the demand, the supply and the projected stock of one item, so you can see exactly when a shortage will happen. The <b>Gantt</b> draws orders as bars on a calendar."),
 "forecast": what("a forecast",
   "A <b>forecast</b> is the sales you expect but have no order for yet. When you tick <i>Include the forecast</i> in a planning run, the system also prepares material and production for these expected sales, so the factory is ready before the order arrives."),
 "purchasing": what("a purchase order and goods receipt",
   "A <b>purchase order (PO)</b> is a written promise to a vendor to buy items at agreed prices. It does not change the books by itself; it simply records what you expect to receive. When the goods really arrive you post a <b>goods receipt</b>. Now stock goes up, and the books record a liability called <b>goods received, not invoiced (GR/IR)</b>, because you have the goods but the vendor has not billed you yet.",
   "You can receive in parts. A PO is <b>partially received</b> until every line has arrived. Goods that need inspection are received into the <b>quarantine</b> location, and quality lots appear automatically."),
 "purchasing-scrolled": what("the vendor invoice and the three-way match",
   "The <b>vendor invoice</b> is the bill from the vendor. Before the company accepts it, the system performs a <b>three-way match</b>: it compares the <b>purchase order</b> (what you ordered and the agreed price), the <b>goods receipt</b> (what actually arrived) and the <b>invoice</b> (what the vendor charges). If all three agree, the invoice is posted and you owe the vendor. If the quantity or price differs by more than the <b>tolerance</b> in Settings, the invoice goes <b>on hold</b> and a responsible person must <b>release</b> or <b>reject</b> it.",
   "<b>Landed cost</b> is the extra cost of getting goods to your door: freight, customs duty, insurance. You add it to the receipts it belongs to and the system spreads it across the goods by value, weight or volume, so each item's cost includes its share. Payment is recorded with <b>Pay</b>, which reduces what you owe the vendor."),
 "stock": what("stock on hand",
   "<b>Stock on hand</b> is the quantity of each item in each location, and its peso value. The value comes from the item's cost (standard cost under standard costing). Every change of stock is a numbered <b>stock document</b>, and each document writes its own journal voucher so the books always agree with the warehouse."),
 "availability": what("availability",
   "<b>Availability</b> separates what you have from what you can still promise. <b>On hand</b> is physically in stock. <b>Reserved</b> is already committed to open orders. <b>Projected</b> adds what is expected from purchase and production orders. <b>Short</b> means you cannot cover demand; <b>over-promised</b> means orders exceed everything you have and expect."),
 "lots": what("a lot (batch)",
   "A <b>lot</b> or <b>batch</b> is a group of units that share the same origin, such as one delivery from a vendor or one production run. Lot-tracked items carry a lot number and an <b>expiry date</b>. If a vendor reports a defective batch, <b>trace</b> tells you where every unit went: <b>backward</b> to find the source, <b>forward</b> to find the customers who received it."),
 "documents": what("a stock document",
   "A <b>stock document</b> is the numbered record of one movement: receipt, issue to production, transfer, delivery, adjustment. You never delete a posted document. If it was wrong, you <b>reverse</b> it: the system posts an opposite document, and both stay on record. This is how real accounting keeps an honest trail."),
 "move": what("an adjustment and a transfer",
   "An <b>adjustment</b> changes the quantity in the books to match reality: an <b>opening balance</b> when you start using the system, or a <b>stock count difference</b> when the physical count is not what the system says. A <b>transfer</b> only moves stock from one location to another and changes nothing in the books."),
 "production": what("a production order",
   "A <b>production order</b> is the instruction to make a quantity of a product. It copies the BOM (materials) and the routing (operations) at that moment. Its life has steps: <b>released</b> (work may start) → <b>materials issued</b> (stock moves into <b>work in process</b>) → <b>operations confirmed</b> (hours and good/scrap quantities recorded) → <b>finished goods received</b> → <b>settled</b> → <b>closed</b>.",
   "<b>Work in process (WIP)</b> is the cost of jobs that are started but not yet finished goods: materials already issued plus labor and machine cost already charged. <b>Settlement</b> compares what the order really cost with the standard cost of the good units; the difference is a <b>variance</b>, posted to its own account so you can study it. <b>Scrap</b> is production that failed and is thrown away."),
 "dispatch": what("the dispatch list",
   "The <b>dispatch list</b> is the supervisor's work queue for each work center: which operations are ready to run, in priority order, with the quantity and hours still to do. Changing an order's <b>priority</b> moves it up or down the list."),
 "downtime": what("downtime",
   "<b>Downtime</b> is time a machine could have run but did not: breakdown, waiting for material, power failure. Logging it with a reason makes lost time visible and lowers the machine's <b>availability</b> in OEE."),
 "oee": what("OEE",
   "<b>OEE</b> (overall equipment effectiveness) is one number that shows how well a machine is used: <b>availability</b> (was it running when it should?) × <b>performance</b> (did it run at full speed?) × <b>quality</b> (were the units good?). 100% would mean perfect production. The <b>biggest loss</b> tells you which of the three to fix first."),
 "upkeep": what("machine upkeep",
   "<b>Upkeep</b> (maintenance) keeps machines working. <b>Preventive service</b> is done on a schedule, for example every 500 machine hours, before anything breaks. A <b>repair</b> is done after a failure. Linking the machine to a fixed asset lets the system charge machine cost at the machine's real depreciation."),
 "quality-lots": what("an inspection lot",
   "An <b>inspection lot</b> is a batch of goods waiting to be checked. It is created automatically when an inspected item is received from a vendor or finished in production. Until the decision is recorded the goods sit in <b>quarantine</b>. The <b>decision</b> splits the lot: <b>accept</b> (goes into usable stock), <b>scrap</b> (thrown away, loss posted), <b>return to vendor</b>, or <b>rework</b> (sent back to be fixed)."),
 "quality-plans": what("an inspection plan",
   "An <b>inspection plan</b> lists what to measure on an item, called <b>characteristics</b>, and the acceptable <b>minimum</b> and <b>maximum</b>. For lantern paper it might be moisture between 5% and 8%. A measurement outside the limits is a failure. The plan also says whether the item is inspected when bought, when made, or both."),
 "quality-ncr": what("a non-conformance report (NCR)",
   "An <b>NCR</b> is the written record of a defect: what was wrong, how many units, the <b>root cause</b> (why it happened) and what was done with the goods. It stays open until you write the <b>corrective action</b>, the step taken so the problem does not repeat, and then close it. The peso loss is shown so the cost of poor quality is visible."),
 "shipping": what("a delivery and the customer invoice",
   "A <b>delivery</b> (shipment) moves finished goods out of stock to the customer. The books record the <b>cost of goods sold (COGS)</b>: the cost of what you gave away. The <b>invoice</b> is the bill to the customer. It records <b>accounts receivable</b> (what the customer owes), <b>revenue</b> and the <b>VAT</b> you collect for the government. Deliver and invoice are separate steps so you can ship in parts and never bill twice."),
 "sales": what("a quote, a sales order and an invoice",
   "A <b>quote</b> is an offer that is not binding. A <b>sales order</b> is the customer's confirmed order; planning counts it as demand and Shipping delivers against it. The <b>invoice</b> is the bill. A customer's payment is applied to the invoice, which turns <b>Paid in full</b> when its balance is zero."),
 "vouchers": what("a journal voucher",
   "A <b>journal voucher</b> is the basic unit of the books: one entry with at least two lines, each a <b>debit</b> or a <b>credit</b> to an <b>account</b>. The total debits must equal the total credits. Documents such as receipts and invoices write their vouchers automatically; you prepare a voucher yourself only for adjusting entries.",
   "<b>Separation of duties</b> means the person who prepares a voucher must not be the one who approves it. A voucher touching a <b>control account</b> (such as accounts receivable, accounts payable or inventory) is blocked unless it is an <b>override</b> with a written reason, and it needs approval. A posted voucher is never deleted; you <b>reverse</b> it."),
 "accounts": what("the chart of accounts",
   "The <b>chart of accounts</b> is the numbered list of every account the books use: cash, receivables, inventory, payables, sales, expenses. Each account has a code, a name and a type (asset, liability, equity, income or expense). The type decides which financial statement it appears on."),
 "recurring": what("a recurring entry",
   "A <b>recurring entry</b> is a voucher that repeats on a schedule, such as monthly rent. You define it once and use <b>Post now</b> when it falls due, instead of typing it every month."),
 "period-months": what("settling and closing a month",
   "<b>Settling</b> the month does the final calculations: labor and machine cost are charged at what really happened, and variances are posted. <b>Closing</b> locks the month so nothing more can be posted to it. This protects reported figures once they are final. Months must be closed in order, oldest first, and the system checks that the books agree with the production records before it lets you close."),
 "period-cogm": what("the cost of goods manufactured and sold",
   "The <b>cost of goods manufactured (COGM)</b> statement shows what it cost to make the goods finished this month: opening work in process + materials + labor + overhead − closing work in process. <b>Cost of goods sold (COGS)</b> then adds the change in finished-goods stock, giving the cost of what was actually sold."),
 "analytics-profit": what("profitability and variance analysis",
   "<b>Profitability</b> shows sales minus cost per product, and the <b>margin %</b>, so you can see which products earn money. A <b>variance</b> is the difference between standard and actual: a <b>price</b> variance means materials cost more or less than planned, a <b>usage</b> variance means more or fewer materials were used, and an <b>efficiency</b> variance means work took more or less time."),
 "analytics-inventory": what("inventory, supplier and production analysis",
   "<b>ABC class</b> ranks items by value: class A is the few items that hold most of the value and deserve the tightest control. <b>Cover</b> says how many days current stock will last at the recent rate of use. <b>Supplier performance</b> compares vendors on lateness, price differences and rejected goods. <b>Production performance</b> shows good output, scrap % and lead time per product."),
 "analytics-lot": what("cost by lot size",
   "Setup time is spent once per batch, so a larger batch spreads it over more units and the cost per unit drops. This view works out the unit cost at several lot sizes so you can choose the most economical batch. Nothing is saved or posted."),
 "banking": what("bank reconciliation",
   "<b>Reconciliation</b> means checking that the bank's record and your books agree. Each bank line should match an entry in the books with the same amount. <b>Auto-match</b> pairs them automatically; lines left over are your <b>unreconciled</b> items and need investigation (a bank fee not yet recorded, a cheque not yet cleared)."),
 "fixed": what("a fixed asset and depreciation",
   "A <b>fixed asset</b> is something the company owns and uses for years, such as a machine. Its <b>cost</b> is not an expense at purchase; instead the cost minus the <b>salvage value</b> (what it is worth at the end) is spread over its <b>useful life</b> as <b>depreciation</b>. <b>Net book value</b> is cost minus accumulated depreciation. Machine cost in production uses this real depreciation."),
 "payroll": what("payroll",
   "<b>Payroll</b> pays employees: monthly staff a fixed salary, hourly staff according to hours logged. The system works out statutory deductions and posts the wage expense. <b>Loans</b> are advances repaid through payroll, and <b>leave</b> records days off."),
 "settings": what("company settings",
   "<b>Settings</b> hold the rules of the company. <b>Costing method</b> chooses standard or actual costing. <b>Vendor invoice tolerance</b> is how much an invoice may differ before it is put on hold. Students can read them; the teacher controls them so every company is graded the same way."),
 "reports-open": what("a financial report",
   "Reports are the output of the books, laid out like the ones a finance department files. They are always consistent because they all read the same ledger. <b>As at</b> reports show a position on one date (balance sheet); <b>From / To</b> reports cover a period (income statement). <b>CSV</b> saves a spreadsheet and <b>Print</b> prepares a paper copy."),
 "reports-stockcard": what("a stock card",
   "A <b>stock card</b> lists every movement of one item in date order with a running balance, like a bank statement for stock. Use it to find why a quantity is different from what you expected."),
 "reports-integrity": what("the books integrity check",
   "The <b>integrity check</b> is a list of automatic proofs that the ledger and the sub-ledgers agree: stock records against the inventory account, receivables against customers, payables against vendors. Every row should pass. A failure points to the area where a posting is wrong; fix it before closing the month."),
 "team-new": what("a team company and roles",
   "In a <b>team company</b> the work is split between students by <b>role</b>. The system enforces it: a Purchasing officer can create purchase orders but cannot post a payment, a Warehouse clerk can receive goods but cannot approve vouchers. The teacher can change members and roles at any time, so a team keeps working even when someone is absent."),
}

PLACE = {
 "Getting Started": {"start": [0, 1, 2, 3, 4, 5]},
 "Dashboard": {"dash": [0, 1, 2]},
 "Master Data": {"items": [9, 10], "boms": [11, 12, 13], "routings": [14], "workcenters": [4, 5], "rates": [7], "calendar": [6],
                 "units": [0], "conversions": [1], "locations": [2], "costcenters": [3], "costingsheet": [8]},
 "Costing": {"costing": [0, 1, 2]},
 "Planning": {"planned": [0, 1, 2], "reqs": [3, 4], "exceptions": [6], "forecast": [5]},
 "Purchasing": {"purchasing": [0, 7, 1], "purchasing-scrolled": [2, 3, 4, 5, 6]},
 "Inventory": {"stock": [0], "availability": [], "lots": [3], "documents": [4], "move": [1, 2]},
 "Production": {"production": [0, 1, 2, 3, 4, 5, 6]},
 "Shop Floor": {"dispatch": [0], "downtime": [1], "oee": [2], "upkeep": [3]},
 "Quality": {"quality-lots": [1], "quality-plans": [0], "quality-ncr": [2]},
 "Shipping": {"shipping": [0, 1, 2]},
 "Sales": {"sales": [0, 1, 2, 3, 4, 5]},
 "Finance": {"vouchers": [0, 1, 2], "accounts": [3], "recurring": [4]},
 "Period End": {"period-months": [0, 1, 2], "period-cogm": [3]},
 "Analytics": {"analytics-profit": [0], "analytics-inventory": [1], "analytics-lot": [2]},
 "Banking, Fixed Assets, Payroll and Settings": {"banking": [0], "fixed": [1], "payroll": [2], "settings": [3]},
 "Reports": {"reports-open": [0], "reports-stockcard": [1], "reports-integrity": [2]},
 "Teams and Roles": {"team-new": [0, 1], "team-member": [2]},
}
USED = set()

def sec(chapter, key):
    """Explanation first, then the how-to blocks for this screenshot."""
    USED.add((chapter, key))
    blocks = HOWTO.get(chapter, [])
    idx = PLACE.get(chapter, {}).get(key, [])
    return EXPLAIN.get(key, "") + "".join(blocks[i] for i in idx)

def leftover(chapter):
    """Any how-to block of the chapter not placed after a screenshot (safety net)."""
    placed = {i for k, v in PLACE.get(chapter, {}).items() if (chapter, k) in USED for i in v}
    return "".join(b for i, b in enumerate(HOWTO.get(chapter, [])) if i not in placed)
