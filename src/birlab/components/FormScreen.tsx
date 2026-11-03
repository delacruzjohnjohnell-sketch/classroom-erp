"use client";
// The filling screen: the form replica plus the buttons of the Offline eBIRForms Package, in the same order and with the same names:
// Validate, Edit, Save, Print, Final Copy, Submit/File Final (simulated). With a case it also runs the story, hints, "Check my return" and the scoring.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkReturn, keyValues, wrongFormResult, type CheckResult } from "../engine/check";
import { annualReturnDue, isoToUs, money, amt } from "../engine/tax";
import { logAttempt } from "../lib/birApi";
import { FORMS, getForm } from "../forms/registry";
import type { FieldDef, FormDef, Issue, Values } from "../forms/types";
import type { CaseDef } from "../cases/types";
import { draftKey, useBirStore, type Draft } from "../store/useBirStore";
import { FormRenderer, pageOfId, type Mark } from "./FormRenderer";

interface Props { formId: string; caseDef?: CaseDef; mode: "practice" | "assessment" | "free" }

const todayIso = () => new Date().toISOString().slice(0, 10);
const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11).toString(36).toUpperCase().padStart(7, "0");

/** Prefills the taxpayer's own identity items. The item numbers differ from form to form, so the first field of each kind on the form is used. */
function profileToValues(p: ReturnType<typeof useBirStore.getState>["profile"], def?: FormDef): Values {
  const v: Values = {};
  if (!def) return v;
  const fields = def.pages.flatMap((pg) => pg.sections.flatMap((s) => s.rows.flatMap((r) => (r.type === "fields" ? r.fields : []))));
  const first = (pred: (f: FieldDef) => boolean) => fields.find(pred)?.id;
  const name = [p.last, p.first, p.middle].filter(Boolean).join(", ") || p.tradeName;
  const put = (id: string | undefined, value: string) => { if (id && value) v[id] = value; };
  put(first((f) => f.kind === "tin"), p.tin);
  put(first((f) => f.kind === "rdo"), p.rdo);
  put(first((f) => f.kind === "text" && /name/i.test(f.label)), name.toUpperCase());
  put(first((f) => f.kind === "text" && /address/i.test(f.label)), p.address.toUpperCase());
  put(first((f) => f.kind === "zip"), p.zip);
  put(first((f) => f.kind === "phone"), p.tel);
  put(first((f) => f.kind === "email"), p.email);
  return v;
}

export function FormScreen({ formId, caseDef, mode }: Props) {
  const entry = getForm(formId);
  const def = entry?.def;
  const key = draftKey(formId, caseDef?.id ?? "", mode);
  const store = useBirStore();
  const saved = store.drafts[key];

  const [stage, setStage] = useState<"story" | "fill">(caseDef && !saved ? "story" : "fill");
  const [chosen, setChosen] = useState("");
  const [values, setValues] = useState<Values>(() => saved?.values ?? (caseDef ? { ...caseDef.profile } : profileToValues(store.profile, def)));
  const [filingDate, setFilingDate] = useState(saved?.filingDate ?? caseDef?.filingDate ?? todayIso());
  const [status, setStatus] = useState<Draft["status"]>(saved?.status ?? "draft");
  const [page, setPage] = useState(0);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hintsUsed, setHintsUsed] = useState(saved?.hintsUsed ?? 0);
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const ctx = useMemo(() => ({ filingDate, classification: caseDef?.classification }), [filingDate, caseDef]);
  const computed = useMemo(() => (def ? def.compute(values, ctx) : {}), [def, values, ctx]);
  const locked = status === "final" || status === "submitted";
  const key0 = useMemo(() => (def && caseDef ? keyValues(def, { ...caseDef.profile, ...caseDef.facts }, { filingDate: caseDef.filingDate, classification: caseDef.classification }) : null), [def, caseDef]);

  if (!entry || !def) return <p className="text-sm text-gray-600">This form is coming in a later phase.</p>;

  const errors = Object.fromEntries((issues ?? []).map((i) => [i.id, i.message]));
  const marks: Record<string, Mark> | undefined = result?.items.length ? Object.fromEntries(result.items.map((i) => [i.id, i.status])) : undefined;
  const persist = (s: Draft["status"], vals = values) => store.saveDraft(key, { values: vals, filingDate, status: s, updatedAt: new Date().toISOString(), caseId: caseDef?.id ?? "", mode, formId, hintsUsed });
  const set = (id: string, v: string) => { if (locked) return; setValues((x) => ({ ...x, [id]: v })); setStatus("draft"); setIssues(null); setResult(null); };

  const focusFirst = (list: Issue[]) => {
    const first = list[0];
    if (!first) return;
    setPage(pageOfId(def, first.id));
    setTimeout(() => { const el = document.getElementById(`f-${first.id}`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); (el as HTMLElement | null)?.focus?.(); }, 60);
  };

  const validate = (): Issue[] => {
    const list = def.validate(values, ctx);
    setIssues(list);
    if (list.length === 0) { setStatus("validated"); persist("validated"); setMsg("Validation successful. You may now save, print or make this the Final Copy."); }
    else { setStatus("draft"); setMsg(`${list.length} item${list.length === 1 ? "" : "s"} need attention.`); focusFirst(list); }
    return list;
  };
  const edit = () => { setStatus("draft"); setMsg("The form is unlocked."); };
  const save = () => { persist(status); setMsg("Draft saved."); };
  const finalCopy = () => {
    const list = validate();
    if (list.length === 0) { setStatus("final"); persist("final"); setMsg("Final Copy: the form is locked. Press Edit to change it."); }
  };
  const checkMine = () => { if (!def || !key0 || !caseDef) return; setResult(checkReturn(def, key0, values, ctx)); };

  const submit = () => {
    if (status !== "final") { setMsg("Make the form a Final Copy first (it must pass Validate)."); return; }
    let res: CheckResult | null = null;
    if (def && key0 && caseDef) { res = checkReturn(def, key0, values, ctx); setResult(res); }
    setStatus("submitted"); persist("submitted");
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    if (res && caseDef && mode !== "free") {
      store.addAttempt({ id: `${Date.now()}`, formId, caseId: caseDef.id, mode, score: res.score, max: res.max, percent: res.percent, at: new Date().toISOString(), seconds, wrongForm: false });
      void logAttempt({ formId, caseId: caseDef.id, mode, values, score: res.score, max: res.max, final: true, seconds, wrongForm: false });
    }
  };

  const chooseForm = () => {
    if (!caseDef) return;
    if (chosen === caseDef.correctForm) { setStage("fill"); setMsg(null); return; }
    const r = wrongFormResult(chosen, caseDef.correctForm, caseDef.whyForm);
    setResult(r);
    store.addAttempt({ id: `${Date.now()}`, formId, caseId: caseDef.id, mode: mode === "assessment" ? "assessment" : "practice", score: 0, max: 1, percent: 0, at: new Date().toISOString(), seconds: 0, wrongForm: true });
    void logAttempt({ formId: chosen, caseId: caseDef.id, mode: mode === "assessment" ? "assessment" : "practice", values: {}, score: 0, max: 1, final: true, seconds: 0, wrongForm: true });
  };

  const elapsed = Math.round((now - startedAt) / 1000);
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const dueIso = def.dueDate(values) || (caseDef ? annualReturnDue(caseDef.year) : "");
  const late = !!dueIso && filingDate > dueIso;
  const revealed = status === "submitted";

  // ---- story and "which form?" (cases only)
  if (caseDef && stage === "story") {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{caseDef.level} case · taxable year {caseDef.year} · {mode} mode</div>
          <h2 className="text-lg font-bold mt-1">{caseDef.title}</h2>
          <div className="mt-2 space-y-2 text-sm text-gray-800">{caseDef.story.map((p, i) => <p key={i}>{p}</p>)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm font-semibold">Which BIR form will you use for this taxpayer?
            <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="mt-1 block w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm font-normal">
              <option value="">Choose a form</option>
              {FORMS.map((f) => <option key={f.id} value={f.id}>{f.number}: {f.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-500">Choosing the wrong form scores zero, with an explanation.</p>
          <button type="button" disabled={!chosen} onClick={chooseForm} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Open this form</button>
          {result?.wrongForm && (
            <div role="alert" className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              <b>Score: 0.</b> You chose Form {result.wrongForm.chosen}; this taxpayer files Form {result.wrongForm.correct}. {result.wrongForm.why}
              <div className="mt-2"><Link href={`/bir-lab/${formId}`} className="text-blue-700 underline">Back to the lesson</Link></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pageTabs = def.pages.map((pg, i) => (
    <button key={pg.id} type="button" onClick={() => setPage(i)} className={`px-3 py-1.5 text-xs font-semibold border border-b-0 rounded-t ${page === i ? "bg-white text-gray-900" : "bg-gray-200 text-gray-600"}`}>{pg.title}</button>
  ));

  return (
    <div className="space-y-3">
      <div role="note" className="rounded border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs sm:text-sm text-amber-900">Educational simulation only — not connected to the BIR. Do not enter real TINs or personal data.</div>
      <p className="lg:hidden text-xs text-gray-600">Filling a return is easier on a tablet or laptop. You can read the case here, but the form needs a wider screen.</p>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
        <span className="font-semibold">Form {def.number} · version {def.version}</span>
        <span>Due {dueIso ? isoToUs(dueIso) : "(enter the year)"}</span>
        <label className="flex items-center gap-1.5">Date of filing (simulation)
          <input type="date" disabled={locked || !!caseDef} value={filingDate} onChange={(e) => { setFilingDate(e.target.value); setResult(null); }} className="rounded border border-gray-300 px-1.5 py-0.5" />
        </label>
        {late && <span className="rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">Filed late: surcharge and interest apply</span>}
        {mode === "assessment" && <label className="flex items-center gap-1"><input type="checkbox" checked={showTimer} onChange={(e) => setShowTimer(e.target.checked)} /> Timer {showTimer && <b className="tabular-nums">{mmss}</b>}</label>}
        <Link href={`/bir-lab/${formId}`} className="ml-auto text-blue-700 underline">Lesson</Link>
      </div>

      {caseDef && (
        <details className="rounded border border-gray-200 bg-white p-3 text-sm" open={!saved}>
          <summary className="cursor-pointer font-semibold">{caseDef.title}: the story</summary>
          <div className="mt-2 space-y-2">{caseDef.story.map((p, i) => <p key={i}>{p}</p>)}</div>
        </details>
      )}

      <div className="hidden lg:block">
        <div className="flex gap-1">{pageTabs}</div>
        <FormRenderer def={def} page={page} values={values} computed={computed} onChange={locked ? undefined : set} marks={marks} errors={errors} />
      </div>
      <div className="lg:hidden rounded border border-gray-300 bg-white p-4 text-sm text-gray-700">This screen is too narrow to fill the form. Open it on a tablet or a laptop, or rotate your device.</div>

      {/* The bottom buttons, in the order and with the names of eBIRForms. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border border-gray-300 bg-white/95 p-2 shadow print:hidden">
        <button type="button" onClick={validate} className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">Validate</button>
        <button type="button" onClick={edit} className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">Edit</button>
        <button type="button" onClick={save} className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">Save</button>
        <button type="button" onClick={() => setPrinting(true)} className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">Print</button>
        <button type="button" onClick={finalCopy} className="rounded border border-gray-400 bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">Final Copy</button>
        <button type="button" onClick={submit} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">Submit/File Final</button>
        {caseDef && mode === "practice" && (
          <>
            <span className="mx-1 h-5 border-l border-gray-300" />
            <button type="button" onClick={checkMine} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Check my return</button>
            <button type="button" disabled={hintsUsed >= caseDef.hints.length} onClick={() => { setHintsUsed((n) => n + 1); }} className="rounded border border-gray-400 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Hint ({hintsUsed}/{caseDef.hints.length})</button>
          </>
        )}
        {msg && <span role="status" className="text-sm text-gray-700">{msg}</span>}
      </div>

      {caseDef && mode === "practice" && hintsUsed > 0 && (
        <ul className="rounded border border-blue-200 bg-blue-50 p-3 text-sm list-disc pl-6">{caseDef.hints.slice(0, hintsUsed).map((h) => <li key={h}>{h}</li>)}</ul>
      )}

      {issues && issues.length > 0 && (
        <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-sm">
          <div className="font-semibold text-rose-900">Validation errors</div>
          <ul className="mt-1 space-y-0.5">{issues.map((i, n) => (
            <li key={n}><button type="button" className="text-left text-rose-800 underline" onClick={() => { setPage(pageOfId(def, i.id)); setTimeout(() => document.getElementById(`f-${i.id}`)?.scrollIntoView({ block: "center" }), 60); }}>Item {i.item || i.id}</button>: {i.message}</li>
          ))}</ul>
        </div>
      )}

      {result && !result.wrongForm && (
        <div className="rounded border border-gray-300 bg-white p-3 text-sm">
          <div className="font-semibold">{revealed ? "Result" : "Check my return"}: {result.score} of {result.max} points ({result.percent}%)</div>
          <p className="text-xs text-gray-500">Green is correct, red is wrong, grey is not required for this case.{revealed ? "" : " The expected values appear after you file the final return."}</p>
          <table className="mt-2 w-full text-xs"><tbody>
            {result.items.filter((i) => i.status === "wrong").map((i) => (
              <tr key={i.id} className="border-t border-gray-100"><td className="py-1">Item {i.item}{i.id.endsWith("B") ? " (spouse)" : ""}</td><td className="text-rose-700">wrong</td>{revealed && <td className="text-right tabular-nums">expected {/^[A-Za-z]/.test(i.expected ?? "") ? i.expected : money(amt(i.expected))}, you have {/^[A-Za-z]/.test(i.got ?? "") ? i.got || "(blank)" : money(amt(i.got))}</td>}</tr>
            ))}
            {result.items.every((i) => i.status !== "wrong") && <tr><td className="py-1 text-emerald-700">Every required item is correct.</td></tr>}
          </tbody></table>
          {revealed && caseDef && (
            <details className="mt-3"><summary className="cursor-pointer font-semibold">Worked solution</summary>
              <ol className="mt-1 list-decimal pl-5 space-y-1">{caseDef.solution.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </details>
          )}
        </div>
      )}

      {status === "submitted" && <Confirmation def={def} values={values} computed={computed} />}

      {printing && (
        <div className="fixed inset-0 z-50 overflow-auto bg-gray-700/80 p-4 print:static print:bg-white print:p-0">
          <style>{`@page { size: 8.5in 13in; margin: 0.3in } @media print { body * { visibility: hidden } .bir-print, .bir-print * { visibility: visible } .bir-print { position: absolute; left: 0; top: 0; width: 100% } }`}</style>
          <div className="mx-auto mb-2 flex max-w-[8.5in] items-center justify-between gap-2 print:hidden">
            <span className="text-sm font-semibold text-white">Print preview: long bond paper, 8.5 x 13 in</span>
            <span className="flex gap-2"><button type="button" onClick={() => window.print()} className="rounded bg-white px-3 py-1.5 text-sm font-semibold">Print</button><button type="button" onClick={() => setPrinting(false)} className="rounded bg-white px-3 py-1.5 text-sm font-semibold">Close</button></span>
          </div>
          <div className="bir-print mx-auto w-[8.5in] max-w-full bg-white p-2 shadow-lg">
            <FormRenderer def={def} page={0} allPages values={values} computed={computed} />
            <p className="mt-2 text-center text-[10px] text-gray-500">Educational simulation only — not a BIR document.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** The mock filing confirmation, the mock "Tax Return Receipt Confirmation" email, and a mock payment step. All of it is a simulation. */
function Confirmation({ def, values, computed }: { def: NonNullable<ReturnType<typeof getForm>>["def"] & object; values: Values; computed: Values }) {
  const ref = `SIM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${hashStr(JSON.stringify(values))}`;
  const payable = amt(computed["30A"]);
  return (
    <div className="space-y-3">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-700">Simulation</div>
        <h3 className="text-lg font-bold">Your return has been filed (simulated)</h3>
        <p className="text-sm">Form {def.number} · Reference number <b>{ref}</b>. Nothing was sent to the BIR.</p>
      </div>
      <div className="rounded border border-gray-300 bg-white p-4 text-sm">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-700">Simulation: mock email</div>
        <div className="mt-1 text-gray-500">From: no-reply@simulation.invalid · To: {values["11"] || "(your email)"}</div>
        <div className="font-semibold">Subject: Tax Return Receipt Confirmation</div>
        <p className="mt-2">Dear Taxpayer, this is a classroom simulation of the confirmation e-mail. Your return {def.number} with reference <b>{ref}</b> was recorded in the lab. Total amount payable shown on the return: <b>₱{money(payable)}</b>.</p>
      </div>
      <div className="rounded border border-gray-300 bg-white p-4 text-sm">
        <div className="text-xs font-bold uppercase tracking-widest text-amber-700">Simulation: payment step</div>
        <p className="mt-1">In real life you would pay through one of the channels the BIR allows, for example an authorized agent bank, or the BIR&apos;s e-payment channels (online banking, e-wallets, credit/debit card). Keep the proof of payment and report it in Part III of the return. This lab does not process any payment.</p>
      </div>
    </div>
  );
}
