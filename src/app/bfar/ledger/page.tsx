"use client";
import { useState } from "react";
import { emptyWork, entriesOfBook, FREE_BOOK } from "@/bfar/core/student-work";
import { BookPicker } from "@/bfar/components/BookPicker";
import { GeneratedTrialBalanceView, LedgerWorkspace, SaveBar } from "@/bfar/components/StudentWorkspaces";
import { Card, PageHeader } from "@/bfar/components/ui";
import { PRACTICE_SETS } from "@/bfar/practice-sets";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const EMPTY = emptyWork();

export default function LedgerPage() {
  const hydrated = useHydrated();
  const book = useAccountingStore((s) => s.activeBook);
  const entries = useAccountingStore((s) => s.entries);
  const work = useAccountingStore((s) => s.work[book]) ?? EMPTY;
  const status = useAccountingStore((s) => s.status[book] ?? "draft");
  const saveWork = useAccountingStore((s) => s.saveWork);
  const [tab, setTab] = useState<"ledger" | "tb">("ledger");
  const locked = status === "released";
  const set = PRACTICE_SETS.find((s) => s.id === book);

  return (
    <>
      <PageHeader title="General ledger and trial balance" subtitle="Post your journal entries to the ledger accounts yourself and foot each account. The trial balance builds itself from what you posted, so a posting mistake shows up as an unbalanced trial balance." />
      <BookPicker />
      {!hydrated ? null : (
        <>
          <p className="text-xs text-slate-600 mb-3">{set ? set.title : "Free practice"}: post each line of your journal to the right account and side. Post the transactions only; the adjusting entries go on the worksheet.{book === FREE_BOOK ? " In your own practice journal a wrong drop is marked right away." : ""}</p>
          <div className="flex gap-1 mb-4">
            {([["ledger", "Ledger accounts"], ["tb", "Trial balance"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1 text-xs font-semibold border ${tab === id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-700"}`}>{label}</button>
            ))}
          </div>
          {tab === "ledger"
            ? <LedgerWorkspace accounts={work.ledger} entries={entriesOfBook(entries, book)} instantFeedback={book === FREE_BOOK} disabled={locked} onChange={(ledger) => saveWork(book, { ...work, ledger })} />
            : <GeneratedTrialBalanceView ledger={work.ledger} entries={entriesOfBook(entries, book)} />}
          <SaveBar book={book} />
        </>
      )}
    </>
  );
}
