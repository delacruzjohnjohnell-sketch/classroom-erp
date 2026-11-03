"use client";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { getAccount } from "@/bfar/core/chart-of-accounts";
import { entryRefs } from "@/bfar/core/ledger-posting";
import { sum } from "@/bfar/lib/currency";
import { entriesOfBook, FREE_BOOK } from "@/bfar/core/student-work";
import { BookPicker } from "@/bfar/components/BookPicker";
import type { JournalKind } from "@/bfar/core/types";
import { BalanceBadge, EntryLinesEditor, draftToLines, emptyDraft } from "@/bfar/components/EntryBuilder";
import { Card, Empty, Money, PageHeader } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const KINDS: { id: JournalKind | "all"; label: string }[] = [
  { id: "all", label: "All journals" },
  { id: "general", label: "General journal" },
  { id: "sales", label: "Sales journal" },
  { id: "purchases", label: "Purchases journal" },
  { id: "cash-receipts", label: "Cash receipts journal" },
  { id: "cash-disbursements", label: "Cash disbursements journal" },
];
const STAGE_LABEL = { transaction: "", adjusting: "Adjusting", closing: "Closing", reversing: "Reversing" } as const;

export default function JournalPage() {
  const hydrated = useHydrated();
  const allEntries = useAccountingStore((s) => s.entries);
  const book = useAccountingStore((s) => s.activeBook);
  const entries = useMemo(() => entriesOfBook(allEntries, book), [allEntries, book]);
  const addEntry = useAccountingStore((s) => s.addEntry);
  const removeEntry = useAccountingStore((s) => s.removeEntry);
  const [date, setDate] = useState("2026-12-01");
  const [kind, setKind] = useState<JournalKind>("general");
  const [draft, setDraft] = useState(emptyDraft());
  const [explanation, setExplanation] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [view, setView] = useState<JournalKind | "all">("all");

  const lines = draftToLines(draft);
  const refs = useMemo(() => entryRefs(entries), [entries]);
  const shown = useMemo(() => entries.filter((e) => view === "all" || e.kind === view).sort((a, b) => a.date.localeCompare(b.date)), [entries, view]);

  const submit = () => {
    const res = addEntry({ date, kind, lines, explanation });
    setErrors(res.errors);
    if (res.ok) { setDraft(emptyDraft()); setExplanation(""); }
  };

  return (
    <>
      <PageHeader title="Journal" subtitle="Record each transaction as a journal entry. Debit lines first, credit lines indented. The entry is only accepted when total debits equal total credits." />
      <BookPicker />
      {book !== FREE_BOOK ? <Card><p className="text-sm text-gray-600">This is your journal for the practice set, built from the source documents. Journalize on the Practice sets page. Choose &quot;My own practice journal&quot; above to record your own entries.</p></Card> : <Card title="New entry">
        <div className="flex flex-wrap gap-3 mb-3 text-sm">
          <label className="flex flex-col gap-1">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1">Journal
            <select value={kind} onChange={(e) => setKind(e.target.value as JournalKind)} className="rounded border border-gray-300 px-2 py-1.5">
              {KINDS.filter((k) => k.id !== "all").map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <EntryLinesEditor draft={draft} onChange={setDraft} />
        <label className="flex flex-col gap-1 text-sm mt-3">Explanation
          <input value={explanation} onChange={(e) => setExplanation(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5" placeholder="e.g. Owner invested cash to start the business" />
        </label>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <BalanceBadge lines={lines} />
          <button type="button" onClick={submit} className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Record entry</button>
        </div>
        {errors.length > 0 && <ul className="mt-2 text-sm text-rose-700 list-disc pl-5" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </Card>}

      <div className="flex flex-wrap gap-1 mt-6 mb-3">
        {KINDS.map((k) => <button key={k.id} type="button" onClick={() => setView(k.id)} className={`rounded-full px-3 py-1 text-xs font-semibold border ${view === k.id ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-700"}`}>{k.label}</button>)}
      </div>
      {!hydrated ? null : shown.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-xs text-gray-600">
              <tr><th className="p-2 w-28">Date</th><th className="p-2">Particulars</th><th className="p-2 w-16">PR</th><th className="p-2 w-32 text-right">Debit</th><th className="p-2 w-32 text-right">Credit</th><th className="w-8" /></tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-gray-200 align-top">
                  <td className="p-2 whitespace-nowrap">{e.date}</td>
                  <td className="p-2">
                    {e.lines.map((l, i) => <div key={i} className={l.credit > 0 ? "pl-8" : ""}>{getAccount(l.accountCode)?.name}</div>)}
                    <div className="italic text-gray-500 mt-1">({e.explanation}){STAGE_LABEL[e.stage] && <span className="not-italic font-semibold ml-2 text-xs text-gray-600">{STAGE_LABEL[e.stage]}{e.tag ? ` (${e.tag})` : ""}</span>}</div>
                  </td>
                  <td className="p-2">{refs.get(e.id)}</td>
                  <td className="p-2 text-right">{e.lines.map((l, i) => <div key={i}><Money value={l.debit} />&nbsp;</div>)}</td>
                  <td className="p-2 text-right">{e.lines.map((l, i) => <div key={i}><Money value={l.credit} />&nbsp;</div>)}</td>
                  <td className="p-2">{book === FREE_BOOK && <button type="button" onClick={() => removeEntry(e.id)} aria-label="Delete entry" className="text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-semibold">
                <td className="p-2" colSpan={3}>Totals (footed)</td>
                <td className="p-2 text-right"><Money value={sum(shown.flatMap((e) => e.lines.map((l) => l.debit)))} peso /></td>
                <td className="p-2 text-right"><Money value={sum(shown.flatMap((e) => e.lines.map((l) => l.credit)))} peso /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
