import { describe, expect, it } from "vitest";
import { formatAmount, formatPeso, parsePesos, percentOf, roundDiv } from "../lib/currency";
import { CHART_OF_ACCOUNTS, getAccount, searchAccounts, suggestAccounts } from "../core/chart-of-accounts";
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
import { PRACTICE_SETS, practiceItems } from "../practice-sets";
import { expectedOf, gradeSubmission, gradeWork, keyJournal, keyOf, perfectWork, solutionEntries } from "../practice-sets/solution";
import { computeWorksheet, normalizeWork, emptyWork, entriesOfBook, FREE_BOOK, generateTrialBalance, worksheetFootings } from "../core/student-work";
import { BAYANIHAN } from "../practice-sets/bayanihan";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
    for (const it of practiceItems(CLEANPRO)) expect(validateEntry({ date: "2026-12-01", kind: "general", explanation: "x", lines: keyOf("cleanpro", it.id)!.key }).ok).toBe(true);
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
      const exp = expectedOf(set.id)!;
      expect(s.netIncome).toBe(exp.netIncome);
      expect(s.totalAssets).toBe(exp.totalAssets);
      expect(s.endingCapital).toBe(exp.endingCapital);
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
  const rent = { key: keyOf("cleanpro", "t03")!.key, hint: keyOf("cleanpro", "t03")!.hint };
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
    const dep = keyOf("cleanpro", "adj-d")!;
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
    const items = practiceItems(CLEANPRO).map((i) => ({ id: i.id, key: keyOf("cleanpro", i.id)!.key }));
    const answers = { [items[0].id]: items[0].key, [items[1].id]: items[1].key };
    const g = gradeAnswers(items, answers);
    expect(g).toMatchObject({ total: 23, correct: 2, percent: 9 });
  });
});

describe("Practice Set C: Bayanihan (comprehensive service)", () => {
  const entries = solutionEntries(BAYANIHAN);
  const opts = { business: "service" as const, entity: BAYANIHAN.entity, period: BAYANIHAN.period, asOf: BAYANIHAN.asOf };

  it("has 28 documents and ten lettered adjustments", () => {
    expect(BAYANIHAN.transactions).toHaveLength(28);
    expect(BAYANIHAN.adjustments.map((a) => a.tag)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  });
  it("produces the expected figures with balanced statements", () => {
    const s = generateStatements(entries, opts);
    const exp = expectedOf("bayanihan")!;
    expect(s.netIncome).toBe(exp.netIncome);
    expect(s.totalAssets).toBe(exp.totalAssets);
    expect(s.endingCapital).toBe(exp.endingCapital);
    expect(s.balanced).toBe(true);
    expect(s.cashReconciles).toBe(true);
  });
  it("cross-foots the worksheet and closes to permanent accounts only", () => {
    expect(buildWorksheet(entries).crossFooted).toBe(true);
    const c = closingEntries(entries, "2027-01-31");
    const pc = postClosingTrialBalance([...entries, ...c.entries]);
    expect(pc.balanced).toBe(true);
    expect(pc.onlyPermanentAccounts).toBe(true);
  });
  it("reverses exactly the four reversible adjustments", () => {
    expect(reversingEntries(entries, "2027-02-01").map((e) => e.tag)).toEqual(["a", "f", "g", "h"]);
  });
});

describe("source documents and the student view", () => {
  it("gives every item in every set a source document and a key", () => {
    for (const set of PRACTICE_SETS) {
      for (const it of practiceItems(set)) {
        expect(it.document, `${set.id}/${it.id}`).toBeDefined();
        expect(it.document!.items.length).toBeGreaterThan(0);
        expect(keyOf(set.id, it.id), `${set.id}/${it.id} key`).toBeDefined();
      }
    }
  });
  it("grades a student's answers only through the teacher module", () => {
    const items = practiceItems(CLEANPRO);
    const answers = { [items[0].id]: keyOf("cleanpro", items[0].id)!.key, [items[2].id]: [dr("602", P(36000)), cr("101", P(36000))] };
    const m = gradeSubmission(CLEANPRO, answers, emptyWork());
    expect(m.journalMax).toBe(23);
    expect(m.max).toBe(m.journalMax + m.workMax);
    expect(m.score).toBe(1);
    expect(m.items[2].status).toBe("incorrect");
    expect(m.items[1].status).toBe("empty");
    expect(m.items[2].hints.join(" ")).toMatch(/ASSET/);
  });
  it("never ships the keys to students: no student-facing file imports the key modules", () => {
    const root = join(__dirname, "..", "..");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "__tests__" ? [] : walk(p)) : [p]; });
    const files = [...walk(join(root, "bfar")), ...walk(join(root, "app", "bfar"))].filter((f) => /\.(ts|tsx)$/.test(f));
    const allowed = new Set(["keys.ts", "solution.ts", join("app", "bfar", "teacher", "page.tsx")].map((x) => x));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const importsKeys = /from\s+["'][^"']*(\/keys|\/solution)["']/.test(src);
      const dynamic = /import\(["'][^"']*practice-sets\/solution["']\)/.test(src);
      const ok = [...allowed].some((a) => f.endsWith(a));
      if (importsKeys || dynamic) expect(ok, f).toBe(true);
    }
  });
});

describe("separate books and the hand-built ledger and worksheet", () => {
  it("keeps each practice set's entries apart", () => {
    const all = PRACTICE_SETS.flatMap((s) => solutionEntries(s));
    const free = createEntry({ date: "2026-12-01", kind: "general", explanation: "x", lines: [dr("101", 100), cr("301", 100)] });
    const mixed = [...all, free];
    for (const set of PRACTICE_SETS) {
      const mine = entriesOfBook(mixed, set.id);
      expect(mine).toHaveLength(set.transactions.length + set.adjustments.length);
      expect(mine.every((e) => e.id.startsWith(`${set.id}-`))).toBe(true);
    }
    expect(entriesOfBook(mixed, FREE_BOOK)).toEqual([free]);
    // the ledger of one set does not include another set's amounts
    const a = postToLedger(entriesOfBook(mixed, "cleanpro"), ["transaction"]);
    expect(balanceOf(a, "101")).toBe(P(463500));
    expect(balanceOf(a, "130")).toBe(0);
  });
  it("gives full marks to correct hand-built books in every set", () => {
    for (const set of PRACTICE_SETS) {
      const g = gradeWork(set, perfectWork(set), keyJournal(set));
      expect(g.score, set.id).toBe(g.max);
      expect(g.marking.footings).toEqual({ subtotalsOk: true, netOk: true, totalsOk: true });
    }
  });
  it("gives nothing for books that were not built", () => {
    const g = gradeWork(CLEANPRO, emptyWork(), keyJournal(CLEANPRO));
    expect(g.score).toBe(0);
    expect(g.max).toBeGreaterThan(20);
  });
  it("marks a wrong ledger balance", () => {
    const w = perfectWork(CLEANPRO);
    w.ledger.find((a) => a.code === "101")!.balance = "1.00";
    const g = gradeWork(CLEANPRO, w, keyJournal(CLEANPRO));
    expect(g.marking.ledger.find((c) => c.code === "101")!.ok).toBe(false);
    expect(g.score).toBe(g.max - 1);
  });
  it("marks an adjusted balance placed in the wrong column 7-10", () => {
    const w = perfectWork(CLEANPRO);
    w.worksheet.placements.find((p) => p.code === "140")!.to = "isDr"; // prepaid rent is a balance sheet asset
    const g = gradeWork(CLEANPRO, w, keyJournal(CLEANPRO));
    const c = g.marking.columns.find((x) => x.code === "140")!;
    expect(c).toMatchObject({ ok: false, expectedTo: "bsDr", gotTo: "isDr" });
    // the typed subtotals no longer match the student's own columns, so the footings are charged too
    expect(g.marking.footings.subtotalsOk).toBe(false);
  });
  it("marks adjusting lines placed on the wrong account, in the wrong column, or not placed", () => {
    const base = perfectWork(CLEANPRO);
    const w1 = structuredClone(base);
    w1.worksheet.adjustments[0].code = "603";
    expect(gradeWork(CLEANPRO, w1, keyJournal(CLEANPRO)).marking.adjusting.filter((p) => p.status === "wrong-account")).toHaveLength(1);
    const w2 = structuredClone(base);
    w2.worksheet.adjustments[0].side = w2.worksheet.adjustments[0].side === "Dr" ? "Cr" : "Dr";
    expect(gradeWork(CLEANPRO, w2, keyJournal(CLEANPRO)).marking.adjusting.filter((p) => p.status === "wrong-side")).toHaveLength(1);
    const w3 = structuredClone(base);
    w3.worksheet.adjustments.pop();
    expect(gradeWork(CLEANPRO, w3, keyJournal(CLEANPRO)).marking.adjusting.filter((p) => p.status === "not-posted")).toHaveLength(1);
  });
  it("grades the footings by follow-through: an early posting mistake is not charged again", () => {
    const w = structuredClone(perfectWork(CLEANPRO));
    w.ledger.find((a) => a.code === "101")!.posted[0].side = "Cr"; // posting mistake: charged in the posting
    // the student foots their own (wrong) columns correctly
    const tx = solutionEntries(CLEANPRO);
    const rows = computeWorksheet(generateTrialBalance(w.ledger, tx.filter((e) => e.stage === "transaction")), tx, w.worksheet);
    const f = worksheetFootings(rows);
    const text = (n: number) => (n ? (n / 100).toFixed(2) : "");
    w.worksheet.subtotals = Object.fromEntries(Object.entries(f.subtotals).map(([k, v]) => [k, text(v)]));
    w.worksheet.net = Object.fromEntries(Object.entries(f.net).map(([k, v]) => [k, text(v as number)]));
    w.worksheet.totals = Object.fromEntries(Object.entries(f.totals).map(([k, v]) => [k, text(v)]));
    const g = gradeWork(CLEANPRO, w, keyJournal(CLEANPRO));
    expect(g.marking.posting.filter((p) => p.status !== "ok")).toHaveLength(1);
    expect(g.marking.footings).toEqual({ subtotalsOk: true, netOk: true, totalsOk: true });
  });
  it("gives no footing points for an empty worksheet", () => {
    const g = gradeWork(CLEANPRO, emptyWork(), keyJournal(CLEANPRO));
    expect(g.marking.footings).toEqual({ subtotalsOk: false, netOk: false, totalsOk: false });
  });
  it("computes the worksheet columns from the student's clicks", () => {
    const set = CLEANPRO;
    const w = perfectWork(set);
    const tx = solutionEntries(set);
    const rows = computeWorksheet(generateTrialBalance(w.ledger, tx.filter((e) => e.stage === "transaction")), tx, w.worksheet);
    const cash = rows.find((r) => r.code === "101")!;
    expect(cash).toMatchObject({ tbDr: P(463500), adjDr: 0, atbDr: P(463500), bsDr: P(463500), to: "bsDr" });
    const rent = rows.find((r) => r.code === "140")!;
    expect(rent).toMatchObject({ tbDr: P(36000), adjCr: P(6000), atbDr: P(30000), adjTags: ["a"] });
    const dep = rows.find((r) => r.code === "160-A")!;
    expect(dep).toMatchObject({ tbCr: 0, adjCr: P(3600), atbCr: P(3600), bsCr: P(3600) });
    expect(worksheetFootings(rows).totals.isDr).toBe(worksheetFootings(rows).totals.isCr);
  });
  it("handles the periodic ending inventory typed in columns 8 and 9", () => {
    const set = METRO;
    const w = perfectWork(set);
    const tx = solutionEntries(set);
    const rows = computeWorksheet(generateTrialBalance(w.ledger, tx.filter((e) => e.stage === "transaction")), tx, w.worksheet);
    expect(rows.find((r) => r.code === "130")).toMatchObject({ isDr: P(50000), isCr: P(65000), bsDr: P(65000) });
    const bad = structuredClone(w);
    bad.worksheet.ending.bsDr = "64000.00";
    const c = gradeWork(set, bad, keyJournal(set)).marking.columns.find((x) => x.code === "130")!;
    expect(c).toMatchObject({ ok: false, endingOk: false });
  });
  it("flags accounts the student added that the key does not have", () => {
    const w = perfectWork(CLEANPRO);
    w.ledger.push({ code: "130", posted: [], runBalances: {}, debitFooting: "", creditFooting: "", balance: "", side: "" });
    expect(gradeWork(CLEANPRO, w, keyJournal(CLEANPRO)).marking.extra.ledger).toEqual(["130"]);
  });
  it("marks a journal line dropped on the wrong account, on the wrong side, or never posted", () => {
    const base = perfectWork(CLEANPRO);
    // wrong account: move the first line of the first entry (Dr 101) into the 301 account
    const w1 = structuredClone(base);
    const cash = w1.ledger.find((a) => a.code === "101")!;
    const moved = cash.posted.shift()!;
    w1.ledger.find((a) => a.code === "301")!.posted.push(moved);
    const g1 = gradeWork(CLEANPRO, w1, keyJournal(CLEANPRO)).marking.posting.filter((p) => p.status !== "ok");
    expect(g1).toHaveLength(1);
    expect(g1[0]).toMatchObject({ status: "wrong-account", accountCode: "101", postedTo: "301" });
    // wrong side: the same line dropped on the credit half of its own account
    const w2 = structuredClone(base);
    w2.ledger.find((a) => a.code === "101")!.posted[0].side = "Cr";
    expect(gradeWork(CLEANPRO, w2, keyJournal(CLEANPRO)).marking.posting.filter((p) => p.status === "wrong-side")).toHaveLength(1);
    // not posted
    const w3 = structuredClone(base);
    w3.ledger.find((a) => a.code === "101")!.posted.pop();
    expect(gradeWork(CLEANPRO, w3, keyJournal(CLEANPRO)).marking.posting.filter((p) => p.status === "not-posted")).toHaveLength(1);
  });
  it("counts a line as missing when the student's journal never had it", () => {
    const j = keyJournal(CLEANPRO);
    delete j["t05"];
    const g = gradeWork(CLEANPRO, perfectWork(CLEANPRO), j).marking.posting;
    expect(g.filter((p) => p.status === "no-line")).toHaveLength(2);
  });
});

describe("predictive account search", () => {
  const codes = (q: string) => suggestAccounts(q).map((a) => a.code);
  it("finds accounts from the first letters", () => {
    expect(codes("ca")[0]).toBe("101");
    expect(codes("cash").slice(0, 2)).toEqual(["101", "102"]);
    expect(codes("acc")[0]).toBe("110");
    expect(codes("acc")).toEqual(expect.arrayContaining(["110", "201", "160-A"]));
    expect(codes("depreciation")).toEqual(expect.arrayContaining(["160-A", "170-A", "605", "606"]));
    expect(codes("sal")).toEqual(expect.arrayContaining(["210", "421", "420", "601"]));
  });
  it("matches a code prefix first and a word inside the name too", () => {
    expect(codes("110")[0]).toBe("110");
    expect(codes("110").slice(0, 2)).toEqual(["110", "110-A"]);
    expect(codes("capital")).toContain("301");
    expect(codes("rec")).toContain("110");
  });
  it("shows nothing for an empty box and nothing for gibberish", () => {
    expect(codes("")).toEqual([]);
    expect(codes("zzz")).toEqual([]);
  });
  it("never returns more than the limit", () => {
    expect(suggestAccounts("a", 5).length).toBeLessThanOrEqual(5);
  });
});

describe("the trial balance is generated from the student's ledger", () => {
  const set = CLEANPRO;
  const journalEntries = solutionEntries(set).filter((e) => e.stage === "transaction");
  it("balances when everything is posted correctly and matches the books", () => {
    const tb = generateTrialBalance(perfectWork(set).ledger, journalEntries);
    expect(tb.balanced).toBe(true);
    expect(tb.unpostedLines).toBe(0);
    expect(tb.rows.find((r) => r.code === "101")).toMatchObject({ debit: P(463500), credit: 0 });
    expect(tb.rows.find((r) => r.code === "301")).toMatchObject({ debit: 0, credit: P(500000) });
    const expected = trialBalance(postToLedger(journalEntries, ["transaction"]));
    expect(tb.totalDebit).toBe(expected.totalDebit);
    expect(tb.rows).toHaveLength(expected.rows.length);
  });
  it("shows a posting mistake as an unbalanced trial balance", () => {
    const w = structuredClone(perfectWork(set));
    w.ledger.find((a) => a.code === "101")!.posted[0].side = "Cr"; // a debit posted on the credit side
    const tb = generateTrialBalance(w.ledger, journalEntries);
    expect(tb.balanced).toBe(false);
  });
  it("reports lines not posted yet and has no rows for an empty ledger", () => {
    const w = structuredClone(perfectWork(set));
    w.ledger.find((a) => a.code === "101")!.posted.pop();
    expect(generateTrialBalance(w.ledger, journalEntries).unpostedLines).toBe(1);
    expect(generateTrialBalance([], journalEntries).rows).toEqual([]);
  });
});

describe("saved work in an older shape never crashes anything", () => {
  const set = CLEANPRO;
  const tx = solutionEntries(set);
  const use = (raw: unknown) => {
    const w = normalizeWork(raw);
    // everything the pages and the grading read must work on it
    const tb = generateTrialBalance(w.ledger, tx.filter((e) => e.stage === "transaction"));
    expect(() => computeWorksheet(tb, tx, w.worksheet)).not.toThrow();
    expect(() => gradeWork(set, w, keyJournal(set))).not.toThrow();
    return w;
  };
  it("accepts the typed-ledger shape, the typed-worksheet shape and the trial-balance field", () => {
    const old = {
      ledger: [{ code: "101", rows: [{ date: "12-01", debit: "1", credit: "", balance: "1" }], debitFooting: "1", creditFooting: "", balance: "1", side: "Dr" }],
      tb: { rows: [], totalDebit: "", totalCredit: "" },
      worksheet: { rows: [{ code: "101", adj: "", cells: {} }], subtotals: {}, net: {}, totals: {} },
    };
    const w = use(old);
    expect(w.ledger[0]).toMatchObject({ code: "101", posted: [], debitFooting: "1" });
    expect(w.worksheet).toMatchObject({ extraCodes: [], adjustments: [], placements: [], ending: { isCr: "", bsDr: "" } });
  });
  it("accepts nothing, junk and partial objects", () => {
    for (const raw of [undefined, null, 5, "x", [], {}, { ledger: "no" }, { ledger: [null, { code: 1 }], worksheet: 7 }]) use(raw);
  });
  it("keeps valid parts and drops invalid ones", () => {
    const w = use({ ledger: [{ code: "101", posted: [{ ref: "a#0", side: "Dr" }, { ref: 5, side: "Dr" }, { ref: "b#0", side: "X" }] }], worksheet: { extraCodes: ["602", 4], placements: [{ code: "140", to: "bsDr" }, { code: "140", to: "nope" }] } });
    expect(w.ledger[0].posted).toEqual([{ ref: "a#0", side: "Dr" }]);
    expect(w.worksheet.extraCodes).toEqual(["602"]);
    expect(w.worksheet.placements).toEqual([{ code: "140", to: "bsDr" }]);
  });
});
