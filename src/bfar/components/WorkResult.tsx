"use client";
// How the teacher marked the hand-built ledger, trial balance and worksheet. Shown to the student only after release, and to the teacher always.
import type { ReactNode } from "react";
import { getAccount } from "../core/chart-of-accounts";
import type { WorkMarking } from "../core/student-work";
import { formatAmount } from "../lib/currency";

const name = (code: string) => `${code} ${getAccount(code)?.name ?? ""}`;
const Section = ({ title, ok, total, children }: { title: string; ok: number; total: number; children: ReactNode }) => (
  <div className="mt-3">
    <div className="text-sm font-semibold">{title}: {ok} of {total} correct</div>
    <ul className="mt-1 list-disc pl-5 text-xs text-rose-800 space-y-0.5">{children}</ul>
  </div>
);

export function WorkResult({ marking: m }: { marking: WorkMarking }) {
  const lw = m.ledger.filter((c) => !c.ok), tw = m.tb.filter((c) => !c.ok), ww = m.worksheet.filter((c) => !c.ok);
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold">Ledger, trial balance and worksheet</div>
      <Section title="Ledger accounts" ok={m.ledger.length - lw.length} total={m.ledger.length}>
        {lw.map((c) => <li key={c.code}>{name(c.code)}: {c.opened ? `expected footings ${formatAmount(c.expected.debitFooting)} / ${formatAmount(c.expected.creditFooting)} and balance ${formatAmount(c.expected.balance)} ${c.expected.side}; you had ${formatAmount(c.got.debitFooting)} / ${formatAmount(c.got.creditFooting)} and ${formatAmount(c.got.balance)} ${c.got.side}` : "not opened in your ledger"}</li>)}
        {m.extra.ledger.map((c) => <li key={`x${c}`}>{name(c)}: not needed in this ledger</li>)}
      </Section>
      <Section title="Trial balance" ok={m.tb.length - tw.length + (m.tbTotalsOk ? 1 : 0)} total={m.tb.length + 1}>
        {tw.map((c) => <li key={c.code}>{name(c.code)}: {c.listed ? `expected Dr ${formatAmount(c.expected.debit)} / Cr ${formatAmount(c.expected.credit)}; you had Dr ${formatAmount(c.got.debit)} / Cr ${formatAmount(c.got.credit)}` : "missing from your trial balance"}</li>)}
        {!m.tbTotalsOk && <li>Totals: expected {formatAmount(m.expectedTotals.tbDebit)} and {formatAmount(m.expectedTotals.tbCredit)}</li>}
        {m.extra.tb.map((c) => <li key={`x${c}`}>{name(c)}: not on this trial balance</li>)}
      </Section>
      <Section title="Worksheet" ok={m.worksheet.length - ww.length + (m.worksheetTotalsOk ? 1 : 0)} total={m.worksheet.length + 1}>
        {ww.map((c) => <li key={c.code}>{name(c.code)}: {c.listed ? "one or more columns or the adjustment letters are not right" : "missing from your worksheet"}{c.expectedAdj.length ? ` (adjustment ${c.expectedAdj.join(", ")})` : ""}</li>)}
        {!m.worksheetTotalsOk && <li>Net income line or column totals are not right</li>}
        {m.extra.worksheet.map((c) => <li key={`x${c}`}>{name(c)}: not on this worksheet</li>)}
      </Section>
    </div>
  );
}
