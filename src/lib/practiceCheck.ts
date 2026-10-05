// Checks a company's data against a practice set.
//
// Pure logic with no imports, so it can be tested without a database. A practice set is
// described by a PracticeSet definition (its expected figures); the checks themselves are
// the same for every set. Each set's figures come from running its transactions through
// the same posting rules the app uses (tax split, COGS at last cost, payroll brackets,
// straight-line depreciation, void/reverse), not from hand arithmetic.
//
// To add a practice set: write its PracticeSet below, verify the figures with a ledger
// simulation, and append it to PRACTICE_SETS.

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
export type EmployeeSpec = { payType: "monthly" | "hourly"; annualSalary?: number; hourlyRate?: number };

export type PracticeSet = {
  id: string;
  name: string;
  summary: string;
  balances: { code: string; side: Side; amount: number; hint?: string }[];
  expectedNetIncome: number;          // negative = a loss, by design
  customers: string[];
  vendors: string[];
  employees: EmployeeSpec[];
  items: { name: string; qty: number; cost: number }[];
  invoiceTotals: number[];            // posted invoices, tax-inclusive
  voidTotals: number[];
  billTotals: number[];
  openBillTotal: number;              // the one bill left unpaid, which must have a due date
  quotes: { declined: number; converted: number };
  reversals: number;                  // entries starting "Reversal of:"
  recurringPosted: number;
  payroll: { runs: number; gross: number; hint: string };
  thirteenth: { runs: number; total: number };   // runs 0 = none expected
  depreciation: number;
  asset: { cost: number; months: number };
  loanBalance: number;
  bankReconciled: number | null;      // null = bank reconciliation is not part of this set
  lock: string | null;                // exact date, or null = any date will do
  hints?: Record<string, string>;     // per-account overrides of the generic hints
};

// Generic wording for a wrong account balance; a set can override any of these.
const DEFAULT_HINTS: Record<string, string> = {
  "1000": "Cash is the sum of every payment received and made, payroll, rent, loans and fees. Look for a missing or duplicated payment, rent post, or payroll run.",
  "1100": "Every invoice should be fully collected. Look for a payment that was skipped.",
  "1150": "The employee loan less the deductions payroll took. Check the loan was issued once and payroll ran the right number of times.",
  "1160": "12% tax on every bill. Check each bill had the 12% tax rate entered.",
  "1200": "Bills received less cost of goods sold. Check purchase-order line names match item names exactly.",
  "1500": "The motorcycle purchase, posted once.",
  "1590": "One monthly depreciation click of 1,083.33 for each month.",
  "2000": "Only the one designated bill should still be unpaid. Check the other bills were each paid.",
  "2100": "Payroll runs with the correct salaries.",
  "2110": "Payroll runs with the correct salaries.",
  "2120": "Payroll runs with the correct salaries.",
  "2130": "Both employees are under the tax-free bracket, so this stays at zero. A balance here means a salary was entered too high.",
  "2200": "12% tax on every invoice. The voided duplicate nets to zero.",
  "3000": "Owner's capital as listed in the setup.",
  "4000": "Invoices before tax. Check quantities and unit prices, and that the duplicate invoice was voided.",
  "5000": "Depends on the items sold and on bills updating item costs. Check item names on purchase-order lines.",
  "5100": "Rent posts plus the bank fee. A double-counted entry and its reversal net to zero.",
  "5300": "Payroll runs at the expected gross pay.",
  "5310": "Employer contributions on the payroll runs.",
  "5320": "13th month pay.",
  "5400": "One monthly depreciation click of 1,083.33 for each month.",
};

const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "Cash", "1100": "Accounts Receivable", "1150": "Employee Loans Receivable", "1160": "Input Tax (VAT)",
  "1200": "Inventory", "1500": "Fixed Assets", "1590": "Accumulated Depreciation", "2000": "Accounts Payable",
  "2100": "SSS Payable", "2110": "PhilHealth Payable", "2120": "Pag-IBIG Payable", "2130": "Withholding Tax Payable",
  "2200": "VAT Payable", "3000": "Owner's Equity", "4000": "Sales Revenue", "5000": "Cost of Goods Sold",
  "5100": "Operating Expenses", "5300": "Payroll Expense", "5310": "Payroll Tax Expense (Employer Share)",
  "5320": "13th Month Pay Expense", "5400": "Depreciation Expense",
};

const CUSTOMERS = ["Alon Retail Store", "Bayanihan Mart", "Cruz Family Sari-Sari Store"];
const VENDORS = ["Meridian Wholesale Supply", "Star Packaging Co."];

// ---------- Practice set: November–December 2026 ----------
const NOV_DEC_2026: PracticeSet = {
  id: "nov-dec-2026",
  name: "November–December 2026 (two months)",
  summary: "Ends in a net profit of ₱29,306.67. Salaried employees, 13th month pay, books locked December 31, 2026, bank steps on the Cash account.",
  balances: [
    { code: "1000", side: "dr", amount: 271900.13 },
    { code: "1100", side: "dr", amount: 0, hint: "Every invoice should be fully collected. Check the two final payments (Invoice-001's last 40% and Invoice-006's last 50%)." },
    { code: "1150", side: "dr", amount: 2000, hint: "The 3,000 loan less two 500 payroll deductions. Check the loan was issued once and payroll ran twice." },
    { code: "1160", side: "dr", amount: 13506 },
    { code: "1200", side: "dr", amount: 60780, hint: "Bills received less cost of goods sold, plus the opening inventory entries. Check PO line names match item names exactly and that both opening-inventory journal entries were posted." },
    { code: "1500", side: "dr", amount: 65000 },
    { code: "1590", side: "cr", amount: 2166.66, hint: "Two monthly depreciation clicks of 1,083.33." },
    { code: "2000", side: "cr", amount: 10080, hint: "Only Bill-004 should be unpaid. Check Bill-001, 002 and 003 were each paid." },
    { code: "2100", side: "cr", amount: 6160, hint: "Two payroll runs. Check Employee A's annual salary is 144,000 and Employee B's is 120,000." },
    { code: "2110", side: "cr", amount: 2200, hint: "Two payroll runs with the correct annual salaries." },
    { code: "2120", side: "cr", amount: 1600, hint: "Two payroll runs with the correct annual salaries." },
    { code: "2130", side: "cr", amount: 0 },
    { code: "2200", side: "cr", amount: 28372.8 },
    { code: "3000", side: "cr", amount: 333300, hint: "250,000 cash capital + 76,200 opening inventory + 7,100 second import." },
    { code: "4000", side: "cr", amount: 236440, hint: "Six invoices before tax. Check quantities and unit prices, and that the duplicate invoice was voided." },
    { code: "5000", side: "dr", amount: 135070 },
    { code: "5100", side: "dr", amount: 16150, hint: "Two rent posts (8,000) plus the 150 bank fee. The 2,000 double-count and its reversal net to zero." },
    { code: "5300", side: "dr", amount: 44000, hint: "Two payroll runs of 22,000 gross." },
    { code: "5310", side: "dr", amount: 6080 },
    { code: "5320", side: "dr", amount: 3666.67, hint: "Click 'Post 13th month pay' once, in the HR module, after both payroll runs." },
    { code: "5400", side: "dr", amount: 2166.66, hint: "Two monthly depreciation clicks of 1,083.33." },
  ],
  expectedNetIncome: 29306.67,
  customers: CUSTOMERS,
  vendors: VENDORS,
  employees: [{ payType: "monthly", annualSalary: 144000 }, { payType: "monthly", annualSalary: 120000 }],
  items: [
    { name: "Notebook (80 leaves)", qty: 80, cost: 24 },
    { name: "Ballpen (box of 12)", qty: 170, cost: 88 },
    { name: "Backpack (student)", qty: 40, cost: 300 },
    { name: "Umbrella (foldable)", qty: 120, cost: 145 },
    { name: "Water Bottle (500ml)", qty: 100, cost: 55 },
    { name: "Highlighter set", qty: 80, cost: 45 },
    { name: "Clipboard", qty: 50, cost: 70 },
  ],
  invoiceTotals: [40320, 47040, 50064, 37856, 70448, 19084.8],
  voidTotals: [47040],
  billTotals: [25536, 45920, 44520, 10080],
  openBillTotal: 10080,
  quotes: { declined: 1, converted: 6 },
  reversals: 3,
  recurringPosted: 2,
  payroll: { runs: 2, gross: 22000, hint: "Run payroll once for November and once for December with the correct annual salaries." },
  thirteenth: { runs: 1, total: 3666.67 },
  depreciation: 2166.66,
  asset: { cost: 65000, months: 60 },
  loanBalance: 2000,
  bankReconciled: 8,
  lock: "2026-12-31",
};

// ---------- Practice set: three-month (final revision, no approvals) ----------
const THREE_MONTH: PracticeSet = {
  id: "three-month",
  name: "Three-month set (final revision, no approvals)",
  summary: "Ends in a net LOSS of ₱117,709.99 by design (payroll outweighs sales). Employee B is hourly, no 13th month pay, bank reconciliation is not checked, any lock date counts.",
  balances: [
    { code: "1000", side: "dr", amount: 35891.4 },
    { code: "1100", side: "dr", amount: 0, hint: "Every invoice should be fully collected. Check the final payments on Invoice-001 and Invoice-006." },
    { code: "1150", side: "dr", amount: 1500, hint: "The 3,000 loan less three 500 payroll deductions. Check the loan was issued once and payroll ran three times." },
    { code: "1160", side: "dr", amount: 5628 },
    { code: "1200", side: "dr", amount: 9710, hint: "Only stock received through posted bills counts here; the CSV imports post nothing. Check PO line names match item names exactly." },
    { code: "1500", side: "dr", amount: 65000 },
    { code: "1590", side: "cr", amount: 3249.99, hint: "Three monthly depreciation clicks of 1,083.33." },
    { code: "2000", side: "cr", amount: 6720, hint: "Only Bill-004 should be unpaid. Check the other bills were each paid." },
    { code: "2100", side: "cr", amount: 12600, hint: "Three payroll runs. Check Employee A is 180,000 a year and Employee B is hourly at 95 with 160 hours logged in the month of each run." },
    { code: "2110", side: "cr", amount: 4530, hint: "Three payroll runs with the correct pay." },
    { code: "2120", side: "cr", amount: 2400, hint: "Three payroll runs with the correct pay." },
    { code: "2130", side: "cr", amount: 0 },
    { code: "2200", side: "cr", amount: 5939.4 },
    { code: "3000", side: "cr", amount: 200000, hint: "The ₱200,000 opening capital entry." },
    { code: "4000", side: "cr", amount: 49495 },
    { code: "5000", side: "dr", amount: 37190 },
    { code: "5100", side: "dr", amount: 24150, hint: "Three rent posts (24,000) plus the 150 bank fee. The 2,000 double-count and its reversal net to zero." },
    { code: "5300", side: "dr", amount: 90600, hint: "Three payroll runs of 30,200 gross. Employee B's pay comes from hours logged in the same calendar month as the run." },
    { code: "5310", side: "dr", amount: 12015 },
    { code: "5320", side: "dr", amount: 0, hint: "This set has no 13th month pay. It should stay at zero." },
    { code: "5400", side: "dr", amount: 3249.99, hint: "Three monthly depreciation clicks of 1,083.33." },
  ],
  expectedNetIncome: -117709.99,
  customers: CUSTOMERS,
  vendors: VENDORS,
  employees: [{ payType: "monthly", annualSalary: 180000 }, { payType: "hourly", hourlyRate: 95 }],
  items: [
    { name: "Notebook (80 leaves)", qty: 120, cost: 23 },
    { name: "Ballpen (box of 12)", qty: 190, cost: 85 },
    { name: "Backpack (student)", qty: 50, cost: 300 },
    { name: "Umbrella (foldable)", qty: 45, cost: 150 },
    { name: "Water Bottle (500ml)", qty: 150, cost: 55 },
    { name: "Highlighter set", qty: 50, cost: 45 },
    { name: "Clipboard", qty: 30, cost: 70 },
  ],
  invoiceTotals: [3528, 8618.4, 6160, 4592, 29344, 3192],
  voidTotals: [8618.4],
  billTotals: [6384, 25088, 11480, 2856, 6720],
  openBillTotal: 6720,
  quotes: { declined: 1, converted: 6 },
  reversals: 3,
  recurringPosted: 3,
  payroll: { runs: 3, gross: 30200, hint: "Run payroll once a month for three months. Employee B is paid from hours logged in the same calendar month as the run: two entries of 80 hours." },
  thirteenth: { runs: 0, total: 0 },
  depreciation: 3249.99,
  asset: { cost: 65000, months: 60 },
  loanBalance: 1500,
  bankReconciled: null,
  lock: null,
};

export const PRACTICE_SETS: PracticeSet[] = [NOV_DEC_2026, THREE_MONTH];
export const DEFAULT_PRACTICE_SET_ID = NOV_DEC_2026.id;

// ---------- helpers ----------
const cents = (n: number) => Math.round((n || 0) * 100);
const peso = (n: number) => "₱" + (n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const sameCents = (a: number, b: number) => Math.abs(cents(a) - cents(b)) <= 1;
const sameList = (a: number[], b: number[]) => {
  const x = a.map(cents).sort((p, q) => p - q), y = b.map(cents).sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1);
};
const listPesos = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b).map(peso).join(", ") : "none");

const specKey = (s: EmployeeSpec) =>
  s.payType === "monthly" ? `monthly|${Math.round(s.annualSalary ?? 0)}` : `hourly|${cents(s.hourlyRate ?? 0)}`;
const specText = (s: EmployeeSpec) =>
  s.payType === "monthly" ? `monthly, ${peso(s.annualSalary ?? 0)} a year` : `hourly, ${peso(s.hourlyRate ?? 0)} an hour`;

export function computeNetIncome(d: PracticeData): number {
  const raw: Record<string, number> = {};
  const byId = new Map(d.accounts.map((a) => [a.id, a]));
  for (const e of d.entries) for (const l of e.journal_lines) {
    const a = byId.get(l.account_id);
    if (a) raw[a.id] = (raw[a.id] || 0) + (l.debit || 0) - (l.credit || 0);
  }
  let revenue = 0, expenses = 0;
  for (const a of d.accounts) {
    const v = raw[a.id] || 0;
    if (a.type === "revenue") revenue += -v;
    if (a.type === "expense") expenses += v;
  }
  return revenue - expenses;
}

export function runPracticeChecks(d: PracticeData, set: PracticeSet): CheckResult[] {
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
  const netIncome = computeNetIncome(d);

  // ---------- company setup ----------
  const missing = (want: string[], have: { name: string }[]) => want.filter((w) => !have.some((h) => norm(h.name) === norm(w)));
  const mc = missing(set.customers, d.customers);
  add("Company setup", "Customers", set.customers.join(", "), mc.length ? `missing: ${mc.join(", ")}` : "all present", mc.length === 0, "Add the customers exactly as named in the practice set.");
  const mv = missing(set.vendors, d.vendors);
  add("Company setup", "Vendors", set.vendors.join(", "), mv.length ? `missing: ${mv.join(", ")}` : "all present", mv.length === 0, "Add the vendors exactly as named in the practice set.");

  const wantEmp = set.employees.map(specKey).sort();
  const haveSpecs: EmployeeSpec[] = d.employees.map((e) => {
    const hourly = (e.pay_type ?? "monthly") === "hourly";
    return hourly ? { payType: "hourly" as const, hourlyRate: e.hourly_rate ?? 0 } : { payType: "monthly" as const, annualSalary: e.salary };
  });
  const haveEmp = haveSpecs.map(specKey).sort();
  add("Company setup", "Employees and pay", `${set.employees.length} employees: ${set.employees.map(specText).join("; ")}`,
    `${haveSpecs.length} employee(s): ${haveSpecs.map(specText).join("; ") || "none"}`,
    wantEmp.length === haveEmp.length && wantEmp.every((k, i) => k === haveEmp[i]),
    "The monthly salary field is ANNUAL (the system divides by 12). Check each employee's pay type and amount against the practice set.");
  add("Company setup", "Approval threshold left blank", "blank (no limit)", d.tenant.approval_threshold == null ? "blank" : peso(d.tenant.approval_threshold),
    d.tenant.approval_threshold == null, "Clear the approval threshold on the Sales page so nothing waits for approval.");

  for (const want of set.items) {
    const found = d.items.find((i) => norm(i.name) === norm(want.name));
    const actual = found ? `${found.qty_on_hand} on hand @ ${peso(found.unit_cost)}` : "item not found";
    add("Inventory items", want.name, `${want.qty} on hand @ ${peso(want.cost)}`, actual,
      !!found && sameCents(found.qty_on_hand, want.qty) && sameCents(found.unit_cost, want.cost),
      found ? "Quantity or cost is off. Check the purchase-order line prices and quantities, and the invoice quantities." : "Check the CSV import, and that PO line descriptions match the item names exactly.");
  }
  add("Inventory items", "No duplicate or stray items", `${set.items.length} items`, `${d.items.length} items`, d.items.length === set.items.length,
    "A purchase-order line whose description does not exactly match an item name creates a new item on receipt. Delete the stray item and redo that bill.");

  const asset = d.fixedAssets.find((a) => norm(a.name).includes("motorcycle"));
  add("Company setup", "Fixed asset: Delivery Motorcycle", `${peso(set.asset.cost)} cost, ${set.asset.months} months`, asset ? `${peso(asset.cost)}, ${asset.useful_life_months} months` : "not found",
    !!asset && sameCents(asset.cost, set.asset.cost) && asset.useful_life_months === set.asset.months, `Register the motorcycle at ${set.asset.cost.toLocaleString("en-PH")} with a useful life of ${set.asset.months} MONTHS (not years).`);
  const rent = d.recurring.find((r) => r.frequency === "monthly" && r.active);
  add("Company setup", "Recurring rent entry", "a monthly recurring entry", rent ? `${rent.memo} (monthly)` : "none", !!rent, "Create the recurring rent entry under Financials → Recurring.");

  // ---------- documents ----------
  const invoicesPosted = d.invoices.filter((i) => i.status === "fulfilled").map((i) => i.total);
  add("Documents", "Posted invoices", `${set.invoiceTotals.length} invoices: ${listPesos(set.invoiceTotals)}`, `${invoicesPosted.length} invoice(s): ${listPesos(invoicesPosted)}`,
    sameList(invoicesPosted, set.invoiceTotals), "Compare each invoice total with the practice set, including 12% tax. Totals are tax-inclusive.");
  const voided = d.invoices.filter((i) => i.status === "void").map((i) => i.total);
  add("Documents", "Voided duplicate invoice", `${set.voidTotals.length} void: ${listPesos(set.voidTotals)}`, `${voided.length} void: ${listPesos(voided)}`, sameList(voided, set.voidTotals),
    "Create the duplicate invoice exactly as the practice set describes, post it, then use Void.");
  const held = d.invoices.filter((i) => i.status === "pending_approval").length + d.bills.filter((b) => b.status === "pending_approval").length;
  add("Documents", "Nothing held for approval", "0", String(held), held === 0, "A document is waiting for approval because a threshold amount is set. Clear the threshold and post it again.");
  const billsPosted = d.bills.filter((b) => b.status === "received").map((b) => b.total);
  add("Documents", "Posted bills", `${set.billTotals.length} bills: ${listPesos(set.billTotals)}`, `${billsPosted.length} bill(s): ${listPesos(billsPosted)}`,
    sameList(billsPosted, set.billTotals), "Compare each bill total with the practice set, including 12% tax.");

  const paidFor = (id: string) => d.billPayments.filter((p) => p.bill_id === id).reduce((s, p) => s + p.amount, 0);
  const openBills = d.bills.filter((b) => b.status === "received" && b.total - paidFor(b.id) > 0.005);
  const openBill = openBills.length === 1 ? openBills[0] : null;
  add("Documents", "Exactly one unpaid bill (Bill-004), with a due date", `1 unpaid: ${peso(set.openBillTotal)}, due date set`,
    openBills.length === 0 ? "none unpaid" : `${openBills.length} unpaid: ${listPesos(openBills.map((b) => b.total - paidFor(b.id)))}${openBill && !openBill.due_date ? ", no due date" : ""}`,
    !!openBill && sameCents(openBill.total - paidFor(openBill.id), set.openBillTotal) && !!openBill.due_date,
    "Bill-004 must be created with the New bill button (not Create bill from PO) so it has a due date, and must stay unpaid. Pay the other bills.");

  const declined = d.quotes.filter((q) => q.status === "declined").length;
  const converted = d.quotes.filter((q) => q.status === "converted").length;
  add("Documents", `Quotes: ${set.quotes.declined} declined, ${set.quotes.converted} converted`, `${set.quotes.declined} declined, ${set.quotes.converted} converted`, `${declined} declined, ${converted} converted`,
    declined === set.quotes.declined && converted === set.quotes.converted, "One quote should be declined; every other quote becomes a sales order and an invoice.");

  // ---------- ledger ----------
  for (const row of set.balances) {
    const actual = natural(row.code, row.side);
    add("Ledger balances", `${row.code} ${ACCOUNT_NAMES[row.code] ?? row.code}`, peso(row.amount), peso(actual), sameCents(actual, row.amount),
      row.hint ?? set.hints?.[row.code] ?? DEFAULT_HINTS[row.code]);
  }
  add("Ledger balances", "Debits equal credits", "equal", `${peso(totalDebit)} vs ${peso(totalCredit)}`, sameCents(totalDebit, totalCredit), "The books are out of balance, which the app should prevent. Ask for help.");
  const wantProfit = set.expectedNetIncome > 0;
  add("Ledger balances", "Net profit", wantProfit ? "a profit" : "a loss (by design)", peso(netIncome), wantProfit ? netIncome > 0 : netIncome < 0,
    wantProfit ? "The result should be a net profit. Compare the expense accounts above to find what was posted twice." : "This set is designed to end in a net loss. Compare the accounts above.");
  add("Ledger balances", "Net income amount", peso(set.expectedNetIncome), peso(netIncome), sameCents(netIncome, set.expectedNetIncome), "See the account balances above for what differs.");

  // ---------- month-end tasks ----------
  const reversals = d.entries.filter((e) => (e.memo ?? "").startsWith("Reversal of:")).length;
  add("Month-end tasks", "Reversing entries", `${set.reversals} (the voided invoice's sale and cost, plus the double-counted expense)`, String(reversals), reversals === set.reversals,
    "Void the duplicate invoice (2 entries) and Reverse the double-counted expense (1 entry).");
  const recurringPosted = d.entries.filter((e) => (e.memo ?? "").includes("(recurring)")).length;
  add("Month-end tasks", "Rent posted from the recurring entry", `${set.recurringPosted} (one per month)`, String(recurringPosted), recurringPosted === set.recurringPosted,
    "Recurring entries never post themselves. Click Post once for each month.");
  const regular = d.payrollRuns.filter((r) => r.run_type === "regular");
  add("Month-end tasks", "Payroll runs", `${set.payroll.runs} runs of ${peso(set.payroll.gross)} gross`, `${regular.length} run(s): ${listPesos(regular.map((r) => r.total))}`,
    regular.length === set.payroll.runs && regular.every((r) => sameCents(r.total, set.payroll.gross)), set.payroll.hint);
  const thirteenth = d.payrollRuns.filter((r) => r.run_type === "13th_month");
  add("Month-end tasks", "13th month pay", set.thirteenth.runs === 0 ? "none in this set" : `${set.thirteenth.runs} run of ${peso(set.thirteenth.total)}`,
    `${thirteenth.length} run(s): ${listPesos(thirteenth.map((r) => r.total))}`,
    thirteenth.length === set.thirteenth.runs && thirteenth.every((r) => sameCents(r.total, set.thirteenth.total)),
    set.thirteenth.runs === 0 ? "This set has no 13th month pay. Do not click Post 13th month pay." : "In the HR module click 'Post 13th month pay' once, after the payroll runs.");
  const accum = d.fixedAssets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  add("Month-end tasks", "Depreciation recorded", peso(set.depreciation), peso(accum), sameCents(accum, set.depreciation), "Click 'Record 1 month dep.' once for each month.");
  const loan = d.loans[0];
  add("Month-end tasks", "Employee B loan balance", `${peso(set.loanBalance)} remaining`, loan ? `${peso(loan.balance_remaining)} remaining` : "no loan", !!loan && d.loans.length === 1 && sameCents(loan.balance_remaining, set.loanBalance),
    "Issue one 3,000 loan with a 500 monthly deduction, then run payroll once a month.");
  if (set.bankReconciled != null) {
    const reconciled = d.bankTxns.filter((t) => t.reconciled).length;
    add("Month-end tasks", "Bank transactions reconciled", `at least ${set.bankReconciled}`, String(reconciled), reconciled >= set.bankReconciled,
      "Log the bank transactions listed in the practice set on the Cash account, then use Auto-match. Dates must match the postings.");
  }
  add("Month-end tasks", "Attachment uploaded", "at least 1", String(d.attachments), d.attachments >= 1, "Attach a file to a bill or journal entry.");
  add("Month-end tasks", "Leave request filed", "at least 1", String(d.leaveRequests), d.leaveRequests >= 1, "File a leave request in the HR module.");
  const lockedOk = set.lock ? d.tenant.books_locked_through === set.lock : d.tenant.books_locked_through != null;
  add("Month-end tasks", set.lock ? `Books locked through ${set.lock}` : "Books locked", set.lock ?? "locked through any date", d.tenant.books_locked_through ?? "not locked", lockedOk,
    set.lock ? `Lock the books through ${set.lock} as the very last step.` : "Lock the books as the last step.");

  return out;
}

export function summarize(results: CheckResult[]) {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, failed: results.length - passed };
}
