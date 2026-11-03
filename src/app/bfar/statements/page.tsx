"use client";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { getAccount } from "@/bfar/core/chart-of-accounts";
import { closingEntries } from "@/bfar/core/closing-engine";
import { postClosingTrialBalance } from "@/bfar/core/post-closing-tb";
import { reversingEntries } from "@/bfar/core/reversing-engine";
import { generateStatements } from "@/bfar/core/statements-generator";
import type { BusinessType, InventorySystem, JournalEntry } from "@/bfar/core/types";
import { parsePesos } from "@/bfar/lib/currency";
import { PRACTICE_SETS } from "@/bfar/practice-sets";
import { entriesOfBook } from "@/bfar/core/student-work";
import { BookPicker } from "@/bfar/components/BookPicker";
import { Card, Empty, Money, PageHeader, Pill, StatementView } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

type Tab = "income" | "equity" | "position" | "cashFlows" | "period";
const TABS: { id: Tab; label: string }[] = [
  { id: "income", label: "Comprehensive income" }, { id: "equity", label: "Changes in equity" },
  { id: "position", label: "Financial position" }, { id: "cashFlows", label: "Cash flows" }, { id: "period", label: "Closing, post-closing, reversing" },
];

function EntryTable({ entries, empty }: { entries: JournalEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-t border-gray-100 align-top">
            <td className="p-1.5 w-24 whitespace-nowrap">{e.date}</td>
            <td className="p-1.5">{e.lines.map((l, i) => <div key={i} className={l.credit > 0 ? "pl-8" : ""}>{getAccount(l.accountCode)?.name}</div>)}<div className="italic text-gray-500">({e.explanation})</div></td>
            <td className="p-1.5 text-right w-32">{e.lines.map((l, i) => <div key={i}><Money value={l.debit} />&nbsp;</div>)}</td>
            <td className="p-1.5 text-right w-32">{e.lines.map((l, i) => <div key={i}><Money value={l.credit} />&nbsp;</div>)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatementsPage() {
  const book = useAccountingStore((s) => s.activeBook);
  // Remount when the book changes so each book starts with its own settings.
  return <StatementsInner key={book} book={book} />;
}

function StatementsInner({ book }: { book: string }) {
  const hydrated = useHydrated();
  const init = PRACTICE_SETS.find((x) => x.id === book);
  const allEntries = useAccountingStore((s) => s.entries);
  const entries = useMemo(() => entriesOfBook(allEntries, book), [allEntries, book]);
  const [tab, setTab] = useState<Tab>("income");
  const [business, setBusiness] = useState<BusinessType>(init?.business ?? "service");
  const [inventory, setInventory] = useState<InventorySystem>(init?.inventory ?? "periodic");
  const [ending, setEnding] = useState(init?.endingInventory ? (init.endingInventory / 100).toFixed(2) : "");
  const [entity, setEntity] = useState(init?.entity ?? "Your Business Name");
  const [period, setPeriod] = useState(init?.period ?? "For the month ended December 31, 2026");
  const [asOf, setAsOf] = useState(init?.asOf ?? "December 31, 2026");
  const [closingDate, setClosingDate] = useState(init?.closingDate ?? "2026-12-31");
  const [reversingDate, setReversingDate] = useState(init?.reversingDate ?? "2027-01-01");

  const applySet = (id: string) => {
    const s = PRACTICE_SETS.find((x) => x.id === id);
    if (!s) return;
    setBusiness(s.business); setInventory(s.inventory ?? "periodic"); setEnding(s.endingInventory ? (s.endingInventory / 100).toFixed(2) : "");
    setEntity(s.entity); setPeriod(s.period); setAsOf(s.asOf); setClosingDate(s.closingDate); setReversingDate(s.reversingDate);
  };

  const endingInventory = business === "merchandising" && inventory === "periodic" ? (parsePesos(ending) ?? 0) : undefined;
  const books = useMemo(() => entries.filter((e) => e.stage === "transaction" || e.stage === "adjusting"), [entries]);
  const st = useMemo(() => generateStatements(books, { business, inventory, endingInventory, entity, period, asOf }), [books, business, inventory, endingInventory, entity, period, asOf]);
  const closing = useMemo(() => closingEntries(books, closingDate, { endingInventory }), [books, closingDate, endingInventory]);
  const postClosing = useMemo(() => postClosingTrialBalance([...books, ...closing.entries]), [books, closing]);
  const reversing = useMemo(() => reversingEntries(books, reversingDate), [books, reversingDate]);

  return (
    <>
      <PageHeader title="Financial statements" subtitle="Prepared under PAS 1 from the journal entries of the chosen book. Single underline for subtotals, double underline for totals."
        actions={<button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"><Printer size={14} /> Print / Save as PDF</button>} />
      <BookPicker />
      <Card className="mb-4 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <label className="flex flex-col gap-1">Use the settings of
            <select defaultValue="" onChange={(e) => applySet(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5"><option value="" disabled>Choose a practice set</option>{PRACTICE_SETS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          <label className="flex flex-col gap-1">Type of business
            <select value={business} onChange={(e) => setBusiness(e.target.value as BusinessType)} className="rounded border border-gray-300 px-2 py-1.5"><option value="service">Service</option><option value="merchandising">Merchandising</option></select></label>
          {business === "merchandising" && (
            <>
              <label className="flex flex-col gap-1">Inventory system
                <select value={inventory} onChange={(e) => setInventory(e.target.value as InventorySystem)} className="rounded border border-gray-300 px-2 py-1.5"><option value="periodic">Periodic</option><option value="perpetual">Perpetual</option></select></label>
              {inventory === "periodic" && <label className="flex flex-col gap-1">Ending inventory (physical count)
                <input value={ending} onChange={(e) => setEnding(e.target.value)} inputMode="decimal" className="rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums" /></label>}
            </>
          )}
          <label className="flex flex-col gap-1">Business name<input value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1">Period heading<input value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1">Position date<input value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5" /></label>
        </div>
      </Card>

      <div className="flex flex-wrap gap-1 mb-4 print:hidden">
        {TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1 text-xs font-semibold border ${tab === t.id ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-700"}`}>{t.label}</button>)}
      </div>

      {!hydrated ? null : books.length === 0 ? <Empty>No books yet. Record entries in the journal or load a practice set solution.</Empty> : tab === "period" ? (
        <div className="grid gap-4">
          <Card title="Closing entries (revenue, expenses, income summary, drawing)">
            <label className="text-sm flex items-center gap-2 mb-2 print:hidden">Date<input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1" /></label>
            <EntryTable entries={closing.entries} empty="There is nothing to close yet." />
          </Card>
          <Card title="Post-closing trial balance">
            <table className="w-full text-sm max-w-2xl">
              <tbody>{postClosing.rows.map((r) => <tr key={r.code} className="border-t border-gray-100"><td className="p-1.5 w-16">{r.code}</td><td className="p-1.5">{r.name}</td><td className="p-1.5 text-right w-36"><Money value={r.debit} /></td><td className="p-1.5 text-right w-36"><Money value={r.credit} /></td></tr>)}</tbody>
              <tfoot><tr className="font-bold border-t-2 border-gray-800"><td colSpan={2} className="p-1.5">Total</td><td className="p-1.5 text-right"><Money value={postClosing.totalDebit} peso blankZero={false} /></td><td className="p-1.5 text-right"><Money value={postClosing.totalCredit} peso blankZero={false} /></td></tr></tfoot>
            </table>
            <div className="flex gap-2 mt-2"><Pill ok={postClosing.balanced}>{postClosing.balanced ? "Balanced" : "Not balanced"}</Pill><Pill ok={postClosing.onlyPermanentAccounts}>{postClosing.onlyPermanentAccounts ? "Only permanent accounts remain" : "A temporary account still has a balance"}</Pill></div>
          </Card>
          <Card title="Reversing entries (accruals, expense-method prepaids, income-method unearned)">
            <label className="text-sm flex items-center gap-2 mb-2 print:hidden">Date<input type="date" value={reversingDate} onChange={(e) => setReversingDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1" /></label>
            <EntryTable entries={reversing} empty="No adjustment in these books needs reversing." />
          </Card>
        </div>
      ) : (
        <>
          <StatementView statement={st[tab]} entity={entity} />
          <div className="max-w-3xl mx-auto mt-3 flex flex-wrap gap-2 print:hidden">
            {tab === "position" && <Pill ok={st.balanced}>{st.balanced ? "Assets equal liabilities plus equity" : "Assets do not equal liabilities plus equity"}</Pill>}
            {tab === "cashFlows" && <Pill ok={st.cashReconciles}>{st.cashReconciles ? "Ending cash agrees with the ledger" : "Ending cash differs from the ledger"}</Pill>}
          </div>
        </>
      )}
    </>
  );
}
