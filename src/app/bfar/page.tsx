"use client";
import Link from "next/link";
import { BookOpen, ClipboardList, FileSpreadsheet, Library, NotebookPen, Table2 } from "lucide-react";
import { entriesOfBook, FREE_BOOK } from "@/bfar/core/student-work";
import { PRACTICE_SETS } from "@/bfar/practice-sets";
import { Card, PageHeader } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const TOOLS = [
  { href: "/bfar/practice-sets", icon: ClipboardList, title: "Practice sets", text: "Three complete cycles that start from source documents: CleanPro and Bayanihan (service) and Metro Hardware (merchandising). Your teacher checks your work." },
  { href: "/bfar/journal", icon: NotebookPen, title: "Journal", text: "General journal and the four special journals. Debits must equal credits before an entry is accepted." },
  { href: "/bfar/ledger", icon: BookOpen, title: "Ledger", text: "Post to the ledger accounts yourself and foot them. The trial balance builds itself from what you posted." },
  { href: "/bfar/worksheet", icon: Table2, title: "Worksheet", text: "Fill the 10-column worksheet by hand, with the adjustment letters." },
  { href: "/bfar/statements", icon: FileSpreadsheet, title: "Statements", text: "PAS 1 statements, closing entries, post-closing trial balance and reversing entries. Print or save as PDF." },
  { href: "/bfar/reference", icon: Library, title: "Reference", text: "Normal balances, asset vs expense method, FOB terms, freight and credit terms." },
];

export default function BfarHome() {
  const hydrated = useHydrated();
  const entries = useAccountingStore((s) => s.entries);
  return (
    <>
      <PageHeader
        title="Basic Financial Accounting and Reporting"
        subtitle="Prof. Win Ballada's accounting cycle for a sole proprietorship, following PFRS for SMEs and double-entry bookkeeping. Everything you enter is saved in this browser and works offline."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
            <Card className="h-full hover:border-blue-400 transition-colors">
              <t.icon size={20} className="text-blue-600 mb-2" />
              <div className="font-semibold">{t.title}</div>
              <p className="text-sm text-gray-600 mt-1">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card title="Your books right now" className="mt-6">
        {!hydrated ? <p className="text-sm text-gray-500">Loading…</p> : (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {[...PRACTICE_SETS.map((p) => ({ id: p.id, label: p.title })), { id: FREE_BOOK, label: "My own practice journal" }].map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
                <span>{b.label}</span><span className="text-gray-500">{entriesOfBook(entries, b.id).length} journal {entriesOfBook(entries, b.id).length === 1 ? "entry" : "entries"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
