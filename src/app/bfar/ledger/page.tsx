"use client";
import { useMemo, useState } from "react";
import { postToLedger, toTAccount, type Stage } from "@/bfar/core/ledger-posting";
import { trialBalance } from "@/bfar/core/trial-balance";
import type { AccountType } from "@/bfar/core/types";
import { Card, Empty, Money, PageHeader, Pill } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const CATS: { id: AccountType | "all"; label: string }[] = [
  { id: "all", label: "All accounts" }, { id: "asset", label: "Assets" }, { id: "liability", label: "Liabilities" },
  { id: "equity", label: "Equity" }, { id: "revenue", label: "Revenues" }, { id: "expense", label: "Expenses" },
];

export default function LedgerPage() {
  const hydrated = useHydrated();
  const entries = useAccountingStore((s) => s.entries);
  const [mode, setMode] = useState<"gl" | "t">("gl");
  const [cat, setCat] = useState<AccountType | "all">("all");
  const [adjusted, setAdjusted] = useState(true);
  const [period, setPeriod] = useState(false);

  const stages: Stage[] = useMemo(() => (period ? ["transaction", "adjusting", "closing", "reversing"] : adjusted ? ["transaction", "adjusting"] : ["transaction"]), [adjusted, period]);
  const ledger = useMemo(() => postToLedger(entries, stages), [entries, stages]);
  const shown = ledger.filter((l) => cat === "all" || l.account.type === cat);
  const tb = useMemo(() => trialBalance(ledger), [ledger]);

  return (
    <>
      <PageHeader title="General ledger" subtitle="Every journal entry posted to its account. Switch between the four-column account and the T-account with footings."
        actions={<div className="flex rounded-md border border-slate-300 overflow-hidden text-sm">
          {(["gl", "t"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{m === "gl" ? "4-column" : "T-accounts"}</button>)}
        </div>} />
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        {CATS.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`rounded-full px-3 py-1 text-xs font-semibold border ${cat === c.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-700"}`}>{c.label}</button>)}
        <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={adjusted || period} disabled={period} onChange={(e) => setAdjusted(e.target.checked)} /> Include adjusting entries</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={period} onChange={(e) => setPeriod(e.target.checked)} /> Include closing and reversing</label>
      </div>

      {!hydrated ? null : shown.length === 0 ? <Empty>Nothing posted yet. Record entries in the journal or work a practice set.</Empty> : mode === "gl" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((l) => (
            <div key={l.account.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 text-sm font-semibold flex justify-between"><span>{l.account.name}</span><span className="text-slate-500">Account No. {l.account.code}</span></div>
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500"><tr><th className="p-1.5">Date</th><th className="p-1.5">Explanation</th><th className="p-1.5">PR</th><th className="p-1.5 text-right">Debit</th><th className="p-1.5 text-right">Credit</th><th className="p-1.5 text-right">Balance</th></tr></thead>
                <tbody>
                  {l.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-1.5 whitespace-nowrap">{r.date.slice(5)}</td><td className="p-1.5">{r.explanation}</td><td className="p-1.5">{r.ref}</td>
                      <td className="p-1.5 text-right"><Money value={r.debit} /></td><td className="p-1.5 text-right"><Money value={r.credit} /></td>
                      <td className="p-1.5 text-right"><Money value={r.balance} blankZero={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => {
            const t = toTAccount(l);
            return (
              <div key={t.code} className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-center text-sm font-semibold border-b-2 border-slate-800 pb-1">{t.name} <span className="text-slate-500 font-normal">({t.code})</span></div>
                <div className="grid grid-cols-2 text-xs min-h-[3rem]">
                  <div className="border-r-2 border-slate-800 pr-2 pt-1">{t.debits.map((d, i) => <div key={i} className="flex justify-between"><span className="text-slate-500">{d.date.slice(5)}</span><Money value={d.amount} /></div>)}</div>
                  <div className="pl-2 pt-1">{t.credits.map((c, i) => <div key={i} className="flex justify-between"><span className="text-slate-500">{c.date.slice(5)}</span><Money value={c.amount} /></div>)}</div>
                </div>
                <div className="grid grid-cols-2 text-xs border-t border-slate-800 mt-1 pt-1 text-slate-600">
                  <div className="pr-2 text-right"><Money value={t.debitFooting} blankZero={false} /></div>
                  <div className="pl-2 text-right"><Money value={t.creditFooting} blankZero={false} /></div>
                </div>
                <div className="text-xs font-semibold mt-1 text-right">Balance: <Money value={t.balance} peso blankZero={false} /> {t.balanceSide === "debit" ? "Dr" : "Cr"}</div>
              </div>
            );
          })}
        </div>
      )}

      {hydrated && ledger.length > 0 && (
        <Card title="Trial balance" className="mt-6">
          <table className="w-full text-sm max-w-2xl">
            <thead className="text-left text-xs text-slate-500"><tr><th className="p-1.5 w-20">Acct</th><th className="p-1.5">Account title</th><th className="p-1.5 text-right w-36">Debit</th><th className="p-1.5 text-right w-36">Credit</th></tr></thead>
            <tbody>{tb.rows.map((r) => <tr key={r.code} className="border-t border-slate-100"><td className="p-1.5">{r.code}</td><td className="p-1.5">{r.name}</td><td className="p-1.5 text-right"><Money value={r.debit} /></td><td className="p-1.5 text-right"><Money value={r.credit} /></td></tr>)}</tbody>
            <tfoot><tr className="font-bold"><td colSpan={2} className="p-1.5">Total</td><td className="p-1.5 text-right"><span className="inline-block border-b-4 border-double border-slate-900"><Money value={tb.totalDebit} peso blankZero={false} /></span></td><td className="p-1.5 text-right"><span className="inline-block border-b-4 border-double border-slate-900"><Money value={tb.totalCredit} peso blankZero={false} /></span></td></tr></tfoot>
          </table>
          <div className="mt-2"><Pill ok={tb.balanced}>{tb.balanced ? "Debits equal credits" : "Debits and credits differ"}</Pill></div>
        </Card>
      )}
    </>
  );
}
