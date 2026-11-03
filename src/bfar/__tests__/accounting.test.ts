import { describe, expect, it } from "vitest";
import { formatAmount, formatPeso, parsePesos, percentOf, roundDiv } from "../lib/currency";
import { CHART_OF_ACCOUNTS, getAccount, searchAccounts } from "../core/chart-of-accounts";
import { balanceMessage, createEntry, cr, dr, validateEntry } from "../core/journalizer";
import { balanceOf, postToLedger, toTAccount } from "../core/ledger-posting";
import { trialBalance } from "../core/trial-balance";
import * as adj from "../core/adjustments-engine";
import { buildWorksheet } from "../core/worksheet-engine";
import { closingEntries } from "../core/closing-engine";
import { postClosingTrialBalance } from "../core/post-closing-tb";
import { reversingEntries } from "../core/reversing-engine";
import { generateStatements } from "../core/statements-generator";
import { evaluateEntry, gradeAnswers } from "../core/evaluator";
import { PRACTICE_SETS, practiceItems, solutionEntries } from "../practice-sets";
import { CLEANPRO } from "../practice-sets/cleanpro";
import { METRO } from "../practice-sets/metro";
import { P } from "../practice-sets/types";

describe("currency (integer centavos)", () => {
  it("parses and formats pesos without floating point error", () => {
    expect(parsePesos("1,234.50")).toBe(123450);
    expect(parsePesos("₱0.1")).toBe(10);
    expect(parsePesos("(500)")).toBe(-50000);
    expect(parsePesos("abc")).toBeNull();
    expect(parsePesos("")).toBeNull();
    expect(formatPeso(123450)).toBe("₱1,234.50");
    expect(formatPeso(-5000)).toBe("(₱50.00)");
    expect(formatAmount(5)).toBe("0.05");
  });
  it("adds 0.1 + 0.2 exactly", () => {
    expect(parsePesos("0.1")! + parsePesos("0.2")!).toBe(parsePesos("0.3"));
  });
  it("rounds half away from zero", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(percentOf(P(33000), 2)).toBe(P(660));
    expect(percentOf(P(100.5), 2)).toBe(201);
  });
});

describe("chart of accounts", () => {
  it("has Ballada's codes and normal balances", () => {
    expect(getAccount("101")?.name).toBe("Cash");
    expect(getAccount("110-A")).toMatchObject({ contra: true, normal: "credit", offsets: "110" });
    expect(getAccount("160-A")?.normal).toBe("credit");
    expect(getAccount("302")?.normal).toBe("debit");
    expect(getAccount("421")).toMatchObject({ contra: true, normal: "debit" });
    expect(getAccount("502")).toMatchObject({ contra: true, normal: "credit" });
    expect(new Set(CHART_OF_ACCOUNTS.map((a) => a.code)).size).toBe(CHART_OF_ACCOUNTS.length);
  });
  it("autocompletes by code and by name", () => {
    expect(searchAccounts("110")[0].code).toBe("110");
    expect(searchAccounts("deprec").map((a) => a.code)).toContain("605");
    expect(searchAccounts("zzz")).toEqual([]);
  });
});

describe("journalizer", () => {
  const base = { date: "2026-12-01", kind: "general" as const, explanation: "x" };
  it("reports unequal debits and credits with the exact message", () => {
    expect(balanceMessage([dr("101", 10000), cr("301", 9000)])).toBe("Debits (₱100.00) do not equal Credits (₱90.00)");
    expect(validateEntry({ ...base, lines: [dr("101", 10000), cr("301", 9000)] }).errors).toContain("Debits (₱100.00) do not equal Credits (₱90.00)");
  });
  it("rejects bad input", () => {
    expect(validateEntry({ ...base, date: "2026-02-30", lines: [dr("101", 1), cr("301", 1)] }).ok).toBe(false);
    expect(validateEntry({ ...base, explanation: " ", lines: [dr("101", 1), cr("301", 1)] }).ok).toBe(false);
    expect(validateEntry({ ...base, lines: [dr("999", 1), cr("301", 1)] }).ok).toBe(false);
    expect(validateEntry({ ...base, lines: [{ accountCode: "101", debit: 5, credit: 5 }, cr("301", 5)] }).ok).toBe(false);
    expect(validateEntry({ ...base, lines: [dr("101", 1.5), cr("301", 1.5)] }).ok).toBe(false);
    expect(validateEntry({ ...base, lines: [dr("101", 100)] }).ok).toBe(false);
  });
  it("accepts a balanced compound entry", () => {
    const e = createEntry({ ...base, lines: [dr("160", 24000000), cr("101", 10000000), cr("202", 14000000)] });
    expect(e.stage).toBe("transaction");
    expect(() => createEntry({ ...base, lines: [dr("101", 1), cr("301", 2)] })).toThrow(/do not equal/);
  });
});

describe("ledger and trial balance", () => {
  const entries = [
    createEntry({ date: "2026-12-01", kind: "general", explanation: "invest", lines: [dr("101", 100000), cr("301", 100000)] }),
    createEntry({ date: "2026-12-03", kind: "general", explanation: "pay", lines: [dr("603", 30000), cr("101", 30000)] }),
    createEntry({ date: "2026-12-02", kind: "general", explanation: "earlier", lines: [dr("101", 5000), cr("401", 5000)] }),
  ];
  it("posts in date order with running balances and PR references", () => {
    const cash = postToLedger(entries).find((l) => l.account.code === "101")!;
    expect(cash.rows.map((r) => r.date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(cash.rows.map((r) => r.balance)).toEqual([100000, 105000, 75000]);
    expect(cash.rows[0].ref).toBe("GJ1");
    expect(cash.debitTotal).toBe(105000);
    expect(cash.creditTotal).toBe(30000);
    expect(cash.balance).toBe(75000);
    expect(cash.balanceSide).toBe("debit");
  });
  it("builds T-accounts with footings", () => {
    const t = toTAccount(postToLedger(entries).find((l) => l.account.code === "101")!);
    expect(t.debits).toHaveLength(2);
    expect(t.credits).toHaveLength(1);
    expect(t.debitFooting).toBe(105000);
    expect(t.balance).toBe(75000);
  });
  it("puts balances in the right trial balance column and balances", () => {
    const tb = trialBalance(postToLedger(entries));
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.rows.find((r) => r.code === "301")).toMatchObject({ debit: 0, credit: 100000 });
  });
  it("flips an abnormal balance to the other column", () => {
    const e = [createEntry({ date: "2026-12-01", kind: "general", explanation: "x", lines: [cr("101", 500), dr("603", 500)] })];
    const tb = trialBalance(postToLedger(e));
    expect(tb.rows.find((r) => r.code === "101")).toMatchObject({ debit: 0, credit: 500 });
    expect(tb.balanced).toBe(true);
  });
});

describe("adjustments engine", () => {
  const b = { date: "2026-12-31", tag: "a" };
  it("asset method moves the expired part to expense; expense method sets up the unexpired part", () => {
    const asset = adj.prepaid({ ...b, method: "asset", expenseCode: "602", prepaidCode: "140", amount: P(6000) });
    expect(asset.lines).toEqual([dr("602", P(6000)), cr("140", P(6000))]);
    const expense = adj.prepaid({ ...b, method: "expense", expenseCode: "602", prepaidCode: "140", amount: P(30000) });
    expect(expense.lines).toEqual([dr("140", P(30000)), cr("602", P(30000))]);
    expect(adj.expiredPortion(P(36000), 6, 1)).toBe(P(6000));
  });
  it("liability method earns revenue; income method defers it", () => {
    expect(adj.unearned({ ...b, method: "liability", amount: P(4000) }).lines).toEqual([dr("230", P(4000)), cr("401", P(4000))]);
    expect(adj.unearned({ ...b, method: "income", amount: P(8000) }).lines).toEqual([dr("401", P(8000)), cr("230", P(8000))]);
  });
  it("computes straight-line depreciation with salvage value", () => {
    expect(adj.straightLine(P(240000), P(24000), 60)).toBe(P(3600));
    expect(adj.straightLine(P(240000), P(24000), 5, 1)).toBe(P(43200));
    expect(() => adj.straightLine(1, 0, 0)).toThrow();
  });
  it("computes supplies used from the count", () => {
    expect(adj.suppliesUsed({ ...b, suppliesCode: "150", available: P(8000), onHand: P(2500) }).lines[0]).toEqual(dr("604", P(5500)));
  });
  it("estimates the allowance by percentage and by aging, net of the existing allowance", () => {
    expect(adj.allowanceByPercent(P(33000), 2)).toBe(P(660));
    expect(adj.allowanceByAging([{ amount: P(20000), ratePercent: 1 }, { amount: P(10000), ratePercent: 5 }, { amount: P(3000), ratePercent: 20 }])).toBe(P(200 + 500 + 600));
    expect(adj.uncollectible({ ...b, requiredAllowance: P(1300), existingAllowance: P(300) })!.lines[0]).toEqual(dr("607", P(1000)));
    expect(adj.uncollectible({ ...b, requiredAllowance: P(1300), existingAllowance: -P(200) })!.lines[0]).toEqual(dr("607", P(1500)));
    expect(adj.uncollectible({ ...b, requiredAllowance: P(100), existingAllowance: P(300) })).toBeNull();
  });
  it("tags every adjusting entry with its type and letter", () => {
    const e = adj.accruedExpense({ ...b, expenseCode: "601", payableCode: "210", amount: P(100) });
    expect(e).toMatchObject({ stage: "adjusting", tag: "a", adjType: "accrued-expense" });
    expect(adj.accruedRevenue({ ...b, receivableCode: "110", revenueCode: "401", amount: P(100) }).adjType).toBe("accrued-revenue");
    expect(adj.depreciation({ ...b, expenseCode: "605", accumulatedCode: "160-A", amount: P(1) }).lines[1].accountCode).toBe("160-A");
  });
});

describe("Practice Set A: CleanPro (service)", () => {
  const entries = solutionEntries(CLEANPRO);
  const opts = { business: "service" as const, entity: CLEANPRO.entity, period: CLEANPRO.period, asOf: CLEANPRO.asOf };

  it("has 17 transactions and 6 lettered adjustments, all balanced", () => {
    expect(CLEANPRO.transactions).toHaveLength(17);
    expect(CLEANPRO.adjustments.map((a) => a.tag)).toEqual(["a", "b", "c", "d", "e", "f"]);
    for (const it of practiceItems(CLEANPRO)) expect(validateEntry({ date: "2026-12-01", kind: "general", explanation: "x", lines: it.key }).ok).toBe(true);
  });
  it("has the expected unadjusted balances", () => {
    const l = postToLedger(entries, ["transaction"]);
    expect(balanceOf(l, "101")).toBe(P(463500));
    expect(balanceOf(l, "110")).toBe(P(33000));
    expect(trialBalance(l).balanced).toBe(true);
  });
  it("builds a cross-footed 10-column worksheet with net income in columns 7 and 10", () => {
    const ws = buildWorksheet(entries);
    expect(ws.crossFooted).toBe(true);
    expect(ws.isNetIncome).toBe(true);
    expect(ws.netIncome).toBe(P(121740));
    expect(ws.totals.isDr).toBe(ws.totals.isCr);
    expect(ws.totals.bsDr).toBe(ws.totals.bsCr);
    expect(ws.subtotals.isDr + ws.netIncome).toBe(ws.totals.isDr);
    expect(ws.rows.find((r) => r.code === "601")!.adjRefs).toEqual(["c"]);
    expect(ws.rows.find((r) => r.code === "160-A")).toMatchObject({ atbCr: P(3600), bsCr: P(3600) });
  });
  it("puts a net loss in column 8 (Cr) and column 9 (Dr)", () => {
    const loss = [
      createEntry({ date: "2026-12-01", kind: "general", explanation: "invest", lines: [dr("101", 100000), cr("301", 100000)] }),
      createEntry({ date: "2026-12-02", kind: "general", explanation: "rent", lines: [dr("602", 30000), cr("101", 30000)] }),
      createEntry({ date: "2026-12-03", kind: "general", explanation: "fees", lines: [dr("101", 10000), cr("401", 10000)] }),
    ];
    const ws = buildWorksheet(loss);
    expect(ws.isNetIncome).toBe(false);
    expect(ws.netIncome).toBe(20000);
    expect(ws.totals.isCr).toBe(ws.subtotals.isCr + 20000);
    expect(ws.totals.bsDr).toBe(ws.subtotals.bsDr + 20000);
    expect(ws.crossFooted).toBe(true);
  });
  it("produces balanced statements and reconciles cash", () => {
    const s = generateStatements(entries, opts);
    expect(s.netIncome).toBe(P(121740));
    expect(s.endingCapital).toBe(P(606740));
    expect(s.totalAssets).toBe(P(773740));
    expect(s.balanced).toBe(true);
    expect(s.cashReconciles).toBe(true);
    expect(s.position.lines.find((l) => l.label === "Total assets")?.kind).toBe("total");
    expect(s.income.lines.find((l) => l.label === "Net income")?.amount).toBe(P(121740));
  });
  it("closes in REID order and leaves only permanent accounts", () => {
    const c = closingEntries(entries, "2026-12-31");
    expect(c.entries.map((e) => e.tag)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(c.entries[0].lines.at(-1)).toEqual(cr("303", P(178000)));
    expect(c.entries[2].lines).toEqual([dr("303", P(121740)), cr("301", P(121740))]);
    expect(c.entries[3].lines).toEqual([dr("301", P(15000)), cr("302", P(15000))]);
    const pc = postClosingTrialBalance([...entries, ...c.entries]);
    expect(pc.balanced).toBe(true);
    expect(pc.onlyPermanentAccounts).toBe(true);
    expect(pc.rows.find((r) => r.code === "301")!.credit).toBe(P(606740));
    expect(pc.totalDebit).toBe(P(778000)); // gross assets; the allowance and accumulated depreciation sit on the credit side
  });
  it("reverses only accruals", () => {
    const rev = reversingEntries(entries, "2027-01-01");
    expect(rev.map((e) => e.tag)).toEqual(["c", "f"]);
    expect(rev[0].lines).toEqual([dr("210", P(12000)), cr("601", P(12000))]);
    expect(rev.every((e) => e.stage === "reversing" && e.date === "2027-01-01")).toBe(true);
  });
  it("ledger after reversing nets accrued salaries back to zero payable", () => {
    const all = [...entries, ...closingEntries(entries, "2026-12-31").entries, ...reversingEntries(entries, "2027-01-01")];
    const l = postToLedger(all, ["transaction", "adjusting", "closing", "reversing"]);
    expect(balanceOf(l, "210")).toBe(0);
  });
});

describe("Practice Set B: Metro Hardware (merchandising, periodic)", () => {
  const entries = solutionEntries(METRO);
  const opts = { business: "merchandising" as const, inventory: "periodic" as const, endingInventory: METRO.endingInventory, entity: METRO.entity, period: METRO.period, asOf: METRO.asOf };

  it("has balanced entries and a balanced trial balance", () => {
    expect(trialBalance(postToLedger(entries, ["transaction"])).balanced).toBe(true);
  });
  it("computes cost of goods sold from the physical count", () => {
    const s = generateStatements(entries, opts);
    const line = (label: string) => s.income.lines.find((l) => l.label === label && l.amount !== undefined)?.amount;
    expect(line("Merchandise inventory, beginning")).toBe(P(50000));
    expect(line("Net purchases")).toBe(P(191850));
    expect(line("Net cost of purchases")).toBe(P(194850));
    expect(line("Goods available for sale")).toBe(P(244850));
    expect(line("Cost of goods sold")).toBe(P(179850));
    expect(line("Net sales")).toBe(P(299060));
    expect(line("Gross profit")).toBe(P(119210));
    expect(s.netIncome).toBe(P(64210));
    expect(s.balanced).toBe(true);
    expect(s.cashReconciles).toBe(true);
    expect(s.totalAssets).toBe(P(649210));
  });
  it("cross-foots the worksheet with beginning and ending inventory on one line", () => {
    const ws = buildWorksheet(entries, { endingInventory: METRO.endingInventory });
    const inv = ws.rows.find((r) => r.code === "130")!;
    expect(inv).toMatchObject({ isDr: P(50000), isCr: P(65000), bsDr: P(65000) });
    expect(ws.netIncome).toBe(P(64210));
    expect(ws.crossFooted).toBe(true);
  });
  it("closes with the ending inventory and balances after closing", () => {
    const c = closingEntries(entries, "2026-12-31", { endingInventory: METRO.endingInventory });
    expect(c.netIncome).toBe(P(64210));
    expect(c.entries[0].lines).toContainEqual(dr("130", P(65000)));
    expect(c.entries[1].lines).toContainEqual(cr("130", P(50000)));
    const pc = postClosingTrialBalance([...entries, ...c.entries]);
    expect(pc.balanced).toBe(true);
    expect(pc.onlyPermanentAccounts).toBe(true);
    expect(pc.rows.find((r) => r.code === "130")!.debit).toBe(P(65000));
    expect(pc.rows.find((r) => r.code === "301")!.credit).toBe(P(644210));
  });
  it("matches the figures stated on the set", () => {
    for (const set of PRACTICE_SETS) {
      const s = generateStatements(solutionEntries(set), { business: set.business, inventory: set.inventory, endingInventory: set.endingInventory, entity: set.entity, period: set.period, asOf: set.asOf });
      expect(s.netIncome).toBe(set.expected.netIncome);
      expect(s.totalAssets).toBe(set.expected.totalAssets);
      expect(s.endingCapital).toBe(set.expected.endingCapital);
    }
  });
});

describe("perpetual inventory", () => {
  it("shows cost of goods sold from account 505 and inventory from the ledger", () => {
    const e = [
      createEntry({ date: "2026-12-01", kind: "general", explanation: "invest", lines: [dr("101", P(100000)), cr("301", P(100000))] }),
      createEntry({ date: "2026-12-02", kind: "purchases", explanation: "buy", lines: [dr("130", P(40000)), cr("201", P(40000))] }),
      createEntry({ date: "2026-12-03", kind: "sales", explanation: "sell", lines: [dr("101", P(30000)), cr("420", P(30000))] }),
      createEntry({ date: "2026-12-03", kind: "general", explanation: "cost", lines: [dr("505", P(18000)), cr("130", P(18000))] }),
    ];
    const s = generateStatements(e, { business: "merchandising", inventory: "perpetual", entity: "X", period: "p", asOf: "d" });
    expect(s.netIncome).toBe(P(12000));
    expect(s.position.lines.find((l) => l.label === "Merchandise inventory")?.amount).toBe(P(22000));
    expect(s.balanced).toBe(true);
  });
});

describe("evaluator", () => {
  const rent = CLEANPRO.transactions[2];
  it("accepts the key regardless of line order", () => {
    expect(evaluateEntry([cr("101", P(36000)), dr("140", P(36000))], rent.key).status).toBe("correct");
  });
  it("gives the prepaid-method hint when rent is expensed", () => {
    const r = evaluateEntry([dr("602", P(36000)), cr("101", P(36000))], rent.key, { hint: rent.hint });
    expect(r.status).toBe("incorrect");
    expect(r.hints.join(" ")).toMatch(/ASSET/);
    expect(r.messages).toContain("Missing: Dr 140 Prepaid Rent.");
  });
  it("gives the contra-asset hint when the equipment account is credited", () => {
    const dep = CLEANPRO.adjustments[3];
    const r = evaluateEntry([dr("605", P(3600)), cr("160", P(3600))], dep.key);
    expect(r.hints.join(" ")).toMatch(/contra-asset/);
  });
  it("detects unbalanced, empty, wrong amount and wrong side", () => {
    expect(evaluateEntry([], rent.key).status).toBe("empty");
    expect(evaluateEntry([dr("140", 100), cr("101", 90)], rent.key).status).toBe("unbalanced");
    expect(evaluateEntry([dr("140", P(30000)), cr("101", P(30000))], rent.key).messages.join(" ")).toMatch(/amount/);
    const flipped = evaluateEntry([cr("140", P(36000)), dr("101", P(36000))], rent.key);
    expect(flipped.messages.join(" ")).toMatch(/wrong side/);
    expect(flipped.hints.join(" ")).toMatch(/normal balance/);
  });
  it("only reveals the key for the instructor", () => {
    expect(evaluateEntry([dr("602", P(36000)), cr("101", P(36000))], rent.key).key).toBeUndefined();
    expect(evaluateEntry([dr("602", P(36000)), cr("101", P(36000))], rent.key, { showKey: true }).key).toEqual(rent.key);
  });
  it("grades a whole set", () => {
    const items = practiceItems(CLEANPRO).map((i) => ({ id: i.id, key: i.key }));
    const answers = { [items[0].id]: items[0].key, [items[1].id]: items[1].key };
    const g = gradeAnswers(items, answers);
    expect(g).toMatchObject({ total: 23, correct: 2, percent: 9 });
  });
});
