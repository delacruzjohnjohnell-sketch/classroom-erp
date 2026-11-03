"use client";
// A live multi-line journal entry editor: account autocomplete, debit/credit amounts, credit lines indented, and a running balance badge.
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { CHART_OF_ACCOUNTS, getAccount } from "../core/chart-of-accounts";
import { balanceMessage, totalDebits } from "../core/journalizer";
import type { JournalLine } from "../core/types";
import { formatAmount, parsePesos } from "../lib/currency";
import { Pill } from "./ui";

export interface DraftLine { code: string; debit: string; credit: string }

export const emptyDraft = (n = 2): DraftLine[] => Array.from({ length: n }, () => ({ code: "", debit: "", credit: "" }));
const codeOf = (text: string) => (text.trim().split(/\s+/)[0] ?? "").toUpperCase();

export function draftToLines(d: DraftLine[]): JournalLine[] {
  return d
    .filter((x) => x.code.trim() || x.debit.trim() || x.credit.trim())
    .map((x) => ({ accountCode: codeOf(x.code), debit: parsePesos(x.debit) ?? 0, credit: parsePesos(x.credit) ?? 0 }));
}

export function linesToDraft(lines: JournalLine[]): DraftLine[] {
  if (lines.length === 0) return emptyDraft();
  return lines.map((l) => ({
    code: `${l.accountCode} ${getAccount(l.accountCode)?.name ?? ""}`.trim(),
    debit: l.debit ? (l.debit / 100).toFixed(2) : "",
    credit: l.credit ? (l.credit / 100).toFixed(2) : "",
  }));
}

export function BalanceBadge({ lines }: { lines: JournalLine[] }) {
  if (lines.every((l) => l.debit === 0 && l.credit === 0)) return <Pill ok>Enter amounts</Pill>;
  const msg = balanceMessage(lines);
  return msg ? <Pill ok={false}>{msg}</Pill> : <Pill ok>Balanced: ₱{formatAmount(totalDebits(lines))}</Pill>;
}

export function EntryLinesEditor({ draft, onChange, disabled = false }: { draft: DraftLine[]; onChange: (d: DraftLine[]) => void; disabled?: boolean }) {
  const listId = useId();
  const set = (i: number, patch: Partial<DraftLine>) => onChange(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const normalize = (i: number) => {
    const acc = getAccount(codeOf(draft[i].code));
    if (acc) set(i, { code: `${acc.code} ${acc.name}` });
  };
  return (
    <div>
      <datalist id={listId}>
        {CHART_OF_ACCOUNTS.map((a) => <option key={a.code} value={`${a.code} ${a.name}`} />)}
      </datalist>
      <div className="grid grid-cols-[1fr_8rem_8rem_2rem] gap-x-2 gap-y-1.5 items-center text-sm">
        <div className="text-xs font-semibold text-slate-500">Account title (type a code or a name)</div>
        <div className="text-xs font-semibold text-slate-500 text-right">Debit</div>
        <div className="text-xs font-semibold text-slate-500 text-right">Credit</div>
        <div />
        {draft.map((row, i) => {
          const unknown = row.code.trim() !== "" && !getAccount(codeOf(row.code));
          const credit = row.credit.trim() !== "" && row.debit.trim() === "";
          return (
            <div key={i} className="contents">
              <div className={credit ? "pl-8" : ""}>
                <input
                  list={listId} value={row.code} disabled={disabled} aria-label={`Account ${i + 1}`}
                  onChange={(e) => set(i, { code: e.target.value })} onBlur={() => normalize(i)}
                  className={`w-full rounded border px-2 py-1.5 ${unknown ? "border-rose-400" : "border-slate-300"}`} placeholder="e.g. 101 Cash"
                />
                {unknown && <div className="text-xs text-rose-600 mt-0.5">Choose an account from the chart of accounts.</div>}
              </div>
              <input value={row.debit} disabled={disabled} inputMode="decimal" aria-label={`Debit ${i + 1}`} onChange={(e) => set(i, { debit: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-right tabular-nums" placeholder="0.00" />
              <input value={row.credit} disabled={disabled} inputMode="decimal" aria-label={`Credit ${i + 1}`} onChange={(e) => set(i, { credit: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-right tabular-nums" placeholder="0.00" />
              <button type="button" disabled={disabled || draft.length <= 2} onClick={() => onChange(draft.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="text-slate-400 hover:text-rose-600 disabled:opacity-30"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </div>
      <button type="button" disabled={disabled} onClick={() => onChange([...draft, { code: "", debit: "", credit: "" }])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40"><Plus size={13} /> Add a line</button>
    </div>
  );
}
