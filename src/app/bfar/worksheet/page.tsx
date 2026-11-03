"use client";
import { emptyWork, entriesOfBook, generateTrialBalance } from "@/bfar/core/student-work";
import { BookPicker } from "@/bfar/components/BookPicker";
import { SaveBar, WorksheetWorkspace } from "@/bfar/components/StudentWorkspaces";
import { PageHeader } from "@/bfar/components/ui";
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
  const bookEntries = entriesOfBook(entries, book);
  const tb = generateTrialBalance(work.ledger, bookEntries.filter((e) => e.stage === "transaction"));

  return (
    <>
      <PageHeader title="Ten-column worksheet" subtitle="The trial balance comes from your ledger. Click an adjusting line, then the Dr or Cr cell of its account (columns 3 and 4); the adjusted trial balance works itself out. Then click each adjusted balance and the column it belongs in (7 to 10). Type the subtotals, the net income or loss, and the totals." />
      <BookPicker />
      {!hydrated ? null : (
        <>
          {set?.periodEndDocuments?.length ? <p className="text-xs text-gray-600 mb-3">This set has an inventory count sheet under Practice sets, in &quot;Papers for the end of the period&quot;. Type the ending inventory in the Income Statement credit (8) and Balance Sheet debit (9) cells of the Merchandise Inventory row, and click its beginning balance into the Income Statement debit (7).</p> : null}
          <WorksheetWorkspace ws={work.worksheet} tb={tb} adjEntries={bookEntries.filter((e) => e.stage === "adjusting")} periodic={set?.inventory === "periodic"} disabled={locked} onChange={(worksheet) => saveWork(book, { ...work, worksheet })} />
          <SaveBar book={book} />
        </>
      )}
    </>
  );
}
