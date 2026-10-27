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
  // read by mfg_practice_snapshot_a2 (migration 0059); absent in a plain mfg_practice_snapshot
  quality_plans?: { item: string; characteristic: string; min: number | null; max: number | null }[];
  quality_flags?: { item: string; receipt: boolean; production: boolean }[];
  inspection_lots?: { item: string; source: string; qty: number; status: string; accept: number; scrap: number; return: number; rework: number }[];
  ncrs?: { item: string; root_cause: string; qty: number; status: string; action_written: boolean }[];
  batches?: { item: string; batch_no: string; expiry: string }[];
  assets?: { name: string; cost: number; salvage: number; life: number; accumulated: number }[];
  payments?: { received: number; received_count: number; made: number; made_count: number };
  reversals?: { confirmations: number; vouchers: number };
  downtime?: { work_center: string; hours: number; category: string }[];
  bills?: { total: number; status: string }[];
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
  vendorInvoices: { total: number; invoiceDate: string; due: string; status?: string }[];
  orders: { item: string; planned: number; good: number; scrap: number }[];
  invoices: { total: number; date: string; due: string }[];
  balances: { code: string; amount: number; hint?: string }[];   // amount = debit minus credit (a credit balance is negative)
  manualVouchers: { count: number; totalDebit: number };
  month?: string;                                                 // 'YYYY-MM', must be CLOSED
  months?: string[];                                              // a set that runs over several months lists them all here, in order
  profitLabel?: string;                                           // e.g. "December and January"; default "November"
  // ---- areas added by Activity 2 (all optional, so Activity 1 is unchanged)
  quality?: {
    plans: { item: string; characteristic: string; min: number | null; max: number | null }[];
    flags: { item: string; receipt: boolean; production: boolean }[];
    lots: { item: string; qty: number; accept: number; scrap: number; return: number; rework: number }[];
    ncrs: { item: string; rootCause: string; qty: number }[];
  };
  batches?: { item: string; batchNo: string; expiry: string }[];
  assets?: { name: string; cost: number; salvage: number; life: number; accumulated: number }[];
  payments?: { received: number; receivedCount: number; made: number; madeCount: number };
  reversals?: { confirmations: number; vouchers: number };
  downtime?: { workCenter: string; hours: number; category: string }[];
  bills?: number[];                                               // every vendor bill total (invoices and landed-cost bills), any order
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
    const wantStatus = vi.status ?? "POSTED";
    const f = s.vendor_invoices.find((x) => same(Number(x.total), vi.total) && x.status === wantStatus) ?? s.vendor_invoices.find((x) => same(Number(x.total), vi.total));
    add("Purchasing", `Vendor invoice of ${peso(vi.total)}`, `${wantStatus.toLowerCase()} ${vi.invoiceDate}, due ${vi.due}`, f ? `${f.status.toLowerCase()} ${f.invoice_date ?? ""}, due ${f.due_date ?? "—"}` : "not found",
      !!f && f.status === wantStatus && f.invoice_date === vi.invoiceDate && f.due_date === vi.due, "Enter the vendor invoice against the order, with the invoice date, due date and 12% tax from the set.");
  }
  add("Purchasing", "Vendor invoices", `${set.vendorInvoices.length}`, `${s.vendor_invoices.length}`, s.vendor_invoices.length === set.vendorInvoices.length,
    "Compare with the vendor invoices in the set. A missing or duplicated invoice shows here; an invoice left uninvoiced on purpose is explained in the set.");

  // ---- production
  const usedOrders = new Set<number>();
  for (const o of set.orders) {
    const at = s.orders.findIndex((x, i) => !usedOrders.has(i) && x.item === o.item && same(Number(x.planned), o.planned));
    if (at >= 0) usedOrders.add(at);
    const f = at >= 0 ? s.orders[at] : s.orders.find((x) => x.item === o.item);
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
  add("Ledger balances", `Net profit for ${set.profitLabel ?? "November"}`, peso(wantNet), peso(haveNet), same(haveNet, wantNet), "A different profit means one of the postings above is off; fix the first account that does not match.");

  // ---- month end
  add("Month end", "Manual journal vouchers posted", `${set.manualVouchers.count} (total debits ${peso(set.manualVouchers.totalDebit)})`,
    `${s.vouchers.manual_posted} (total debits ${peso(Number(s.vouchers.total_manual_amount))})`,
    s.vouchers.manual_posted === set.manualVouchers.count && same(Number(s.vouchers.total_manual_amount), set.manualVouchers.totalDebit),
    "Finance → New journal voucher: one for the owner's capital and one for the November rent, both submitted so they post.");
  for (const month of set.months ?? (set.month ? [set.month] : [])) {
    const p = s.periods.find((x) => x.period === month);
    add("Month end", `Month ${month}`, "closed", p ? p.status.toLowerCase() : "not settled", !!p && p.status === "CLOSED",
      "Period End: settle the month, then close it. Closing is the last step, and an earlier month must be closed before the next.");
  }

  // ---- Activity 2 areas (only when the set lists them)
  const q = set.quality;
  if (q) {
    for (const f of q.flags) {
      const h = (s.quality_flags ?? []).find((x) => x.item === f.item);
      add("Quality", `Inspection set for ${f.item}`, `on receipt ${f.receipt ? "yes" : "no"}, in production ${f.production ? "yes" : "no"}`,
        h ? `on receipt ${h.receipt ? "yes" : "no"}, in production ${h.production ? "yes" : "no"}` : "not switched on", !!h && h.receipt === f.receipt && h.production === f.production,
        "Quality → Plans and settings: tick the inspection setting for this item.");
    }
    for (const p of q.plans) {
      const h = (s.quality_plans ?? []).find((x) => x.item === p.item && x.characteristic === p.characteristic);
      const spec = (a: number | null, b: number | null) => `${a == null ? "—" : num(Number(a))} to ${b == null ? "—" : num(Number(b))}`;
      add("Quality", `Inspection plan ${p.item}: ${p.characteristic}`, spec(p.min, p.max), h ? spec(h.min, h.max) : "no plan", !!h && spec(h.min, h.max) === spec(p.min, p.max),
        "Quality → Plans and settings: one characteristic with the minimum and maximum from the set.");
    }
    q.lots.forEach((l, i) => {
      const h = (s.inspection_lots ?? []).filter((x) => x.item === l.item)[i];
      add("Quality", `Inspection lot ${i + 1} of ${l.item}`, `${l.qty}: accept ${l.accept}, scrap ${l.scrap}, return ${l.return}`,
        h ? `${num(Number(h.qty))}: accept ${num(Number(h.accept))}, scrap ${num(Number(h.scrap))}, return ${num(Number(h.return))}` : "no lot",
        !!h && same(Number(h.qty), l.qty) && same(Number(h.accept), l.accept) && same(Number(h.scrap), l.scrap) && same(Number(h.return), l.return) && same(Number(h.rework), l.rework),
        "Receive the goods into Quarantine, record the measurement, then decide the accepted, scrapped and returned quantities exactly as the set says.");
    });
    q.ncrs.forEach((n, i) => {
      const h = (s.ncrs ?? [])[i];
      add("Quality", `Non-conformance report ${i + 1}`, `${n.item}, ${n.rootCause}, ${n.qty}, closed with a corrective action`,
        h ? `${h.item}, ${h.root_cause}, ${num(Number(h.qty))}, ${h.status.toLowerCase()}${h.action_written ? " with an action" : " without an action"}` : "none",
        !!h && h.item === n.item && h.root_cause === n.rootCause && same(Number(h.qty), n.qty) && h.status === "CLOSED" && h.action_written,
        "A decision that returns or scraps goods raises a report by itself. Choose the root cause in the decision, then close the report with a corrective action.");
    });
  }
  for (const b of set.batches ?? []) {
    const h = (s.batches ?? []).find((x) => x.item === b.item && x.batch_no === b.batchNo);
    add("Purchasing", `Batch ${b.batchNo} of ${b.item}`, `expires ${b.expiry}`, h ? `expires ${h.expiry}` : "not received", !!h && h.expiry === b.expiry,
      "Receive the batch-tracked item with the lot number and the expiry date from the set.");
  }
  for (const a of set.assets ?? []) {
    const h = (s.assets ?? []).find((x) => x.name === a.name);
    add("Fixed assets", a.name, `cost ${peso(a.cost)}, salvage ${peso(a.salvage)}, ${a.life} months, depreciation so far ${peso(a.accumulated)}`,
      h ? `cost ${peso(Number(h.cost))}, salvage ${peso(Number(h.salvage))}, ${h.life} months, depreciation so far ${peso(Number(h.accumulated))}` : "not registered",
      !!h && same(Number(h.cost), a.cost) && same(Number(h.salvage), a.salvage) && h.life === a.life && same(Number(h.accumulated), a.accumulated),
      "Fixed Assets: register the asset with the set's cost, salvage value and life, and record one month's depreciation for each month closed.");
  }
  if (set.payments) {
    const p = s.payments;
    add("Payments", "Customer payments received", `${set.payments.receivedCount} payments, ${peso(set.payments.received)}`, p ? `${p.received_count} payments, ${peso(Number(p.received))}` : "none",
      !!p && p.received_count === set.payments.receivedCount && same(Number(p.received), set.payments.received), "Sales → record each customer payment with the amount and date from the set.");
    add("Payments", "Vendor payments made", `${set.payments.madeCount} payments, ${peso(set.payments.made)}`, p ? `${p.made_count} payments, ${peso(Number(p.made))}` : "none",
      !!p && p.made_count === set.payments.madeCount && same(Number(p.made), set.payments.made), "Purchasing → Vendor invoices: pay each invoice with the amount from the set.");
  }
  if (set.bills) {
    const have = (s.bills ?? []).map((b) => Number(b.total)).sort((a, b) => a - b);
    const want = [...set.bills].sort((a, b) => a - b);
    add("Purchasing", "Vendor bills (invoices and landed cost)", want.map(peso).join(", "), have.map(peso).join(", ") || "none",
      have.length === want.length && have.every((v, i) => same(v, want[i])), "Every posted vendor invoice and the landed-cost bill must be there once; a rejected or voided invoice is not a bill.");
  }
  if (set.reversals) {
    const r = s.reversals;
    add("Corrections", "Reversed production confirmations", `${set.reversals.confirmations}`, `${r?.confirmations ?? 0}`, (r?.confirmations ?? 0) === set.reversals.confirmations,
      "Reverse the wrong confirmation from the order screen (do not edit it), then post the right one.");
    add("Corrections", "Reversed journal vouchers", `${set.reversals.vouchers}`, `${r?.vouchers ?? 0}`, (r?.vouchers ?? 0) === set.reversals.vouchers,
      "Finance: reverse the wrongly booked voucher, then post a new one to the right account.");
  }
  for (const d of set.downtime ?? []) {
    const h = (s.downtime ?? []).find((x) => x.work_center === d.workCenter && x.category === d.category);
    add("Shop floor", `Downtime on ${d.workCenter}`, `${d.hours} h, ${d.category.toLowerCase().replace(/_/g, " ")}`, h ? `${num(Number(h.hours))} h, ${h.category.toLowerCase().replace(/_/g, " ")}` : "not logged",
      !!h && same(Number(h.hours), d.hours), "Shop Floor → Downtime: log the hours and the reason from the set.");
  }
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
