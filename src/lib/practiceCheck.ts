// Checks a company's data against the November–December 2026 practice set.
//
// Pure logic with no imports, so it can be tested without a database. The expected
// figures come from running the practice set's transactions through the same
// posting rules the app uses (tax split, COGS at last cost, payroll brackets,
// straight-line depreciation, void/reverse), not from hand arithmetic.

export type PracticeData = {
  tenant: { books_locked_through: string | null; approval_threshold: number | null };
  accounts: { id: string; code: string; name: string; type: string }[];
  entries: { id: string; entry_date: string; memo: string | null; journal_lines: { account_id: string; debit: number; credit: number }[] }[];
  customers: { name: string }[];
  vendors: { name: string }[];
  items: { sku: string | null; name: string; qty_on_hand: number; unit_cost: number; reorder_point: number }[];
  employees: { name: string; salary: number; pay_type: string | null; hourly_rate: number | null }[];
  invoices: { id: string; total: number; tax_amount: number; status: string }[];
  invoicePayments: { invoice_id: string; amount: number }[];
  bills: { id: string; total: number; tax_amount: number; status: string; due_date: string | null }[];
  billPayments: { bill_id: string; amount: number }[];
  quotes: { status: string }[];
  loans: { principal: number; monthly_deduction: number; balance_remaining: number; status: string }[];
  fixedAssets: { name: string; cost: number; salvage_value: number; useful_life_months: number; accumulated_depreciation: number }[];
  recurring: { memo: string; frequency: string; active: boolean }[];
  payrollRuns: { run_type: string; total: number }[];
  bankTxns: { amount: number; reconciled: boolean; matched_journal_entry_id: string | null }[];
  attachments: number;
  leaveRequests: number;
};

export type CheckResult = {
  group: string;
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
  hint?: string;
};

type Side = "dr" | "cr";

// Natural-side balances at the end of the practice set.
export const EXPECTED_BALANCES: { code: string; name: string; side: Side; amount: number; hint: string }[] = [
  { code: "1000", name: "Cash", side: "dr", amount: 271900.13, hint: "Cash is the sum of every payment, payroll, rent, loan and fee. Look for a missing or duplicated payment, rent post, or payroll run." },
  { code: "1100", name: "Accounts Receivable", side: "dr", amount: 0, hint: "Every invoice should be fully collected. Check the two final payments (Invoice-001's last 40% and Invoice-006's last 50%)." },
  { code: "1150", name: "Employee Loans Receivable", side: "dr", amount: 2000, hint: "The 3,000 loan less two 500 payroll deductions. Check the loan was issued once and payroll ran twice." },
  { code: "1160", name: "Input Tax (VAT)", side: "dr", amount: 13506, hint: "12% tax on every bill. Check each bill had the 12% tax rate entered." },
  { code: "1200", name: "Inventory", side: "dr", amount: 60780, hint: "Bills received less cost of goods sold, plus the opening inventory entries. Check PO line names match item names exactly and that both opening-inventory journal entries were posted." },
  { code: "1500", name: "Fixed Assets", side: "dr", amount: 65000, hint: "The motorcycle purchase, posted once." },
  { code: "1590", name: "Accumulated Depreciation", side: "cr", amount: 2166.66, hint: "Two monthly depreciation clicks of 1,083.33." },
  { code: "2000", name: "Accounts Payable", side: "cr", amount: 10080, hint: "Only Bill-004 should be unpaid. Check Bill-001, 002 and 003 were each paid." },
  { code: "2100", name: "SSS Payable", side: "cr", amount: 6160, hint: "Two payroll runs. Check Employee A's annual salary is 144,000 and Employee B's is 120,000." },
  { code: "2110", name: "PhilHealth Payable", side: "cr", amount: 2200, hint: "Two payroll runs with the correct annual salaries." },
  { code: "2120", name: "Pag-IBIG Payable", side: "cr", amount: 1600, hint: "Two payroll runs with the correct annual salaries." },
  { code: "2130", name: "Withholding Tax Payable", side: "cr", amount: 0, hint: "Both salaries are under the tax-free bracket, so this stays at zero. A balance here means a salary was entered too high." },
  { code: "2200", name: "VAT Payable", side: "cr", amount: 28372.8, hint: "12% tax on every invoice. The voided duplicate nets to zero." },
  { code: "3000", name: "Owner's Equity", side: "cr", amount: 333300, hint: "250,000 cash capital + 76,200 opening inventory + 7,100 second import." },
  { code: "4000", name: "Sales Revenue", side: "cr", amount: 236440, hint: "Six invoices before tax. Check quantities and unit prices, and that the duplicate invoice was voided." },
  { code: "5000", name: "Cost of Goods Sold", side: "dr", amount: 135070, hint: "Depends on the items sold and on bills updating item costs. Check item names on PO lines." },
  { code: "5100", name: "Operating Expenses", side: "dr", amount: 16150, hint: "Two rent posts (8,000) plus the 150 bank fee. The 2,000 double-count and its reversal net to zero." },
  { code: "5300", name: "Payroll Expense", side: "dr", amount: 44000, hint: "Two payroll runs of 22,000 gross." },
  { code: "5310", name: "Payroll Tax Expense (Employer Share)", side: "dr", amount: 6080, hint: "Employer contributions on two payroll runs." },
  { code: "5320", name: "13th Month Pay Expense", side: "dr", amount: 3666.67, hint: "Click 'Post 13th month pay' once, in the HR module, after both payroll runs." },
  { code: "5400", name: "Depreciation Expense", side: "dr", amount: 2166.66, hint: "Two monthly depreciation clicks of 1,083.33." },
];

export const EXPECTED_NET_INCOME = 29306.67;

const EXPECTED_ITEMS: { name: string; qty: number; cost: number }[] = [
  { name: "Notebook (80 leaves)", qty: 80, cost: 24 },
  { name: "Ballpen (box of 12)", qty: 170, cost: 88 },
  { name: "Backpack (student)", qty: 40, cost: 300 },
  { name: "Umbrella (foldable)", qty: 120, cost: 145 },
  { name: "Water Bottle (500ml)", qty: 100, cost: 55 },
  { name: "Highlighter set", qty: 80, cost: 45 },
  { name: "Clipboard", qty: 50, cost: 70 },
];

const EXPECTED_CUSTOMERS = ["Alon Retail Store", "Bayanihan Mart", "Cruz Family Sari-Sari Store"];
const EXPECTED_VENDORS = ["Meridian Wholesale Supply", "Star Packaging Co."];
const EXPECTED_INVOICE_TOTALS = [40320, 47040, 50064, 37856, 70448, 19084.8];
const EXPECTED_BILL_TOTALS = [25536, 45920, 44520, 10080];

const cents = (n: number) => Math.round((n || 0) * 100);
const peso = (n: number) => "₱" + (n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const sameCents = (a: number, b: number) => Math.abs(cents(a) - cents(b)) <= 1;
const sortedCents = (xs: number[]) => xs.map(cents).sort((a, b) => a - b);
const sameList = (a: number[], b: number[]) => {
  const x = sortedCents(a), y = sortedCents(b);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1);
};
const listPesos = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b).map(peso).join(", ") : "none");

export function runPracticeChecks(d: PracticeData): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (group: string, label: string, expected: string, actual: string, pass: boolean, hint?: string) =>
    out.push({ group, label, expected, actual, pass, hint: pass ? undefined : hint });

  // ---------- ledger balances ----------
  const accountById = new Map(d.accounts.map((a) => [a.id, a]));
  const raw: Record<string, number> = {};
  let totalDebit = 0, totalCredit = 0;
  for (const e of d.entries) {
    for (const l of e.journal_lines) {
      const a = accountById.get(l.account_id);
      totalDebit += l.debit || 0;
      totalCredit += l.credit || 0;
      if (a) raw[a.code] = (raw[a.code] || 0) + (l.debit || 0) - (l.credit || 0);
    }
  }
  const natural = (code: string, side: Side) => (side === "dr" ? raw[code] || 0 : -(raw[code] || 0));

  let revenue = 0, expenses = 0;
  for (const a of d.accounts) {
    const v = raw[a.code] || 0;
    if (a.type === "revenue") revenue += -v;
    if (a.type === "expense") expenses += v;
  }
  const netIncome = revenue - expenses;

  // ---------- company setup ----------
  const missing = (want: string[], have: { name: string }[]) => want.filter((w) => !have.some((h) => norm(h.name) === norm(w)));
  const mc = missing(EXPECTED_CUSTOMERS, d.customers);
  add("Company setup", "Customers", EXPECTED_CUSTOMERS.join(", "), mc.length ? `missing: ${mc.join(", ")}` : "all present", mc.length === 0, "Add the three customers exactly as named in the practice set.");
  const mv = missing(EXPECTED_VENDORS, d.vendors);
  add("Company setup", "Vendors", EXPECTED_VENDORS.join(", "), mv.length ? `missing: ${mv.join(", ")}` : "all present", mv.length === 0, "Add the two vendors exactly as named in the practice set.");

  const salaries = d.employees.map((e) => e.salary);
  add("Company setup", "Employees and annual salaries", "2 employees: ₱144,000 and ₱120,000 a year, monthly pay", `${d.employees.length} employee(s): ${listPesos(salaries)}`,
    d.employees.length === 2 && sameList(salaries, [144000, 120000]) && d.employees.every((e) => (e.pay_type ?? "monthly") === "monthly"),
    "The salary field is ANNUAL. Employee A is 144,000 and Employee B is 120,000, both on monthly pay.");
  add("Company setup", "Approval threshold left blank", "blank (no limit)", d.tenant.approval_threshold == null ? "blank" : peso(d.tenant.approval_threshold),
    d.tenant.approval_threshold == null, "Clear the approval threshold on the Sales page so nothing waits for approval.");

  for (const want of EXPECTED_ITEMS) {
    const found = d.items.find((i) => norm(i.name) === norm(want.name));
    const actual = found ? `${found.qty_on_hand} on hand @ ${peso(found.unit_cost)}` : "item not found";
    add("Inventory items", want.name, `${want.qty} on hand @ ${peso(want.cost)}`, actual,
      !!found && sameCents(found.qty_on_hand, want.qty) && sameCents(found.unit_cost, want.cost),
      found ? "Quantity or cost is off. Check the purchase-order line prices and quantities, and the invoice quantities." : "Check the CSV import, and that PO line descriptions match the item names exactly.");
  }
  add("Inventory items", "No duplicate or stray items", `${EXPECTED_ITEMS.length} items`, `${d.items.length} items`, d.items.length === EXPECTED_ITEMS.length,
    "A purchase-order line whose description does not exactly match an item name creates a new item on receipt. Delete the stray item and redo that bill.");

  const asset = d.fixedAssets.find((a) => norm(a.name).includes("motorcycle"));
  add("Company setup", "Fixed asset: Delivery Motorcycle", "₱65,000 cost, 60 months", asset ? `${peso(asset.cost)}, ${asset.useful_life_months} months` : "not found",
    !!asset && sameCents(asset.cost, 65000) && asset.useful_life_months === 60, "Register the motorcycle at 65,000 with a useful life of 60 MONTHS (not years).");
  const rent = d.recurring.find((r) => r.frequency === "monthly" && r.active);
  add("Company setup", "Recurring rent entry", "a monthly recurring entry", rent ? `${rent.memo} (monthly)` : "none", !!rent, "Create the recurring rent entry under Financials → Recurring.");

  // ---------- documents ----------
  const invoicesPosted = d.invoices.filter((i) => i.status === "fulfilled").map((i) => i.total);
  add("Documents", "Posted invoices", `6 invoices: ${listPesos(EXPECTED_INVOICE_TOTALS)}`, `${invoicesPosted.length} invoice(s): ${listPesos(invoicesPosted)}`,
    sameList(invoicesPosted, EXPECTED_INVOICE_TOTALS), "Compare each invoice total with the practice set, including 12% tax. Totals are tax-inclusive.");
  const voided = d.invoices.filter((i) => i.status === "void").map((i) => i.total);
  add("Documents", "Voided duplicate invoice", `1 void: ${peso(47040)}`, `${voided.length} void: ${listPesos(voided)}`, sameList(voided, [47040]),
    "Create the duplicate of Invoice-002 (47,040.00), post it, then use Void.");
  const held = d.invoices.filter((i) => i.status === "pending_approval").length + d.bills.filter((b) => b.status === "pending_approval").length;
  add("Documents", "Nothing held for approval", "0", String(held), held === 0, "A document is waiting for approval because a threshold amount is set. Clear the threshold and post it again.");
  const billsPosted = d.bills.filter((b) => b.status === "received").map((b) => b.total);
  add("Documents", "Posted bills", `4 bills: ${listPesos(EXPECTED_BILL_TOTALS)}`, `${billsPosted.length} bill(s): ${listPesos(billsPosted)}`,
    sameList(billsPosted, EXPECTED_BILL_TOTALS), "Compare each bill total with the practice set, including 12% tax.");

  const paidFor = (id: string) => d.billPayments.filter((p) => p.bill_id === id).reduce((s, p) => s + p.amount, 0);
  const openBills = d.bills.filter((b) => b.status === "received" && b.total - paidFor(b.id) > 0.005);
  const bill4 = openBills.length === 1 ? openBills[0] : null;
  add("Documents", "Exactly one unpaid bill (Bill-004), with a due date", `1 unpaid: ${peso(10080)}, due date set`,
    openBills.length === 0 ? "none unpaid" : `${openBills.length} unpaid: ${listPesos(openBills.map((b) => b.total - paidFor(b.id)))}${bill4 && !bill4.due_date ? ", no due date" : ""}`,
    !!bill4 && sameCents(bill4.total - paidFor(bill4.id), 10080) && !!bill4.due_date,
    "Bill-004 must be created with the New bill button (not Create bill from PO) so it has a due date, and must stay unpaid. Pay the other three bills.");

  const declined = d.quotes.filter((q) => q.status === "declined").length;
  const converted = d.quotes.filter((q) => q.status === "converted").length;
  add("Documents", "Quotes: one declined, six converted", "1 declined, 6 converted", `${declined} declined, ${converted} converted`, declined === 1 && converted === 6,
    "Quote-002 should be declined; the other six quotes become sales orders and invoices.");

  // ---------- ledger ----------
  for (const row of EXPECTED_BALANCES) {
    const actual = natural(row.code, row.side);
    add("Ledger balances", `${row.code} ${row.name}`, peso(row.amount), peso(actual), sameCents(actual, row.amount), row.hint);
  }
  add("Ledger balances", "Debits equal credits", "equal", `${peso(totalDebit)} vs ${peso(totalCredit)}`, sameCents(totalDebit, totalCredit), "The books are out of balance, which the app should prevent. Ask for help.");
  add("Ledger balances", "Net profit", "a profit", peso(netIncome), netIncome > 0, "The result should be a net profit. Compare the expense accounts above to find what was posted twice.");
  add("Ledger balances", "Net income amount", peso(EXPECTED_NET_INCOME), peso(netIncome), sameCents(netIncome, EXPECTED_NET_INCOME), "See the account balances above for what differs.");

  // ---------- month-end tasks ----------
  const reversals = d.entries.filter((e) => (e.memo ?? "").startsWith("Reversal of:")).length;
  add("Month-end tasks", "Reversing entries", "3 (the voided invoice's sale and cost, plus the double-counted expense)", String(reversals), reversals === 3,
    "Void the duplicate invoice (2 entries) and Reverse the 2,000 double-counted expense (1 entry).");
  const recurringPosted = d.entries.filter((e) => (e.memo ?? "").includes("(recurring)")).length;
  add("Month-end tasks", "Rent posted from the recurring entry", "2 (November and December)", String(recurringPosted), recurringPosted === 2,
    "Recurring entries never post themselves. Click Post once in November and once in December.");
  const regular = d.payrollRuns.filter((r) => r.run_type === "regular");
  add("Month-end tasks", "Payroll runs", "2 runs of ₱22,000.00 gross", `${regular.length} run(s): ${listPesos(regular.map((r) => r.total))}`,
    regular.length === 2 && regular.every((r) => sameCents(r.total, 22000)), "Run payroll once for November and once for December with the correct annual salaries.");
  const thirteenth = d.payrollRuns.filter((r) => r.run_type === "13th_month");
  add("Month-end tasks", "13th month pay", `1 run of ${peso(3666.67)}`, `${thirteenth.length} run(s): ${listPesos(thirteenth.map((r) => r.total))}`,
    thirteenth.length === 1 && sameCents(thirteenth[0].total, 3666.67), "In the HR module click 'Post 13th month pay' once, after both payroll runs.");
  const accum = d.fixedAssets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  add("Month-end tasks", "Depreciation recorded", `${peso(2166.66)} (2 months)`, peso(accum), sameCents(accum, 2166.66), "Click 'Record 1 month dep.' once in November and once in December.");
  const loan = d.loans[0];
  add("Month-end tasks", "Employee B loan balance", `${peso(2000)} remaining`, loan ? `${peso(loan.balance_remaining)} remaining` : "no loan", !!loan && d.loans.length === 1 && sameCents(loan.balance_remaining, 2000),
    "Issue one 3,000 loan with a 500 monthly deduction, then run payroll twice.");
  const reconciled = d.bankTxns.filter((t) => t.reconciled).length;
  add("Month-end tasks", "Bank transactions reconciled", "at least 8", String(reconciled), reconciled >= 8, "Log the eight bank transactions on the Cash account, then use Auto-match. Dates must match the postings.");
  add("Month-end tasks", "Attachment uploaded", "at least 1", String(d.attachments), d.attachments >= 1, "Attach a file to a bill or journal entry.");
  add("Month-end tasks", "Leave request filed", "at least 1", String(d.leaveRequests), d.leaveRequests >= 1, "File a leave request for Employee A in the HR module.");
  add("Month-end tasks", "Books locked through December 31", "2026-12-31", d.tenant.books_locked_through ?? "not locked", d.tenant.books_locked_through === "2026-12-31",
    "Lock the books through 2026-12-31 as the very last step.");

  return out;
}

export function summarize(results: CheckResult[]) {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, failed: results.length - passed };
}
