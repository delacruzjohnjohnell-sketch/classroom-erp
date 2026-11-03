"use client";
// "Which form do I file?": answer a few questions and the lab names the form(s), with the reason and a link to each lesson.
import { useMemo, useState } from "react";
import Link from "next/link";
import { getForm } from "@/birlab/forms/registry";
import { nextQuestion, recommend, type Answers } from "@/birlab/engine/decide";

export default function WhichFormPage() {
  const [answers, setAnswers] = useState<Answers>({});
  const [trail, setTrail] = useState<{ key: keyof Answers; question: string; label: string }[]>([]);
  const q = useMemo(() => nextQuestion(answers), [answers]);
  const picks = useMemo(() => recommend(answers), [answers]);

  const choose = (value: string, label: string) => {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.key]: value } as Answers));
    setTrail((t) => [...t, { key: q.key, question: q.text, label }]);
  };
  const back = () => {
    const last = trail[trail.length - 1];
    if (!last) return;
    setAnswers((a) => { const { [last.key]: _drop, ...rest } = a; void _drop; return rest as Answers; });
    setTrail((t) => t.slice(0, -1));
  };
  const reset = () => { setAnswers({}); setTrail([]); };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="border-l-4 border-[#f2b705] pl-3 text-2xl font-bold text-[#0b2a6f]">Which form do I file?</h1>
        <p className="mt-1 text-sm text-gray-600">Answer a few questions. This is a study aid: always read the story or the facts first, because the facts decide the form.</p>
      </div>

      {trail.length > 0 && (
        <ol className="space-y-1 rounded border border-gray-200 bg-white p-3 text-sm">
          {trail.map((t, i) => <li key={i}><span className="text-gray-500">{t.question}</span> <b>{t.label}</b></li>)}
        </ol>
      )}

      {q ? (
        <fieldset className="rounded-lg border border-gray-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold">{q.text}</legend>
          <div className="mt-2 grid gap-2">
            {q.options.map((o) => <button key={o.value} type="button" onClick={() => choose(o.value, o.label)} className="rounded border border-gray-300 px-3 py-2 text-left text-sm hover:bg-[#e8eefb]">{o.label}</button>)}
          </div>
        </fieldset>
      ) : (
        <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-lg font-bold text-emerald-900">File</h2>
          {picks.map((p) => {
            const entry = getForm(p.form);
            return (
              <div key={p.form} className="rounded bg-white p-3 text-sm">
                <div className="font-semibold">Form {entry?.number ?? p.form}{entry ? `: ${entry.name}` : ""}</div>
                <p className="mt-0.5 text-gray-700">{p.reason}</p>
                {entry && <Link href={`/bir-lab/${encodeURIComponent(entry.id)}`} className="mt-1 inline-block text-[#0b2a6f] underline">Open the lesson</Link>}
              </div>
            );
          })}
        </section>
      )}

      <div className="flex gap-3 text-sm">
        <button type="button" onClick={back} disabled={trail.length === 0} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Back</button>
        <button type="button" onClick={reset} disabled={trail.length === 0} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Start over</button>
      </div>
    </div>
  );
}
