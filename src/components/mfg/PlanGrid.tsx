"use client";

import { qtyText } from "@/lib/mfgOps";
import { bucketHeading, type GridRow } from "@/lib/mfgPlanning";

const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

type Line = { key: string; label: string; hint: string; get: (r: GridRow) => number; tone?: "plan" | "stock" };

const LINES: Line[] = [
  { key: "gross", label: "Needed", hint: "Sales orders, forecast and the components other orders will use", get: (r) => Number(r.gross) },
  { key: "scheduled", label: "Already on order", hint: "Purchase orders and production orders that have not arrived yet", get: (r) => Number(r.scheduled) },
  { key: "end", label: "Stock at the end", hint: "What you expect to hold once the plan is carried out", get: (r) => Number(r.projected_end), tone: "stock" },
  { key: "net", label: "Shortage to cover", hint: "How much the plan had to add in this column", get: (r) => Number(r.net) },
  { key: "receipt", label: "Plan brings in", hint: "Good quantity the planned orders or requisitions deliver", get: (r) => Number(r.planned_receipt), tone: "plan" },
  { key: "release", label: "Start or order", hint: "Quantity to start making or to order in this column", get: (r) => Number(r.planned_release), tone: "plan" },
];

/** The time-phased picture of one item: one column per time bucket, read top to bottom. */
export default function PlanGrid({ rows, bucketDays, uom }: { rows: GridRow[]; bucketDays: number; uom: string }) {
  const sorted = [...rows].sort((a, b) => a.bucket_no - b.bucket_no);
  if (sorted.length === 0) return <div className="text-[12.5px] text-[#7F8EA0] py-4">This item had nothing to plan in the latest run: no demand, no safety stock and nothing on order.</div>;
  const opening = Number(sorted[0].projected_start);
  return (
    <div className="overflow-x-auto" role="region" aria-label="Planning grid" tabIndex={0}>
      <table style={{ minWidth: 140 + 78 * (sorted.length + 1), fontFamily: MONO, fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", position: "sticky", left: 0, background: "inherit", minWidth: 150 }}>{uom ? `In ${uom}` : ""}</th>
            <th style={{ textAlign: "right" }} title="Stock in the raw-material and finished-goods stores today">In stock now</th>
            {sorted.map((r) => <th key={r.bucket_no} style={{ textAlign: "right" }}>{bucketHeading(r.bucket_start, bucketDays)}</th>)}
          </tr>
        </thead>
        <tbody>
          {LINES.map((l) => (
            <tr key={l.key}>
              <td style={{ position: "sticky", left: 0, background: "inherit", fontWeight: l.tone ? 600 : 400 }} title={l.hint}>{l.label}</td>
              <td style={{ textAlign: "right" }}>{l.key === "end" ? qtyText(opening) : ""}</td>
              {sorted.map((r) => {
                const v = l.get(r);
                const strong = l.tone === "plan" && v > 0;
                return (
                  <td key={r.bucket_no} style={{ textAlign: "right", fontWeight: strong || l.tone === "stock" ? 600 : 400, color: strong ? "#F2B13C" : v === 0 && l.tone !== "stock" ? "#7F8EA0" : undefined }}>
                    {v === 0 && l.tone !== "stock" ? "–" : qtyText(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[11.5px] text-[#7F8EA0] mt-2">
        Read each column from the top: what is needed, what is already coming, what stock is left, and what the plan had to add. Stock is never allowed to fall below the safety stock.
      </div>
    </div>
  );
}
