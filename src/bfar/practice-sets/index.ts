// The practice sets and the helpers that turn a set (or a student's answers to it) into journal entries.
import { createEntry } from "../core/journalizer";
import type { JournalEntry, JournalLine } from "../core/types";
import { CLEANPRO } from "./cleanpro";
import { METRO } from "./metro";
import type { PracticeAdjustment, PracticeSet, PracticeTransaction } from "./types";

export const PRACTICE_SETS: PracticeSet[] = [CLEANPRO, METRO];
export const getPracticeSet = (id: string): PracticeSet | undefined => PRACTICE_SETS.find((s) => s.id === id);

export type PracticeItem = ({ type: "transaction" } & PracticeTransaction) | ({ type: "adjustment" } & PracticeAdjustment & { id: string });

/** Every item in the order the student works through them: transactions first, then adjustments. */
export const practiceItems = (set: PracticeSet): PracticeItem[] => [
  ...set.transactions.map((t) => ({ type: "transaction" as const, ...t })),
  ...set.adjustments.map((a) => ({ type: "adjustment" as const, ...a, id: `adj-${a.tag}` })),
];

/** The journal entry for one item with the given lines (the key's, or a student's). */
export function entryForItem(set: PracticeSet, item: PracticeItem, lines: JournalLine[]): JournalEntry {
  const id = `${set.id}-${item.id}`;
  return item.type === "transaction"
    ? createEntry({ date: item.date, kind: item.kind, lines, explanation: item.description }, { id })
    : { ...createEntry({ date: item.date, kind: "general", lines, explanation: item.description }, { id, stage: "adjusting", tag: item.tag }), adjType: item.adjType };
}

/** The whole set journalized from its own key. */
export const solutionEntries = (set: PracticeSet): JournalEntry[] => practiceItems(set).map((it) => entryForItem(set, it, it.key));
