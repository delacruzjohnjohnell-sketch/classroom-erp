"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { getAccount } from "@/bfar/core/chart-of-accounts";
import { evaluateEntry, type EntryEvaluation } from "@/bfar/core/evaluator";
import { formatAmount } from "@/bfar/lib/currency";
import { PRACTICE_SETS, practiceItems } from "@/bfar/practice-sets";
import type { PracticeSet } from "@/bfar/practice-sets/types";
import { BalanceBadge, EntryLinesEditor, draftToLines, emptyDraft, linesToDraft, type DraftLine } from "@/bfar/components/EntryBuilder";
import { Card, Empty, PageHeader, Pill } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

function SetWork({ set }: { set: PracticeSet }) {
  const entries = useAccountingStore((s) => s.entries);
  const answers = useAccountingStore((s) => s.answers[set.id]);
  const instructor = useAccountingStore((s) => s.instructorMode);
  const saveAnswer = useAccountingStore((s) => s.saveAnswer);
  const commit = useAccountingStore((s) => s.commitPracticeItem);
  const loadSolution = useAccountingStore((s) => s.loadSolution);
  const resetSet = useAccountingStore((s) => s.resetSet);
  const [drafts, setDrafts] = useState<Record<string, DraftLine[]>>({});
  const [results, setResults] = useState<Record<string, EntryEvaluation>>({});

  const items = practiceItems(set);
  const done = (id: string) => entries.some((e) => e.id === `${set.id}-${id}`);
  const doneCount = items.filter((i) => done(i.id)).length;
  const draftOf = (id: string) => drafts[id] ?? (answers?.[id] ? linesToDraft(answers[id]) : emptyDraft());

  const check = (id: string) => {
    const item = items.find((i) => i.id === id)!;
    const lines = draftToLines(draftOf(id));
    const res = evaluateEntry(lines, item.key, { hint: item.hint, showKey: instructor });
    saveAnswer(set.id, id, lines);
    if (res.status === "correct") commit(set.id, id, lines);
    setResults({ ...results, [id]: res });
  };

  return (
    <>
      <Card className="mb-4">
        <p className="text-sm text-slate-700">{set.summary}</p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <Pill ok={doneCount === items.length}>{doneCount} of {items.length} correct</Pill>
          <div className="h-2 w-48 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>
          <button type="button" onClick={() => { resetSet(set.id); setDrafts({}); setResults({}); }} className="text-slate-600 hover:underline">Start over</button>
          {instructor && <button type="button" onClick={() => loadSolution(set.id)} className="rounded border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">Load the full solution</button>}
          {doneCount > 0 && <><Link href="/bfar/ledger" className="text-blue-700 hover:underline">Ledger</Link><Link href="/bfar/worksheet" className="text-blue-700 hover:underline">Worksheet</Link><Link href="/bfar/statements" className="text-blue-700 hover:underline">Statements</Link></>}
        </div>
      </Card>

      <div className="grid gap-4">
        {items.map((item, n) => {
          const r = results[item.id];
          const isDone = done(item.id);
          return (
            <Card key={item.id} className={isDone ? "border-emerald-300 bg-emerald-50/40" : ""}>
              <div className="flex items-start gap-3">
                <div className="text-xs font-semibold text-slate-500 w-20 shrink-0">{item.type === "adjustment" ? `Adjustment (${item.tag})` : `No. ${n + 1}`}<div className="font-normal">{item.date}</div></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{item.description}</p>
                  {item.type === "transaction" && item.terms && <p className="text-xs text-slate-600 mt-0.5">Terms: {item.terms}</p>}
                  {isDone ? (
                    <p className="mt-2 text-sm text-emerald-700 inline-flex items-center gap-1.5"><CheckCircle2 size={16} /> Correct and recorded in your books.</p>
                  ) : (
                    <div className="mt-3">
                      <EntryLinesEditor draft={draftOf(item.id)} onChange={(d) => setDrafts({ ...drafts, [item.id]: d })} />
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <BalanceBadge lines={draftToLines(draftOf(item.id))} />
                        <button type="button" onClick={() => check(item.id)} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Check</button>
                      </div>
                      {r && r.status !== "correct" && (
                        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm" role="alert">
                          <ul className="list-disc pl-5 text-rose-800">{r.messages.map((m) => <li key={m}>{m}</li>)}</ul>
                          {r.hints.length > 0 && <p className="mt-2 text-slate-700"><b>Hint:</b> {r.hints.join(" ")}</p>}
                        </div>
                      )}
                    </div>
                  )}
                  {instructor && (
                    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
                      <div className="font-semibold text-amber-900 mb-1">Solution key</div>
                      {item.key.map((l, i) => <div key={i} className={`flex justify-between max-w-md ${l.credit > 0 ? "pl-6" : ""}`}><span>{getAccount(l.accountCode)?.name}</span><span className="tabular-nums">{formatAmount(l.debit || l.credit)}</span></div>)}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

export default function PracticeSetsPage() {
  const hydrated = useHydrated();
  const [active, setActive] = useState<string | null>(null);
  const set = PRACTICE_SETS.find((s) => s.id === active);
  return (
    <>
      <PageHeader title="Practice sets" subtitle="Work a full month of transactions. Each answer is checked instantly against the solution key, with a hint when it is wrong. Correct answers are recorded in your books for the ledger, worksheet and statements."
        actions={set ? <button type="button" onClick={() => setActive(null)} className="text-sm text-blue-700 hover:underline">All practice sets</button> : undefined} />
      {!hydrated ? null : set ? <SetWork set={set} /> : PRACTICE_SETS.length === 0 ? <Empty>No practice sets.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {PRACTICE_SETS.map((s) => (
            <button key={s.id} type="button" onClick={() => setActive(s.id)} className="text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
              <Card className="h-full hover:border-blue-400 transition-colors">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{s.business === "service" ? "Service business" : `Merchandising, ${s.inventory} system`}</div>
                <div className="font-semibold mt-1">{s.title}</div>
                <p className="text-sm text-slate-600 mt-1">{s.summary}</p>
                <p className="text-xs text-slate-500 mt-2">{s.transactions.length} transactions, {s.adjustments.length} {s.adjustments.length === 1 ? "adjustment" : "adjustments"}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
