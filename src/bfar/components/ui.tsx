"use client";
// Small presentational pieces shared by the BFAR pages: page header, card, money cell and the statement renderer.
import type { ReactNode } from "react";
import type { Statement, StatementLine } from "../core/statements-generator";
import { formatAmount, formatPeso } from "../lib/currency";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-4 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function Money({ value, peso = false, blankZero = true }: { value: number; peso?: boolean; blankZero?: boolean }) {
  if (blankZero && value === 0) return <span className="tabular-nums" />;
  return <span className="tabular-nums">{peso ? formatPeso(value) : formatAmount(value)}</span>;
}

export function Pill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-6 text-center">{children}</div>;
}

const INDENT = ["pl-0", "pl-5", "pl-10"] as const;

function amountClass(kind: StatementLine["kind"]): string {
  if (kind === "subtotal") return "border-b border-slate-800";
  if (kind === "total") return "border-b-4 border-double border-slate-900 font-bold";
  return "";
}

/** A statement in accounting format: subtotals get a single underline, totals a double underline. */
export function StatementView({ statement, entity }: { statement: Statement; entity: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-3xl mx-auto print:border-0">
      <div className="text-center mb-5">
        <div className="font-bold uppercase tracking-wide text-slate-900">{entity}</div>
        <div className="font-bold text-slate-900">{statement.title}</div>
        <div className="text-sm text-slate-600">{statement.subtitle}</div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {statement.lines.map((l, i) => (
            <tr key={i}>
              <td className={`py-0.5 ${INDENT[l.indent]} ${l.kind === "header" ? "font-semibold pt-3" : ""} ${l.kind === "total" ? "font-bold" : ""}`}>{l.label}</td>
              <td className="py-0.5 w-40 text-right">
                {l.amount !== undefined && (
                  <span className={`inline-block min-w-[8rem] tabular-nums px-1 ${amountClass(l.kind)}`}>{l.kind === "total" ? formatPeso(l.amount) : formatAmount(l.amount)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
