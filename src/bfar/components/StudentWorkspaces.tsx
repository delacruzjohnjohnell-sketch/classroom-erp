"use client";
// The places where students do the work themselves: post to ledger accounts, build the trial balance, fill the 10-column worksheet.
// Nothing is calculated or checked here. The teacher checks it.
import { Plus, Trash2 } from "lucide-react";
import { CHART_OF_ACCOUNTS, getAccount } from "../core/chart-of-accounts";
import { entryRefs } from "../core/ledger-posting";
import { emptyLedgerAccount, lineRef, type LedgerAccountIn, type TbRowIn, type TrialBalanceIn, type WorksheetIn, type WsRowIn } from "../core/student-work";
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

interface PostLine { ref: string; entry: JournalEntry; accountCode: string; side: "Dr" | "Cr"; amount: number }
const postLines = (entries: JournalEntry[]): PostLine[] =>
  [...entries].filter((e) => e.stage === "transaction").sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((e) => e.lines.map((l, i): PostLine => ({ ref: lineRef(e.id, i), entry: e, accountCode: l.accountCode, side: l.debit > 0 ? "Dr" : "Cr", amount: l.debit || l.credit })));

function Chip({ line, selected, onSelect, onRemove, wrong, disabled, compact }: { line: PostLine; selected?: boolean; onSelect?: () => void; onRemove?: () => void; wrong?: boolean; disabled?: boolean; compact?: boolean }) {
  return (
    <div draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData("text/plain", line.ref); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onSelect} role={onSelect ? "button" : undefined} tabIndex={onSelect && !disabled ? 0 : undefined} aria-pressed={onSelect ? selected : undefined}
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
      className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs bg-white ${disabled ? "" : "cursor-grab"} ${selected ? "border-blue-600 ring-2 ring-blue-300" : wrong ? "border-rose-400 bg-rose-50" : "border-slate-300"}`}>
      <span className={`truncate ${!compact && line.side === "Cr" ? "pl-4" : ""}`}>{line.entry.date.slice(5)} · {compact ? "" : getAccount(line.accountCode)?.name}</span>
      <span className="tabular-nums font-medium">{formatAmount(line.amount)}</span>
      {wrong && <span className="text-rose-700 font-semibold" title="Wrong account or side">✗</span>}
      {onRemove && !disabled && <button type="button" aria-label="Take this line out of the account" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-slate-400 hover:text-rose-600"><Trash2 size={11} /></button>}
    </div>
  );
}

/**
 * Posting by drag and drop: each line of the student's journal is dragged to the debit or credit half of a ledger account (or tapped, then the half is tapped).
 * The student still types the footings and the ending balance. `instantFeedback` (the free journal only) flags a line dropped in the wrong place.
 */
export function LedgerWorkspace({ accounts, onChange, entries, disabled, instantFeedback }: { accounts: LedgerAccountIn[]; onChange: (a: LedgerAccountIn[]) => void; entries: JournalEntry[]; disabled?: boolean; instantFeedback?: boolean }) {
  const [view, setView] = useState<"t" | "col">("t");
  const [selected, setSelected] = useState<string | null>(null);
  const lines = postLines(entries);
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const refs = entryRefs(entries, ["transaction"]);
  const postedRefs = new Set(accounts.flatMap((a) => a.posted.map((p) => p.ref)));
  const unposted = lines.filter((l) => !postedRefs.has(l.ref));
  const taken = accounts.map((a) => a.code);

  const post = (ref: string, code: string, side: "Dr" | "Cr") => {
    if (disabled || !byRef.has(ref)) return;
    onChange(accounts.map((a) => ({ ...a, posted: a.code === code ? [...a.posted.filter((p) => p.ref !== ref), { ref, side }] : a.posted.filter((p) => p.ref !== ref) })));
    setSelected(null);
  };
  const unpost = (ref: string) => onChange(accounts.map((a) => ({ ...a, posted: a.posted.filter((p) => p.ref !== ref) })));
  const patch = (i: number, p: Partial<LedgerAccountIn>) => onChange(accounts.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const zone = (code: string, side: "Dr" | "Cr") => ({
    onDragOver: (e: React.DragEvent) => { if (!disabled) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); post(e.dataTransfer.getData("text/plain"), code, side); },
    onClick: () => { if (selected) post(selected, code, side); },
  });
  const wrong = (l: PostLine, code: string, side: "Dr" | "Cr") => !!instantFeedback && (l.accountCode !== code || l.side !== side);

  const footings = (a: LedgerAccountIn, i: number) => (
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
  );

  return (
    <div>
      <Card title={`Journal lines to post: ${lines.length - unposted.length} of ${lines.length} posted`} className="mb-4">
        {lines.length === 0 ? <p className="text-sm text-slate-500">Journalize first; the lines of your journal appear here.</p> : unposted.length === 0 ? <p className="text-sm text-emerald-700">Every line is posted.</p> : (
          <>
            <p className="text-xs text-slate-600 mb-2">Drag a line to the <b>left (debit)</b> or <b>right (credit)</b> half of the right account. On a phone or tablet, tap the line, then tap the half.</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto">
              {unposted.map((l) => <Chip key={l.ref} line={l} disabled={disabled} selected={selected === l.ref} onSelect={() => setSelected(selected === l.ref ? null : l.ref)} />)}
            </div>
          </>
        )}
      </Card>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {!disabled && <div className="max-w-xs w-full"><AccountSelect value="" taken={taken} onChange={(code) => code && onChange([...accounts, emptyLedgerAccount(code)])} /></div>}
        {!disabled && <span className="text-xs text-slate-500">Open the accounts you need.</span>}
        <div className="ml-auto flex rounded-md border border-slate-300 overflow-hidden text-xs">
          {([["t", "T-accounts"], ["col", "4-column"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`px-3 py-1.5 ${view === id ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>)}
        </div>
      </div>
      {accounts.length === 0 ? <Empty>No ledger accounts yet. Open an account, then drag journal lines into it.</Empty> : (
        <div className={`grid gap-4 ${view === "t" ? "sm:grid-cols-2 lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {accounts.map((a, i) => {
            const mine = a.posted.map((p) => ({ p, l: byRef.get(p.ref) })).filter((x): x is { p: typeof x.p; l: PostLine } => !!x.l).sort((x, y) => x.l.entry.date.localeCompare(y.l.entry.date));
            return (
              <div key={a.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-sm font-semibold flex justify-between items-center">
                  <span>{getAccount(a.code)?.name}</span>
                  <span className="flex items-center gap-3 text-slate-500 font-normal">No. {a.code}{!disabled && <button type="button" aria-label={`Close ${a.code}`} onClick={() => onChange(accounts.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>}</span>
                </div>
                {view === "t" ? (
                  <div className="grid grid-cols-2 min-h-[6rem] text-xs">
                    <div {...zone(a.code, "Dr")} aria-label={`${getAccount(a.code)?.name} debit side`} className={`border-r-2 border-t-2 border-slate-800 m-2 mr-0 p-1.5 space-y-1 ${selected ? "bg-blue-50 cursor-pointer" : "bg-slate-50"}`}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Debit</div>
                      {mine.filter((x) => x.p.side === "Dr").map((x) => <Chip key={x.p.ref} compact line={x.l} disabled={disabled} wrong={wrong(x.l, a.code, "Dr")} onRemove={() => unpost(x.p.ref)} />)}
                    </div>
                    <div {...zone(a.code, "Cr")} aria-label={`${getAccount(a.code)?.name} credit side`} className={`border-t-2 border-slate-800 m-2 ml-0 p-1.5 space-y-1 ${selected ? "bg-blue-50 cursor-pointer" : "bg-slate-50"}`}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Credit</div>
                      {mine.filter((x) => x.p.side === "Cr").map((x) => <Chip key={x.p.ref} compact line={x.l} disabled={disabled} wrong={wrong(x.l, a.code, "Cr")} onRemove={() => unpost(x.p.ref)} />)}
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500"><tr><th className="p-1 w-14">Date</th><th className="p-1">Explanation</th><th className="p-1 w-12">PR</th><th className="p-1 w-20 text-right">Debit</th><th className="p-1 w-20 text-right">Credit</th><th className="p-1 w-24">Balance</th></tr></thead>
                    <tbody>
                      {mine.map(({ p, l }) => (
                        <tr key={p.ref} className="border-t border-slate-100">
                          <td className="p-1">{l.entry.date.slice(5)}</td><td className="p-1">{l.entry.explanation}</td><td className="p-1">{refs.get(l.entry.id)}</td>
                          <td className="p-1 text-right tabular-nums">{p.side === "Dr" ? formatAmount(l.amount) : ""}</td><td className="p-1 text-right tabular-nums">{p.side === "Cr" ? formatAmount(l.amount) : ""}</td>
                          <td className="p-0.5"><input className={num} disabled={disabled} value={a.runBalances[p.ref] ?? ""} inputMode="decimal" aria-label="Running balance" onChange={(e) => patch(i, { runBalances: { ...a.runBalances, [p.ref]: e.target.value } })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {view === "col" && <div {...zone(a.code, "Dr")} className={`m-2 rounded border border-dashed p-2 text-center text-[11px] ${selected ? "border-blue-400 bg-blue-50 cursor-pointer" : "border-slate-300 text-slate-400"}`}>Drop a debit line here</div>}
                {view === "col" && <div {...zone(a.code, "Cr")} className={`m-2 mt-0 rounded border border-dashed p-2 text-center text-[11px] ${selected ? "border-blue-400 bg-blue-50 cursor-pointer" : "border-slate-300 text-slate-400"}`}>Drop a credit line here</div>}
                {footings(a, i)}
              </div>
            );
          })}
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
