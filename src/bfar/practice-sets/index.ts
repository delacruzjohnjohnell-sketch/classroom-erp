// The practice sets as students see them (no keys) and the helpers that turn a student's answers into journal entries.
// Solution keys are in keys.ts / solution.ts and are loaded only by the teacher's page and the tests.
import { createEntry } from "../core/journalizer";
import type { AdjustmentType, JournalEntry, JournalLine } from "../core/types";
import { BAYANIHAN } from "./bayanihan";
import { CLEANPRO } from "./cleanpro";
import { DOCS } from "./documents";
import { METRO } from "./metro";
import type { PracticeSet, SourceDocument } from "./types";

export const PRACTICE_SETS: PracticeSet[] = [CLEANPRO, METRO, BAYANIHAN];
export const getPracticeSet = (id: string): PracticeSet | undefined => PRACTICE_SETS.find((s) => s.id === id);

export interface PracticeItem {
  id: string;
  type: "transaction" | "adjustment";
  date: string;
  kind: JournalEntry["kind"];
  description: string;
  tag?: string;
  adjType?: AdjustmentType;
  terms?: string;
  document?: SourceDocument;
}

/** Every item in the order the student works through them: transactions first, then adjustments. */
export const practiceItems = (set: PracticeSet): PracticeItem[] => [
  ...set.transactions.map((t): PracticeItem => ({ id: t.id, type: "transaction", date: t.date, kind: t.kind, description: t.description, terms: t.terms, document: t.document ?? DOCS[`${set.id}/${t.id}`] })),
  ...set.adjustments.map((a): PracticeItem => ({ id: `adj-${a.tag}`, type: "adjustment", date: a.date, kind: "general", description: a.description, tag: a.tag, adjType: a.adjType, document: a.document ?? DOCS[`${set.id}/adj-${a.tag}`] })),
];

/** The explanation recorded with a student's entry: what the student wrote, or a reference to the document. */
export const defaultExplanation = (item: PracticeItem): string => (item.document ? `Per ${item.document.type} No. ${item.document.no}` : item.description);

/** The journal entry for one item with the given lines (a student's, or the key's). */
export function entryForItem(set: PracticeSet, item: PracticeItem, lines: JournalLine[], explanation?: string): JournalEntry {
  const id = `${set.id}-${item.id}`;
  const text = explanation?.trim() || defaultExplanation(item);
  return item.type === "transaction"
    ? createEntry({ date: item.date, kind: item.kind, lines, explanation: text }, { id })
    : { ...createEntry({ date: item.date, kind: "general", lines, explanation: text }, { id, stage: "adjusting", tag: item.tag }), adjType: item.adjType };
}
