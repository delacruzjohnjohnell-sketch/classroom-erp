// Closing entries in REID order: (1) Revenue → Income Summary, (2) Expenses → Income Summary, (3) Income Summary → Capital, (4) Drawing → Capital.
// Under the periodic system, pass the ending inventory: it is debited in entry 1 and the beginning inventory is credited in entry 2.
import { createEntry, cr, dr } from "./journalizer";
import { balanceOf, postToLedger } from "./ledger-posting";
import type { Centavos } from "../lib/currency";
import type { JournalEntry, JournalLine } from "./types";

export interface Closing { entries: JournalEntry[]; netIncome: Centavos; isNetIncome: boolean }

export function closingEntries(entries: JournalEntry[], date: string, opts: { endingInventory?: Centavos } = {}): Closing {
  const ledger = postToLedger(entries, ["transaction", "adjusting"]);
  const temp = ledger.filter((l) => (l.account.type === "revenue" || l.account.type === "expense") && l.balance > 0);
  const creditBalances = temp.filter((l) => l.balanceSide === "credit");
  const debitBalances = temp.filter((l) => l.balanceSide === "debit");

  const one: JournalLine[] = creditBalances.map((l) => dr(l.account.code, l.balance));
  const two: JournalLine[] = debitBalances.map((l) => cr(l.account.code, l.balance));
  if (opts.endingInventory !== undefined) {
    if (opts.endingInventory > 0) one.push(dr("130", opts.endingInventory));
    const beginning = balanceOf(ledger, "130");
    if (beginning > 0) two.push(cr("130", beginning));
  }
  const revenueTotal = one.reduce((s, l) => s + l.debit, 0);
  const expenseTotal = two.reduce((s, l) => s + l.credit, 0);
  const out: JournalEntry[] = [];
  const add = (tag: string, lines: JournalLine[], explanation: string) => out.push(createEntry({ date, kind: "general", lines, explanation }, { stage: "closing", tag }));

  if (revenueTotal > 0) add("c1", [...one, cr("303", revenueTotal)], "To close the revenue accounts to Income Summary.");
  if (expenseTotal > 0) add("c2", [dr("303", expenseTotal), ...two], "To close the expense accounts to Income Summary.");
  const net = revenueTotal - expenseTotal;
  if (net > 0) add("c3", [dr("303", net), cr("301", net)], "To close Income Summary to Owner's Capital (net income).");
  else if (net < 0) add("c3", [dr("301", -net), cr("303", -net)], "To close Income Summary to Owner's Capital (net loss).");
  const drawing = balanceOf(ledger, "302");
  if (drawing > 0) add("c4", [dr("301", drawing), cr("302", drawing)], "To close Owner's Drawing to Owner's Capital.");
  return { entries: out, netIncome: Math.abs(net), isNetIncome: net >= 0 };
}
