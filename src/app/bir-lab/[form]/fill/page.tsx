"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getForm } from "@/birlab/forms/registry";
import { getCase } from "@/birlab/cases";
import { FormScreen } from "@/birlab/components/FormScreen";
import { useBirStore } from "@/birlab/store/useBirStore";

function FillInner() {
  const { form } = useParams<{ form: string }>();
  const params = useSearchParams();
  const entry = getForm(decodeURIComponent(form ?? ""));
  const caseDef = getCase(params.get("case") ?? "");
  const mode = params.get("mode") === "assessment" ? "assessment" : caseDef ? "practice" : "free";
  const { visited, quiz } = useBirStore();

  if (!entry?.def) return <p className="text-sm text-gray-600">This form is built in a later phase. <Link className="text-blue-700 underline" href="/bir-lab">Back to the lab</Link></p>;
  if (!visited[entry.id]) {
    return (
      <div className="max-w-xl space-y-2 rounded border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold">Read the lesson first</h1>
        <p className="text-sm text-gray-700">Each form has a short lesson, a filling guide and tips. Open it once, then come back to fill the form.</p>
        <Link href={`/bir-lab/${entry.id}`} className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open the lesson</Link>
      </div>
    );
  }
  if (caseDef && !quiz[entry.id]?.passed) {
    return (
      <div className="max-w-xl space-y-2 rounded border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold">Pass the quick check first</h1>
        <p className="text-sm text-gray-700">The case problems unlock when you get 4 of 5 on the Quick check. You can still read the whole lesson.</p>
        <Link href={`/bir-lab/${entry.id}`} className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Go to the lesson</Link>
      </div>
    );
  }
  return <FormScreen key={`${entry.id}-${caseDef?.id ?? "free"}-${mode}`} formId={entry.id} caseDef={caseDef} mode={mode} />;
}

export default function FillPage() {
  return <Suspense fallback={null}><FillInner /></Suspense>;
}
