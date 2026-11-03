"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { getAccount } from "@/bfar/core/chart-of-accounts";
import { formatAmount } from "@/bfar/lib/currency";
import { loadMine, saveMine } from "@/bfar/lib/bfarApi";
import { PRACTICE_SETS, practiceItems } from "@/bfar/practice-sets";
import type { PracticeSet } from "@/bfar/practice-sets/types";
import { BalanceBadge, EntryLinesEditor, draftToLines, emptyDraft, linesToDraft, type DraftLine } from "@/bfar/components/EntryBuilder";
import { SourceDocumentCard } from "@/bfar/components/SourceDocumentCard";
import { Card, Empty, PageHeader, Pill } from "@/bfar/components/ui";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

function SetWork({ set }: { set: PracticeSet }) {
  const answers = useAccountingStore((s) => s.answers[set.id]);
  const status = useAccountingStore((s) => s.status[set.id] ?? "draft");
  const released = useAccountingStore((s) => s.released[set.id]);
  const saveItem = useAccountingStore((s) => s.saveItem);
  const loadFromServer = useAccountingStore((s) => s.loadFromServer);
  const setStatus = useAccountingStore((s) => s.setStatus);
  const resetSet = useAccountingStore((s) => s.resetSet);
  const [drafts, setDrafts] = useState<Record<string, DraftLine[]>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const items = practiceItems(set);
  const locked = status === "released";
  const draftOf = (id: string) => drafts[id] ?? (answers?.[id] ? linesToDraft(answers[id]) : emptyDraft());
  const entered = items.filter((i) => (answers?.[i.id] ?? []).some((l) => l.debit > 0 || l.credit > 0)).length;

  // Pull what the server holds (and the teacher's released marking) when the set is opened.
  useEffect(() => {
    let live = true;
    loadMine(set.id).then((mine) => {
      if (!live || !mine) return;
      const local = useAccountingStore.getState().answers[set.id];
      if (mine.status === "released" || !local || Object.keys(local).length === 0) loadFromServer(set.id, mine.answers, mine.status, mine.released);
      else setStatus(set.id, mine.status);
    }).catch(() => { /* not saved to the teacher yet, or the database is not set up: the books still work on this device */ });
    return () => { live = false; };
  }, [set.id, loadFromServer, setStatus]);

  const change = (id: string, d: DraftLine[]) => {
    setDrafts((x) => ({ ...x, [id]: d }));
    saveItem(set.id, id, draftToLines(d));
  };

  const send = async (submit: boolean) => {
    setBusy(true); setMessage(null);
    try {
      const mine = useAccountingStore.getState().answers[set.id] ?? {};
      const s = await saveMine(set.id, mine, submit);
      setStatus(set.id, s);
      setMessage({ ok: true, text: submit ? "Submitted. Your teacher will check it." : "Saved." });
    } catch (e) {
      setMessage({ ok: false, text: `${(e as Error).message}. Your work is still saved on this device.` });
    }
    setBusy(false);
  };

  return (
    <>
      <Card className="mb-4">
        <p className="text-sm text-slate-700">{set.summary}</p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <Pill ok={entered === items.length}>{entered} of {items.length} entered</Pill>
          {status === "submitted" && <Pill ok>Submitted, waiting for your teacher</Pill>}
          {status === "released" && released && <Pill ok={released.score === released.max}>Checked: {released.score} of {released.max}</Pill>}
          {!locked && <button type="button" onClick={() => { resetSet(set.id); setDrafts({}); setMessage(null); }} className="text-slate-600 hover:underline">Start over</button>}
          {entered > 0 && <><Link href="/bfar/ledger" className="text-blue-700 hover:underline">Ledger</Link><Link href="/bfar/worksheet" className="text-blue-700 hover:underline">Worksheet</Link><Link href="/bfar/statements" className="text-blue-700 hover:underline">Statements</Link></>}
        </div>
        {released?.comment && <p className="mt-3 rounded-md bg-blue-50 border border-blue-200 p-2 text-sm"><b>Your teacher says:</b> {released.comment}</p>}
        <p className="mt-3 text-xs text-slate-500">You will not be told whether an entry is right. Journalize each document, save, and submit. Your teacher checks the work and releases the result.</p>
      </Card>

      {set.periodEndDocuments && set.periodEndDocuments.length > 0 && (
        <Card title="Papers for the end of the period" className="mb-4">
          <div className="grid gap-3 md:grid-cols-2">{set.periodEndDocuments.map((d) => <SourceDocumentCard key={d.no} document={d} />)}</div>
        </Card>
      )}

      <div className="grid gap-4">
        {items.map((item, n) => {
          const result = released?.items.find((r) => r.id === item.id);
          return (
            <Card key={item.id} className={result ? (result.status === "correct" ? "border-emerald-300" : "border-rose-300") : ""}>
              <div className="flex items-start gap-3">
                <div className="text-xs font-semibold text-slate-500 w-20 shrink-0">{item.type === "adjustment" ? `Adjustment (${item.tag})` : `No. ${n + 1}`}<div className="font-normal">{item.date}</div></div>
                <div className="flex-1 min-w-0">
                  {item.document ? <SourceDocumentCard document={item.document} /> : <p className="text-sm font-medium text-slate-900">{item.description}</p>}
                  {item.type === "adjustment" && <p className="text-xs text-slate-600 mt-2">Prepare the adjusting entry as of {item.date}.</p>}
                  <div className="mt-3">
                    <EntryLinesEditor draft={draftOf(item.id)} onChange={(d) => change(item.id, d)} disabled={locked} />
                    <div className="mt-2"><BalanceBadge lines={draftToLines(draftOf(item.id))} /></div>
                  </div>
                  {result && (
                    <div className={`mt-3 rounded-md border p-3 text-sm ${result.status === "correct" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                      <div className="font-semibold inline-flex items-center gap-1.5">{result.status === "correct" ? <><CheckCircle2 size={16} className="text-emerald-600" /> Correct</> : <><XCircle size={16} className="text-rose-600" /> Not correct</>}</div>
                      {result.status !== "correct" && (
                        <>
                          <ul className="list-disc pl-5 mt-1 text-rose-800">{result.messages.map((m) => <li key={m}>{m}</li>)}</ul>
                          {result.hints.length > 0 && <p className="mt-1 text-slate-700"><b>Hint:</b> {result.hints.join(" ")}</p>}
                          <div className="mt-2 text-xs"><div className="font-semibold">Correct entry</div>
                            {result.key.map((l, i) => <div key={i} className={`flex justify-between max-w-md ${l.credit > 0 ? "pl-6" : ""}`}><span>{getAccount(l.accountCode)?.name}</span><span className="tabular-nums">{formatAmount(l.debit || l.credit)}</span></div>)}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {!locked && (
        <div className="sticky bottom-0 mt-4 bg-white/95 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3 shadow">
          <button type="button" disabled={busy} onClick={() => void send(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Save my work</button>
          <button type="button" disabled={busy || entered === 0} onClick={() => void send(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{status === "submitted" ? "Submit again" : "Submit to my teacher"}</button>
          {message && <span role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
        </div>
      )}
    </>
  );
}

export default function PracticeSetsPage() {
  const hydrated = useHydrated();
  const [active, setActive] = useState<string | null>(null);
  const set = PRACTICE_SETS.find((s) => s.id === active);
  return (
    <>
      <PageHeader title="Practice sets" subtitle="Start from the source documents: analyze each paper and journalize it. Nothing is graded on screen; submit your work and your teacher checks it."
        actions={set ? <button type="button" onClick={() => setActive(null)} className="text-sm text-blue-700 hover:underline">All practice sets</button> : undefined} />
      {!hydrated ? null : set ? <SetWork set={set} /> : PRACTICE_SETS.length === 0 ? <Empty>No practice sets.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {PRACTICE_SETS.map((s) => (
            <button key={s.id} type="button" onClick={() => setActive(s.id)} className="text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
              <Card className="h-full hover:border-blue-400 transition-colors">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{s.business === "service" ? "Service business" : `Merchandising, ${s.inventory} system`}</div>
                <div className="font-semibold mt-1">{s.title}</div>
                <p className="text-sm text-slate-600 mt-1">{s.summary}</p>
                <p className="text-xs text-slate-500 mt-2">{s.transactions.length} source documents, {s.adjustments.length} {s.adjustments.length === 1 ? "adjustment" : "adjustments"}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
