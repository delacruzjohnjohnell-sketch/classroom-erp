"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getForm } from "@/birlab/forms/registry";
import { LearnPage } from "@/birlab/components/LearnPage";
import { LESSONS } from "@/birlab/content/lessons";

export default function FormLessonPage() {
  const { form } = useParams<{ form: string }>();
  const entry = getForm(decodeURIComponent(form ?? ""));
  if (!entry) return <p className="text-sm text-gray-600">That form is not in the lab. <Link className="text-blue-700 underline" href="/bir-lab">Back to the lab</Link></p>;
  const lesson = LESSONS[entry.id];
  if (!lesson) {
    return (
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">Form {entry.number}: {entry.name}</h1>
        <p className="text-sm text-gray-700">{entry.whoFiles}. Due: {entry.due}.</p>
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">The lesson, filling screen and cases for this form are built in a later phase.</p>
        <Link className="text-sm text-blue-700 underline" href="/bir-lab">Back to the lab</Link>
      </div>
    );
  }
  return <LearnPage formId={entry.id} lesson={lesson} />;
}
