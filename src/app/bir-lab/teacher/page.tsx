"use client";
// The instructor page: every student's saved attempts (filter, CSV export) and an answer-key viewer for each case. Teachers only; the database also refuses anyone else.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { ALL_CASES, getCase } from "@/birlab/cases";
import { keyValues } from "@/birlab/engine/check";
import { isoToUs, money, amt } from "@/birlab/engine/tax";
import { FORMS, getForm } from "@/birlab/forms/registry";
import { fetchTeacherList, type TeacherRow } from "@/birlab/lib/birApi";
import { unverifiedRules } from "@/birlab/rules/2026";

const csvCell = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;

export default function TeacherPage() {
  const { profile } = useSession();
  const [rows, setRows] = useState<TeacherRow[] | null | undefined>(undefined);
  const [form, setForm] = useState("");
  const [student, setStudent] = useState("");
  const [caseId, setCaseId] = useState(ALL_CASES[0]?.id ?? "");
  const isTeacher = profile?.role === "teacher";

  useEffect(() => { if (!isTeacher) return; let on = true; fetchTeacherList().then((r) => { if (on) setRows(r); }); return () => { on = false; }; }, [isTeacher]);
  const shown = useMemo(() => (rows ?? []).filter((r) => (!form || r.form_id === form) && (!student || r.student.toLowerCase().includes(student.toLowerCase()))), [rows, form, student]);
  const students = useMemo(() => new Set((rows ?? []).map((r) => r.student)).size, [rows]);

  const exportCsv = () => {
    const head = ["Student", "Form", "Case", "Mode", "Score", "Max", "Percent", "Final", "Wrong form", "Seconds", "When"];
    const lines = shown.map((r) => [r.student, r.form_id, r.case_id, r.mode, r.score, r.max_score, r.max_score ? Math.round((r.score / r.max_score) * 100) : 0, r.final, r.wrong_form, r.seconds, r.created_at].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "bir-lab-attempts.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const c = getCase(caseId);
  const def = c ? getForm(c.form)?.def : undefined;
  const key = c && def ? keyValues(def, { ...c.profile, ...c.facts }, { filingDate: c.filingDate, classification: c.classification }) : null;
  const keyItems = key && def && c ? def.scoring({ ...c.profile, ...c.facts }).filter((s) => amt(key[s.id]) !== 0 || /[A-Za-z]/.test(key[s.id] ?? "")) : [];

  if (!isTeacher) return <p className="text-sm text-gray-600">This page is for instructors. <Link href="/bir-lab" className="text-[#0b2a6f] underline">Back to the lab</Link></p>;

  return (
    <div className="space-y-6">
      <h1 className="border-l-4 border-[#f2b705] pl-3 text-2xl font-bold text-[#0b2a6f]">Instructor</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Student attempts</h2>
        {rows === undefined && <p className="mt-1 text-xs text-gray-500">Loading…</p>}
        {rows === null && <p className="mt-1 text-xs text-amber-800">The attempts could not be read. Migration 0084 must be applied, and you must be signed in as a teacher.</p>}
        {rows && (
          <>
            <div className="mt-2 flex flex-wrap items-end gap-3 text-xs text-gray-600">
              <label className="flex flex-col gap-1">Form<select value={form} onChange={(e) => setForm(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"><option value="">All</option>{FORMS.filter((f) => f.def).map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}</select></label>
              <label className="flex flex-col gap-1">Student<input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="name contains" className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" /></label>
              <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 disabled:opacity-40">Export CSV</button>
              <span>{shown.length} attempts · {students} students</span>
            </div>
            <div className="mt-2 max-h-96 overflow-auto"><table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-gray-500"><tr><th className="p-1.5">When</th><th className="p-1.5">Student</th><th className="p-1.5">Form</th><th className="p-1.5">Case</th><th className="p-1.5">Mode</th><th className="p-1.5">Score</th><th className="p-1.5">Time</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id} className="border-t border-gray-100"><td className="p-1.5">{isoToUs(r.created_at.slice(0, 10))}</td><td className="p-1.5">{r.student}</td><td className="p-1.5">{r.form_id}</td><td className="p-1.5">{r.case_id || "free"}</td><td className="p-1.5">{r.mode}{r.final ? "" : " (draft)"}</td><td className="p-1.5 font-semibold">{r.wrong_form ? "wrong form: 0%" : r.max_score ? `${Math.round((r.score / r.max_score) * 100)}%` : "—"}</td><td className="p-1.5">{Math.round(r.seconds / 60)} min</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Answer keys</h2>
        <p className="mt-0.5 text-xs text-gray-500">The key is the form&apos;s own computation run on the case&apos;s facts, so it can never disagree with the form.</p>
        <label className="mt-2 flex flex-col gap-1 text-xs text-gray-600">Case
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="max-w-xl rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
            {ALL_CASES.map((x) => <option key={x.id} value={x.id}>{x.form} · {x.level} · {x.title}</option>)}
          </select>
        </label>
        {c && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Worked solution</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{c.solution.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <p className="mt-2 text-xs text-gray-500">Correct form: {c.correctForm}. {c.whyForm}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Key values (graded items)</h3>
              <table className="mt-1 w-full text-xs"><tbody>
                {keyItems.map((s) => <tr key={s.id} className="border-t border-gray-100"><td className="p-1">Item {s.item} <span className="text-gray-400">({s.id})</span></td><td className="p-1 text-right tabular-nums">{/[A-Za-z]/.test(key?.[s.id] ?? "") ? key?.[s.id] : money(amt(key?.[s.id]), false)}</td><td className="p-1 text-right text-gray-400">×{s.weight}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Rules not checked against an official BIR document</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-700">
          {unverifiedRules().map((r) => <li key={r.rule}><b>{r.rule}</b>: {r.basis}{r.note ? ` — ${r.note}` : ""}</li>)}
        </ul>
      </section>
    </div>
  );
}
