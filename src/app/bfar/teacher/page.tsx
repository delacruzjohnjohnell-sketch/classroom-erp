"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccount } from "@/bfar/core/chart-of-accounts";
import { formatAmount } from "@/bfar/lib/currency";
import { checkSubmission, listSubmissions, type TeacherRow } from "@/bfar/lib/bfarApi";
import { PRACTICE_SETS, getPracticeSet, practiceItems } from "@/bfar/practice-sets";
import { WorkResult } from "@/bfar/components/WorkResult";
import type { Marking } from "@/bfar/practice-sets/solution";
import { SourceDocumentCard } from "@/bfar/components/SourceDocumentCard";
import { Card, Empty, PageHeader, Pill } from "@/bfar/components/ui";
import type { JournalLine } from "@/bfar/core/types";
import { useSession } from "@/lib/session";

const LinesView = ({ lines, empty }: { lines: JournalLine[]; empty?: string }) => (
  <div className="text-xs">
    {lines.filter((l) => l.debit || l.credit).length === 0 ? <span className="text-slate-400">{empty ?? "No entry"}</span> : lines.filter((l) => l.debit || l.credit).map((l, i) => (
      <div key={i} className={`flex justify-between gap-3 ${l.credit > 0 ? "pl-5" : ""}`}><span>{getAccount(l.accountCode)?.name ?? (l.accountCode || "?")}</span><span className="tabular-nums">{formatAmount(l.debit || l.credit)}</span></div>
    ))}
  </div>
);

export default function TeacherCheckPage() {
  const router = useRouter();
  const { loading, userId, profile } = useSession();
  const [rows, setRows] = useState<TeacherRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [marking, setMarking] = useState<Marking | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const isTeacher = profile?.role === "teacher";
  useEffect(() => {
    if (!loading && userId && profile && !isTeacher) router.replace("/bfar");
  }, [loading, userId, profile, isTeacher, router]);

  const reload = useCallback(() => { listSubmissions().then(setRows).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => { if (isTeacher) reload(); }, [isTeacher, reload]);

  // The keys are loaded only here, only for a teacher.
  const open = async (row: TeacherRow) => {
    const set = getPracticeSet(row.setId);
    if (!set) return;
    const { gradeSubmission } = await import("@/bfar/practice-sets/solution");
    setOpenId(row.id); setMarking(gradeSubmission(set, row.journal, row.work)); setComment(row.comment ?? ""); setNote(null);
  };

  const save = async (release: boolean) => {
    const row = rows?.find((r) => r.id === openId);
    if (!row || !marking) return;
    setBusy(true); setNote(null);
    try {
      await checkSubmission(row.id, { ...marking, comment: comment.trim() || null }, release);
      setNote(release ? "Released to the student." : "Marking saved. The student cannot see it yet.");
      reload();
    } catch (e) { setNote((e as Error).message); }
    setBusy(false);
  };

  if (loading || !isTeacher) return null;
  const row = rows?.find((r) => r.id === openId);
  const set = row && getPracticeSet(row.setId);

  return (
    <>
      <PageHeader title="Check student work" subtitle="Submitted practice sets, graded against the solution key. Students only see the result and the correct entries after you release them." />
      {error && <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}. If this says a function does not exist, migration 0083 has not been applied yet.</div>}
      {!row ? (
        rows === null ? null : rows.length === 0 ? <Empty>No student has saved work yet.</Empty> : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs text-slate-600"><tr><th className="p-2">Student</th><th className="p-2">Practice set</th><th className="p-2">Status</th><th className="p-2">Submitted</th><th className="p-2 text-right">Score</th><th className="p-2" /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2">{r.student}</td>
                    <td className="p-2">{PRACTICE_SETS.find((s) => s.id === r.setId)?.title ?? r.setId}</td>
                    <td className="p-2"><Pill ok={r.status !== "draft"}>{r.status === "draft" ? "Still working" : r.status === "submitted" ? "Waiting for you" : "Released"}</Pill></td>
                    <td className="p-2 whitespace-nowrap">{r.submittedAt ? new Date(r.submittedAt).toLocaleString("en-PH") : ""}</td>
                    <td className="p-2 text-right">{r.score !== null ? `${r.score} / ${r.max}` : ""}</td>
                    <td className="p-2 text-right"><button type="button" onClick={() => void open(r)} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Check</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : set && marking && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button type="button" onClick={() => setOpenId(null)} className="text-blue-700 hover:underline">All submissions</button>
              <b>{row.student}</b><span>{set.title}</span>
              <Pill ok={marking.score === marking.max}>{marking.score} of {marking.max} correct</Pill>
              <span className="text-xs text-slate-600">Journal {marking.journalScore}/{marking.journalMax} · Posting, ledger and worksheet {marking.workScore}/{marking.workMax}</span>
              {row.status === "released" && <Pill ok>Already released</Pill>}
            </div>
            <label className="flex flex-col gap-1 text-sm mt-3">Comment for the student (optional)
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Save marking</button>
              <button type="button" disabled={busy} onClick={() => void save(true)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Release to the student</button>
              {note && <span role="status" className="text-sm text-slate-700">{note}</span>}
            </div>
          </Card>
          <Card title="Posting, ledger and worksheet" className="mb-4"><WorkResult marking={marking.work} /></Card>
          <div className="grid gap-3">
            {practiceItems(set).map((item, n) => {
              const m = marking.items.find((x) => x.id === item.id)!;
              return (
                <Card key={item.id} className={m.status === "correct" ? "border-emerald-300" : "border-rose-300"}>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="text-xs font-semibold text-slate-500 w-20 shrink-0">{item.type === "adjustment" ? `Adj. (${item.tag})` : `No. ${n + 1}`}</div>
                    <div className="flex-1 min-w-[16rem]">{item.document ? <SourceDocumentCard document={item.document} entity={set.entity} /> : <p className="text-sm">{item.description}</p>}</div>
                    <div className="w-72 shrink-0">
                      <div className="text-xs font-semibold mb-1">Student&apos;s entry <Pill ok={m.status === "correct"}>{m.status === "correct" ? "Correct" : m.status === "empty" ? "Blank" : "Not correct"}</Pill></div>
                      <LinesView lines={m.answer} />
                      {m.status !== "correct" && (<><div className="text-xs font-semibold mt-3 mb-1">Key</div><LinesView lines={m.key} /><ul className="mt-2 list-disc pl-4 text-xs text-rose-800">{m.messages.map((x) => <li key={x}>{x}</li>)}</ul></>)}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
