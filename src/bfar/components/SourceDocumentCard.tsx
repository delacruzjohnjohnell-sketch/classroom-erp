// A business paper drawn like paper: the thing the student journalizes from.
import { formatAmount, formatPeso, sum } from "../lib/currency";
import type { SourceDocument } from "../practice-sets/types";

export function SourceDocumentCard({ document: d }: { document: SourceDocument }) {
  const total = sum(d.items.map((i) => i.amount));
  return (
    <div className="rounded border border-slate-300 bg-amber-50/50 p-3 text-sm shadow-sm max-w-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-300 pb-2">
        <div className="font-semibold uppercase tracking-wide text-slate-800">{d.type}</div>
        <div className="text-right text-xs text-slate-600">No. {d.no}<div>{d.date}</div></div>
      </div>
      <div className="mt-2 text-slate-700"><span className="text-slate-500">{d.partyLabel}:</span> <b>{d.party}</b></div>
      <table className="w-full mt-2">
        <tbody>
          {d.items.map((i, n) => (
            <tr key={n} className="border-t border-slate-200 align-top">
              <td className="py-1 pr-3">{i.desc}</td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap">{formatAmount(i.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-700 font-semibold"><td className="py-1">{d.items.length > 1 ? "Total" : "Amount"}</td><td className="py-1 text-right tabular-nums">{formatPeso(total)}</td></tr>
        </tfoot>
      </table>
      {d.terms && <p className="mt-2 text-xs text-slate-700"><b>Terms:</b> {d.terms}</p>}
      {d.note && <p className="mt-1 text-xs italic text-slate-600">{d.note}</p>}
    </div>
  );
}
