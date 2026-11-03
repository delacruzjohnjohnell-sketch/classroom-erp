"use client";
// The places where students do the work themselves: post to ledger accounts, build the trial balance, fill the 10-column worksheet.
// Nothing is calculated or checked here. The teacher checks it.
import { Plus, Trash2 } from "lucide-react";
import { getAccount } from "../core/chart-of-accounts";
import { AccountSelect } from "./AccountPicker";
import { entryRefs } from "../core/ledger-posting";
import { computeWorksheet, emptyLedgerAccount, generateTrialBalance, lineRef, type ColTarget, type GeneratedTrialBalance, type LedgerAccountIn, type WorksheetIn } from "../core/student-work";
import type { JournalEntry } from "../core/types";
import { COLUMN_KEYS, type ColumnKey } from "../core/worksheet-engine";
import { formatAmount } from "../lib/currency";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { saveMine } from "../lib/bfarApi";
import { emptyWork, FREE_BOOK } from "../core/student-work";
import { useAccountingStore } from "../store/useAccountingStore";
import { Card, Empty } from "./ui";

const input = "w-full rounded border border-slate-300 px-1.5 py-1 text-xs";
const num = `${input} text-right tabular-nums`;

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

// Dragging is an extra for a mouse. Touch screens use the Post button, because a finger drag scrolls or pulls the page to refresh.
const subscribePointer = (cb: () => void) => { const m = window.matchMedia("(pointer: fine)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const useFinePointer = () => useSyncExternalStore(subscribePointer, () => window.matchMedia("(pointer: fine)").matches, () => false);

function Chip({ line, onRemove, wrong, disabled, draggable }: { line: PostLine; onRemove?: () => void; wrong?: boolean; disabled?: boolean; draggable?: boolean }) {
  return (
    <div draggable={!!draggable && !disabled} onDragStart={(e) => { e.dataTransfer.setData("text/plain", line.ref); e.dataTransfer.effectAllowed = "move"; }}
      className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs bg-white ${draggable && !disabled ? "cursor-grab" : ""} ${wrong ? "border-rose-400 bg-rose-50" : "border-slate-300"}`}>
      <span className="truncate">{line.entry.date.slice(5)}</span>
      <span className="tabular-nums font-medium">{formatAmount(line.amount)}</span>
      {wrong && <span className="text-rose-700 font-semibold" title="Wrong account or side">✗</span>}
      {onRemove && !disabled && <button type="button" aria-label="Take this line out of the account" onClick={onRemove} className="text-slate-400 hover:text-rose-600"><Trash2 size={11} /></button>}
    </div>
  );
}

/** One journal line waiting to be posted: the student picks the account and the side, then posts it. */
function PostRow({ line, onPost, disabled }: { line: PostLine; onPost: (code: string, side: "Dr" | "Cr") => void; disabled?: boolean }) {
  const [code, setCode] = useState("");
  const [side, setSide] = useState<"" | "Dr" | "Cr">("");
  return (
    <div className="grid gap-2 items-center border-t border-slate-100 py-1.5 text-xs md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_7rem_5rem]">
      <div className="min-w-0">
        <div className={`truncate ${line.side === "Cr" ? "pl-5" : ""}`}><span className="text-slate-500">{line.entry.date.slice(5)}</span> · <b>{getAccount(line.accountCode)?.name}</b></div>
        <div className="truncate text-slate-500">{line.entry.explanation}</div>
      </div>
      <AccountSelect value={code} disabled={disabled} onChange={setCode} />
      <select value={side} disabled={disabled} onChange={(e) => setSide(e.target.value as "" | "Dr" | "Cr")} className={input} aria-label="Side"><option value="">Side</option><option value="Dr">Debit</option><option value="Cr">Credit</option></select>
      <div className="flex items-center justify-between gap-2 md:contents">
        <span className="tabular-nums font-medium md:hidden">{formatAmount(line.amount)}</span>
        <button type="button" disabled={disabled || !code || !side} onClick={() => side && onPost(code, side)} className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40">Post</button>
      </div>
    </div>
  );
}

/**
 * Posting: each line of the student's journal is posted to an account and a side the student chooses (Post button; a mouse can also drag it to the debit or credit half).
 * The student still types the footings and the ending balance. `instantFeedback` (the free journal only) flags a line posted to the wrong place.
 */
export function LedgerWorkspace({ accounts, onChange, entries, disabled, instantFeedback }: { accounts: LedgerAccountIn[]; onChange: (a: LedgerAccountIn[]) => void; entries: JournalEntry[]; disabled?: boolean; instantFeedback?: boolean }) {
  const [view, setView] = useState<"t" | "col">("t");
  const fine = useFinePointer();
  const lines = postLines(entries);
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const refs = entryRefs(entries, ["transaction"]);
  const postedRefs = new Set(accounts.flatMap((a) => a.posted.map((p) => p.ref)));
  const unposted = lines.filter((l) => !postedRefs.has(l.ref));

  // Posting to an account that is not open yet opens it.
  const post = (ref: string, code: string, side: "Dr" | "Cr") => {
    if (disabled || !byRef.has(ref)) return;
    const base = accounts.some((a) => a.code === code) ? accounts : [...accounts, emptyLedgerAccount(code)];
    onChange(base.map((a) => ({ ...a, posted: a.code === code ? [...a.posted.filter((p) => p.ref !== ref), { ref, side }] : a.posted.filter((p) => p.ref !== ref) })));
  };
  const unpost = (ref: string) => onChange(accounts.map((a) => ({ ...a, posted: a.posted.filter((p) => p.ref !== ref) })));
  const patch = (i: number, p: Partial<LedgerAccountIn>) => onChange(accounts.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const zone = (code: string, side: "Dr" | "Cr") => ({
    onDragOver: (e: React.DragEvent) => { if (!disabled && fine) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (fine) post(e.dataTransfer.getData("text/plain"), code, side); },
  });
  const wrong = (l: PostLine, code: string, side: "Dr" | "Cr") => !!instantFeedback && (l.accountCode !== code || l.side !== side);

  const field = (label: string, node: ReactNode) => <label className="flex flex-col gap-1 text-[11px] text-slate-500">{label}{node}</label>;
  const footings = (a: LedgerAccountIn, i: number) => (
    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-2 text-xs">
      {field("Total debits", <input className={num} disabled={disabled} value={a.debitFooting} inputMode="decimal" aria-label="Total debits" onChange={(e) => patch(i, { debitFooting: e.target.value })} />)}
      {field("Total credits", <input className={num} disabled={disabled} value={a.creditFooting} inputMode="decimal" aria-label="Total credits" onChange={(e) => patch(i, { creditFooting: e.target.value })} />)}
      {field("Ending balance", <input className={num} disabled={disabled} value={a.balance} inputMode="decimal" aria-label="Ending balance" onChange={(e) => patch(i, { balance: e.target.value })} />)}
      {field("Balance is", <select className={input} disabled={disabled} value={a.side} aria-label="Balance side" onChange={(e) => patch(i, { side: e.target.value as LedgerAccountIn["side"] })}><option value="">Debit or credit</option><option value="Dr">Debit</option><option value="Cr">Credit</option></select>)}
    </div>
  );

  return (
    <div>
      <Card title={`Journal lines to post: ${lines.length - unposted.length} of ${lines.length} posted`} className="mb-4">
        {lines.length === 0 ? <p className="text-sm text-slate-500">Journalize first; the lines of your journal appear here.</p> : unposted.length === 0 ? <p className="text-sm text-emerald-700">Every line is posted.</p> : (
          <>
            <p className="text-xs text-slate-600 mb-2">For each line, choose the account and the side (debit or credit) it belongs to, then press Post.{fine ? " With a mouse you can also drag the line's amount to the debit or credit half of an account below." : ""}</p>
            <div className="max-h-96 overflow-y-auto">
              {unposted.map((l) => (
                <div key={l.ref} className="flex items-start gap-2">
                  {fine && !disabled && <div className="pt-2"><Chip line={l} draggable /></div>}
                  <div className="flex-1 min-w-0"><PostRow line={l} disabled={disabled} onPost={(code, side) => post(l.ref, code, side)} /></div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-slate-500">{accounts.length === 0 ? "Your ledger accounts appear here as you post." : `${accounts.length} account${accounts.length === 1 ? "" : "s"} open`}</span>
        <div className="ml-auto flex rounded-md border border-slate-300 overflow-hidden text-xs">
          {([["t", "T-accounts"], ["col", "4-column"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`px-3 py-1.5 ${view === id ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>)}
        </div>
      </div>
      {accounts.length === 0 ? <Empty>No ledger accounts yet. Post a journal line above.</Empty> : (
        <div className={`grid gap-4 ${view === "t" ? "sm:grid-cols-2 lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {accounts.map((a, i) => {
            const mine = a.posted.map((p) => ({ p, l: byRef.get(p.ref) })).filter((x): x is { p: typeof x.p; l: PostLine } => !!x.l).sort((x, y) => x.l.entry.date.localeCompare(y.l.entry.date));
            return (
              <div key={a.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-sm font-semibold flex justify-between items-center">
                  <span>{getAccount(a.code)?.name}</span>
                  <span className="flex items-center gap-3 text-slate-500 font-normal">No. {a.code}{!disabled && a.posted.length === 0 && <button type="button" aria-label={`Close ${a.code}`} onClick={() => onChange(accounts.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>}</span>
                </div>
                {view === "t" ? (
                  <div className="grid grid-cols-2 min-h-[6rem] text-xs">
                    <div {...zone(a.code, "Dr")} aria-label={`${getAccount(a.code)?.name} debit side`} className="border-r-2 border-t-2 border-slate-800 m-2 mr-0 p-1.5 space-y-1 bg-slate-50">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Debit</div>
                      {mine.filter((x) => x.p.side === "Dr").map((x) => <Chip key={x.p.ref} line={x.l} disabled={disabled} draggable={fine} wrong={wrong(x.l, a.code, "Dr")} onRemove={() => unpost(x.p.ref)} />)}
                    </div>
                    <div {...zone(a.code, "Cr")} aria-label={`${getAccount(a.code)?.name} credit side`} className="border-t-2 border-slate-800 m-2 ml-0 p-1.5 space-y-1 bg-slate-50">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Credit</div>
                      {mine.filter((x) => x.p.side === "Cr").map((x) => <Chip key={x.p.ref} line={x.l} disabled={disabled} draggable={fine} wrong={wrong(x.l, a.code, "Cr")} onRemove={() => unpost(x.p.ref)} />)}
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500"><tr><th className="p-1 w-14">Date</th><th className="p-1">Explanation</th><th className="p-1 w-12">PR</th><th className="p-1 w-20 text-right">Debit</th><th className="p-1 w-20 text-right">Credit</th><th className="p-1 w-24">Balance</th></tr></thead>
                    <tbody>
                      {mine.map(({ p, l }) => (
                        <tr key={p.ref} className="border-t border-slate-100">
                          <td className="p-1">{l.entry.date.slice(5)}</td><td className="p-1">{l.entry.explanation}{wrong(l, a.code, p.side) && <span className="ml-1 text-rose-700 font-semibold" title="Wrong account or side">✗</span>}{!disabled && <button type="button" aria-label="Take this line out of the account" onClick={() => unpost(p.ref)} className="ml-1 text-slate-400 hover:text-rose-600 align-middle"><Trash2 size={11} /></button>}</td><td className="p-1">{refs.get(l.entry.id)}</td>
                          <td className="p-1 text-right tabular-nums">{p.side === "Dr" ? formatAmount(l.amount) : ""}</td><td className="p-1 text-right tabular-nums">{p.side === "Cr" ? formatAmount(l.amount) : ""}</td>
                          <td className="p-0.5"><input className={num} disabled={disabled} value={a.runBalances[p.ref] ?? ""} inputMode="decimal" aria-label="Running balance" onChange={(e) => patch(i, { runBalances: { ...a.runBalances, [p.ref]: e.target.value } })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {footings(a, i)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The trial balance of the student's own ledger. It is generated, not typed: it shows what the posting added up to, mistakes included. */
export function GeneratedTrialBalanceView({ ledger, entries }: { ledger: LedgerAccountIn[]; entries: JournalEntry[] }) {
  const tb = generateTrialBalance(ledger, entries);
  if (tb.rows.length === 0) return <Empty>Post journal lines to the ledger and the trial balance builds itself here.</Empty>;
  return (
    <Card>
      <table className="w-full text-sm max-w-3xl">
        <thead className="text-left text-xs text-slate-500"><tr><th className="p-1 w-20">Acct</th><th className="p-1">Account title</th><th className="p-1 w-36 text-right">Debit</th><th className="p-1 w-36 text-right">Credit</th></tr></thead>
        <tbody>{tb.rows.map((r) => <tr key={r.code} className="border-t border-slate-100"><td className="p-1">{r.code}</td><td className="p-1">{r.name}</td><td className="p-1 text-right tabular-nums">{r.debit ? formatAmount(r.debit) : ""}</td><td className="p-1 text-right tabular-nums">{r.credit ? formatAmount(r.credit) : ""}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="p-1" colSpan={2}>Total</td><td className="p-1 text-right tabular-nums"><span className="inline-block border-b-4 border-double border-slate-900">{formatAmount(tb.totalDebit)}</span></td><td className="p-1 text-right tabular-nums"><span className="inline-block border-b-4 border-double border-slate-900">{formatAmount(tb.totalCredit)}</span></td></tr></tfoot>
      </table>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${tb.balanced ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{tb.balanced ? "Debits equal credits" : "Debits and credits are not equal: look for a line posted to the wrong side or left out"}</span>
        {tb.unpostedLines > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">{tb.unpostedLines} journal {tb.unpostedLines === 1 ? "line is" : "lines are"} not posted yet</span>}
      </div>
    </Card>
  );
}

const GROUPS = ["1-2 Trial balance", "3-4 Adjustments", "5-6 Adjusted trial balance", "7-8 Income statement", "9-10 Balance sheet"];
type Sel = { kind: "adj"; ref: string } | { kind: "atb"; code: string } | null;
const TARGETS: ColTarget[] = ["isDr", "isCr", "bsDr", "bsCr"];
const num2 = (n: number) => (n ? formatAmount(n) : "");

/**
 * The worksheet by clicking. Columns 1-2 come from the student's own ledger and 5-6 are worked out from 1-4, so the student never types those.
 * Adjustments: click an adjusting line from the journal, then click the Dr (3) or Cr (4) cell of the account. Columns 7-10: click the adjusted balance,
 * then click the column it belongs in. Subtotals, the net income line and the totals are typed.
 */
export function WorksheetWorkspace({ ws, onChange, tb, adjEntries, periodic, disabled }: { ws: WorksheetIn; onChange: (w: WorksheetIn) => void; tb: GeneratedTrialBalance; adjEntries: JournalEntry[]; periodic: boolean; disabled?: boolean }) {
  const [sel, setSel] = useState<Sel>(null);
  const rows = computeWorksheet(tb, adjEntries, ws);
  const lines = postLines(adjEntries.map((e) => ({ ...e, stage: "transaction" as const }))).map((l) => ({ ...l, tag: l.entry.tag ?? "" }));
  const placedRefs = new Set(ws.adjustments.map((a) => a.ref));
  const waiting = lines.filter((l) => !placedRefs.has(l.ref));
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const adjSel = sel?.kind === "adj";

  const placeAdj = (code: string, side: "Dr" | "Cr") => {
    if (disabled || sel?.kind !== "adj") return;
    onChange({ ...ws, adjustments: [...ws.adjustments.filter((a) => a.ref !== sel.ref), { ref: sel.ref, code, side }] });
    setSel(null);
  };
  const placeTarget = (code: string, to: ColTarget) => {
    if (disabled || sel?.kind !== "atb" || sel.code !== code) return;
    onChange({ ...ws, placements: [...ws.placements.filter((p) => p.code !== code), { code, to }] });
    setSel(null);
  };
  const footRow = (label: string, field: "subtotals" | "net" | "totals", only?: ColumnKey[]) => (
    <tr className="border-t border-slate-300 font-semibold bg-slate-50">
      <td className="p-1">{label}</td>
      {COLUMN_KEYS.map((k) => (
        <td key={k} className="p-0.5">{only && !only.includes(k) ? null : <input className={num} disabled={disabled} value={ws[field][k] ?? ""} inputMode="decimal" aria-label={`${label} ${k}`} onChange={(e) => onChange({ ...ws, [field]: { ...ws[field], [k]: e.target.value } })} />}</td>
      ))}
    </tr>
  );
  const cellBtn = "w-full min-h-[1.6rem] rounded border px-1 py-0.5 text-right tabular-nums";

  return (
    <div>
      <Card title={`Adjusting lines to place: ${lines.length - waiting.length} of ${lines.length} placed`} className="mb-4">
        {lines.length === 0 ? <p className="text-sm text-slate-500">Journalize the adjustments first; their lines appear here.</p> : waiting.length === 0 ? <p className="text-sm text-emerald-700">Every adjusting line is placed.</p> : (
          <>
            <p className="text-xs text-slate-600 mb-2">Click an adjusting line, then click the <b>Dr (column 3)</b> or <b>Cr (column 4)</b> cell on the row of its account. An account that is not in the worksheet yet is added with the box under the lines.</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-56 overflow-y-auto">
              {waiting.map((l) => {
                const on = sel?.kind === "adj" && sel.ref === l.ref;
                return (
                  <button key={l.ref} type="button" disabled={disabled} aria-pressed={on} onClick={() => setSel(on ? null : { kind: "adj", ref: l.ref })}
                    className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-left text-xs ${on ? "border-blue-600 bg-blue-50 ring-2 ring-blue-300" : "border-slate-300 bg-white"}`}>
                    <span className={`truncate ${l.side === "Cr" ? "pl-4" : ""}`}><b>({l.tag})</b> {getAccount(l.accountCode)?.name}</span><span className="tabular-nums font-medium">{formatAmount(l.amount)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!disabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 max-w-md">
            <span className="text-xs text-slate-500">Add an account row:</span>
            <div className="flex-1 min-w-[12rem]"><AccountSelect value="" taken={rows.map((r) => r.code)} label="Add an account row" onChange={(code) => code && onChange({ ...ws, extraCodes: [...ws.extraCodes, code] })} /></div>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-600 mb-2">{sel?.kind === "atb" ? "Now click the column (7, 8, 9 or 10) where this adjusted balance belongs." : "To fill columns 7 to 10, click an adjusted balance (columns 5 or 6), then click the column it belongs in."}</p>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr><th rowSpan={2} className="p-1.5 text-left w-52">Account title</th>{GROUPS.map((g) => <th key={g} colSpan={2} className="p-1.5 border-l border-slate-200">{g}</th>)}</tr>
            <tr>{GROUPS.flatMap((g) => ["Dr", "Cr"].map((x) => <th key={g + x} className="p-1 border-l border-slate-200 font-medium">{x}</th>))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="p-4 text-center text-slate-500">The trial balance builds from your ledger. Post journal lines on the Ledger page first.</td></tr>}
            {rows.map((r) => {
              const inventoryRow = periodic && r.code === "130";
              const atbSelected = sel?.kind === "atb" && sel.code === r.code;
              const adjCell = (side: "Dr" | "Cr") => {
                const mine = ws.adjustments.filter((a) => a.code === r.code && a.side === side && byRef.has(a.ref));
                return (
                  <td className="p-0.5 align-top">
                    <button type="button" disabled={disabled || !adjSel} onClick={() => placeAdj(r.code, side)} aria-label={`Place in ${r.name} ${side}`}
                      className={`${cellBtn} ${adjSel ? "border-dashed border-blue-500 bg-blue-50 cursor-pointer" : "border-transparent"}`}>
                      {mine.map((a) => <span key={a.ref} className="flex items-center justify-end gap-1">({byRef.get(a.ref)!.tag}) {formatAmount(byRef.get(a.ref)!.amount)}{!disabled && <span role="button" tabIndex={0} aria-label="Take this adjustment out" onClick={(e) => { e.stopPropagation(); onChange({ ...ws, adjustments: ws.adjustments.filter((x) => x.ref !== a.ref) }); }} className="text-slate-400 hover:text-rose-600"><Trash2 size={10} /></span>}</span>)}
                    </button>
                  </td>
                );
              };
              const atbCell = (amount: number) => (
                <td className="p-0.5">
                  {amount ? <button type="button" disabled={disabled} aria-pressed={atbSelected} aria-label={`Select the adjusted balance of ${r.name}`} onClick={() => setSel(atbSelected ? null : { kind: "atb", code: r.code })}
                    className={`${cellBtn} ${atbSelected ? "border-blue-600 bg-blue-50 ring-2 ring-blue-300" : "border-slate-300 bg-white hover:bg-slate-50"}`}>{formatAmount(amount)}</button> : null}
                </td>
              );
              const targetCell = (to: ColTarget, value: number) => {
                if (inventoryRow && (to === "isCr" || to === "bsDr")) {
                  return <td key={to} className="p-0.5"><input className={num} disabled={disabled} value={ws.ending[to]} inputMode="decimal" placeholder="ending" aria-label={`Ending inventory ${to}`} onChange={(e) => onChange({ ...ws, ending: { ...ws.ending, [to]: e.target.value } })} /></td>;
                }
                return (
                  <td key={to} className="p-0.5">
                    <button type="button" disabled={disabled || !atbSelected} onClick={() => placeTarget(r.code, to)} aria-label={`Place ${r.name} in ${to}`}
                      className={`${cellBtn} ${atbSelected ? "border-dashed border-blue-500 bg-blue-50 cursor-pointer" : "border-transparent"}`}>
                      {r.to === to ? <span className="inline-flex items-center gap-1">{formatAmount(value)}{!disabled && <span role="button" tabIndex={0} aria-label="Take this out of the column" onClick={(e) => { e.stopPropagation(); onChange({ ...ws, placements: ws.placements.filter((p) => p.code !== r.code) }); }} className="text-slate-400 hover:text-rose-600"><Trash2 size={10} /></span>}</span> : ""}
                    </button>
                  </td>
                );
              };
              return (
                <tr key={r.code} className="border-t border-slate-100">
                  <td className="p-1">{r.code} {r.name}{!disabled && ws.extraCodes.includes(r.code) && r.adjTags.length === 0 && <button type="button" aria-label={`Remove ${r.code}`} onClick={() => onChange({ ...ws, extraCodes: ws.extraCodes.filter((c) => c !== r.code) })} className="ml-1 text-slate-400 hover:text-rose-600 align-middle"><Trash2 size={10} /></button>}</td>
                  <td className="p-1 text-right tabular-nums">{num2(r.tbDr)}</td><td className="p-1 text-right tabular-nums">{num2(r.tbCr)}</td>
                  {adjCell("Dr")}{adjCell("Cr")}
                  {atbCell(r.atbDr)}{atbCell(r.atbCr)}
                  {TARGETS.map((to) => targetCell(to, r.atbDr || r.atbCr))}
                </tr>
              );
            })}
            {footRow("Subtotals", "subtotals")}
            {footRow("Net income (loss)", "net", ["isDr", "isCr", "bsDr", "bsCr"])}
            {footRow("Totals", "totals")}
          </tbody>
        </table>
      </div>
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
