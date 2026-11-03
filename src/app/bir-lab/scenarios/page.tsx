"use client";
// Cross-form scenarios: one story, several returns, numbers carried from step to step. Each step opens the normal filling screen with that case.
import Link from "next/link";
import { getCase } from "@/birlab/cases";
import { SCENARIOS } from "@/birlab/cases/scenarios";
import { getForm } from "@/birlab/forms/registry";
import { useBirStore } from "@/birlab/store/useBirStore";

export default function ScenariosPage() {
  const { quiz, drafts } = useBirStore();
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cross-form scenarios</h1>
        <p className="mt-1 text-sm text-gray-600">Real taxpayers file several returns that feed one another. Work through each scenario in order: the figure on one form becomes a credit or a check on the next. Each step needs the lesson read and its Quick check passed (4 of 5), like any case.</p>
      </div>
      {SCENARIOS.map((s) => (
        <section key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-bold">{s.title}</h2>
          <p className="mt-1 text-sm text-gray-700">{s.intro}</p>
          <ol className="mt-3 space-y-2">
            {s.steps.map((st, i) => {
              const c = getCase(st.caseId);
              const entry = c ? getForm(c.form) : undefined;
              if (!c || !entry) return null;
              const open = !!quiz[c.form]?.passed;
              const done = Object.values(drafts).some((d) => d.caseId === c.id && (d.status === "final" || d.status === "submitted"));
              return (
                <li key={st.caseId} className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-sm font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">Form {entry.number}: {c.title}{done && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">filed</span>}</div>
                    <div className="text-xs text-gray-600">{st.note}</div>
                  </div>
                  {open
                    ? <Link href={`/bir-lab/${c.form}/fill?case=${c.id}&mode=practice`} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">Practice</Link>
                    : <Link href={`/bir-lab/${c.form}`} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">Pass the Form {entry.number} quick check first</Link>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
