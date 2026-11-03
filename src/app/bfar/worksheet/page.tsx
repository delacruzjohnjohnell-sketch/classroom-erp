"use client";
import { emptyWork, entriesOfBook } from "@/bfar/core/student-work";
import { BookPicker } from "@/bfar/components/BookPicker";
import { JournalReference, SaveBar, WorksheetWorkspace } from "@/bfar/components/StudentWorkspaces";
import { Card, PageHeader } from "@/bfar/components/ui";
import { PRACTICE_SETS } from "@/bfar/practice-sets";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const EMPTY = emptyWork();

export default function WorksheetPage() {
  const hydrated = useHydrated();
  const book = useAccountingStore((s) => s.activeBook);
  const entries = useAccountingStore((s) => s.entries);
  const work = useAccountingStore((s) => s.work[book]) ?? EMPTY;
  const status = useAccountingStore((s) => s.status[book] ?? "draft");
  const saveWork = useAccountingStore((s) => s.saveWork);
  const locked = status === "released";
  const set = PRACTICE_SETS.find((s) => s.id === book);
  const adjusting = entriesOfBook(entries, book).filter((e) => e.stage === "adjusting");

  return (
    <>
      <PageHeader title="Ten-column worksheet" subtitle="Fill the worksheet yourself: list the accounts, copy the trial balance, enter the adjustments with their letters, extend to the adjusted trial balance, then the income statement and balance sheet columns. Foot every column, place the net income or loss, and total. Nothing is calculated for you." />
      <BookPicker />
      {!hydrated ? null : (
        <>
          <Card title={`Adjusting entries${set ? `: ${set.title}` : ", free practice"}`} className="mb-4">
            <JournalReference entries={adjusting} />
          </Card>
          {set?.periodEndDocuments?.length ? <p className="text-xs text-slate-600 mb-3">This set has an inventory count sheet under Practice sets, in &quot;Papers for the end of the period&quot;. Enter the ending inventory in the Income Statement credit and Balance Sheet debit columns of the Merchandise Inventory line.</p> : null}
          <WorksheetWorkspace ws={work.worksheet} disabled={locked} onChange={(worksheet) => saveWork(book, { ...work, worksheet })} />
          <SaveBar book={book} />
        </>
      )}
    </>
  );
}
