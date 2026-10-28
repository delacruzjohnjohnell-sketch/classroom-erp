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
