// PAS 1 style financial statements: Statement of Comprehensive Income (by nature for service, by function with cost of sales for merchandising),
// Changes in Equity, classified Financial Position, and Cash Flows. Subtotal lines get a single underline, total lines a double underline.
import { getAccount } from "./chart-of-accounts";
import { balanceOf, postToLedger } from "./ledger-posting";
import { sum, type Centavos } from "../lib/currency";
import type { BusinessType, InventorySystem, JournalEntry, LedgerAccount } from "./types";

export type LineKind = "header" | "item" | "subtotal" | "total";
export interface StatementLine { label: string; amount?: Centavos; indent: 0 | 1 | 2; kind: LineKind }
export interface Statement { title: string; subtitle: string; lines: StatementLine[] }

export interface StatementOptions {
  business: BusinessType;
  inventory?: InventorySystem;
  /** Physical count of merchandise at the end of the period (periodic system). */
  endingInventory?: Centavos;
  entity: string;
  /** e.g. "For the month ended December 31, 2026" */
  period: string;
  /** e.g. "December 31, 2026" */
  asOf: string;
}

export interface Statements {
  income: Statement; equity: Statement; position: Statement; cashFlows: Statement;
  netIncome: Centavos; endingCapital: Centavos; totalAssets: Centavos; totalLiabilitiesAndEquity: Centavos;
  balanced: boolean; cashReconciles: boolean;
}

const H = (label: string, indent: 0 | 1 | 2 = 0): StatementLine => ({ label, indent, kind: "header" });
const I = (label: string, amount: Centavos, indent: 0 | 1 | 2 = 1): StatementLine => ({ label, amount, indent, kind: "item" });
const S = (label: string, amount: Centavos, indent: 0 | 1 | 2 = 0): StatementLine => ({ label, amount, indent, kind: "subtotal" });
const T = (label: string, amount: Centavos, indent: 0 | 1 | 2 = 0): StatementLine => ({ label, amount, indent, kind: "total" });

const bal = (ledger: LedgerAccount[], code: string) => balanceOf(ledger, code);
const bySection = (ledger: LedgerAccount[], section: string) => ledger.filter((l) => l.account.section === section && l.balance > 0);

export function generateStatements(entries: JournalEntry[], o: StatementOptions): Statements {
  const ledger = postToLedger(entries, ["transaction", "adjusting"]);
  const periodic = o.business === "merchandising" && (o.inventory ?? "periodic") === "periodic";
  const lines: StatementLine[] = [];

  // ---- Income statement
  let revenueTotal: Centavos;
  if (o.business === "merchandising") {
    const gross = bal(ledger, "420"), returns = bal(ledger, "421"), disc = bal(ledger, "422");
    const netSales = gross - returns - disc;
    lines.push(H("Revenues"), I("Gross sales", gross), I("Less: Sales returns and allowances", -returns, 2), I("Sales discounts", -disc, 2), S("Net sales", netSales));
    let cogs: Centavos;
    if (periodic) {
      const begin = bal(ledger, "130"), purch = bal(ledger, "501"), pr = bal(ledger, "502"), pd = bal(ledger, "503"), fi = bal(ledger, "504");
      const netPurch = purch - pr - pd, delivered = netPurch + fi, available = begin + delivered, ending = o.endingInventory ?? 0;
      cogs = available - ending;
      lines.push(H("Cost of goods sold"), I("Merchandise inventory, beginning", begin), I("Purchases", purch, 2), I("Less: Purchase returns and allowances", -pr, 2), I("Purchase discounts", -pd, 2),
        I("Net purchases", netPurch), I("Add: Freight-in", fi, 2), I("Net cost of purchases", delivered), I("Goods available for sale", available), I("Less: Merchandise inventory, ending", -ending), S("Cost of goods sold", cogs));
    } else {
      cogs = bal(ledger, "505");
      lines.push(H("Cost of goods sold"), S("Cost of goods sold", cogs));
    }
    const gp = netSales - cogs;
    lines.push(S("Gross profit", gp));
    const other = bySection(ledger, "revenue").filter((l) => l.account.code !== "420");
    for (const l of other) lines.push(I(l.account.name, bal(ledger, l.account.code)));
    revenueTotal = gp + sum(other.map((l) => bal(ledger, l.account.code)));
  } else {
    const rev = bySection(ledger, "revenue");
    lines.push(H("Revenues"), ...rev.map((l) => I(l.account.name, bal(ledger, l.account.code))));
    revenueTotal = sum(rev.map((l) => bal(ledger, l.account.code)));
    lines.push(S("Total revenues", revenueTotal));
  }
  const exp = bySection(ledger, "operating-expense");
  const expTotal = sum(exp.map((l) => bal(ledger, l.account.code)));
  lines.push(H("Operating expenses"), ...exp.map((l) => I(l.account.name, bal(ledger, l.account.code))), S("Total operating expenses", expTotal));
  const netIncome = revenueTotal - expTotal;
  lines.push(T(netIncome >= 0 ? "Net income" : "Net loss", Math.abs(netIncome)));
  const income: Statement = { title: "Statement of Comprehensive Income", subtitle: o.period, lines };

  // ---- Changes in equity
  const capitalBegin = bal(ledger, "301"), drawings = bal(ledger, "302");
  const endingCapital = capitalBegin + netIncome - drawings;
  const equity: Statement = {
    title: "Statement of Changes in Equity", subtitle: o.period,
    lines: [I("Owner's capital, beginning", capitalBegin, 0), I(netIncome >= 0 ? "Add: Net income" : "Less: Net loss", Math.abs(netIncome), 1), I("Less: Owner's drawings", -drawings, 1), T("Owner's capital, ending", endingCapital)],
  };

  // ---- Financial position
  const asset = (code: string) => bal(ledger, code);
  const contraPair = (code: string, contraCode: string, label: string, lab2: string): StatementLine[] =>
    asset(code) || asset(contraCode) ? [I(label, asset(code), 1), I(lab2, -asset(contraCode), 2), I(`${label}, net`, asset(code) - asset(contraCode), 1)] : [];
  const ar = contraPair("110", "110-A", "Accounts receivable", "Less: Allowance for uncollectible accounts");
  const inventory = periodic ? (o.endingInventory ?? 0) : bal(ledger, "130");
  const plain = (codes: string[]) => codes.filter((c) => asset(c) !== 0).map((c) => I(getAccount(c)!.name, asset(c)));
  const currentAssets = asset("101") + asset("102") + (asset("110") - asset("110-A")) + asset("120") + inventory + asset("140") + asset("141") + asset("150") + asset("151");
  const oe = [...contraPair("160", "160-A", "Office equipment", "Less: Accumulated depreciation"), ...contraPair("170", "170-A", "Delivery equipment", "Less: Accumulated depreciation")];
  const ppe = asset("160") - asset("160-A") + asset("170") - asset("170-A");
  const liabCurrent = ["201", "202", "210", "220", "230"].filter((c) => bal(ledger, c) !== 0);
  const totalLiab = sum(liabCurrent.map((c) => bal(ledger, c)));
  const totalAssets = currentAssets + ppe;
  const position: Statement = {
    title: "Statement of Financial Position", subtitle: `As of ${o.asOf}`,
    lines: [
      H("Assets"), H("Current assets", 1), ...plain(["101", "102"]), ...ar, ...plain(["120"]),
      ...(inventory ? [I("Merchandise inventory", inventory)] : []), ...plain(["140", "141", "150", "151"]),
      S("Total current assets", currentAssets, 1),
      ...(ppe ? [H("Property and equipment", 1), ...oe, S("Total property and equipment", ppe, 1)] : []),
      T("Total assets", totalAssets),
      H("Liabilities"), ...liabCurrent.map((c) => I(getAccount(c)!.name, bal(ledger, c))), S("Total liabilities", totalLiab),
      H("Owner's equity"), I("Owner's capital, ending", endingCapital), T("Total liabilities and owner's equity", totalLiab + endingCapital),
    ],
  };

  // ---- Cash flows (direct method), classified by what the cash was exchanged for
  const INVESTING = new Set(["120", "160", "170"]);
  const FINANCING = new Set(["301", "302", "202"]);
  let opIn = 0, opOut = 0;
  const investing = new Map<string, number>(), financing = new Map<string, number>();
  for (const e of entries.filter((x) => x.stage === "transaction")) {
    const cash = sum(e.lines.filter((l) => l.accountCode === "101").map((l) => l.debit - l.credit));
    if (cash === 0) continue;
    const others = e.lines.filter((l) => l.accountCode !== "101");
    const inv = others.find((l) => INVESTING.has(l.accountCode)), fin = others.find((l) => FINANCING.has(l.accountCode));
    if (inv) investing.set(getAccount(inv.accountCode)!.name, (investing.get(getAccount(inv.accountCode)!.name) ?? 0) + cash);
    else if (fin) financing.set(getAccount(fin.accountCode)!.name, (financing.get(getAccount(fin.accountCode)!.name) ?? 0) + cash);
    else if (cash > 0) opIn += cash; else opOut += cash;
  }
  const flowLines = (m: Map<string, number>) => [...m.entries()].map(([k, v]) => I(k, v));
  const opNet = opIn + opOut, invNet = sum([...investing.values()]), finNet = sum([...financing.values()]);
  const netChange = opNet + invNet + finNet;
  const cashFlows: Statement = {
    title: "Statement of Cash Flows", subtitle: o.period,
    lines: [
      H("Cash flows from operating activities"), I("Cash received from customers and others", opIn), I("Cash paid to suppliers, employees and others", opOut), S("Net cash from operating activities", opNet),
      H("Cash flows from investing activities"), ...flowLines(investing), S("Net cash from investing activities", invNet),
      H("Cash flows from financing activities"), ...flowLines(financing), S("Net cash from financing activities", finNet),
      S("Net increase (decrease) in cash", netChange), I("Cash, beginning", 0, 0), T("Cash, ending", netChange),
    ],
  };

  return {
    income, equity, position, cashFlows, netIncome, endingCapital, totalAssets, totalLiabilitiesAndEquity: totalLiab + endingCapital,
    balanced: totalAssets === totalLiab + endingCapital, cashReconciles: netChange === asset("101"),
  };
}
