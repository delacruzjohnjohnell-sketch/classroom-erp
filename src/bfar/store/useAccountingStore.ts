"use client";
// The student's working books, kept in the browser (offline first). Persisted to localStorage under "bfar-accounting-v1".
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createEntry, validateEntry, type EntryInput, type Validation } from "../core/journalizer";
import type { JournalEntry, JournalLine } from "../core/types";
import { entryForItem, getPracticeSet, practiceItems, solutionEntries } from "../practice-sets";

interface AccountingState {
  /** The working books: every entry across stages, in the order added. */
  entries: JournalEntry[];
  /** Student answers to the practice items: set id → item id → lines (even the wrong ones, so work is not lost). */
  answers: Record<string, Record<string, JournalLine[]>>;
  /** Instructor mode reveals the solution keys. */
  instructorMode: boolean;
  addEntry: (input: EntryInput) => Validation;
  removeEntry: (id: string) => void;
  saveAnswer: (setId: string, itemId: string, lines: JournalLine[]) => void;
  /** Records a correct practice answer in the books (replacing an earlier one for the same item). */
  commitPracticeItem: (setId: string, itemId: string, lines: JournalLine[]) => void;
  loadSolution: (setId: string) => void;
  /** Clears one practice set's entries and answers. */
  resetSet: (setId: string) => void;
  resetBooks: () => void;
  setInstructorMode: (on: boolean) => void;
}

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set) => ({
      entries: [],
      answers: {},
      instructorMode: false,
      addEntry: (input) => {
        const v = validateEntry(input);
        if (v.ok) set((s) => ({ entries: [...s.entries, createEntry(input)] }));
        return v;
      },
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      saveAnswer: (setId, itemId, lines) => set((s) => ({ answers: { ...s.answers, [setId]: { ...s.answers[setId], [itemId]: lines } } })),
      commitPracticeItem: (setId, itemId, lines) => {
        const ps = getPracticeSet(setId);
        const item = ps && practiceItems(ps).find((i) => i.id === itemId);
        if (!ps || !item) return;
        const entry = entryForItem(ps, item, lines);
        set((s) => ({ entries: [...s.entries.filter((e) => e.id !== entry.id), entry] }));
      },
      loadSolution: (setId) => {
        const ps = getPracticeSet(setId);
        if (ps) set((s) => ({ entries: [...s.entries.filter((e) => !e.id.startsWith(`${setId}-`)), ...solutionEntries(ps)] }));
      },
      resetSet: (setId) => set((s) => ({ entries: s.entries.filter((e) => !e.id.startsWith(`${setId}-`)), answers: { ...s.answers, [setId]: {} } })),
      resetBooks: () => set({ entries: [], answers: {} }),
      setInstructorMode: (on) => set({ instructorMode: on }),
    }),
    { name: "bfar-accounting-v1", version: 1, storage: createJSONStorage(() => localStorage), skipHydration: true },
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
