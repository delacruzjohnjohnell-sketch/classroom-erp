"use client";

import { Download, Printer } from "lucide-react";
import { fmtAmount, type Line } from "@/lib/mfgStatements";

/**
 * A report laid out the way a finance report is: the company, the title, the period, the currency, the figures with single and double rules,
 * notes, and signature lines. On screen it sits on a white sheet whatever the theme; printed, only the sheet is printed.
 */
export type SheetProps = {
  company: string;
  title: string;
  /** "As at 30 November 2026" or "For the period 1 November to 30 November 2026" */
  period: string;
  /** headers of the figure columns when `lines` are given, e.g. ["30 Nov 2026", "31 Oct 2026"] */
  columns?: string[];
  lines?: Line[];
  /** a custom body (a table) instead of statement lines */
  children?: React.ReactNode;
  notes?: React.ReactNode[];
  /** rows for the CSV button; statements get them from toCsvRows */
  csv?: string[][];
  exportName: string;
  preparedBy?: string;
  /** "Amounts in Philippine peso" unless the report is not in money (quantities, hours) */
  unitNote?: string;
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function download(name: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const RULE = "1px solid #111";
export default function ReportSheet({ company, title, period, columns, lines, children, notes, csv, exportName, preparedBy, unitNote }: SheetProps) {
  const cols = columns ?? [];
  const generated = new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
  return (
    <div>
      <div className="report-actions flex gap-2 justify-end mb-2">
        {csv && <button type="button" onClick={() => download(exportName, csv)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#A3B1C2] hover:text-ink border border-hairline rounded px-2.5 py-1.5"><Download size={13} /> CSV</button>}
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#A3B1C2] hover:text-ink border border-hairline rounded px-2.5 py-1.5"><Printer size={13} /> Print</button>
      </div>
      <article className="report-sheet" aria-label={title}>
        <header style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{company}</div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>{title}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{period}</div>
          <div style={{ fontSize: 11.5, color: "#555", fontStyle: "italic", marginTop: 1 }}>{unitNote ?? "(Amounts in Philippine peso)"}</div>
        </header>

        {lines ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: RULE, padding: "4px 6px", fontWeight: 600 }}> </th>
                {cols.map((c) => <th key={c} style={{ textAlign: "right", borderBottom: RULE, padding: "4px 6px", fontWeight: 600, width: 130 }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const strong = l.kind !== "line";
                const top = l.kind === "subtotal" || l.kind === "total" || l.kind === "grand" ? RULE : undefined;
                const bottom = l.kind === "grand" ? "3px double #111" : undefined;
                return (
                  <tr key={i}>
                    <td style={{ padding: "3px 6px", paddingLeft: 6 + (l.indent ?? 0) * 18, fontWeight: strong ? 700 : 400, textTransform: l.kind === "heading" && (l.indent ?? 0) === 0 ? "uppercase" : undefined,
                      fontSize: l.kind === "heading" ? 12 : undefined, letterSpacing: l.kind === "heading" && (l.indent ?? 0) === 0 ? "0.04em" : undefined }}>
                      {l.code && <span style={{ color: "#777", marginRight: 8, fontVariantNumeric: "tabular-nums" }}>{l.code}</span>}{l.label}
                    </td>
                    {l.values.map((v, j) => (
                      <td key={j} style={{ padding: "3px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: strong ? 700 : 400, borderTop: top, borderBottom: bottom }}>{fmtAmount(v)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : children}

        {notes && notes.length > 0 && (
          <section style={{ marginTop: 18, fontSize: 11.5, color: "#333" }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>Notes</div>
            <ol style={{ paddingLeft: 18, margin: 0 }}>{notes.map((n, i) => <li key={i} style={{ marginBottom: 2 }}>{n}</li>)}</ol>
          </section>
        )}

        <footer style={{ marginTop: 28, fontSize: 11.5, color: "#333" }}>
          <div style={{ display: "flex", gap: 28, justifyContent: "space-between" }}>
            {["Prepared by", "Reviewed by", "Approved by"].map((r) => (
              <div key={r} style={{ flex: 1 }}>
                <div style={{ borderBottom: RULE, height: 26, fontWeight: 600, paddingTop: 8 }}>{r === "Prepared by" ? preparedBy ?? "" : ""}</div>
                <div style={{ marginTop: 2 }}>{r}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, color: "#666" }}>Generated {generated} from the company&rsquo;s books. Figures are in Philippine peso; amounts in brackets are negative.</div>
        </footer>
      </article>
      <style>{`
        .report-sheet { background: #fff; color: #111; padding: 28px 32px; border-radius: 6px; max-width: 920px; margin: 0 auto; font-family: Georgia, "Times New Roman", serif; overflow-x: auto; }
        .report-sheet table { font-family: inherit; }
        .report-sheet th, .report-sheet td { background: transparent; color: inherit; border-left: 0; border-right: 0; }
        .report-sheet .rs-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .report-sheet .rs-table th { text-align: left; border-bottom: 1px solid #111; padding: 4px 6px; font-weight: 600; vertical-align: bottom; }
        .report-sheet .rs-table td { padding: 3px 6px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
        .report-sheet .rs-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .report-sheet .rs-table tr.strong td { font-weight: 700; }
        .report-sheet .rs-table tr.tot td { border-top: 1px solid #111; border-bottom: 3px double #111; font-weight: 700; }
        .report-sheet h4 { font-size: 12.5px; font-weight: 700; margin: 16px 0 4px; }
        @media print {
          body * { visibility: hidden !important; }
          .report-sheet, .report-sheet * { visibility: visible !important; }
          .report-sheet { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; border-radius: 0; box-shadow: none; }
          .report-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
