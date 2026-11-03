// TEACHER ONLY. Joins the solution keys to the practice sets: the full solution as journal entries, the books it produces, and grading of everything a student built.
// Never import this from a student-facing page, or the keys end up in the students' download.
import { evaluateEntry, type EvalStatus } from "../core/evaluator";
import { postToLedger } from "../core/ledger-posting";
import { requireAccount } from "../core/chart-of-accounts";
import { amt, computeWorksheet, generateTrialBalance, lineRef, worksheetFootings, type ColTarget, type ColumnCheck, type LedgerAccountIn, type LedgerCheck, type PostingCheck, type StudentWork, type WorkMarking, type WorksheetIn } from "../core/student-work";
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

const pesos = (c: number) => (c ? (c / 100).toFixed(2) : "");

/** The Income Statement or Balance Sheet column an account's adjusted balance belongs in, from the key. Merchandise inventory under the periodic system: its beginning balance goes to the Income Statement debit. */
function expectedTarget(set: PracticeSet, row: { code: string; atbDr: number }): ColTarget {
  const acc = requireAccount(row.code);
  const incomeSide = acc.type === "revenue" || acc.type === "expense" || (set.inventory === "periodic" && row.code === "130");
  return incomeSide ? (row.atbDr > 0 ? "isDr" : "isCr") : (row.atbDr > 0 ? "bsDr" : "bsCr");
}

/** Matches each line of a key entry to a line of the student's journal entry (same account, side and amount) and checks where the student placed it. */
function checkPlacements(entries: JournalEntry[], itemIdOf: (e: JournalEntry) => string, journal: Record<string, JournalLine[] | undefined>, whereIs: (ref: string) => { code: string; side: "Dr" | "Cr" } | undefined): PostingCheck[] {
  const out: PostingCheck[] = [];
  for (const e of entries) {
    const mine = journal[itemIdOf(e)] ?? [];
    const used = new Set<number>();
    for (const L of e.lines) {
      const side = L.debit > 0 ? "Dr" : "Cr", amount = L.debit || L.credit;
      const j = mine.findIndex((m, idx) => !used.has(idx) && m.accountCode === L.accountCode && (m.debit > 0 ? "Dr" : "Cr") === side && (m.debit || m.credit) === amount);
      const base = { entryId: e.id, accountCode: L.accountCode, side, amount } as const;
      if (j < 0) { out.push({ ...base, status: "no-line" }); continue; }
      used.add(j);
      const at = whereIs(lineRef(e.id, j));
      if (!at) out.push({ ...base, status: "not-posted" });
      else if (at.code !== L.accountCode) out.push({ ...base, status: "wrong-account", postedTo: at.code, postedSide: at.side });
      else if (at.side !== side) out.push({ ...base, status: "wrong-side", postedTo: at.code, postedSide: at.side });
      else out.push({ ...base, status: "ok" });
    }
  }
  return out;
}

/** The student's own journal entries rebuilt from their answers, so the worksheet can be computed from what they did (follow-through). */
function studentEntries(set: PracticeSet, journal: Record<string, JournalLine[] | undefined>): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const it of practiceItems(set)) {
    const lines = journal[it.id];
    if (!lines || lines.length === 0) continue;
    try { out.push(entryForItem(set, it, lines)); } catch { /* an incomplete entry is not in their books */ }
  }
  return out;
}

/**
 * Grades what a student built by hand: the posting to the ledger and the ledger footings, then the worksheet. The worksheet is graded by follow-through:
 * the adjusting lines must be placed on the right row and column, each adjusted balance in the right column 7-10, and the typed footings must agree with the
 * student's own placements, so one early mistake is charged once (in the posting) and not again on every later column.
 */
export function gradeWork(set: PracticeSet, work: StudentWork, journal: Record<string, JournalLine[] | undefined>): { marking: WorkMarking; score: number; max: number } {
  const { entries, ledger, ws } = expectedBooks(set);
  const tx = entries.filter((x) => x.stage === "transaction");

  const posting = checkPlacements(tx, (e) => e.id.slice(set.id.length + 1), journal, (ref) => {
    const home = work.ledger.find((a) => a.posted.some((p) => p.ref === ref));
    const where = home?.posted.find((p) => p.ref === ref);
    return home && where ? { code: home.code, side: where.side } : undefined;
  });

  const ledgerChecks: LedgerCheck[] = ledger.map((l) => {
    const mine: LedgerAccountIn | undefined = work.ledger.find((a) => a.code === l.account.code);
    const expected = { debitFooting: l.debitTotal, creditFooting: l.creditTotal, balance: l.balance, side: (l.balanceSide === "debit" ? "Dr" : "Cr") as "Dr" | "Cr" };
    const got = { debitFooting: amt(mine?.debitFooting), creditFooting: amt(mine?.creditFooting), balance: amt(mine?.balance), side: mine?.side ?? "" };
    const ok = !!mine && got.debitFooting === expected.debitFooting && got.creditFooting === expected.creditFooting && got.balance === expected.balance && (expected.balance === 0 || got.side === expected.side);
    return { code: l.account.code, opened: !!mine, ok, expected, got };
  });

  // The worksheet, from the student's own trial balance, adjustment lines and clicks.
  const mineEntries = studentEntries(set, journal);
  const rows = computeWorksheet(generateTrialBalance(work.ledger, mineEntries.filter((e) => e.stage === "transaction")), mineEntries, work.worksheet);
  const adjusting = checkPlacements(entries.filter((x) => x.stage === "adjusting"), (e) => e.id.slice(set.id.length + 1), journal, (ref) => {
    const a = work.worksheet.adjustments.find((x) => x.ref === ref);
    return a ? { code: a.code, side: a.side } : undefined;
  });
  const endingOk = (set.endingInventory ?? 0) > 0 && amt(work.worksheet.ending.isCr) === set.endingInventory && amt(work.worksheet.ending.bsDr) === set.endingInventory;
  const columns: ColumnCheck[] = ws.rows.map((r) => {
    const mine = rows.find((x) => x.code === r.code);
    const expectedTo = expectedTarget(set, r);
    const periodicInv = set.inventory === "periodic" && r.code === "130";
    const placed = !!mine?.to;
    return { code: r.code, listed: !!mine, placed, expectedTo, gotTo: mine?.to, endingOk: periodicInv ? endingOk : undefined, ok: !!mine && mine.to === expectedTo && (!periodicInv || endingOk) };
  });
  const foot = worksheetFootings(rows);
  const keys4: ColumnKey[] = ["isDr", "isCr", "bsDr", "bsCr"];
  const built = rows.length > 0; // nothing earned for footing an empty worksheet
  const footings = {
    subtotalsOk: built && COLUMN_KEYS.every((k) => amt(work.worksheet.subtotals[k]) === foot.subtotals[k]),
    netOk: built && keys4.every((k) => amt(work.worksheet.net[k]) === (foot.net[k] ?? 0)),
    totalsOk: built && COLUMN_KEYS.every((k) => amt(work.worksheet.totals[k]) === foot.totals[k]),
  };

  const keyCodes = (list: { code: string }[]) => new Set(list.map((x) => x.code));
  const extra = {
    ledger: work.ledger.filter((a) => !keyCodes(ledger.map((l) => ({ code: l.account.code }))).has(a.code)).map((a) => a.code),
    worksheet: rows.filter((r) => !keyCodes(ws.rows).has(r.code)).map((r) => r.code),
  };

  const marking: WorkMarking = { posting, ledger: ledgerChecks, adjusting, columns, footings, extra };
  const footingPoints = Number(footings.subtotalsOk) + Number(footings.netOk) + Number(footings.totalsOk);
  const score = posting.filter((p) => p.status === "ok").length + ledgerChecks.filter((c) => c.ok).length + adjusting.filter((p) => p.status === "ok").length + columns.filter((c) => c.ok).length + footingPoints;
  const max = posting.length + ledgerChecks.length + adjusting.length + columns.length + 3;
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
  const w = gradeWork(set, work, journal);
  return { items, work: w.marking, journalScore, journalMax: items.length, workScore: w.score, workMax: w.max, score: journalScore + w.score, max: items.length + w.max };
}

/** The student's journal answers when every entry equals the key (for tests and demonstrations). */
export const keyJournal = (set: PracticeSet): Record<string, JournalLine[]> =>
  Object.fromEntries(practiceItems(set).map((it) => [it.id, KEYS[set.id].items[it.id].key]));

/** A fully correct set of hand-built books, in the form a student types them. For tests and for the teacher's demonstration. */
export function perfectWork(set: PracticeSet): StudentWork {
  const { entries, ledger, tb, ws } = expectedBooks(set);
  const tx = entries.filter((e) => e.stage === "transaction");
  const lineSide = (x: JournalLine): "Dr" | "Cr" => (x.debit > 0 ? "Dr" : "Cr");
  const tbCodes = new Set(tb.rows.map((r) => r.code));
  const posted = ledger.map((l) => ({
    code: l.account.code,
    posted: tx.flatMap((e) => e.lines.flatMap((x, i) => (x.accountCode === l.account.code ? [{ ref: lineRef(e.id, i), side: lineSide(x) }] : []))),
    runBalances: {},
    debitFooting: pesos(l.debitTotal), creditFooting: pesos(l.creditTotal), balance: pesos(l.balance), side: (l.balanceSide === "debit" ? "Dr" : "Cr") as "Dr" | "Cr",
  }));
  const worksheet: WorksheetIn = {
    extraCodes: ws.rows.filter((r) => !tbCodes.has(r.code)).map((r) => r.code),
    adjustments: entries.filter((e) => e.stage === "adjusting").flatMap((e) => e.lines.map((x, i) => ({ ref: lineRef(e.id, i), code: x.accountCode, side: lineSide(x) }))),
    placements: ws.rows.map((r) => ({ code: r.code, to: expectedTarget(set, r) })),
    ending: set.endingInventory ? { isCr: pesos(set.endingInventory), bsDr: pesos(set.endingInventory) } : { isCr: "", bsDr: "" },
    subtotals: {}, net: {}, totals: {},
  };
  const rows = computeWorksheet(generateTrialBalance(posted, tx), entries, worksheet);
  const foot = worksheetFootings(rows);
  worksheet.subtotals = Object.fromEntries(COLUMN_KEYS.map((k) => [k, pesos(foot.subtotals[k])]));
  worksheet.net = Object.fromEntries((Object.entries(foot.net) as [ColumnKey, number][]).map(([k, v]) => [k, pesos(v)]));
  worksheet.totals = Object.fromEntries(COLUMN_KEYS.map((k) => [k, pesos(foot.totals[k])]));
  return { ledger: posted, worksheet };
}
