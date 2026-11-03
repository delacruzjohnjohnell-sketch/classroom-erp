"use client";
// Chooses which book a page works on: one of the practice sets, or the student's own free journal. Books are never mixed.
import { FREE_BOOK } from "../core/student-work";
import { PRACTICE_SETS } from "../practice-sets";
import { useAccountingStore } from "../store/useAccountingStore";

export function BookPicker() {
  const book = useAccountingStore((s) => s.activeBook);
  const setBook = useAccountingStore((s) => s.setBook);
  const books = [...PRACTICE_SETS.map((s) => ({ id: s.id, label: s.title })), { id: FREE_BOOK, label: "My own practice journal" }];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4 print:hidden" role="tablist" aria-label="Book">
      <span className="text-xs font-semibold text-slate-500 mr-1">Book:</span>
      {books.map((b) => (
        <button key={b.id} type="button" role="tab" aria-selected={book === b.id} onClick={() => setBook(b.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold border ${book === b.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{b.label}</button>
      ))}
    </div>
  );
}
