"use client";
// The BIR filing calendar for one taxable year, filtered by the kind of taxpayer. Every date comes from the rules file; unverified ones are marked.
import { useMemo, useState } from "react";
import Link from "next/link";
import { AUDIENCES, TRANSACTION_RULES, calendarFor, type Audience } from "@/birlab/engine/calendar";
import { isoToUs } from "@/birlab/engine/tax";

export default function CalendarPage() {
  const [year, setYear] = useState(2025);
  const [picked, setPicked] = useState<Audience[]>([]);
  const events = useMemo(() => calendarFor(year).filter((e) => picked.length === 0 || e.audiences.some((a) => picked.includes(a))), [year, picked]);
  const byMonth = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) m.set(e.date.slice(0, 7), [...(m.get(e.date.slice(0, 7)) ?? []), e]);
    return [...m.entries()];
  }, [events]);
  const toggle = (a: Audience) => setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="border-l-4 border-[#f2b705] pl-3 text-2xl font-bold text-[#0b2a6f]">Filing calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">When each return is due for a calendar-year taxpayer. Dates marked <span className="rounded bg-amber-100 px-1 text-amber-900">taught</span> come from the Code or your course table and are not printed on the BIR form or its instructions; the others were checked against the form&apos;s own Guidelines or the BIR forms page.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Taxable year
          <input type="number" min={2018} max={2040} value={year} onChange={(e) => setYear(Number(e.target.value) || 2025)} className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <fieldset className="flex flex-wrap gap-2 text-xs"><legend className="mb-1 text-gray-600">Show only (none selected shows everything)</legend>
          {AUDIENCES.map((a) => (
            <label key={a.id} className={`cursor-pointer rounded-full border px-3 py-1 ${picked.includes(a.id) ? "border-[#0b2a6f] bg-[#e8eefb] text-[#0b2a6f]" : "border-gray-300 bg-white text-gray-700"}`}>
              <input type="checkbox" className="sr-only" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />{a.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="space-y-3">
        {byMonth.map(([month, list]) => (
          <section key={month} className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-bold text-gray-800">{new Date(`${month}-01T00:00:00Z`).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
            <ul className="mt-1 divide-y divide-gray-100 text-sm">
              {list.map((e, i) => (
                <li key={`${e.date}-${e.form}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                  <span className="w-24 shrink-0 font-semibold tabular-nums">{isoToUs(e.date)}</span>
                  <Link href={`/bir-lab/${encodeURIComponent(e.form.split(" ")[0])}`} className="w-40 shrink-0 font-semibold text-[#0b2a6f] hover:underline">{e.form}</Link>
                  <span className="min-w-0 flex-1">{e.what}</span>
                  {!e.verified && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900" title={e.source}>taught</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {byMonth.length === 0 && <p className="text-sm text-gray-500">Nothing for that selection.</p>}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <h2 className="text-sm font-bold text-gray-800">Deadlines that start from an event</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {TRANSACTION_RULES.map((r) => <li key={r.form}><b>{r.form}</b>: {r.rule}{!r.verified && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900">taught</span>}</li>)}
        </ul>
      </section>
    </div>
  );
}
