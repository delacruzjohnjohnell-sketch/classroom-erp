"use client";
// The opening screen, like the eBIRForms main window: taxpayer profile, a form-type dropdown with Fill-Up and Open (saved drafts).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import AnnouncementsPanel from "@/components/AnnouncementsPanel";
import { FORMS, TRACKS, type Track } from "@/birlab/forms/registry";
import { isRdo, isTin, isoToUs } from "@/birlab/engine/tax";
import { useBirStore, type Profile } from "@/birlab/store/useBirStore";

const FIELDS: { id: keyof Profile; label: string; hint?: string; span?: string }[] = [
  { id: "tin", label: "TIN (3-3-3-5)", hint: "000-000-000-00000" },
  { id: "rdo", label: "RDO code", hint: "3 digits" },
  { id: "last", label: "Last name" },
  { id: "first", label: "First name" },
  { id: "middle", label: "Middle name" },
  { id: "tradeName", label: "Trade name / registered name (non-individuals)", span: "sm:col-span-2" },
  { id: "address", label: "Registered address", span: "sm:col-span-2" },
  { id: "zip", label: "ZIP code" },
  { id: "tel", label: "Telephone" },
  { id: "email", label: "Email" },
  { id: "line", label: "Line of business" },
];

export default function BirLabHome() {
  const router = useRouter();
  const { myCompanies } = useSession();
  const { profile, setProfile, drafts } = useBirStore();
  const [formId, setFormId] = useState("1701A");
  const [company, setCompany] = useState("");

  const tinBad = !!profile.tin && !isTin(profile.tin);
  const rdoBad = !!profile.rdo && !isRdo(profile.rdo);
  const savedDrafts = Object.entries(drafts).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));
  const chosen = FORMS.find((f) => f.id === formId);

  const loadCompany = () => {
    const c = myCompanies.find((x) => x.id === company);
    if (c) setProfile({ tradeName: c.name });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="border-l-4 border-[#f2b705] pl-3 text-2xl font-bold text-[#0b2a6f]">BIR eForms Lab</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">Practice filling out BIR returns in a screen that works like the Offline eBIRForms Package. Each form has a lesson, a filling guide, tips, a quick check and three case problems. Nothing here is sent to the BIR.</p>
      </div>

      <AnnouncementsPanel system="BIR" />

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Taxpayer profile</h2>
        <p className="mt-0.5 text-xs text-gray-500">Like the eBIRForms profile step, this prefills Part I of the form you open. Use made-up values such as 000-000-000-00000. Case problems bring their own taxpayer.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.id} className={`flex flex-col gap-1 text-xs text-gray-600 ${f.span ?? ""}`}>{f.label}
              <input value={profile[f.id]} placeholder={f.hint} onChange={(e) => setProfile({ [f.id]: e.target.value } as Partial<Profile>)} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" aria-invalid={(f.id === "tin" && tinBad) || (f.id === "rdo" && rdoBad)} />
              {f.id === "tin" && tinBad && <span className="text-rose-700">TIN must be 3-3-3-5 digits.</span>}
              {f.id === "rdo" && rdoBad && <span className="text-rose-700">RDO code must be 3 digits.</span>}
            </label>
          ))}
        </div>
        {myCompanies.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">Optional: use the name of one of your ERP companies
              <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"><option value="">Choose a company</option>{myCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <button type="button" disabled={!company} onClick={loadCompany} className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">Load taxpayer profile from ERP company</button>
            <span className="text-xs text-gray-500">ERP companies hold only a name, so TIN, RDO and address stay as you typed them.</span>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Form</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-600">Form type
            <select value={formId} onChange={(e) => setFormId(e.target.value)} className="min-w-[20rem] rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
              {(Object.keys(TRACKS) as Track[]).map((t) => (
                <optgroup key={t} label={`Track ${t}: ${TRACKS[t]}`}>
                  {FORMS.filter((f) => f.track === t).map((f) => <option key={f.id} value={f.id}>{f.number}: {f.name}{f.def ? "" : " (coming in a later phase)"}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => router.push(`/bir-lab/${formId}`)} className="rounded-md bg-[#0b2a6f] px-4 py-2 text-sm font-semibold text-white">Fill-Up</button>
        </div>
        {chosen && <p className="mt-2 text-xs text-gray-600">{chosen.whoFiles}. Due: {chosen.due}.{chosen.def ? "" : " This form is built in a later phase."}</p>}

        <h3 className="mt-5 text-sm font-semibold text-gray-800">Open (saved drafts)</h3>
        {savedDrafts.length === 0 ? <p className="mt-1 text-xs text-gray-500">No saved drafts yet.</p> : (
          <ul className="mt-1 divide-y divide-gray-100 text-sm">
            {savedDrafts.map(([k, d]) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>Form {d.formId} · {d.caseId ? `${d.caseId} (${d.mode})` : "free fill-up"} · <em className="text-gray-500">{d.status}</em> · {d.updatedAt ? isoToUs(d.updatedAt.slice(0, 10)) : ""}</span>
                <Link href={`/bir-lab/${d.formId}/fill${d.caseId ? `?case=${d.caseId}&mode=${d.mode}` : ""}`} className="rounded border border-gray-300 px-2.5 py-1 text-xs font-semibold hover:bg-gray-50">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">All forms and due dates</h2>
        <p className="text-xs text-gray-500">Due dates are as taught; each form&apos;s lesson says whether it was verified against the form&apos;s own instructions.</p>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
          <thead className="text-left text-gray-500"><tr><th className="p-1.5">Form</th><th className="p-1.5">Who files</th><th className="p-1.5">Due</th><th className="p-1.5">Status</th></tr></thead>
          <tbody>{FORMS.map((f) => (
            <tr key={f.id} className="border-t border-gray-100"><td className="p-1.5 font-semibold">{f.number}</td><td className="p-1.5">{f.whoFiles}</td><td className="p-1.5">{f.due}</td><td className="p-1.5">{f.def ? <Link className="text-[#0b2a6f] underline" href={`/bir-lab/${f.id}`}>Open</Link> : <span className="text-gray-400">later phase</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
