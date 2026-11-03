// TEACHER ONLY. Joins the solution keys to the practice sets: the full solution as journal entries, and grading of a student's answers.
// Never import this from a student-facing page, or the keys end up in the students' download.
import { evaluateEntry, type EvalStatus } from "../core/evaluator";
import type { JournalEntry, JournalLine } from "../core/types";
import { entryForItem, practiceItems } from "./index";
import { KEYS } from "./keys";
import type { PracticeSet } from "./types";

export const keyOf = (setId: string, itemId: string) => KEYS[setId]?.items[itemId];
export const expectedOf = (setId: string) => KEYS[setId]?.expected;

export const solutionEntries = (set: PracticeSet): JournalEntry[] =>
  practiceItems(set).map((it) => entryForItem(set, it, KEYS[set.id].items[it.id].key));

export interface CheckedItem { id: string; status: EvalStatus; messages: string[]; hints: string[]; key: JournalLine[]; answer: JournalLine[] }
export interface Marking { items: CheckedItem[]; score: number; max: number }

/** Grades a student's answers (item id → lines) against the key. An unanswered item counts as empty. */
export function gradeSubmission(set: PracticeSet, answers: Record<string, JournalLine[] | undefined>): Marking {
  const items = practiceItems(set).map((it): CheckedItem => {
    const k = KEYS[set.id].items[it.id];
    const answer = answers[it.id] ?? [];
    const r = evaluateEntry(answer, k.key, { hint: k.hint });
    return { id: it.id, status: r.status, messages: r.messages, hints: r.hints, key: k.key, answer };
  });
  return { items, score: items.filter((i) => i.status === "correct").length, max: items.length };
}
