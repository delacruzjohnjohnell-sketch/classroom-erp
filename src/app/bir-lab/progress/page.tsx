"use client";
// The student's own record: quick-check results, attempts saved in this browser, and the attempts saved to the database (when migration 0084 is applied).
import { useEffect, useState } from "react";
import { FORMS } from "@/birlab/forms/registry";
import { ALL_CASES } from "@/birlab/cases";
import { isoToUs } from "@/birlab/engine/tax";
import { fetchMyAttempts, type AttemptRow } from "@/birlab/lib/birApi";
import { useBirStore } from "@/birlab/store/useBirStore";

export default function ProgressPage() {
  const { quiz, attempts } = useBirStore();
  const [saved, setSaved] = useState<AttemptRow[] | null | undefined>(undefined);
  useEffect(() => { let on = true; fetchMyAttempts().then((r) => { if (on) setSaved(r); }); return () => { on = false; }; }, []);
  const built = FORMS.filter((f) => f.def);
  const caseTitle = (id: string) => ALL_CASES.find((c) => c.id === id)?.title ?? id;

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-2xl font-bold">My progress</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Quick checks</h2>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
          <thead className="text-left text-gray-500"><tr><th className="p-1.5">Form</th><th className="p-1.5">Best score</th><th className="p-1.5">Tries</th><th className="p-1.5">Cases</th></tr></thead>
          <tbody>{built.map((f) => {
            const q = quiz[f.id];
            return <tr key={f.id} className="border-t border-gray-100"><td className="p-1.5 font-semibold">{f.number}</td><td className="p-1.5">{q ? `${q.best} of 5` : "—"}</td><td className="p-1.5">{q?.attempts ?? 0}</td><td className="p-1.5">{q?.passed ? <span className="text-emerald-700">unlocked</span> : <span className="text-gray-400">locked</span>}</td></tr>;
          })}</tbody>
        </table></div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Case attempts (this browser)</h2>
        {attempts.length === 0 ? <p className="mt-1 text-xs text-gray-500">No attempts yet. Open a form, pass its quick check, then check a case.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr><th className="p-1.5">When</th><th className="p-1.5">Form</th><th className="p-1.5">Case</th><th className="p-1.5">Mode</th><th className="p-1.5">Score</th></tr></thead>
            <tbody>{[...attempts].reverse().map((a) => (
              <tr key={a.id} className="border-t border-gray-100"><td className="p-1.5">{isoToUs(a.at.slice(0, 10))}</td><td className="p-1.5">{a.formId}</td><td className="p-1.5">{caseTitle(a.caseId)}</td><td className="p-1.5">{a.mode}</td><td className="p-1.5 font-semibold">{a.wrongForm ? "wrong form: 0%" : `${a.percent}%`}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Saved to the classroom record</h2>
        {saved === undefined && <p className="mt-1 text-xs text-gray-500">Loading…</p>}
        {saved === null && <p className="mt-1 text-xs text-gray-500">The classroom record is not available right now. Your work is still safe in this browser.</p>}
        {saved && (saved.length === 0 ? <p className="mt-1 text-xs text-gray-500">Nothing saved yet. A final submitted return is saved here.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
            <thead className="text-left text-gray-500"><tr><th className="p-1.5">When</th><th className="p-1.5">Form</th><th className="p-1.5">Case</th><th className="p-1.5">Mode</th><th className="p-1.5">Score</th></tr></thead>
            <tbody>{saved.map((a) => (
              <tr key={a.id} className="border-t border-gray-100"><td className="p-1.5">{isoToUs(a.created_at.slice(0, 10))}</td><td className="p-1.5">{a.form_id}</td><td className="p-1.5">{caseTitle(a.case_id)}</td><td className="p-1.5">{a.mode}</td><td className="p-1.5 font-semibold">{a.wrong_form ? "wrong form: 0%" : a.max_score ? `${Math.round((a.score / a.max_score) * 100)}%` : "—"}</td></tr>
            ))}</tbody>
          </table></div>
        ))}
      </section>
    </div>
  );
}
