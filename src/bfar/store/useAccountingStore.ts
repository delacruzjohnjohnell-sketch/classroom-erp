"use client";
// The student's working books, kept in the browser (offline first) and tied to the signed-in user. Persisted to localStorage under "bfar-accounting-v1".
// Answers are the student's own: nothing here is checked against a key. The teacher checks the saved submission.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createEntry, validateEntry, type EntryInput, type Validation } from "../core/journalizer";
import { emptyWork, FREE_BOOK, type StudentWork, type WorkMarking } from "../core/student-work";
import type { JournalEntry, JournalLine } from "../core/types";
import { entryForItem, getPracticeSet, practiceItems } from "../practice-sets";

export type SubmissionStatus = "draft" | "submitted" | "released";

/** What the teacher marked, returned by the database only after the teacher released it. */
export interface ReleasedResult {
  score: number;
  max: number;
  comment: string | null;
  items: { id: string; status: string; messages: string[]; hints: string[]; key: JournalLine[]; answer: JournalLine[] }[];
  /** The marking of the ledger, trial balance and worksheet the student built. */
  work?: WorkMarking;
}

interface AccountingState {
  /** The user these books belong to; books are cleared when someone else signs in on the same browser. */
  owner: string | null;
  /** The working books: every entry across stages, in the order added. */
  entries: JournalEntry[];
  /** Student answers to the practice items: set id → item id → lines (even incomplete ones, so work is not lost). */
  answers: Record<string, Record<string, JournalLine[]>>;
  /** The ledger, trial balance and worksheet the student built by hand, per book. */
  work: Record<string, StudentWork | undefined>;
  /** The book (practice set or the free journal) the pages are working on. */
  activeBook: string;
  setBook: (book: string) => void;
  saveWork: (book: string, work: StudentWork) => void;
  status: Record<string, SubmissionStatus>;
  released: Record<string, ReleasedResult | undefined>;
  setOwner: (userId: string) => void;
  addEntry: (input: EntryInput) => Validation;
  removeEntry: (id: string) => void;
  /** Keeps the answer, and records it in the books when it is a complete, balanced entry (otherwise takes it out of the books). */
  saveItem: (setId: string, itemId: string, lines: JournalLine[]) => void;
  /** Replaces a set's answers with what the server holds. */
  loadFromServer: (setId: string, answers: Record<string, JournalLine[]>, status: SubmissionStatus, released?: ReleasedResult, work?: StudentWork) => void;
  setStatus: (setId: string, status: SubmissionStatus) => void;
  resetSet: (setId: string) => void;
  resetBooks: () => void;
}

const rebuild = (setId: string, answers: Record<string, JournalLine[]>): JournalEntry[] => {
  const ps = getPracticeSet(setId);
  if (!ps) return [];
  const out: JournalEntry[] = [];
  for (const item of practiceItems(ps)) {
    const lines = answers[item.id];
    if (!lines || lines.length === 0) continue;
    try { out.push(entryForItem(ps, item, lines)); } catch { /* incomplete or unbalanced: not in the books yet */ }
  }
  return out;
};

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set) => ({
      owner: null,
      entries: [],
      answers: {},
      status: {},
      released: {},
      work: {},
      activeBook: FREE_BOOK,
      setBook: (book) => set({ activeBook: book }),
      saveWork: (book, work) => set((s) => ({ work: { ...s.work, [book]: work } })),
      setOwner: (userId) => set((s) => (s.owner === userId ? s : { owner: userId, entries: [], answers: {}, status: {}, released: {}, work: {}, activeBook: FREE_BOOK })),
      addEntry: (input) => {
        const v = validateEntry(input);
        if (v.ok) set((s) => ({ entries: [...s.entries, createEntry(input)] }));
        return v;
      },
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      saveItem: (setId, itemId, lines) => set((s) => {
        const ps = getPracticeSet(setId);
        const item = ps && practiceItems(ps).find((i) => i.id === itemId);
        const id = `${setId}-${itemId}`;
        let entries = s.entries.filter((e) => e.id !== id);
        if (ps && item && lines.length > 0) { try { entries = [...entries, entryForItem(ps, item, lines)]; } catch { /* not complete yet */ } }
        return { entries, answers: { ...s.answers, [setId]: { ...s.answers[setId], [itemId]: lines } } };
      }),
      loadFromServer: (setId, answers, status, released, work) => set((s) => ({
        entries: [...s.entries.filter((e) => !e.id.startsWith(`${setId}-`)), ...rebuild(setId, answers)],
        answers: { ...s.answers, [setId]: answers },
        status: { ...s.status, [setId]: status },
        released: { ...s.released, [setId]: released },
        work: { ...s.work, [setId]: work ?? s.work[setId] },
      })),
      setStatus: (setId, status) => set((s) => ({ status: { ...s.status, [setId]: status } })),
      resetSet: (setId) => set((s) => ({ entries: s.entries.filter((e) => !e.id.startsWith(`${setId}-`)), answers: { ...s.answers, [setId]: {} }, work: { ...s.work, [setId]: emptyWork() } })),
      resetBooks: () => set({ entries: [], answers: {}, status: {}, released: {}, work: {} }),
    }),
    { name: "bfar-accounting-v1", version: 3, storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** True once the persisted books have been read from the browser; render the books only after this to avoid a server/client mismatch. */
export function useHydrated(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    void Promise.resolve(useAccountingStore.persist.rehydrate()).then(() => setDone(true));
  }, []);
  return done;
}
