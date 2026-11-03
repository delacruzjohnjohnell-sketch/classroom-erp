"use client";
import Link from "next/link";
import { BookOpen, ClipboardList, FileSpreadsheet, FileText, Library, NotebookPen, Table2 } from "lucide-react";
import { postToLedger } from "@/bfar/core/ledger-posting";
import { trialBalance } from "@/bfar/core/trial-balance";
import { Card, PageHeader, Pill } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const TOOLS = [
  { href: "/bfar/practice-sets", icon: ClipboardList, title: "Practice sets", text: "Two complete cycles with solution keys and Ballada-style hints: CleanPro (service) and Metro Hardware (merchandising)." },
  { href: "/bfar/journal", icon: NotebookPen, title: "Journal", text: "General journal and the four special journals. Debits must equal credits before an entry is accepted." },
  { href: "/bfar/ledger", icon: BookOpen, title: "Ledger", text: "Four-column accounts or T-accounts with footings, running balances and the trial balance." },
  { href: "/bfar/worksheet", icon: Table2, title: "Worksheet", text: "The 10-column worksheet, cross-footed, with a practice mode for the adjustment letters." },
  { href: "/bfar/statements", icon: FileSpreadsheet, title: "Statements", text: "PAS 1 statements, closing entries, post-closing trial balance and reversing entries. Print or save as PDF." },
  { href: "/bfar/reference", icon: Library, title: "Reference", text: "Normal balances, asset vs expense method, FOB terms, freight and credit terms." },
];

export default function BfarHome() {
  const hydrated = useHydrated();
  const entries = useAccountingStore((s) => s.entries);
  const tb = trialBalance(postToLedger(entries, ["transaction"]));
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
              <p className="text-sm text-slate-600 mt-1">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card title="Your books right now" className="mt-6">
        {!hydrated ? <p className="text-sm text-slate-500">Loading…</p> : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <FileText size={16} className="text-slate-500" />
            <span>{entries.length} journal {entries.length === 1 ? "entry" : "entries"}</span>
            {entries.length > 0 && <Pill ok={tb.balanced}>{tb.balanced ? "Trial balance balances" : "Trial balance does not balance"}</Pill>}
            {entries.length === 0 && <span className="text-slate-500">Nothing yet. Start with a practice set or the journal.</span>}
          </div>
        )}
      </Card>
    </>
  );
}
