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
  const pw = m.posting.filter((c) => c.status !== "ok");
  const lw = m.ledger.filter((c) => !c.ok), aw = m.adjusting.filter((c) => c.status !== "ok"), cw = m.columns.filter((c) => !c.ok);
  const colName: Record<string, string> = { isDr: "column 7 (Income Statement Dr)", isCr: "column 8 (Income Statement Cr)", bsDr: "column 9 (Balance Sheet Dr)", bsCr: "column 10 (Balance Sheet Cr)" };
  const f = m.footings;
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold">Posting, ledger and worksheet</div>
      <Section title="Posting (journal lines dropped on the right account and side)" ok={m.posting.length - pw.length} total={m.posting.length}>
        {pw.map((c, i) => <li key={i}>{name(c.accountCode)} {c.side === "Dr" ? "debit" : "credit"} {formatAmount(c.amount)}: {c.status === "not-posted" ? "not posted" : c.status === "no-line" ? "not in your journal" : c.status === "wrong-account" ? `posted to ${name(c.postedTo ?? "")}` : `posted on the ${c.postedSide === "Dr" ? "debit" : "credit"} side`}</li>)}
      </Section>
      <Section title="Ledger accounts" ok={m.ledger.length - lw.length} total={m.ledger.length}>
        {lw.map((c) => <li key={c.code}>{name(c.code)}: {c.opened ? `expected footings ${formatAmount(c.expected.debitFooting)} / ${formatAmount(c.expected.creditFooting)} and balance ${formatAmount(c.expected.balance)} ${c.expected.side}; you had ${formatAmount(c.got.debitFooting)} / ${formatAmount(c.got.creditFooting)} and ${formatAmount(c.got.balance)} ${c.got.side}` : "not opened in your ledger"}</li>)}
        {m.extra.ledger.map((c) => <li key={`x${c}`}>{name(c)}: not needed in this ledger</li>)}
      </Section>
      <Section title="Worksheet: adjusting lines placed on the right row and in column 3 or 4" ok={m.adjusting.length - aw.length} total={m.adjusting.length}>
        {aw.map((c, i) => <li key={i}>{name(c.accountCode)} {c.side === "Dr" ? "debit" : "credit"} {formatAmount(c.amount)}: {c.status === "not-posted" ? "not placed" : c.status === "no-line" ? "not in your journal" : c.status === "wrong-account" ? `placed on the ${name(c.postedTo ?? "")} row` : `placed in column ${c.postedSide === "Dr" ? "3 (debit)" : "4 (credit)"}`}</li>)}
      </Section>
      <Section title="Worksheet: adjusted balances placed in columns 7 to 10" ok={m.columns.length - cw.length} total={m.columns.length}>
        {cw.map((c) => <li key={c.code}>{name(c.code)}: {!c.listed ? "not in your worksheet" : !c.placed ? "not placed" : c.gotTo !== c.expectedTo ? `belongs in ${colName[c.expectedTo]}; you chose ${c.gotTo ? colName[c.gotTo] : "none"}` : "the ending inventory typed in columns 8 and 9 is not right"}</li>)}
        {m.extra.worksheet.map((c) => <li key={`x${c}`}>{name(c)}: not needed on this worksheet</li>)}
      </Section>
      <Section title="Worksheet: your subtotals, net income line and totals (checked against your own columns)" ok={Number(f.subtotalsOk) + Number(f.netOk) + Number(f.totalsOk)} total={3}>
        {!f.subtotalsOk && <li>The subtotals do not agree with what your columns add up to</li>}
        {!f.netOk && <li>The net income or loss line is not right, or is in the wrong columns</li>}
        {!f.totalsOk && <li>The totals do not agree with your columns plus the net income or loss</li>}
      </Section>
    </div>
  );
}
