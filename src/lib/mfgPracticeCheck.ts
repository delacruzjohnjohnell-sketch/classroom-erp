// Checks a Manufacturing company against a practice set.
//
// Pure logic, so it can be tested without a database. The company is read by mfg_practice_snapshot (migration 0050) as one JSON
// document; this file compares it with the figures the set expects. A set's figures come from running the whole set through the real
// posting functions in a rolled-back transaction (supabase/tests/mfg_practice_set1_key.sql), not from hand arithmetic; the test
// tests/mfgPracticeCheck.test.ts holds that run's snapshot and must pass every check.
//
// The expected figures of a set (MfgPracticeSet) are NOT in this file: they live in the database (mfg_practice_sets, migration 0052) and only the
// teacher can read them, so a student cannot find them in the website's code. tests/fixtures/mfgPracticeSet1.definition.json is the same set for the tests.
// To add a set: write its answer-key script, run it, keep the snapshot as a fixture, and insert its definition in a migration.

import type { CheckResult } from "./practiceCheck";

export type MfgSnapshot = {
  company: string;
  vendors: string[];
  customers: string[];
  employees: { name: string; pay_type: string | null; hourly_rate: number | null }[];
  work_centers: string[];
  rates: { work_center: string; kind: string; rate: number }[];
  oh_rate: number | null;
  items: { sku: string; name: string; type: string; make_or_buy: string; uom: string; planned_price: number; standard_cost: number; qty: number }[];
  boms: { item: string; lines: { sku: string; qty: number }[] | null }[];
  routings: { item: string; ops: { op_no: number; work_center: string; setup_min: number; run_min: number; labor_min: number; machine_min: number }[] | null }[];
  estimates_released: string[];
  purchase_orders: { vendor: string; total: number; status: string }[];
  vendor_invoices: { total: number; due_date: string | null; status: string; invoice_date: string | null }[];
  orders: { item: string; planned: number; good: number; scrap: number; received: number; status: string }[];
  invoices: { total: number; date: string; due_date: string | null; status: string }[];
  gl: Record<string, number>;
  vouchers: { manual_posted: number; total_manual_amount: number };
  periods: { period: string; status: string }[];
};

export type MfgPracticeSet = {
  id: string;
  name: string;
  summary: string;
  vendors: string[];
  customers: string[];
  employees: { name: string; hourlyRate: number }[];
  workCenters: string[];
  rates: { workCenter: string; kind: "LABOR" | "MACHINE"; rate: number }[];
  ohRate: number;
  items: { sku: string; name: string; type: string; uom: string; plannedPrice?: number; standardCost?: number; qty: number }[];
  boms: { item: string; lines: { sku: string; qty: number }[] }[];
  routings: { item: string; ops: { op: number; workCenter: string; setup: number; run: number; labor: number; machine: number }[] }[];
  purchaseOrders: { vendor: string; total: number }[];
  vendorInvoices: { total: number; invoiceDate: string; due: string }[];
  orders: { item: string; planned: number; good: number; scrap: number }[];
  invoices: { total: number; date: string; due: string }[];
  balances: { code: string; amount: number; hint?: string }[];   // amount = debit minus credit (a credit balance is negative)
  manualVouchers: { count: number; totalDebit: number };
  month: string;                                                  // 'YYYY-MM', must be CLOSED
};

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => String(Math.round(n * 1e6) / 1e6);
const list = (a: string[]) => (a.length ? a.join(", ") : "none");

/** Net profit (positive) or loss (negative) from the ledger balances: revenue and expense accounts start at 4000. */
export function netIncome(gl: Record<string, number>): number {
  let sum = 0;
  for (const [code, bal] of Object.entries(gl)) if (Number(code) >= 4000) sum += bal;
  return Math.round(-sum * 100) / 100;
}

export function runMfgPracticeChecks(s: MfgSnapshot, set: MfgPracticeSet): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (group: string, label: string, expected: string, actual: string, pass: boolean, hint?: string) => out.push({ group, label, expected, actual, pass, hint: pass ? undefined : hint });
  const item = (sku: string) => s.items.find((i) => i.sku === sku);

  // ---- setup
  const names = (have: string[], want: string[]) => ({ missing: want.filter((n) => !have.includes(n)), extra: have.filter((n) => !want.includes(n)) });
  for (const [label, have, want] of [["Vendors", s.vendors, set.vendors], ["Customers", s.customers, set.customers], ["Work centers", s.work_centers, set.workCenters]] as const) {
    const d = names(have, want);
    add("Company setup", label, list(want), list(have), d.missing.length === 0 && d.extra.length === 0,
      d.missing.length ? `Missing: ${list(d.missing)}. Names must match exactly.` : `Not part of the set: ${list(d.extra)}.`);
  }
  for (const e of set.employees) {
    const f = s.employees.find((x) => x.name === e.name);
    add("Company setup", `Employee ${e.name}`, `hourly at ${peso(e.hourlyRate)}`, f ? `${f.pay_type ?? "?"} at ${peso(Number(f.hourly_rate ?? 0))}` : "not found",
      !!f && f.pay_type === "hourly" && same(Number(f.hourly_rate ?? 0), e.hourlyRate), "Add the employee with Pay type Hourly and the hourly rate from the set.");
  }
  for (const r of set.rates) {
    const f = s.rates.find((x) => x.work_center === r.workCenter && x.kind === r.kind);
    add("Company setup", `${r.workCenter} ${r.kind.toLowerCase()} rate`, `${peso(r.rate)} per hour`, f ? `${peso(f.rate)} per hour` : "not set", !!f && same(f.rate, r.rate),
      "Master Data → Activity rates: enter the rate for this work center and activity, starting 1 November 2026.");
  }
  add("Company setup", "Fixed overhead rate", `${peso(set.ohRate)} per hour`, s.oh_rate == null ? "not set" : `${peso(s.oh_rate)} per hour`, s.oh_rate != null && same(s.oh_rate, set.ohRate),
    "Master Data → Costing sheet: set the fixed overhead rate per hour.");

  // ---- items and costing
  for (const it of set.items) {
    const f = item(it.sku);
    add("Items and costing", `Item ${it.sku}`, `${it.name}, ${it.type}, ${it.uom}${it.plannedPrice != null ? `, planned price ${peso(it.plannedPrice)}` : ""}`,
      f ? `${f.name}, ${f.type}, ${f.uom}${it.plannedPrice != null ? `, planned price ${peso(Number(f.planned_price))}` : ""}` : "not found",
      !!f && f.name === it.name && f.type === it.type && f.uom === it.uom && (it.plannedPrice == null || same(Number(f.planned_price), it.plannedPrice)),
      "Check the SKU, name, type, unit of measure and planned price against the item table in the set.");
  }
  for (const b of set.boms) {
    const f = s.boms.find((x) => x.item === b.item);
    const have = (f?.lines ?? []).map((l) => `${l.sku} ${num(Number(l.qty))}`).join("; ");
    const want = b.lines.map((l) => `${l.sku} ${num(l.qty)}`).join("; ");
    add("Items and costing", `Bill of materials ${b.item}`, want, f ? have : "no active bill of materials", !!f && have === want,
      "Master Data → Bills of materials: the bill must be saved and made active, with exactly these components and quantities.");
  }
  for (const r of set.routings) {
    const f = s.routings.find((x) => x.item === r.item);
    const text = (ops: { op: number; wc: string; setup: number; run: number; labor: number; machine: number }[]) => ops.map((o) => `${o.op} ${o.wc} ${num(o.setup)}/${num(o.run)}/${num(o.labor)}/${num(o.machine)}`).join("; ");
    const have = text((f?.ops ?? []).map((o) => ({ op: o.op_no, wc: o.work_center, setup: Number(o.setup_min), run: Number(o.run_min), labor: Number(o.labor_min), machine: Number(o.machine_min) })));
    const want = text(r.ops.map((o) => ({ op: o.op, wc: o.workCenter, setup: o.setup, run: o.run, labor: o.labor, machine: o.machine })));
    add("Items and costing", `Routing ${r.item}`, `${want} (op, work center, setup/run/labor/machine minutes)`, f ? have : "no active routing", !!f && have === want,
      "Master Data → Routings: the operations, work centers and minutes must match the set, and the routing must be made active.");
  }
  for (const sku of set.items.filter((i) => i.standardCost != null).map((i) => i.sku)) {
    add("Items and costing", `Cost estimate released for ${sku}`, "released", s.estimates_released.includes(sku) ? "released" : "not released", s.estimates_released.includes(sku),
      "Costing → New estimate (lot size and date from the set), then mark and release it so the item carries a standard cost.");
  }
  for (const it of set.items.filter((i) => i.standardCost != null)) {
    const f = item(it.sku);
    add("Items and costing", `Standard cost of ${it.sku}`, peso(it.standardCost!), f ? peso(Number(f.standard_cost)) : "not found", !!f && same(Number(f.standard_cost), it.standardCost!),
      "A different standard cost means the bill of materials, routing minutes, activity rates or overhead rate differ from the set.");
  }

  // ---- purchasing
  for (const po of set.purchaseOrders) {
    const f = s.purchase_orders.find((x) => x.vendor === po.vendor && same(Number(x.total), po.total));
    add("Purchasing", `Purchase order ${po.vendor}`, `${peso(po.total)}, fully received`, f ? `${peso(Number(f.total))}, ${f.status}` : "not found",
      !!f && f.status === "closed", "Check the vendor, quantities and unit prices on the order, and that every line was received.");
  }
  for (const vi of set.vendorInvoices) {
    const f = s.vendor_invoices.find((x) => same(Number(x.total), vi.total));
    add("Purchasing", `Vendor invoice of ${peso(vi.total)}`, `posted ${vi.invoiceDate}, due ${vi.due}`, f ? `${f.status} ${f.invoice_date ?? ""}, due ${f.due_date ?? "—"}` : "not found",
      !!f && f.status === "POSTED" && f.invoice_date === vi.invoiceDate && f.due_date === vi.due, "Enter the vendor invoice against the order, with the invoice date, due date and 12% tax from the set.");
  }
  add("Purchasing", "Vendor invoices", `${set.vendorInvoices.length}`, `${s.vendor_invoices.length}`, s.vendor_invoices.length === set.vendorInvoices.length,
    "Only one vendor invoice is entered. The bamboo and rattan receipt stays uninvoiced on purpose (see Goods received, not invoiced).");

  // ---- production
  for (const o of set.orders) {
    const f = s.orders.find((x) => x.item === o.item);
    add("Production", `Order for ${o.item}`, `${o.planned} planned, ${o.good} good, ${o.scrap} scrap, received and settled`,
      f ? `${num(Number(f.planned))} planned, ${num(Number(f.good))} good, ${num(Number(f.scrap))} scrap, received ${num(Number(f.received))}, ${f.status.toLowerCase().replace(/_/g, " ")}` : "no order",
      !!f && same(Number(f.planned), o.planned) && same(Number(f.good), o.good) && same(Number(f.scrap), o.scrap) && same(Number(f.received), o.good) && f.status === "TECHNICALLY_COMPLETE",
      "Check the quantities confirmed on the last operation, the receipt of finished goods, and that the order was settled.");
  }

  // ---- sales
  for (const inv of set.invoices) {
    const f = s.invoices.find((x) => same(Number(x.total), inv.total));
    add("Sales", `Invoice of ${peso(inv.total)}`, `posted ${inv.date}, due ${inv.due}`, f ? `${f.status} ${f.date}, due ${f.due_date ?? "—"}` : "not found",
      !!f && f.status === "fulfilled" && f.date === inv.date && f.due_date === inv.due,
      "Deliver on Shipping first, then create the invoice with the invoice date and due date from the set, and post it on Sales.");
  }
  add("Sales", "Invoices", `${set.invoices.length}`, `${s.invoices.length}`, s.invoices.length === set.invoices.length, "There should be exactly the invoices in the set, no duplicates.");

  // ---- stock
  for (const it of set.items) {
    const f = item(it.sku);
    add("Stock on hand", it.sku, `${it.qty} ${it.uom}`, f ? `${num(Number(f.qty))} ${f.uom}` : "not found", !!f && same(Number(f.qty), it.qty),
      "Compare Inventory → Stock with the receipts, issues and deliveries in the set.");
  }

  // ---- ledger
  const codes = Array.from(new Set([...set.balances.map((b) => b.code), ...Object.keys(s.gl)])).sort();
  for (const code of codes) {
    const want = set.balances.find((b) => b.code === code);
    const have = Number(s.gl[code] ?? 0);
    const side = (n: number) => (n === 0 ? "nil" : n > 0 ? `${peso(n)} Dr` : `${peso(-n)} Cr`);
    add("Ledger balances", `${code} ${ACCOUNT_NAMES[code] ?? ""}`.trim(), want ? side(want.amount) : "nil", side(have), same(have, want?.amount ?? 0),
      want?.hint ?? "This account should not have a balance in this set. Look for an extra or duplicated posting.");
  }
  const wantNet = netIncome(Object.fromEntries(set.balances.map((b) => [b.code, b.amount])));
  const haveNet = netIncome(s.gl);
  add("Ledger balances", "Net profit for November", peso(wantNet), peso(haveNet), same(haveNet, wantNet), "A different profit means one of the postings above is off; fix the first account that does not match.");

  // ---- month end
  add("Month end", "Manual journal vouchers posted", `${set.manualVouchers.count} (total debits ${peso(set.manualVouchers.totalDebit)})`,
    `${s.vouchers.manual_posted} (total debits ${peso(Number(s.vouchers.total_manual_amount))})`,
    s.vouchers.manual_posted === set.manualVouchers.count && same(Number(s.vouchers.total_manual_amount), set.manualVouchers.totalDebit),
    "Finance → New journal voucher: one for the owner's capital and one for the November rent, both submitted so they post.");
  const p = s.periods.find((x) => x.period === set.month);
  add("Month end", `Month ${set.month}`, "closed", p ? p.status.toLowerCase() : "not settled", !!p && p.status === "CLOSED",
    "Period End: settle the month, then close it. Closing is the last step.");
  return out;
}

export function summarizeMfg(results: CheckResult[]) {
  const passed = results.filter((r) => r.pass).length;
  return { passed, failed: results.length - passed, total: results.length };
}

const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "Cash", "1100": "Accounts Receivable", "1160": "Input Tax (VAT)", "1200": "Raw Materials Inventory", "1210": "Work in Process",
  "1220": "Finished Goods Inventory", "1230": "Packaging & Supplies", "2000": "Accounts Payable", "2050": "Goods Received / Invoice Received (GR/IR)",
  "2200": "VAT Payable", "3000": "Owner's Equity", "4000": "Sales Revenue", "5000": "Cost of Goods Sold", "5100": "Operating Expenses",
  "5300": "Payroll Expense", "5500": "Purchase Price Variance", "5510": "Material Usage Variance", "5520": "Labor Efficiency Variance",
  "5540": "Machine / Variable Overhead Variance", "5550": "Fixed Overhead Volume Variance", "5560": "Scrap & Rework Loss",
  "5700": "Applied Direct Labor", "5710": "Applied Machine Overhead", "5720": "Applied Fixed Overhead",
};
