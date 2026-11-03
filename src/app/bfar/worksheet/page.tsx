"use client";
import { useMemo, useState } from "react";
import { buildWorksheet } from "@/bfar/core/worksheet-engine";
import { parsePesos } from "@/bfar/lib/currency";
import { Card, Empty, Money, PageHeader, Pill } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

const GROUPS = ["Trial balance", "Adjustments", "Adjusted trial balance", "Income statement", "Balance sheet"];
const norm = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(",");

function Cells({ keys, row }: { keys: ("Dr" | "Cr")[]; row: Record<string, number> }) {
  return <>{keys.map((k, i) => <td key={i} className="p-1.5 text-right border-l border-slate-100"><Money value={row[k] ?? 0} /></td>)}</>;
}

export default function WorksheetPage() {
  const hydrated = useHydrated();
  const entries = useAccountingStore((s) => s.entries);
  const [ending, setEnding] = useState("");
  const [practice, setPractice] = useState(false);
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const endingInventory = parsePesos(ending) ?? undefined;
  const hasAdjusting = entries.some((e) => e.stage === "adjusting");
  const ws = useMemo(() => buildWorksheet(entries.filter((e) => e.stage === "transaction" || e.stage === "adjusting"), { endingInventory }), [entries, endingInventory]);
  const t = ws.totals;
  const rowsWithAdj = ws.rows.filter((r) => r.adjRefs.length > 0);
  const right = rowsWithAdj.filter((r) => norm(guesses[r.code] ?? "") === norm(r.adjRefs.join(","))).length;

  return (
    <>
      <PageHeader title="Ten-column worksheet" subtitle="Trial balance, adjustments, adjusted trial balance, income statement and balance sheet. Net income goes to the Income Statement debit and Balance Sheet credit columns; a net loss goes the other way."
        actions={<label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={practice} onChange={(e) => { setPractice(e.target.checked); setChecked(false); }} /> Practice mode</label>} />
      <div className="flex flex-wrap items-end gap-4 mb-4 text-sm">
        <label className="flex flex-col gap-1">Ending merchandise inventory (periodic system only)
          <input value={ending} onChange={(e) => setEnding(e.target.value)} inputMode="decimal" placeholder="leave blank for a service business" className="rounded border border-slate-300 px-2 py-1.5 w-64 text-right tabular-nums" />
        </label>
        {practice && hasAdjusting && (
          <>
            <button type="button" onClick={() => setChecked(true)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Check my adjustment letters</button>
            {checked && <Pill ok={right === rowsWithAdj.length}>{right} of {rowsWithAdj.length} accounts right</Pill>}
          </>
        )}
      </div>
      {!hydrated ? null : ws.rows.length === 0 ? <Empty>The worksheet is built from your journal. Record entries (and adjusting entries) first, or load a practice set solution.</Empty> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr><th rowSpan={2} className="p-1.5 text-left w-14">Acct</th><th rowSpan={2} className="p-1.5 text-left">Account title</th>
                {GROUPS.map((g) => <th key={g} colSpan={2} className="p-1.5 border-l border-slate-200">{g}</th>)}</tr>
              <tr>{GROUPS.flatMap((g) => ["Dr", "Cr"].map((s) => <th key={g + s} className="p-1 border-l border-slate-200 font-medium">{s}</th>))}</tr>
              <tr className="text-slate-400 text-[10px]"><th /><th />{Array.from({ length: 10 }, (_, i) => <th key={i} className="border-l border-slate-200 font-normal">({i + 1})</th>)}</tr>
            </thead>
            <tbody>
              {ws.rows.map((r) => (
                <tr key={r.code} className="border-t border-slate-100">
                  <td className="p-1.5">{r.code}</td>
                  <td className="p-1.5">{r.name}</td>
                  <Cells keys={["Dr", "Cr"]} row={{ Dr: r.tbDr, Cr: r.tbCr }} />
                  {practice ? (
                    <td colSpan={2} className="p-1 border-l border-slate-100">
                      {r.adjRefs.length > 0 || guesses[r.code] ? (
                        <input value={guesses[r.code] ?? ""} onChange={(e) => { setGuesses({ ...guesses, [r.code]: e.target.value }); setChecked(false); }} aria-label={`Adjustment letters for ${r.name}`} placeholder="letters, e.g. a, c"
                          className={`w-full rounded border px-1.5 py-1 ${checked && r.adjRefs.length > 0 ? (norm(guesses[r.code] ?? "") === norm(r.adjRefs.join(",")) ? "border-emerald-500" : "border-rose-500") : "border-slate-300"}`} />
                      ) : <input disabled aria-label={`Adjustment letters for ${r.name}`} className="w-full rounded border border-slate-200 px-1.5 py-1 bg-slate-50" placeholder="no adjustment" />}
                    </td>
                  ) : (
                    <>
                      <td className="p-1.5 text-right border-l border-slate-100"><Money value={r.adjDr} />{r.adjDr > 0 && <sup className="ml-0.5 text-slate-500">({r.adjRefs.join(",")})</sup>}</td>
                      <td className="p-1.5 text-right border-l border-slate-100"><Money value={r.adjCr} />{r.adjCr > 0 && <sup className="ml-0.5 text-slate-500">({r.adjRefs.join(",")})</sup>}</td>
                    </>
                  )}
                  <Cells keys={["Dr", "Cr"]} row={{ Dr: r.atbDr, Cr: r.atbCr }} />
                  <Cells keys={["Dr", "Cr"]} row={{ Dr: r.isDr, Cr: r.isCr }} />
                  <Cells keys={["Dr", "Cr"]} row={{ Dr: r.bsDr, Cr: r.bsCr }} />
                </tr>
              ))}
              <tr className="border-t border-slate-800 font-semibold">
                <td colSpan={2} className="p-1.5">Subtotals</td>
                {([ws.subtotals.tbDr, ws.subtotals.tbCr, ws.subtotals.adjDr, ws.subtotals.adjCr, ws.subtotals.atbDr, ws.subtotals.atbCr, ws.subtotals.isDr, ws.subtotals.isCr, ws.subtotals.bsDr, ws.subtotals.bsCr]).map((v, i) => <td key={i} className="p-1.5 text-right border-l border-slate-100"><Money value={v} blankZero={false} /></td>)}
              </tr>
              <tr className="font-semibold">
                <td colSpan={2} className="p-1.5">{ws.isNetIncome ? "Net income" : "Net loss"}</td>
                <td colSpan={6} />
                <td className="p-1.5 text-right border-l border-slate-100">{ws.isNetIncome && <Money value={ws.netIncome} />}</td>
                <td className="p-1.5 text-right border-l border-slate-100">{!ws.isNetIncome && <Money value={ws.netIncome} />}</td>
                <td className="p-1.5 text-right border-l border-slate-100">{!ws.isNetIncome && <Money value={ws.netIncome} />}</td>
                <td className="p-1.5 text-right border-l border-slate-100">{ws.isNetIncome && <Money value={ws.netIncome} />}</td>
              </tr>
              <tr className="font-bold">
                <td colSpan={2} className="p-1.5">Totals</td>
                {([t.tbDr, t.tbCr, t.adjDr, t.adjCr, t.atbDr, t.atbCr, t.isDr, t.isCr, t.bsDr, t.bsCr]).map((v, i) => <td key={i} className="p-1.5 text-right border-l border-slate-100"><span className="inline-block border-b-4 border-double border-slate-900"><Money value={v} blankZero={false} /></span></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {hydrated && ws.rows.length > 0 && (
        <Card className="mt-4"><div className="flex flex-wrap items-center gap-3 text-sm">
          <Pill ok={ws.crossFooted}>{ws.crossFooted ? "Every pair of columns foots and cross-foots" : "Some columns do not foot. Check your entries."}</Pill>
          {!hasAdjusting && <span className="text-slate-500">No adjusting entries yet, so columns 3 and 4 are empty.</span>}
        </div></Card>
      )}
    </>
  );
}
