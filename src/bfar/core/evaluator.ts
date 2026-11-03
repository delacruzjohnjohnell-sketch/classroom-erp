// Instant validation of a student's entry against the solution key, with contextual hints in Ballada's voice.
// The key is only revealed when the caller passes showKey (the instructor toggle).
import { formatPeso } from "../lib/currency";
import { getAccount } from "./chart-of-accounts";
import { balanceMessage } from "./journalizer";
import type { JournalLine } from "./types";

export type EvalStatus = "empty" | "unbalanced" | "incorrect" | "correct";
export interface EntryEvaluation { status: EvalStatus; messages: string[]; hints: string[]; key?: JournalLine[] }

type Sides = { dr: number; cr: number };
const collapse = (lines: JournalLine[]): Map<string, Sides> => {
  const m = new Map<string, Sides>();
  for (const l of lines) {
    if (!l.accountCode || (l.debit === 0 && l.credit === 0)) continue;
    const c = m.get(l.accountCode) ?? { dr: 0, cr: 0 };
    c.dr += l.debit; c.cr += l.credit;
    m.set(l.accountCode, c);
  }
  return m;
};
const name = (code: string) => `${code} ${getAccount(code)?.name ?? code}`;
const isPrepaidOrSupplies = (c: string) => ["140", "141", "150", "151"].includes(c);

export function evaluateEntry(student: JournalLine[], key: JournalLine[], opts: { hint?: string; showKey?: boolean } = {}): EntryEvaluation {
  const s = collapse(student), k = collapse(key);
  const reveal = opts.showKey ? { key } : {};
  if (s.size === 0) return { status: "empty", messages: ["Enter the accounts and amounts first."], hints: [], ...reveal };
  const unbalanced = balanceMessage(student);
  if (unbalanced) return { status: "unbalanced", messages: [unbalanced], hints: ["Every entry must have equal debits and credits. Recheck each amount."], ...reveal };

  const messages: string[] = [], hints: string[] = [];
  for (const [code, want] of k) {
    const got = s.get(code);
    if (!got) { messages.push(`Missing: ${want.dr > 0 ? "Dr" : "Cr"} ${name(code)}.`); continue; }
    if (got.dr !== want.dr || got.cr !== want.cr) {
      const wrongSide = (want.dr > 0 && got.cr > 0 && got.dr === 0) || (want.cr > 0 && got.dr > 0 && got.cr === 0);
      messages.push(wrongSide ? `${name(code)} is on the wrong side.` : `The amount for ${name(code)} is not right.`);
      if (wrongSide) hints.push(`The normal balance of ${getAccount(code)?.name} is a ${getAccount(code)?.normal}. Does this transaction increase or decrease it?`);
    }
  }
  for (const [code, got] of s) {
    if (k.has(code)) continue;
    messages.push(`${name(code)} should not be in this entry.`);
    const acc = getAccount(code);
    const keyPrepaid = [...k.keys()].find(isPrepaidOrSupplies);
    if (acc?.type === "expense" && keyPrepaid && got.dr > 0) hints.push("Check the method: when the payment is recorded as an ASSET (Prepaid / Supplies), the expense is recognized later through an adjusting entry. Under the expense method it would be the other way around.");
    if ((code === "160" || code === "170") && got.cr > 0 && [...k.keys()].some((x) => x.endsWith("-A"))) hints.push("Accumulated Depreciation is a contra-asset. Credit the Accumulated Depreciation account, never the equipment account itself.");
    if (code === "110" && got.cr > 0 && k.has("110-A")) hints.push("Estimated uncollectible accounts go to the Allowance for Uncollectible Accounts (a contra-asset), not directly to Accounts Receivable.");
    if (code === "401" && k.has("230")) hints.push("Cash received before the service is rendered is Unearned Service Revenues (a liability), not revenue yet.");
    if (code === "504" && k.has("609")) hints.push("Freight paid by the seller to deliver goods is Freight-Out (an operating expense). Freight-In is for the buyer under FOB shipping point.");
  }
  if (messages.length === 0) return { status: "correct", messages: ["Correct."], hints: [], ...reveal };
  if (opts.hint) hints.push(opts.hint);
  return { status: "incorrect", messages, hints: [...new Set(hints)], ...reveal };
}

export interface SetGrade { total: number; correct: number; percent: number; items: { id: string; status: EvalStatus }[] }

/** Grades a student's answers (item id → lines) against the keys. Unanswered items count as empty. */
export function gradeAnswers(items: { id: string; key: JournalLine[] }[], answers: Record<string, JournalLine[] | undefined>): SetGrade {
  const results = items.map((it) => ({ id: it.id, status: evaluateEntry(answers[it.id] ?? [], it.key).status }));
  const correct = results.filter((r) => r.status === "correct").length;
  return { total: items.length, correct, percent: items.length ? Math.round((correct / items.length) * 100) : 0, items: results };
}

export const describeAmount = formatPeso;
