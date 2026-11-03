// TEACHER ONLY. Joins the solution keys to the practice sets: the full solution as journal entries, the books it produces, and grading of everything a student built.
// Never import this from a student-facing page, or the keys end up in the students' download.
import { evaluateEntry, type EvalStatus } from "../core/evaluator";
import { postToLedger } from "../core/ledger-posting";
import { amt, type LedgerAccountIn, type LedgerCheck, type StudentWork, type TbCheck, type WorkMarking, type WsCheck } from "../core/student-work";
import { trialBalance } from "../core/trial-balance";
import type { JournalEntry, JournalLine } from "../core/types";
import { buildWorksheet, COLUMN_KEYS, type ColumnKey } from "../core/worksheet-engine";
import { entryForItem, practiceItems } from "./index";
import { KEYS } from "./keys";
import type { PracticeSet } from "./types";

export const keyOf = (setId: string, itemId: string) => KEYS[setId]?.items[itemId];
export const expectedOf = (setId: string) => KEYS[setId]?.expected;

export const solutionEntries = (set: PracticeSet): JournalEntry[] =>
  practiceItems(set).map((it) => entryForItem(set, it, KEYS[set.id].items[it.id].key));

/** The books the key produces: the ledger after the transactions, its trial balance, and the full worksheet. */
export function expectedBooks(set: PracticeSet) {
  const entries = solutionEntries(set);
  const ledger = postToLedger(entries, ["transaction"]);
  return { entries, ledger, tb: trialBalance(ledger), ws: buildWorksheet(entries, { endingInventory: set.endingInventory }) };
}

const norm = (letters: string) => letters.toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(",");

/** Grades the ledger, trial balance and worksheet a student built by hand. One point per ledger account, trial balance row, worksheet row, plus one each for the two totals. */
export function gradeWork(set: PracticeSet, work: StudentWork): { marking: WorkMarking; score: number; max: number } {
  const { ledger, tb, ws } = expectedBooks(set);

  const ledgerChecks: LedgerCheck[] = ledger.map((l) => {
    const mine: LedgerAccountIn | undefined = work.ledger.find((a) => a.code === l.account.code);
    const expected = { debitFooting: l.debitTotal, creditFooting: l.creditTotal, balance: l.balance, side: (l.balanceSide === "debit" ? "Dr" : "Cr") as "Dr" | "Cr" };
    const got = { debitFooting: amt(mine?.debitFooting), creditFooting: amt(mine?.creditFooting), balance: amt(mine?.balance), side: mine?.side ?? "" };
    const ok = !!mine && got.debitFooting === expected.debitFooting && got.creditFooting === expected.creditFooting && got.balance === expected.balance && (expected.balance === 0 || got.side === expected.side);
    return { code: l.account.code, opened: !!mine, ok, expected, got };
  });

  const tbChecks: TbCheck[] = tb.rows.map((r) => {
    const mine = work.tb.rows.find((x) => x.code === r.code);
    const got = { debit: amt(mine?.debit), credit: amt(mine?.credit) };
    return { code: r.code, listed: !!mine, ok: !!mine && got.debit === r.debit && got.credit === r.credit, expected: { debit: r.debit, credit: r.credit }, got };
  });
  const tbTotalsOk = amt(work.tb.totalDebit) === tb.totalDebit && amt(work.tb.totalCredit) === tb.totalCredit;

  const wsChecks: WsCheck[] = ws.rows.map((r) => {
    const mine = work.worksheet.rows.find((x) => x.code === r.code);
    const expected = Object.fromEntries(COLUMN_KEYS.map((k) => [k, r[k]])) as Record<ColumnKey, number>;
    const got = Object.fromEntries(COLUMN_KEYS.map((k) => [k, amt(mine?.cells[k])])) as Record<ColumnKey, number>;
    const adjOk = norm(mine?.adj ?? "") === norm(r.adjRefs.join(","));
    return { code: r.code, listed: !!mine, ok: !!mine && adjOk && COLUMN_KEYS.every((k) => got[k] === expected[k]), expected, got, expectedAdj: r.adjRefs, gotAdj: (mine?.adj ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean) };
  });
  const netExpected: Partial<Record<ColumnKey, number>> = ws.isNetIncome ? { isDr: ws.netIncome, bsCr: ws.netIncome } : { isCr: ws.netIncome, bsDr: ws.netIncome };
  const netOk = (["isDr", "isCr", "bsDr", "bsCr"] as ColumnKey[]).every((k) => amt(work.worksheet.net[k]) === (netExpected[k] ?? 0));
  const worksheetTotalsOk = netOk && COLUMN_KEYS.every((k) => amt(work.worksheet.totals[k]) === ws.totals[k]);

  const expectedCodes = (list: { code: string }[]) => new Set(list.map((x) => x.code));
  const extra = {
    ledger: work.ledger.filter((a) => !expectedCodes(ledger.map((l) => ({ code: l.account.code }))).has(a.code)).map((a) => a.code),
    tb: work.tb.rows.filter((r) => r.code && !expectedCodes(tb.rows).has(r.code)).map((r) => r.code),
    worksheet: work.worksheet.rows.filter((r) => r.code && !expectedCodes(ws.rows).has(r.code)).map((r) => r.code),
  };

  const marking: WorkMarking = {
    ledger: ledgerChecks, tb: tbChecks, tbTotalsOk, worksheet: wsChecks, worksheetTotalsOk, extra,
    expectedTotals: { tbDebit: tb.totalDebit, tbCredit: tb.totalCredit, worksheet: ws.totals },
  };
  const score = ledgerChecks.filter((c) => c.ok).length + tbChecks.filter((c) => c.ok).length + (tbTotalsOk ? 1 : 0) + wsChecks.filter((c) => c.ok).length + (worksheetTotalsOk ? 1 : 0);
  const max = ledgerChecks.length + tbChecks.length + 1 + wsChecks.length + 1;
  return { marking, score, max };
}

export interface CheckedItem { id: string; status: EvalStatus; messages: string[]; hints: string[]; key: JournalLine[]; answer: JournalLine[] }
export interface Marking { items: CheckedItem[]; work: WorkMarking; journalScore: number; journalMax: number; workScore: number; workMax: number; score: number; max: number }

/** Grades everything a student submitted for a set: the journal entries against the key, then the ledger, trial balance and worksheet. */
export function gradeSubmission(set: PracticeSet, journal: Record<string, JournalLine[] | undefined>, work: StudentWork): Marking {
  const items = practiceItems(set).map((it): CheckedItem => {
    const k = KEYS[set.id].items[it.id];
    const answer = journal[it.id] ?? [];
    const r = evaluateEntry(answer, k.key, { hint: k.hint });
    return { id: it.id, status: r.status, messages: r.messages, hints: r.hints, key: k.key, answer };
  });
  const journalScore = items.filter((i) => i.status === "correct").length;
  const w = gradeWork(set, work);
  return { items, work: w.marking, journalScore, journalMax: items.length, workScore: w.score, workMax: w.max, score: journalScore + w.score, max: items.length + w.max };
}

const pesos = (c: number) => (c ? (c / 100).toFixed(2) : "");

/** A fully correct set of hand-built books, in the form a student types them. For tests and for the teacher's demonstration. */
export function perfectWork(set: PracticeSet): StudentWork {
  const { ledger, tb, ws } = expectedBooks(set);
  const cell = (n: number) => pesos(n);
  return {
    ledger: ledger.map((l) => ({
      code: l.account.code,
      rows: l.rows.map((r) => ({ date: r.date.slice(5), particulars: r.explanation, pr: r.ref, debit: pesos(r.debit), credit: pesos(r.credit), balance: pesos(r.balance) })),
      debitFooting: pesos(l.debitTotal), creditFooting: pesos(l.creditTotal), balance: pesos(l.balance), side: l.balanceSide === "debit" ? "Dr" : "Cr",
    })),
    tb: { rows: tb.rows.map((r) => ({ code: r.code, debit: pesos(r.debit), credit: pesos(r.credit) })), totalDebit: pesos(tb.totalDebit), totalCredit: pesos(tb.totalCredit) },
    worksheet: {
      rows: ws.rows.map((r) => ({ code: r.code, adj: r.adjRefs.join(", "), cells: Object.fromEntries(COLUMN_KEYS.map((k) => [k, cell(r[k])])) })),
      subtotals: Object.fromEntries(COLUMN_KEYS.map((k) => [k, cell(ws.subtotals[k])])),
      net: ws.isNetIncome ? { isDr: pesos(ws.netIncome), bsCr: pesos(ws.netIncome) } : { isCr: pesos(ws.netIncome), bsDr: pesos(ws.netIncome) },
      totals: Object.fromEntries(COLUMN_KEYS.map((k) => [k, cell(ws.totals[k])])),
    },
  };
}
