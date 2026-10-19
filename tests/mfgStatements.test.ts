import test from "node:test";
import assert from "node:assert/strict";
import {
  assetClass, buildCashFlow, buildFinancialPosition, buildIncomeStatement, buildTrialBalance, fmtAmount, liabClass, longDate, monthEndBefore, plClass, priorPeriod, shortDate, toCsvRows, type Bal,
} from "../src/lib/mfgStatements.ts";

const b = (code: string, name: string, type: Bal["type"], closing: number): Bal => ({
  code, name, type, opening: 0, debit: closing > 0 ? closing : 0, credit: closing < 0 ? -closing : 0, closing,
});
// signed debit − credit. Assets 182,000; liabilities 35,000; equity 135,000; profit 12,000.
const books: Bal[] = [
  b("1000", "Cash", "asset", 50000), b("1100", "Accounts Receivable", "asset", 20000), b("1200", "Raw Materials Inventory", "asset", 10000),
  b("1210", "Work in Process", "asset", 5000), b("1220", "Finished Goods Inventory", "asset", 7000), b("1500", "Fixed Assets", "asset", 100000),
  b("1590", "Accumulated Depreciation", "asset", -10000),
  b("2000", "Accounts Payable", "liability", -30000), b("2050", "GR/IR", "liability", -5000),
  b("3000", "Owner's Equity", "equity", -135000),
  b("4000", "Sales Revenue", "revenue", -80000),
  b("5000", "Cost of Goods Sold", "expense", 40000), b("5500", "Purchase Price Variance", "expense", 1000),
  b("5100", "Operating Expenses", "expense", 15000), b("5300", "Payroll Expense", "expense", 20000), b("5700", "Applied Direct Labor", "expense", -8000),
  b("1160", "Input Tax (VAT)", "asset", 0),
];

test("amounts print the way accountants write them: thousands separators, brackets for negatives, a dash for nil", () => {
  assert.equal(fmtAmount(1234.5), "1,234.50");
  assert.equal(fmtAmount(-1234.5), "(1,234.50)");
  assert.equal(fmtAmount(0), "–");
  assert.equal(fmtAmount(0.004), "–");
  assert.equal(fmtAmount(null), "");
});

test("accounts are classified by their code into the PAS 1 groups", () => {
  assert.equal(assetClass("1000"), "cash");
  assert.equal(assetClass("1160"), "receivables");
  assert.equal(assetClass("1230"), "inventories");
  assert.equal(assetClass("1590"), "noncurrent");
  assert.equal(liabClass("2200"), "current");
  assert.equal(liabClass("2600"), "noncurrent");
  assert.equal(plClass("4000", "revenue"), "revenue");
  assert.equal(plClass("4100", "revenue"), "otherincome");
  assert.equal(plClass("5000", "expense"), "costofsales");
  assert.equal(plClass("5610", "expense"), "costofsales");
  assert.equal(plClass("5700", "expense"), "absorbed");
  assert.equal(plClass("5400", "expense"), "opex");
});

test("the trial balance lists every account with a balance, debits and credits equal, nil accounts left out", () => {
  const tb = buildTrialBalance(books);
  assert.equal(tb.debit, 268000);
  assert.equal(tb.credit, 268000);
  assert.equal(tb.balanced, true);
  assert.equal(tb.lines.some((l) => l.code === "1160"), false);
  assert.deepEqual(tb.lines.find((l) => l.code === "1590")?.values, [null, 10000]);
  assert.equal(buildTrialBalance([b("1000", "Cash", "asset", 100)]).balanced, false);
});

test("the statement of financial position balances: assets = equity + liabilities, with the profit to date in equity", () => {
  const p = buildFinancialPosition([books]);
  assert.deepEqual(p.assets, [182000]);
  assert.deepEqual(p.equityAndLiabilities, [182000]);
  assert.equal(p.balanced, true);
  assert.deepEqual(p.lines.find((l) => l.label.startsWith("Retained earnings"))?.values, [12000]);
  assert.deepEqual(p.lines.find((l) => l.label === "Total current assets")?.values, [92000]);
  assert.deepEqual(p.lines.find((l) => l.label === "Total non-current assets")?.values, [90000]);
  assert.deepEqual(p.lines.find((l) => l.label === "Total liabilities")?.values, [35000]);
  assert.deepEqual(p.lines.find((l) => l.label === "Total inventories")?.values, [22000]);
});

test("the statement of comprehensive income is by function and its profit is the profit in equity", () => {
  const i = buildIncomeStatement([books]);
  assert.deepEqual(i.revenue, [80000]);
  assert.deepEqual(i.grossProfit, [39000]);
  assert.deepEqual(i.profit, [12000]);
  assert.deepEqual(i.lines.find((l) => l.label === "Total cost of sales")?.values, [-41000]);
  assert.deepEqual(i.lines.find((l) => l.label === "Total operating expenses")?.values, [-27000]);
  assert.equal(i.lines.find((l) => l.label === "TOTAL COMPREHENSIVE INCOME FOR THE PERIOD")?.kind, "grand");
  const p = buildFinancialPosition([books]);
  assert.deepEqual(p.lines.find((l) => l.label.startsWith("Retained earnings"))?.values, i.profit);
});

test("a comparative column lines up row for row, even for an account that did not exist then", () => {
  const before: Bal[] = [b("1000", "Cash", "asset", 30000), b("3000", "Owner's Equity", "equity", -30000)];
  const p = buildFinancialPosition([books, before]);
  assert.deepEqual(p.assets, [182000, 30000]);
  assert.deepEqual(p.equityAndLiabilities, [182000, 30000]);
  assert.equal(p.balanced, true);
  assert.deepEqual(p.lines.find((l) => l.code === "1000")?.values, [50000, 30000]);
  assert.deepEqual(p.lines.find((l) => l.code === "1200")?.values, [10000, 0]);
  const i = buildIncomeStatement([books, [b("4000", "Sales Revenue", "revenue", -5000), b("5000", "Cost of Goods Sold", "expense", 3000)]]);
  assert.deepEqual(i.profit, [12000, 2000]);
});

test("a company with no trading yet still gets a complete, balanced statement", () => {
  const empty = [b("1000", "Cash", "asset", 1000), b("3000", "Owner's Equity", "equity", -1000), b("4000", "Sales Revenue", "revenue", 0)];
  const p = buildFinancialPosition([empty]);
  assert.equal(p.balanced, true);
  const i = buildIncomeStatement([empty]);
  assert.deepEqual(i.profit, [0]);
  assert.ok(i.lines.some((l) => l.label === "GROSS PROFIT"));
});

test("a statement exports as rows for CSV", () => {
  const rows = toCsvRows(buildTrialBalance(books).lines, ["Debit", "Credit"]);
  assert.deepEqual(rows[0], ["Account", "Debit", "Credit"]);
  assert.deepEqual(rows[1], ["1000 Cash", "50000.00", ""]);
  assert.deepEqual(rows[rows.length - 1], ["Total", "268000.00", "268000.00"]);
});

test("dates on a report read in full, and the comparative period is the stretch of time just before", () => {
  assert.equal(longDate("2026-11-30"), "30 November 2026");
  assert.equal(shortDate("2026-11-05"), "5 Nov 2026");
  assert.equal(monthEndBefore("2026-11-18"), "2026-10-31");
  assert.equal(monthEndBefore("2026-03-01"), "2026-02-28");
  assert.deepEqual(priorPeriod("2026-11-01", "2026-11-30"), { from: "2026-10-02", to: "2026-10-31" });
  assert.deepEqual(priorPeriod("2026-11-15", "2026-11-15"), { from: "2026-11-14", to: "2026-11-14" });
});

test("the cash flow statement (indirect) reconciles opening cash to closing cash from two sets of balances", () => {
  const open = [b("1000", "Cash", "asset", 100000), b("3000", "Owner's Equity", "equity", -100000)];
  const close = [
    b("1000", "Cash", "asset", 90000), b("1100", "Accounts Receivable", "asset", 30000), b("1200", "Raw Materials Inventory", "asset", 10000),
    b("1500", "Fixed Assets", "asset", 20000), b("1590", "Accumulated Depreciation", "asset", -2000),
    b("2000", "Accounts Payable", "liability", -10000), b("3000", "Owner's Equity", "equity", -115000),
    b("4000", "Sales Revenue", "revenue", -30000), b("5100", "Operating Expenses", "expense", 5000), b("5400", "Depreciation Expense", "expense", 2000),
  ];
  const cf = buildCashFlow(open, close);
  assert.equal(cf.operating, -5000);      // profit 23,000 + depreciation 2,000 − receivables 30,000 − inventory 10,000 + payables 10,000
  assert.equal(cf.investing, -20000);     // fixed assets bought for cash
  assert.equal(cf.financing, 15000);      // owner put in more capital
  assert.equal(cf.netChange, -10000);
  assert.equal(cf.openingCash, 100000);
  assert.equal(cf.closingCash, 90000);
  assert.equal(cf.reconciles, true);
  const labels = cf.lines.map((l) => l.label);
  assert.ok(labels.includes("Depreciation"));
  assert.ok(labels.includes("Increase in accounts receivable"));
  assert.ok(labels.includes("Acquisition of fixed assets"));
});

test("a period with no activity gives a cash flow of nil that still reconciles", () => {
  const rows = [b("1000", "Cash", "asset", 5000), b("3000", "Owner's Equity", "equity", -5000)];
  const cf = buildCashFlow(rows, rows);
  assert.equal(cf.netChange, 0);
  assert.equal(cf.reconciles, true);
});
