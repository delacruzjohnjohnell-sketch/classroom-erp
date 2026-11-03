"use client";
// The places where students do the work themselves: post to ledger accounts, build the trial balance, fill the 10-column worksheet.
// Nothing is calculated or checked here. The teacher checks it.
import { Plus, Trash2 } from "lucide-react";
import { CHART_OF_ACCOUNTS, getAccount } from "../core/chart-of-accounts";
import { emptyLedgerAccount, emptyLedgerRow, type LedgerAccountIn, type LedgerRowIn, type TbRowIn, type TrialBalanceIn, type WorksheetIn, type WsRowIn } from "../core/student-work";
import type { JournalEntry } from "../core/types";
import { COLUMN_KEYS, type ColumnKey } from "../core/worksheet-engine";
import { formatAmount } from "../lib/currency";
import { useState } from "react";
import { saveMine } from "../lib/bfarApi";
import { emptyWork, FREE_BOOK } from "../core/student-work";
import { useAccountingStore } from "../store/useAccountingStore";
import { Card, Empty } from "./ui";

const input = "w-full rounded border border-slate-300 px-1.5 py-1 text-xs";
const num = `${input} text-right tabular-nums`;

function AccountSelect({ value, onChange, disabled, taken = [] }: { value: string; onChange: (code: string) => void; disabled?: boolean; taken?: string[] }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={input} aria-label="Account">
      <option value="">Choose an account</option>
      {CHART_OF_ACCOUNTS.map((a) => <option key={a.code} value={a.code} disabled={taken.includes(a.code) && a.code !== value}>{a.code} {a.name}</option>)}
    </select>
  );
}

/** The student's own journal for the book, read only, to post from. */
export function JournalReference({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) return <Empty>Nothing in this book&apos;s journal yet. Journalize first.</Empty>;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 text-left text-slate-600 sticky top-0"><tr><th className="p-1.5 w-20">Date</th><th className="p-1.5">Particulars</th><th className="p-1.5 w-24 text-right">Debit</th><th className="p-1.5 w-24 text-right">Credit</th></tr></thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id} className="border-t border-slate-100 align-top">
              <td className="p-1.5 whitespace-nowrap">{e.date.slice(5)}{e.tag ? ` (${e.tag})` : ""}</td>
              <td className="p-1.5">{e.lines.map((l, i) => <div key={i} className={l.credit > 0 ? "pl-5" : ""}>{getAccount(l.accountCode)?.name}</div>)}</td>
              <td className="p-1.5 text-right">{e.lines.map((l, i) => <div key={i}>{l.debit ? formatAmount(l.debit) : " "}</div>)}</td>
              <td className="p-1.5 text-right">{e.lines.map((l, i) => <div key={i}>{l.credit ? formatAmount(l.credit) : " "}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LedgerWorkspace({ accounts, onChange, disabled }: { accounts: LedgerAccountIn[]; onChange: (a: LedgerAccountIn[]) => void; disabled?: boolean }) {
  const taken = accounts.map((a) => a.code);
  const patch = (i: number, p: Partial<LedgerAccountIn>) => onChange(accounts.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const patchRow = (i: number, r: number, p: Partial<LedgerRowIn>) => patch(i, { rows: accounts[i].rows.map((x, k) => (k === r ? { ...x, ...p } : x)) });
  return (
    <div>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2 mb-3 max-w-xl">
          <AccountSelect value="" taken={taken} onChange={(code) => code && onChange([...accounts, emptyLedgerAccount(code)])} />
          <span className="text-xs text-slate-500">Choose an account to open it in your ledger.</span>
        </div>
      )}
      {accounts.length === 0 ? <Empty>No ledger accounts yet. Open an account, then post each journal entry to it.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((a, i) => (
            <div key={a.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 text-sm font-semibold flex justify-between items-center">
                <span>{getAccount(a.code)?.name}</span>
                <span className="flex items-center gap-3 text-slate-500 font-normal">Account No. {a.code}{!disabled && <button type="button" aria-label={`Remove ${a.code}`} onClick={() => onChange(accounts.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>}</span>
              </div>
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500"><tr><th className="p-1 w-16">Date</th><th className="p-1">Explanation</th><th className="p-1 w-14">PR</th><th className="p-1 w-20">Debit</th><th className="p-1 w-20">Credit</th><th className="p-1 w-20">Balance</th></tr></thead>
                <tbody>
                  {a.rows.map((r, k) => (
                    <tr key={k}>
                      <td className="p-0.5"><input className={input} disabled={disabled} value={r.date} placeholder="12-01" aria-label="Date" onChange={(e) => patchRow(i, k, { date: e.target.value })} /></td>
                      <td className="p-0.5"><input className={input} disabled={disabled} value={r.particulars} aria-label="Explanation" onChange={(e) => patchRow(i, k, { particulars: e.target.value })} /></td>
                      <td className="p-0.5"><input className={input} disabled={disabled} value={r.pr} aria-label="Posting reference" onChange={(e) => patchRow(i, k, { pr: e.target.value })} /></td>
                      <td className="p-0.5"><input className={num} disabled={disabled} value={r.debit} inputMode="decimal" aria-label="Debit" onChange={(e) => patchRow(i, k, { debit: e.target.value })} /></td>
                      <td className="p-0.5"><input className={num} disabled={disabled} value={r.credit} inputMode="decimal" aria-label="Credit" onChange={(e) => patchRow(i, k, { credit: e.target.value })} /></td>
                      <td className="p-0.5"><input className={num} disabled={disabled} value={r.balance} inputMode="decimal" aria-label="Running balance" onChange={(e) => patchRow(i, k, { balance: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!disabled && <button type="button" onClick={() => patch(i, { rows: [...a.rows, emptyLedgerRow()] })} className="m-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus size={12} /> Add a row</button>}
              <div className="grid grid-cols-[1fr_6rem_6rem_5rem] gap-2 items-center border-t border-slate-200 p-2 text-xs">
                <span className="font-semibold text-slate-600">Footings and ending balance</span>
                <input className={num} disabled={disabled} value={a.debitFooting} inputMode="decimal" placeholder="Total Dr" aria-label="Total debits" onChange={(e) => patch(i, { debitFooting: e.target.value })} />
                <input className={num} disabled={disabled} value={a.creditFooting} inputMode="decimal" placeholder="Total Cr" aria-label="Total credits" onChange={(e) => patch(i, { creditFooting: e.target.value })} />
                <span />
                <span className="text-slate-500">Ending balance</span>
                <input className={num} disabled={disabled} value={a.balance} inputMode="decimal" placeholder="Balance" aria-label="Ending balance" onChange={(e) => patch(i, { balance: e.target.value })} />
                <select className={input} disabled={disabled} value={a.side} aria-label="Balance side" onChange={(e) => patch(i, { side: e.target.value as LedgerAccountIn["side"] })}><option value="">Dr / Cr</option><option value="Dr">Dr</option><option value="Cr">Cr</option></select>
                <span />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrialBalanceWorkspace({ tb, onChange, disabled }: { tb: TrialBalanceIn; onChange: (t: TrialBalanceIn) => void; disabled?: boolean }) {
  const taken = tb.rows.map((r) => r.code);
  const patchRow = (i: number, p: Partial<TbRowIn>) => onChange({ ...tb, rows: tb.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Card>
      <table className="w-full text-sm max-w-3xl">
        <thead className="text-left text-xs text-slate-500"><tr><th className="p-1">Account title</th><th className="p-1 w-32 text-right">Debit</th><th className="p-1 w-32 text-right">Credit</th><th className="w-6" /></tr></thead>
        <tbody>
          {tb.rows.map((r, i) => (
            <tr key={i}>
              <td className="p-0.5"><AccountSelect value={r.code} taken={taken} disabled={disabled} onChange={(code) => patchRow(i, { code })} /></td>
              <td className="p-0.5"><input className={num} disabled={disabled} value={r.debit} inputMode="decimal" aria-label="Debit" onChange={(e) => patchRow(i, { debit: e.target.value })} /></td>
              <td className="p-0.5"><input className={num} disabled={disabled} value={r.credit} inputMode="decimal" aria-label="Credit" onChange={(e) => patchRow(i, { credit: e.target.value })} /></td>
              <td>{!disabled && <button type="button" aria-label="Remove row" onClick={() => onChange({ ...tb, rows: tb.rows.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-semibold">
            <td className="p-1">Total</td>
            <td className="p-0.5"><input className={num} disabled={disabled} value={tb.totalDebit} inputMode="decimal" aria-label="Total debits" onChange={(e) => onChange({ ...tb, totalDebit: e.target.value })} /></td>
            <td className="p-0.5"><input className={num} disabled={disabled} value={tb.totalCredit} inputMode="decimal" aria-label="Total credits" onChange={(e) => onChange({ ...tb, totalCredit: e.target.value })} /></td>
            <td />
          </tr>
        </tfoot>
      </table>
      {!disabled && <button type="button" onClick={() => onChange({ ...tb, rows: [...tb.rows, { code: "", debit: "", credit: "" }] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus size={12} /> Add an account</button>}
    </Card>
  );
}

const GROUPS = ["Trial balance", "Adjustments", "Adjusted trial balance", "Income statement", "Balance sheet"];

export function WorksheetWorkspace({ ws, onChange, disabled }: { ws: WorksheetIn; onChange: (w: WorksheetIn) => void; disabled?: boolean }) {
  const taken = ws.rows.map((r) => r.code);
  const patchRow = (i: number, p: Partial<WsRowIn>) => onChange({ ...ws, rows: ws.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const patchCell = (i: number, k: ColumnKey, v: string) => patchRow(i, { cells: { ...ws.rows[i].cells, [k]: v } });
  const footRow = (label: string, field: "subtotals" | "net" | "totals", only?: ColumnKey[]) => (
    <tr className="border-t border-slate-300 font-semibold bg-slate-50">
      <td className="p-1" colSpan={2}>{label}</td>
      {COLUMN_KEYS.map((k) => (
        <td key={k} className="p-0.5">{only && !only.includes(k) ? null : <input className={num} disabled={disabled} value={ws[field][k] ?? ""} inputMode="decimal" aria-label={`${label} ${k}`} onChange={(e) => onChange({ ...ws, [field]: { ...ws[field], [k]: e.target.value } })} />}</td>
      ))}
    </tr>
  );
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full min-w-[1250px] text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr><th rowSpan={2} className="p-1.5 text-left w-56">Account title</th><th rowSpan={2} className="p-1.5 text-left w-16">Adj. ref</th>{GROUPS.map((g) => <th key={g} colSpan={2} className="p-1.5 border-l border-slate-200">{g}</th>)}</tr>
          <tr>{GROUPS.flatMap((g) => ["Dr", "Cr"].map((s) => <th key={g + s} className="p-1 border-l border-slate-200 font-medium">{s}</th>))}</tr>
        </thead>
        <tbody>
          {ws.rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="p-0.5"><AccountSelect value={r.code} taken={taken} disabled={disabled} onChange={(code) => patchRow(i, { code })} /></td>
              <td className="p-0.5"><input className={input} disabled={disabled} value={r.adj} placeholder="a, c" aria-label="Adjustment letters" onChange={(e) => patchRow(i, { adj: e.target.value })} /></td>
              {COLUMN_KEYS.map((k) => <td key={k} className="p-0.5"><input className={num} disabled={disabled} value={r.cells[k] ?? ""} inputMode="decimal" aria-label={`${r.code || "row"} ${k}`} onChange={(e) => patchCell(i, k, e.target.value)} /></td>)}
              <td>{!disabled && <button type="button" aria-label="Remove row" onClick={() => onChange({ ...ws, rows: ws.rows.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}</td>
            </tr>
          ))}
          {footRow("Subtotals", "subtotals")}
          {footRow("Net income (loss)", "net", ["isDr", "isCr", "bsDr", "bsCr"])}
          {footRow("Totals", "totals")}
        </tbody>
      </table>
      {!disabled && <button type="button" onClick={() => onChange({ ...ws, rows: [...ws.rows, { code: "", adj: "", cells: {} }] })} className="m-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus size={12} /> Add an account</button>}
    </div>
  );
}

/** Save or submit the whole book (journal, ledger, trial balance, worksheet) to the teacher. The free journal stays on this device. */
export function SaveBar({ book }: { book: string }) {
  const status = useAccountingStore((s) => s.status[book] ?? "draft");
  const setStatus = useAccountingStore((s) => s.setStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (book === FREE_BOOK) return <p className="text-xs text-slate-500 mt-4">Your own practice journal stays on this device. It is not sent to your teacher.</p>;
  if (status === "released") return <p className="text-xs text-slate-500 mt-4">Your teacher already checked this set.</p>;
  const send = async (submit: boolean) => {
    setBusy(true); setMessage(null);
    try {
      const st = useAccountingStore.getState();
      const s = await saveMine(book, st.answers[book] ?? {}, st.work[book] ?? emptyWork(), submit);
      setStatus(book, s);
      setMessage({ ok: true, text: submit ? "Submitted. Your teacher will check it." : "Saved." });
    } catch (e) { setMessage({ ok: false, text: `${(e as Error).message}. Your work is still saved on this device.` }); }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={() => void send(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Save my work</button>
      <button type="button" disabled={busy} onClick={() => void send(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{status === "submitted" ? "Submit again" : "Submit to my teacher"}</button>
      {status === "submitted" && <span className="text-sm text-slate-600">Submitted, waiting for your teacher.</span>}
      {message && <span role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
    </div>
  );
}
