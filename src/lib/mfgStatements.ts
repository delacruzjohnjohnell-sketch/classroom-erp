// Financial statements for a Manufacturing company, laid out the way PAS 1 (IAS 1) asks for them.
// Every statement is built from one list of account balances (mfg_account_balances), so the trial balance, the statement of financial
// position and the statement of comprehensive income cannot disagree with each other or with the books.
// No imports, so the unit tests can load this file directly.

export type Bal = {
  code: string; name: string; type: "asset" | "liability" | "equity" | "revenue" | "expense";
  opening: number; debit: number; credit: number; closing: number;
};

export type LineKind = "heading" | "line" | "subtotal" | "total" | "grand";
/** One printed line. `values` has one entry per column (current period, then the comparative if there is one); null prints as a blank. */
export type Line = { label: string; code?: string; values: (number | null)[]; kind: LineKind; indent?: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (c: string) => Number.parseInt(c, 10);
const isZero = (n: number) => Math.abs(n) < 0.005;

/** Accounting layout of a peso amount: 1,234.50 — negatives in brackets (1,234.50) — nil as a dash. */
export function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "";
  const v = r2(n);
  if (isZero(v)) return "–";
  const s = Math.abs(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}

// ---------- classification by account code (the chart of accounts every Manufacturing company starts with) ----------
export type AssetClass = "cash" | "receivables" | "inventories" | "othercurrent" | "noncurrent";
export function assetClass(code: string): AssetClass {
  const c = num(code);
  if (c >= 1500) return "noncurrent";
  if (c >= 1300) return "othercurrent";
  if (c >= 1200) return "inventories";
  if (c >= 1100) return "receivables";
  return "cash";
}
export type LiabClass = "current" | "noncurrent";
export const liabClass = (code: string): LiabClass => (num(code) >= 2500 ? "noncurrent" : "current");
export type PlClass = "revenue" | "otherincome" | "costofsales" | "opex" | "absorbed";
export function plClass(code: string, type: string): PlClass {
  const c = num(code);
  if (type === "revenue") return c < 4100 ? "revenue" : "otherincome";
  if (c >= 5700 && c < 5800) return "absorbed";
  if (c === 5000 || (c >= 5500 && c < 5700)) return "costofsales";
  return "opex";
}

type Cols = Bal[][];   // [current rows, comparative rows?]
const find = (rows: Bal[], code: string) => rows.find((r) => r.code === code);
const blank = (cols: Cols) => cols.map(() => null as number | null);
const hasAny = (v: (number | null)[]) => v.some((x) => x != null && !isZero(x));
const totals = (cols: Cols, vs: number[][]) => cols.map((_, i) => r2(vs.reduce((s, v) => s + v[i], 0)));

/** Every account that appears in any column, in code order, so a comparative column lines up row for row. */
function codesOf(cols: Cols, pick: (b: Bal) => boolean): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const rows of cols) for (const b of rows) if (pick(b) && !seen.has(b.code)) seen.set(b.code, b.name);
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ code, name }));
}

// ---------- trial balance ----------
export type TrialBalance = { lines: Line[]; debit: number; credit: number; balanced: boolean };
export function buildTrialBalance(rows: Bal[]): TrialBalance {
  const lines: Line[] = [];
  let debit = 0, credit = 0;
  for (const b of [...rows].sort((a, c) => a.code.localeCompare(c.code))) {
    if (isZero(b.closing)) continue;
    const dr = b.closing > 0 ? r2(b.closing) : null;
    const cr = b.closing < 0 ? r2(-b.closing) : null;
    debit += dr ?? 0; credit += cr ?? 0;
    lines.push({ label: b.name, code: b.code, values: [dr, cr], kind: "line" });
  }
  debit = r2(debit); credit = r2(credit);
  lines.push({ label: "Total", values: [debit, credit], kind: "grand" });
  return { lines, debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
}

// ---------- statement of financial position ----------
export type Position = { lines: Line[]; assets: number[]; equityAndLiabilities: number[]; balanced: boolean };
export function buildFinancialPosition(cols: Cols): Position {
  const lines: Line[] = [];
  const profit = (rows: Bal[]) => r2(-rows.filter((b) => b.type === "revenue" || b.type === "expense").reduce((s, b) => s + b.closing, 0));
  const amount = (code: string, rows: Bal[], sign: 1 | -1) => r2(sign * (find(rows, code)?.closing ?? 0));

  /** Prints the accounts of one group (indented) and returns its total per column, or null when every account is nil. */
  const group = (accs: { code: string; name: string }[], sign: 1 | -1, indent: number): number[] | null => {
    const body = accs.map((a) => ({ a, v: cols.map((rows) => amount(a.code, rows, sign)) })).filter((x) => hasAny(x.v));
    if (!body.length) return null;
    for (const x of body) lines.push({ label: x.a.name, code: x.a.code, values: x.v, kind: "line", indent });
    return totals(cols, body.map((x) => x.v));
  };
  const heading = (label: string, indent = 0) => lines.push({ label, values: blank(cols), kind: "heading", indent });
  const subtotal = (label: string, values: number[], indent = 0) => lines.push({ label, values, kind: "subtotal", indent });

  const assetAccs = codesOf(cols, (b) => b.type === "asset");
  const pick = (cls: AssetClass) => assetAccs.filter((a) => assetClass(a.code) === cls);

  heading("ASSETS");
  heading("Non-current assets", 1);
  const nc = group(pick("noncurrent"), 1, 2);
  if (nc) subtotal("Total non-current assets", nc, 1);
  heading("Current assets", 1);
  const parts: number[][] = [];
  for (const [cls, title] of [["cash", "Cash and cash equivalents"], ["receivables", "Trade and other receivables"], ["inventories", "Inventories"], ["othercurrent", "Other current assets"]] as const) {
    const accs = pick(cls);
    const live = accs.filter((a) => cols.some((rows) => !isZero(amount(a.code, rows, 1))));
    if (live.length > 1) heading(title, 2);
    const t = group(accs, 1, live.length > 1 ? 3 : 2);
    if (t) {
      if (live.length > 1) subtotal(`Total ${title.toLowerCase()}`, t, 2);
      parts.push(t);
    }
  }
  const ca = totals(cols, parts);
  subtotal("Total current assets", ca, 1);
  const assets = cols.map((_, i) => r2((nc?.[i] ?? 0) + ca[i]));
  lines.push({ label: "TOTAL ASSETS", values: assets, kind: "grand" });

  heading("EQUITY AND LIABILITIES");
  heading("Equity", 1);
  const eq = group(codesOf(cols, (b) => b.type === "equity"), -1, 2) ?? cols.map(() => 0);
  const earned = cols.map((rows) => profit(rows));
  lines.push({ label: "Retained earnings (accumulated profit to date)", values: earned, kind: "line", indent: 2 });
  const equity = cols.map((_, i) => r2(eq[i] + earned[i]));
  subtotal("Total equity", equity, 1);

  const liabAccs = codesOf(cols, (b) => b.type === "liability");
  heading("Non-current liabilities", 1);
  const ncl = group(liabAccs.filter((a) => liabClass(a.code) === "noncurrent"), -1, 2);
  if (ncl) subtotal("Total non-current liabilities", ncl, 1);
  heading("Current liabilities", 1);
  const cl = group(liabAccs.filter((a) => liabClass(a.code) === "current"), -1, 2);
  if (cl) subtotal("Total current liabilities", cl, 1);
  const liab = cols.map((_, i) => r2((ncl?.[i] ?? 0) + (cl?.[i] ?? 0)));
  subtotal("Total liabilities", liab, 1);
  const eql = cols.map((_, i) => r2(equity[i] + liab[i]));
  lines.push({ label: "TOTAL EQUITY AND LIABILITIES", values: eql, kind: "grand" });
  return { lines, assets, equityAndLiabilities: eql, balanced: assets.every((a, i) => Math.abs(a - eql[i]) < 0.01) };
}

// ---------- statement of comprehensive income (expenses by function) ----------
export type Income = { lines: Line[]; revenue: number[]; grossProfit: number[]; profit: number[] };
export function buildIncomeStatement(cols: Cols): Income {
  const lines: Line[] = [];
  const pl = codesOf(cols, (b) => b.type === "revenue" || b.type === "expense");
  const typeOf = (code: string) => cols.map((rows) => find(rows, code)).find(Boolean)!.type;
  // revenue is a positive amount; costs are positive costs; the credit for production costs absorbed into inventory is a negative cost
  const amount = (code: string, rows: Bal[]) => {
    const b = find(rows, code);
    if (!b) return 0;
    return r2(b.type === "revenue" ? b.credit - b.debit : b.debit - b.credit);
  };
  const block = (c: PlClass, indent: number): number[] | null => {
    const body = pl.filter((a) => plClass(a.code, typeOf(a.code)) === c)
      .map((a) => ({ a, v: cols.map((rows) => amount(a.code, rows)) })).filter((x) => hasAny(x.v));
    if (!body.length) return null;
    for (const x of body) lines.push({ label: x.a.name, code: x.a.code, values: x.v, kind: "line", indent });
    return totals(cols, body.map((x) => x.v));
  };
  const zero = cols.map(() => 0);
  const neg = (v: number[]) => v.map((x) => r2(-x));

  lines.push({ label: "Revenue", values: blank(cols), kind: "heading" });
  const revenue = block("revenue", 1) ?? zero;
  lines.push({ label: "Total revenue", values: revenue, kind: "subtotal" });

  lines.push({ label: "Cost of sales", values: blank(cols), kind: "heading" });
  const cos = block("costofsales", 1) ?? zero;
  lines.push({ label: "Total cost of sales", values: neg(cos), kind: "subtotal" });
  const gross = cols.map((_, i) => r2(revenue[i] - cos[i]));
  lines.push({ label: "GROSS PROFIT", values: gross, kind: "total" });

  const oiAt = lines.length;
  lines.push({ label: "Other income", values: blank(cols), kind: "heading" });
  const oi = block("otherincome", 1);
  if (!oi) lines.splice(oiAt, 1);

  lines.push({ label: "Operating expenses", values: blank(cols), kind: "heading" });
  const ox = block("opex", 1) ?? zero;
  const ab = block("absorbed", 1) ?? zero;
  const opex = cols.map((_, i) => r2(ox[i] + ab[i]));
  lines.push({ label: "Total operating expenses", values: neg(opex), kind: "subtotal" });

  const profit = cols.map((_, i) => r2(gross[i] + (oi?.[i] ?? 0) - opex[i]));
  lines.push({ label: "PROFIT FOR THE PERIOD", values: profit, kind: "total" });
  lines.push({ label: "Other comprehensive income", values: zero, kind: "line", indent: 1 });
  lines.push({ label: "TOTAL COMPREHENSIVE INCOME FOR THE PERIOD", values: profit, kind: "grand" });
  return { lines, revenue, grossProfit: gross, profit };
}

// ---------- statement of cash flows (PAS 7, indirect method) ----------
export type CashFlow = { lines: Line[]; operating: number; investing: number; financing: number; netChange: number; openingCash: number; closingCash: number; reconciles: boolean };
/**
 * Built from two sets of cumulative balances: the day before the period starts (`open`) and the last day of the period (`close`).
 * Profit is the change in the income and expense accounts between them; depreciation is the change in the depreciation expense account.
 * Because the balance sheet always balances, operating + investing + financing equals the change in cash; `reconciles` says whether it does.
 */
export function buildCashFlow(open: Bal[], close: Bal[]): CashFlow {
  const codes = new Map<string, Bal>();
  for (const b of [...open, ...close]) if (!codes.has(b.code)) codes.set(b.code, b);
  const bal = (rows: Bal[], code: string) => find(rows, code)?.closing ?? 0;
  const change = (code: string) => r2(bal(close, code) - bal(open, code));   // debit-positive
  const accs = [...codes.values()].sort((a, b) => a.code.localeCompare(b.code));

  const cash = accs.filter((a) => a.type === "asset" && assetClass(a.code) === "cash");
  const openingCash = r2(cash.reduce((s, a) => s + bal(open, a.code), 0));
  const closingCash = r2(cash.reduce((s, a) => s + bal(close, a.code), 0));

  const profit = r2(-accs.filter((a) => a.type === "revenue" || a.type === "expense").reduce((s, a) => s + change(a.code), 0));
  const dep = r2(change("5400"));
  const one = (v: number): (number | null)[] => [r2(v)];
  const lines: Line[] = [];
  const heading = (label: string, indent = 0) => lines.push({ label, values: [null], kind: "heading", indent });
  const push = (label: string, v: number, indent = 1) => { if (!isZero(v)) lines.push({ label, values: one(v), kind: "line", indent }); };

  heading("Cash flows from operating activities");
  lines.push({ label: "Profit for the period", values: one(profit), kind: "line", indent: 1 });
  let operating = profit;
  if (!isZero(dep)) { heading("Adjustments for", 1); push("Depreciation", dep, 2); operating += dep; }
  const wc: Line[] = [];
  for (const a of accs) {
    if (a.type === "asset" && ["receivables", "inventories", "othercurrent"].includes(assetClass(a.code))) {
      const v = r2(-change(a.code));
      if (!isZero(v)) { wc.push({ label: `${v < 0 ? "Increase" : "Decrease"} in ${a.name.toLowerCase()}`, values: one(v), kind: "line", indent: 2 }); operating += v; }
    } else if (a.type === "liability" && liabClass(a.code) === "current") {
      const v = r2(-change(a.code));
      if (!isZero(v)) { wc.push({ label: `${v > 0 ? "Increase" : "Decrease"} in ${a.name.toLowerCase()}`, values: one(v), kind: "line", indent: 2 }); operating += v; }
    }
  }
  if (wc.length) { heading("Changes in working capital", 1); lines.push(...wc); }
  operating = r2(operating);
  lines.push({ label: "Net cash from operating activities", values: one(operating), kind: "subtotal" });

  // investing: non-current assets other than the depreciation already added back
  heading("Cash flows from investing activities");
  const nc = accs.filter((a) => a.type === "asset" && assetClass(a.code) === "noncurrent");
  const investing = r2(-(nc.reduce((s, a) => s + change(a.code), 0) + dep));
  for (const a of nc.filter((x) => x.code !== "1590")) push(`${change(a.code) >= 0 ? "Acquisition of" : "Disposal of"} ${a.name.toLowerCase()}`, -change(a.code));
  lines.push({ label: "Net cash used in investing activities", values: one(investing), kind: "subtotal" });

  // financing: owner's equity accounts and non-current borrowings
  heading("Cash flows from financing activities");
  let financing = 0;
  for (const a of accs) {
    const isEq = a.type === "equity", isLoan = a.type === "liability" && liabClass(a.code) === "noncurrent";
    if (!isEq && !isLoan) continue;
    const v = r2(-change(a.code));
    financing += v;
    push(isEq ? (v >= 0 ? `Contributions to ${a.name.toLowerCase()}` : `Withdrawals from ${a.name.toLowerCase()}`) : (v >= 0 ? `Proceeds from ${a.name.toLowerCase()}` : `Repayment of ${a.name.toLowerCase()}`), v);
  }
  financing = r2(financing);
  lines.push({ label: "Net cash from financing activities", values: one(financing), kind: "subtotal" });

  const netChange = r2(operating + investing + financing);
  lines.push({ label: "NET INCREASE (DECREASE) IN CASH AND CASH EQUIVALENTS", values: one(netChange), kind: "total" });
  lines.push({ label: "Cash and cash equivalents at the beginning of the period", values: one(openingCash), kind: "line" });
  lines.push({ label: "CASH AND CASH EQUIVALENTS AT THE END OF THE PERIOD", values: one(closingCash), kind: "grand" });
  return { lines, operating, investing, financing, netChange, openingCash, closingCash, reconciles: Math.abs(openingCash + netChange - closingCash) < 0.01 };
}

/** A statement as plain rows for CSV: the account (with its code), then one cell per column. */
export function toCsvRows(lines: Line[], headers: string[]): string[][] {
  const rows: string[][] = [["Account", ...headers]];
  for (const l of lines) rows.push([l.code ? `${l.code} ${l.label}` : l.label, ...l.values.map((v) => (v == null ? "" : r2(v).toFixed(2)))]);
  return rows;
}

// ---------- dates on a report ----------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
/** 2026-11-30 → "30 November 2026" (written out, not left to the browser's locale, so it reads the same everywhere) */
export const longDate = (s: string) => { const p = parts(s); return `${p.d} ${MONTHS[p.m]} ${p.y}`; };
/** 2026-11-30 → "30 Nov 2026" */
export const shortDate = (s: string) => { const p = parts(s); return `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`; };
/** The last day of the month before the one that holds `s`: 2026-11-18 → 2026-10-31. */
export const monthEndBefore = (s: string) => { const d = new Date(`${s}T00:00:00`); d.setDate(0); return iso(d); };
/** The same stretch of time immediately before [from, to]: used for the comparative column of an income statement. */
export function priorPeriod(from: string, to: string): { from: string; to: string } {
  const a = new Date(`${from}T00:00:00`), z = new Date(`${to}T00:00:00`);
  const days = Math.round((z.getTime() - a.getTime()) / 86400000) + 1;
  const pz = new Date(a); pz.setDate(pz.getDate() - 1);
  const pa = new Date(pz); pa.setDate(pa.getDate() - (days - 1));
  return { from: iso(pa), to: iso(pz) };
}
