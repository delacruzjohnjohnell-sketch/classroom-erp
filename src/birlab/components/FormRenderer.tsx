"use client";
// Draws any FormDef like the Offline eBIRForms Package: a header strip, numbered item boxes, Part bars, shaded read-only computed fields,
// right-aligned amounts with two decimals and thousands separators, TIN boxes, MM/DD/YYYY dates and radio buttons.
// Reads the definition only; it knows nothing about any particular form.
import { useState, type ReactNode } from "react";
import { amt, isoToUs, money, usToIso } from "../engine/tax";
import type { FieldDef, FormDef, Page, Row, Values } from "../forms/types";

export type Mark = "correct" | "wrong" | "not-required";

interface Props {
  def: FormDef;
  /** Index of the page to show. Ignored when `allPages` is set (print). */
  page: number;
  allPages?: boolean;
  values: Values;
  computed: Values;
  onChange?: (id: string, value: string) => void;
  highlight?: string;
  marks?: Record<string, Mark>;
  errors?: Record<string, string>;
  compact?: boolean;
}

const BOX = "rounded border bg-white px-1.5 py-1 text-[13px] text-gray-900 w-full focus:outline-none focus:ring-2 focus:ring-blue-400";
const markClass = (m?: Mark) => (m === "correct" ? "border-emerald-500 ring-1 ring-emerald-400" : m === "wrong" ? "border-rose-500 ring-1 ring-rose-400" : m === "not-required" ? "border-gray-300 bg-gray-50" : "border-gray-400");

function tinFormat(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter((x, i) => x || i === 0).join("-");
}

function AmountInput({ id, value, onChange, disabled, mark, error }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; mark?: Mark; error?: string }) {
  const [focus, setFocus] = useState(false);
  const shown = focus || !value.trim() ? value : money(amt(value));
  return (
    <input
      id={`f-${id}`} inputMode="decimal" aria-label={`Item ${id}`} aria-invalid={!!error} title={error} disabled={disabled}
      value={shown} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
      className={`${BOX} text-right tabular-nums ${markClass(error ? "wrong" : mark)} ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
      placeholder="0.00"
    />
  );
}

function Computed({ id, value, mark }: { id: string; value?: string; mark?: Mark }) {
  return (
    <div id={`f-${id}`} aria-label={`Item ${id}, computed`} className={`rounded border px-1.5 py-1 text-[13px] text-right tabular-nums min-h-[1.9rem] bg-gray-200/70 text-gray-900 ${markClass(mark)}`}>
      {value === undefined || value === "" ? "" : money(amt(value))}
    </div>
  );
}

function Field({ f, p }: { f: FieldDef; p: Props }) {
  const v = p.values[f.id] ?? "";
  const set = (x: string) => p.onChange?.(f.id, x);
  const ro = !p.onChange;
  const err = p.errors?.[f.id];
  const cls = `${BOX} ${markClass(err ? "wrong" : p.marks?.[f.id])} ${ro ? "bg-gray-100" : ""}`;
  let control: ReactNode;
  switch (f.kind) {
    case "tin": control = <input id={`f-${f.id}`} disabled={ro} value={v} onChange={(e) => set(tinFormat(e.target.value))} placeholder="000-000-000-00000" className={`${cls} tracking-wider tabular-nums`} aria-label={`Item ${f.item}`} />; break;
    case "rdo": control = <input id={`f-${f.id}`} disabled={ro} value={v} maxLength={3} inputMode="numeric" onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cls} aria-label={`Item ${f.item}`} />; break;
    case "zip": control = <input id={`f-${f.id}`} disabled={ro} value={v} maxLength={4} inputMode="numeric" onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 4))} className={cls} aria-label={`Item ${f.item}`} />; break;
    case "year": control = <input id={`f-${f.id}`} disabled={ro} value={v} maxLength={4} inputMode="numeric" onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="YYYY" className={cls} aria-label={`Item ${f.item}`} />; break;
    case "amount": control = <AmountInput id={f.id} value={v} onChange={set} disabled={ro} mark={p.marks?.[f.id]} error={err} />; break;
    case "count": control = <input id={`f-${f.id}`} disabled={ro} value={v} inputMode="numeric" onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} className={`${cls} text-right`} aria-label={`Item ${f.item}`} />; break;
    case "email": control = <input id={`f-${f.id}`} disabled={ro} type="email" value={v} onChange={(e) => set(e.target.value)} className={cls} aria-label={`Item ${f.item}`} />; break;
    case "phone": control = <input id={`f-${f.id}`} disabled={ro} value={v} inputMode="tel" onChange={(e) => set(e.target.value.replace(/[^\d+\-\s()]/g, ""))} className={cls} aria-label={`Item ${f.item}`} />; break;
    case "monthyear": control = <input id={`f-${f.id}`} disabled={ro} type="month" value={/^(\d{2})\/(\d{4})$/.test(v) ? `${v.slice(3)}-${v.slice(0, 2)}` : ""} onChange={(e) => set(e.target.value ? `${e.target.value.slice(5, 7)}/${e.target.value.slice(0, 4)}` : "")} className={cls} aria-label={`Item ${f.item}, MM/YYYY`} />; break;
    case "date": control = <input id={`f-${f.id}`} disabled={ro} type="date" value={usToIso(v)} onChange={(e) => set(e.target.value ? isoToUs(e.target.value) : "")} className={cls} aria-label={`Item ${f.item}, MM/DD/YYYY`} />; break;
    case "yesno": control = (
      <div id={`f-${f.id}`} role="radiogroup" aria-label={`Item ${f.item}`} className={`flex gap-4 rounded border px-2 py-1.5 bg-white ${markClass(err ? "wrong" : p.marks?.[f.id])}`}>
        {(["yes", "no"] as const).map((o) => <label key={o} className="flex items-center gap-1.5 text-[13px]"><input type="radio" name={`r-${f.id}`} disabled={ro} checked={v === o} onChange={() => set(o)} />{o === "yes" ? "Yes" : "No"}</label>)}
      </div>); break;
    case "radio": control = (
      <div id={`f-${f.id}`} role="radiogroup" aria-label={`Item ${f.item}`} className={`flex flex-wrap gap-x-5 gap-y-1 rounded border px-2 py-1.5 bg-white ${markClass(err ? "wrong" : p.marks?.[f.id])}`}>
        {f.options?.map((o) => <label key={o.value} className="flex items-start gap-1.5 text-[12.5px] max-w-full"><input type="radio" className="mt-0.5" name={`r-${f.id}`} disabled={ro} checked={v === o.value} onChange={() => set(o.value)} /><span>{o.label}</span></label>)}
      </div>); break;
    default: control = <input id={`f-${f.id}`} disabled={ro} value={v} onChange={(e) => set(f.kind === "text" ? e.target.value.toUpperCase() : e.target.value)} className={cls} aria-label={`Item ${f.item}`} />;
  }
  const hl = p.highlight === f.id;
  return (
    <div style={{ gridColumn: `span ${f.span ?? 12} / span ${f.span ?? 12}` }} className={`bir-field rounded p-1 ${hl ? "bg-yellow-200 ring-2 ring-yellow-500" : ""}`}>
      <div className="flex items-start gap-1.5 mb-0.5">
        {f.item && <span className="shrink-0 rounded-sm bg-gray-700 px-1 text-[10px] font-bold text-white leading-4">{f.item}</span>}
        <span className="text-[11.5px] leading-tight text-gray-700">{f.label}</span>
      </div>
      {control}
      {err && <div className="mt-0.5 text-[11px] text-rose-700">{err}</div>}
    </div>
  );
}

function RowView({ row, p }: { row: Row; p: Props }) {
  if (row.type === "heading") return <div className="px-2 pt-2 text-[12px] font-semibold text-gray-700">{row.text}</div>;
  if (row.type === "fields") {
    const fields = row.fields.filter((f) => !f.when || f.when(p.values));
    return fields.length === 0 ? null : <div className="grid grid-cols-12 gap-x-2 gap-y-1 px-1.5 py-1">{fields.map((f) => <Field key={f.id} f={f} p={p} />)}</div>;
  }
  if (row.type === "payment") {
    const ro = !p.onChange;
    const set = (k: string) => (e: { target: { value: string } }) => p.onChange?.(`${row.id}${k}`, e.target.value);
    const val = (k: string) => p.values[`${row.id}${k}`] ?? "";
    return (
      <div className="grid grid-cols-12 gap-2 px-2 py-1 items-center">
        <div className="col-span-12 sm:col-span-3 flex items-center gap-1.5 text-[12px]"><span className="rounded-sm bg-gray-700 px-1 text-[10px] font-bold text-white">{row.item}</span>{row.label}</div>
        <input aria-label={`Item ${row.item} drawee bank/agency`} disabled={ro} value={val("bank")} onChange={set("bank")} placeholder="Drawee Bank/Agency" className={`${BOX} border-gray-400 col-span-6 sm:col-span-3`} />
        <input aria-label={`Item ${row.item} number`} disabled={ro} value={val("num")} onChange={set("num")} placeholder="Number" className={`${BOX} border-gray-400 col-span-6 sm:col-span-2`} />
        <input aria-label={`Item ${row.item} date`} disabled={ro} type="date" value={usToIso(val("date"))} onChange={(e) => p.onChange?.(`${row.id}date`, e.target.value ? isoToUs(e.target.value) : "")} className={`${BOX} border-gray-400 col-span-6 sm:col-span-2`} />
        <input aria-label={`Item ${row.item} amount`} disabled={ro} inputMode="decimal" value={val("amt")} onChange={(e) => p.onChange?.(`${row.id}amt`, e.target.value.replace(/[^\d.,-]/g, ""))} placeholder="0.00" className={`${BOX} border-gray-400 col-span-6 sm:col-span-2 text-right tabular-nums`} />
      </div>
    );
  }
  // amounts
  const pad = row.indent === 2 ? "pl-10" : row.indent === 1 ? "pl-5" : "";
  const twoCols = row.cols.length > 1 || row.cols.includes("B");
  const joint = p.def.spouseOn ? p.def.spouseOn(p.values) : p.values["18"] === "joint";
  return (
    <div className={`grid items-center gap-2 px-2 py-0.5 ${twoCols ? "grid-cols-[minmax(0,1fr)_6.25rem_6.25rem] sm:grid-cols-[1fr_9rem_9rem]" : "grid-cols-[minmax(0,1fr)_7rem] sm:grid-cols-[1fr_9rem]"}`}>
      <div className={`flex items-start gap-1.5 text-[12px] leading-tight ${pad} ${row.bold ? "font-semibold" : ""} ${p.highlight && row.cols.some((c) => `${row.id}${c}` === p.highlight) ? "bg-yellow-200 rounded px-1" : ""}`}>
        <span className="mt-0.5 shrink-0 rounded-sm bg-gray-700 px-1 text-[10px] font-bold text-white leading-4">{row.item}</span>
        <span>{row.label}{row.note ? <em className="block font-normal text-[11px] text-gray-500">{row.note}</em> : null}
          {row.specify && <input aria-label={`Item ${row.item} specify`} id={`f-${row.id}S`} disabled={!p.onChange} value={p.values[`${row.id}S`] ?? ""} onChange={(e) => p.onChange?.(`${row.id}S`, e.target.value.toUpperCase())} placeholder="specify" className={`${BOX} border-gray-400 mt-0.5 !w-56 ${p.errors?.[`${row.id}S`] ? "border-rose-500" : ""}`} />}
        </span>
      </div>
      {(twoCols ? (["A", "B"] as const) : row.cols).map((c) => {
        if (!row.cols.includes(c)) return <div key={c} />;
        const id = `${row.id}${c}`;
        const colOff = c === "B" && !joint;
        const hl = p.highlight === id ? "ring-2 ring-yellow-500" : "";
        return (
          <div key={c} className={hl}>
            {row.mode === "input" && !row.computedCols?.includes(c)
              ? <AmountInput id={id} value={p.values[id] ?? ""} onChange={(x) => p.onChange?.(id, x)} disabled={!p.onChange || colOff} mark={p.marks?.[id]} error={p.errors?.[id]} />
              : <Computed id={id} value={colOff ? "" : p.computed[id]} mark={p.marks?.[id]} />}
          </div>
        );
      })}
    </div>
  );
}

function PageView({ page, p }: { page: Page; p: Props }) {
  return (
    <div className="space-y-2">
      {page.sections.map((s) => {
        const hasB = s.rows.some((r) => r.type === "amounts" && r.cols.length > 1);
        return (
          <section key={s.id} className="rounded border border-gray-400 bg-[#eef1f6]">
            <div className="bg-gray-600 px-2 py-1 text-[12.5px] font-semibold text-white">{s.title}</div>
            {s.note && !p.compact && <div className="px-2 py-1 text-[11px] text-gray-600">{s.note}</div>}
            {hasB && <div className="grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem] sm:grid-cols-[1fr_9rem_9rem] gap-2 px-2 pt-1 text-[11px] font-semibold text-gray-600"><span>Particulars</span><span className="text-center">{p.def.colLabels?.[0] ?? "A) Taxpayer/Filer"}</span><span className="text-center">{p.def.colLabels?.[1] ?? "B) Spouse"}</span></div>}
            <div className="pb-1">{s.rows.map((r, i) => <RowView key={i} row={r} p={p} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

/** The page that holds a field or item id (used to jump to the first error). */
export function pageOfId(def: FormDef, id: string): number {
  const base = id.replace(/[AB]$/, "");
  const idx = def.pages.findIndex((pg) => pg.sections.some((s) => s.rows.some((r) => (r.type === "fields" ? r.fields.some((f) => f.id === id) : r.type === "amounts" ? r.id === id || r.id === base || `${r.id}S` === id : r.type === "payment" ? id.startsWith(r.id) : false))));
  return idx < 0 ? 0 : idx;
}

export function FormRenderer(props: Props) {
  const { def, page, allPages } = props;
  const pages = allPages ? def.pages : [def.pages[Math.min(page, def.pages.length - 1)]];
  return (
    <div className={`bir-form rounded border-2 border-gray-500 bg-[#dfe4ec] p-2 ${props.compact ? "text-[11px]" : ""}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 rounded border border-gray-500 bg-white px-3 py-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">BIR Form No.</div>
          <div className="text-2xl font-extrabold leading-none text-gray-900">{def.number}</div>
          <div className="text-[11px] text-gray-600">{def.version}</div>
        </div>
        <div className="min-w-[14rem] flex-1 text-center">
          <div className="text-base font-bold text-gray-900">{def.title}</div>
          <div className="text-[11.5px] text-gray-700">{def.subtitle}</div>
        </div>
        <div className="text-right text-[10.5px] text-gray-500">Enter all required information in CAPITAL LETTERS.<br />Two copies must be filed with the BIR and one held by the Tax Filer.</div>
      </div>
      {pages.map((pg) => (
        <div key={pg.id} className={allPages ? "mb-3 break-after-page" : ""}>
          {allPages && <div className="mb-1 text-[11px] font-semibold text-gray-600">{def.number} {def.version} — {pg.title}</div>}
          <PageView page={pg} p={props} />
        </div>
      ))}
    </div>
  );
}
