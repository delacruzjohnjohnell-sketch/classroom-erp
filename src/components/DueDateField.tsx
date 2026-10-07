"use client";

import { Label } from "./ui";
import { TERMS, CUSTOM_TERMS, dueFromTerms } from "@/lib/terms";

// Terms dropdown + due date. Choosing a term fills the date from `baseDate`;
// typing a date switches the dropdown to "Custom date".
export default function DueDateField({
  baseDate, terms, due, onChange, label = "Payment terms",
}: {
  baseDate: string;
  terms: string;
  due: string;
  onChange: (terms: string, due: string) => void;
  label?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2.5">
        <select className="input" value={terms}
          onChange={(e) => onChange(e.target.value, e.target.value === CUSTOM_TERMS ? due : dueFromTerms(baseDate, e.target.value))}>
          {TERMS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          <option value={CUSTOM_TERMS}>Custom date</option>
        </select>
        <input className="input" type="date" value={due} onChange={(e) => onChange(CUSTOM_TERMS, e.target.value)} required />
      </div>
      {due && baseDate && due < baseDate && (
        <div className="text-[11.5px] mt-1" style={{ color: "#FF6B7A" }}>The due date is before the document date.</div>
      )}
    </div>
  );
}
