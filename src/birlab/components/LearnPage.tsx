"use client";
// The lesson page for a form, shown before the filling screen: Lecture, item-by-item filling guide (with a form preview that highlights the item),
// Tips and notes, and a five-item Quick check that unlocks the case problems at 4 of 5. Everything stays readable if the student fails the quiz.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CaseDef } from "../cases/types";
import type { GuideRow, LectureSection, QuizItem } from "../content/f1701a";
import { getForm } from "../forms/registry";
import { useBirStore } from "../store/useBirStore";
import { FormRenderer, pageOfId } from "./FormRenderer";

export interface Lesson {
  asOf: string;
  lecture: { title: string; minutes: string; sections: LectureSection[]; worked: { intro: string; steps: string[]; graduated?: Record<string, string>; eight?: Record<string, string>; tables?: { title: string; data: Record<string, string> }[] }; legal: string[] };
  guide: GuideRow[];
  tips: { checklist: string[]; pitfalls: string[]; amended: string; noPayment: string };
  quiz: QuizItem[];
  cases: CaseDef[];
}

type Tab = "lecture" | "guide" | "tips" | "quiz";
const TABS: { id: Tab; label: string }[] = [{ id: "lecture", label: "Lecture" }, { id: "guide", label: "Filling guide" }, { id: "tips", label: "Tips and notes" }, { id: "quiz", label: "Quick check" }];

function WorkedTable({ title, data }: { title: string; data: Record<string, string> }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="text-xs font-semibold text-gray-600">{title}</div>
      <table className="mt-1 w-full text-xs"><tbody>
        {Object.entries(data).map(([item, v]) => <tr key={item} className="border-t border-gray-100"><td className="py-0.5">Item {item}</td><td className="py-0.5 text-right tabular-nums">₱{v}</td></tr>)}
      </tbody></table>
    </div>
  );
}

export function LearnPage({ formId, lesson }: { formId: string; lesson: Lesson }) {
  const entry = getForm(formId);
  const def = entry?.def;
  const { quiz, saveQuiz, visit } = useBirStore();
  const [tab, setTab] = useState<Tab>("lecture");
  const [hl, setHl] = useState<string>(lesson.guide[0]?.field ?? "");
  const [answers, setAnswers] = useState<(number | null)[]>(() => lesson.quiz.map(() => null));
  const [graded, setGraded] = useState(false);
  const q = quiz[formId];

  useEffect(() => { visit(formId); }, [formId, visit]);
  if (!entry || !def) return null;

  const score = answers.reduce<number>((n, a, i) => n + (a === lesson.quiz[i].answer ? 1 : 0), 0);
  const submitQuiz = () => { setGraded(true); saveQuiz(formId, score, lesson.quiz.length); };
  const unlocked = !!q?.passed;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Form {entry.number}: {entry.name}</h1>
        <p className="text-sm text-gray-600 mt-1">{entry.whoFiles}. Official version: <b>{def.version}</b>. Due: <b>{entry.due}</b> (the lecture explains where this date comes from). Rules as of {lesson.asOf}.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600"}`}>{t.label}</button>)}
      </div>

      {tab === "lecture" && (
        <article className="max-w-3xl space-y-5 text-[15px] leading-relaxed text-gray-800">
          <div className="text-xs text-gray-500">{lesson.lecture.title} · {lesson.lecture.minutes}</div>
          {lesson.lecture.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-bold text-gray-900">{s.heading}</h2>
              <div className="mt-1 space-y-2">{s.body.map((p, i) => <p key={i}>{p}</p>)}</div>
            </section>
          ))}
          <section>
            <h2 className="text-lg font-bold text-gray-900">6. Worked illustration</h2>
            <p className="mt-1">{lesson.lecture.worked.intro}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">{lesson.lecture.worked.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <p className="mt-2 text-sm font-semibold">The same numbers on the form:</p>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">{(lesson.lecture.worked.tables ?? [{ title: "Graduated rates with OSD (Part IV.A and IV.C)", data: lesson.lecture.worked.graduated ?? {} }, { title: "8% option (Part IV.B and IV.C)", data: lesson.lecture.worked.eight ?? {} }]).map((t) => <WorkedTable key={t.title} title={t.title} data={t.data} />)}</div>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">7. Legal basis</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{lesson.lecture.legal.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        </article>
      )}

      {tab === "guide" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 text-left text-gray-600"><tr><th className="p-2 w-16">Item</th><th className="p-2">What to enter</th><th className="p-2">Where the number comes from</th><th className="p-2">Common mistake</th></tr></thead>
              <tbody>
                {lesson.guide.map((g) => (
                  <tr key={g.item} onClick={() => setHl(g.field)} className={`cursor-pointer border-t border-gray-100 align-top ${hl === g.field ? "bg-yellow-100" : "hover:bg-gray-50"}`}>
                    <td className="p-2 font-semibold"><button type="button" className="text-left" onClick={() => setHl(g.field)}>{g.item}</button></td><td className="p-2">{g.enter}</td><td className="p-2">{g.source}</td><td className="p-2 text-rose-800">{g.mistake}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-2">
              <div className="mb-1 text-xs font-semibold text-gray-600">Preview: the highlighted item is item {lesson.guide.find((g) => g.field === hl)?.item}</div>
              <div className="max-h-[80vh] overflow-auto rounded border border-gray-300">
                <div style={{ zoom: 0.5 }}><FormRenderer def={def} page={pageOfId(def, hl)} values={{ "18": "joint" }} computed={{}} highlight={hl} compact /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tips" && (
        <div className="max-w-3xl space-y-5 text-sm text-gray-800">
          <section><h2 className="text-lg font-bold">Before you file</h2><ul className="mt-1 list-disc space-y-1 pl-5">{lesson.tips.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul></section>
          <section><h2 className="text-lg font-bold">Pitfalls students make</h2><ul className="mt-1 list-disc space-y-1 pl-5">{lesson.tips.pitfalls.map((c, i) => <li key={i}>{c}</li>)}</ul></section>
          <section><h2 className="text-lg font-bold">Amended return</h2><p className="mt-1">{lesson.tips.amended}</p></section>
          <section><h2 className="text-lg font-bold">No-payment returns</h2><p className="mt-1">{lesson.tips.noPayment}</p></section>
        </div>
      )}

      {tab === "quiz" && (
        <div className="max-w-3xl space-y-4">
          <p className="text-sm text-gray-600">Five questions. Get 4 of 5 to unlock the case problems. You can retake it, and you can read everything either way.</p>
          {lesson.quiz.map((item, i) => (
            <fieldset key={i} className="rounded border border-gray-200 bg-white p-3">
              <legend className="px-1 text-sm font-semibold">{i + 1}. {item.q}</legend>
              {item.choices.map((c, k) => (
                <label key={k} className={`mt-1 flex items-start gap-2 rounded px-2 py-1 text-sm ${graded && k === item.answer ? "bg-emerald-50" : graded && answers[i] === k ? "bg-rose-50" : ""}`}>
                  <input type="radio" name={`q${i}`} disabled={graded} checked={answers[i] === k} onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} className="mt-0.5" />{c}
                </label>
              ))}
              {graded && <p className="mt-2 text-sm text-gray-700"><b>{answers[i] === item.answer ? "Correct. " : "Not quite. "}</b>{item.explain}</p>}
            </fieldset>
          ))}
          {!graded ? (
            <button type="button" disabled={answers.some((a) => a === null)} onClick={submitQuiz} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Check my answers</button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${score >= 4 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{score} of {lesson.quiz.length}{score >= 4 ? ": the case problems are unlocked" : ": 4 of 5 unlocks the case problems"}</span>
              <button type="button" onClick={() => { setGraded(false); setAnswers(lesson.quiz.map(() => null)); }} className="text-sm text-blue-700 underline">Retake</button>
            </div>
          )}
        </div>
      )}

      {lesson.cases.length > 0 && <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold">Case problems</h2>
        {!unlocked && <p className="mt-1 text-sm text-amber-800">Pass the Quick check (4 of 5) to unlock these. {q ? `Your best so far is ${q.best} of ${lesson.quiz.length}.` : ""}</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {lesson.cases.map((c) => (
            <div key={c.id} className="rounded border border-gray-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{c.level}</div>
              <div className="font-semibold">{c.title}</div>
              <p className="mt-1 text-xs text-gray-600">Taxable year {c.year}.</p>
              <div className="mt-2 flex gap-2">
                {(["practice", "assessment"] as const).map((m) => unlocked
                  ? <Link key={m} href={`/bir-lab/${formId}/fill?case=${c.id}&mode=${m}`} className="rounded border border-gray-300 px-2.5 py-1 text-xs font-semibold hover:bg-gray-50">{m === "practice" ? "Practice" : "Assessment"}</Link>
                  : <span key={m} className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-400" aria-disabled>{m === "practice" ? "Practice" : "Assessment"}</span>)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">Practice: unlimited tries, hints and &quot;Check my return&quot;. Assessment: one submission, no hints.</p>
        <div className="mt-3"><Link href={`/bir-lab/${formId}/fill`} className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white">Open the blank form (free fill-up)</Link></div>
      </section>}
    </div>
  );
}
