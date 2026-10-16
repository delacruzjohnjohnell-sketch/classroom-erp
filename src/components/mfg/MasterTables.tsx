"use client";

import { useState } from "react";
import { Panel, Label, GoldBtn, FormStyles } from "../ui";
import { Chip } from "../ListReport";
import SimpleMaster from "./SimpleMaster";
import type { Lookups } from "./useLookups";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import {
  conversionSchema, costCenterSchema, costingSheetSchema, holidaySchema, locationSchema, LOCATION_KINDS, rateSchema, uomSchema,
  workCenterSchema, WEEKDAYS,
} from "@/lib/mfgMaster";

type Props = { lookups: Lookups; reload: () => Promise<void>; readOnly: boolean };
const DAY = Object.fromEntries(WEEKDAYS.map(([n, d]) => [n, d])) as Record<number, string>;
const pct = (n: unknown) => `${Number(n)}%`;

export function UnitsTab({ reload, readOnly }: Props) {
  return (
    <SimpleMaster table="mfg_uom" title="Units of measure" keyCol="code" orderBy="code" readOnly={readOnly} onChanged={reload} addLabel="Add unit"
      hint="The units you buy, make and issue in. A unit can be deleted only while nothing uses it."
      schema={uomSchema}
      fields={[
        { key: "code", label: "Code (e.g. KG)", type: "text", lockOnEdit: true },
        { key: "name", label: "Name", type: "text" },
      ]}
      columns={[
        { key: "code", label: "Code", value: (r) => String(r.code), width: 100 },
        { key: "name", label: "Name", value: (r) => String(r.name), width: 240 },
      ]} />
  );
}

export function ConversionsTab({ lookups, reload, readOnly }: Props) {
  const uomOpts = lookups.uoms.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }));
  const itemName = (id: unknown) => (id ? lookups.items.find((i) => i.item_id === id)?.name ?? "—" : "All items");
  return (
    <SimpleMaster table="mfg_uom_conversions" title="Unit conversions" orderBy="from_uom" readOnly={readOnly} onChanged={reload} addLabel="Add conversion"
      hint="“1 DOZ = 12 PC”. A conversion works in both directions. One set for a particular item beats the general one."
      schema={conversionSchema}
      fields={[
        { key: "item_id", label: "Applies to", type: "select", options: [{ value: "", label: "All items" }, ...lookups.items.map((i) => ({ value: i.item_id, label: `${i.sku} — ${i.name}` }))] },
        { key: "from_uom", label: "1 of this unit…", type: "select", options: uomOpts },
        { key: "factor", label: "…equals this many of", type: "number" },
        { key: "to_uom", label: "…this unit", type: "select", options: uomOpts },
      ]}
      columns={[
        { key: "item", label: "Applies to", value: (r) => itemName(r.item_id), width: 220, filter: true },
        { key: "from", label: "From", value: (r) => String(r.from_uom), width: 90 },
        { key: "factor", label: "Factor", value: (r) => Number(r.factor), align: "right", width: 110 },
        { key: "to", label: "To", value: (r) => String(r.to_uom), width: 90 },
      ]} />
  );
}

export function LocationsTab({ reload, readOnly }: Props) {
  return (
    <SimpleMaster table="mfg_storage_locations" title="Storage locations" orderBy="code" readOnly={readOnly} onChanged={reload} addLabel="Add location"
      hint="Where stock is kept. Every company starts with a raw-material store, the shop floor, a finished-goods store and quarantine."
      schema={locationSchema}
      fields={[
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Name", type: "text" },
        { key: "kind", label: "Kept here", type: "select", options: Object.entries(LOCATION_KINDS).map(([value, label]) => ({ value, label })) },
      ]}
      columns={[
        { key: "code", label: "Code", value: (r) => String(r.code), width: 130 },
        { key: "name", label: "Name", value: (r) => String(r.name), width: 220 },
        { key: "kind", label: "Kept here", value: (r) => LOCATION_KINDS[r.kind as keyof typeof LOCATION_KINDS] ?? String(r.kind), filter: true, width: 170 },
      ]} />
  );
}

export function CostCentersTab({ reload, readOnly }: Props) {
  return (
    <SimpleMaster table="mfg_cost_centers" title="Cost centers" orderBy="code" readOnly={readOnly} onChanged={reload} addLabel="Add cost center"
      hint="Groups of work centers whose costs you want to follow together."
      schema={costCenterSchema}
      fields={[{ key: "code", label: "Code", type: "text" }, { key: "name", label: "Name", type: "text" }]}
      columns={[
        { key: "code", label: "Code", value: (r) => String(r.code), width: 110 },
        { key: "name", label: "Name", value: (r) => String(r.name), width: 260 },
      ]} />
  );
}

export function WorkCentersTab({ lookups, reload, readOnly }: Props) {
  const cc = (id: unknown) => lookups.costCenters.find((c) => c.id === id);
  return (
    <SimpleMaster table="mfg_work_centers" title="Work centers" orderBy="code" readOnly={readOnly} onChanged={reload} addLabel="Add work center"
      hint="A machine, a bench or a crew. Capacity = shifts × hours per shift × utilization on the days it works. A work center used by a routing can be made inactive but not deleted."
      defaults={{ shifts: "1", hours_per_shift: "8", utilization_pct: "85", efficiency_pct: "100", working_days: "12345", active: true }}
      schema={workCenterSchema}
      prepare={(input, row) => ({ ...input, code: String(input.code ?? "").trim() || (row ? String(row.document_number ?? "") : "") })}
      fields={[
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text", help: "Leave blank to use the automatic WC- number." },
        { key: "cost_center_id", label: "Cost center", type: "select", options: lookups.costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })) },
        { key: "shifts", label: "Shifts per day (1–3)", type: "number" },
        { key: "hours_per_shift", label: "Hours per shift", type: "number" },
        { key: "utilization_pct", label: "Utilization % (time actually available)", type: "number" },
        { key: "efficiency_pct", label: "Efficiency % (speed against the standard)", type: "number" },
        { key: "working_days", label: "Working days", type: "days" },
        { key: "active", label: "Active", type: "checkbox" },
      ]}
      columns={[
        { key: "no", label: "No.", value: (r) => String(r.document_number ?? ""), width: 90 },
        { key: "code", label: "Code", value: (r) => String(r.code ?? ""), width: 100 },
        { key: "name", label: "Name", value: (r) => String(r.name), width: 200 },
        { key: "cc", label: "Cost center", value: (r) => cc(r.cost_center_id)?.code ?? "", width: 110, filter: true },
        { key: "shifts", label: "Shifts", value: (r) => Number(r.shifts), align: "right", width: 80 },
        { key: "hrs", label: "Hours/shift", value: (r) => Number(r.hours_per_shift), align: "right", width: 100 },
        { key: "util", label: "Utilization", value: (r) => pct(r.utilization_pct), align: "right", width: 100 },
        { key: "eff", label: "Efficiency", value: (r) => pct(r.efficiency_pct), align: "right", width: 100, defaultHidden: true },
        { key: "days", label: "Works", value: (r) => ((r.working_days as number[]) ?? []).map((d) => DAY[d]).join(" "), width: 190 },
        { key: "active", label: "Status", value: (r) => (r.active ? "Active" : "Inactive"), filter: true, width: 100, render: (r) => <Chip label={r.active ? "Active" : "Inactive"} tone={r.active ? "good" : "muted"} /> },
      ]} />
  );
}

export function CalendarTab({ reload, readOnly }: Props) {
  return (
    <SimpleMaster table="mfg_holidays" title="Holidays" orderBy="holiday_date" readOnly={readOnly} onChanged={reload} addLabel="Add holiday"
      hint="Days no work center works. They are left out of the available hours."
      schema={holidaySchema}
      fields={[{ key: "holiday_date", label: "Date", type: "date" }, { key: "name", label: "Name", type: "text" }]}
      columns={[
        { key: "date", label: "Date", value: (r) => String(r.holiday_date), width: 130 },
        { key: "name", label: "Name", value: (r) => String(r.name), width: 260 },
      ]} />
  );
}

export function RatesTab({ lookups, reload, readOnly }: Props) {
  const wc = (id: unknown) => lookups.workCenters.find((w) => w.id === id);
  const at = (id: unknown) => lookups.activityTypes.find((a) => a.id === id);
  return (
    <SimpleMaster table="mfg_activity_rates" title="Planned activity rates" orderBy="period_start" readOnly={readOnly} onChanged={reload} addLabel="Add rate"
      hint="The planned cost per hour of labor, machine time or setup at each work center, by month. A rate stays in force until a later month has its own."
      schema={rateSchema}
      fields={[
        { key: "work_center_id", label: "Work center", type: "select", options: lookups.workCenters.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })) },
        { key: "activity_type_id", label: "Activity", type: "select", options: lookups.activityTypes.map((a) => ({ value: a.id, label: a.name })) },
        { key: "period_start", label: "From the month starting (must be the 1st)", type: "date" },
        { key: "rate", label: "Rate per hour (₱)", type: "number" },
      ]}
      columns={[
        { key: "wc", label: "Work center", value: (r) => wc(r.work_center_id)?.name ?? "—", filter: true, width: 190 },
        { key: "act", label: "Activity", value: (r) => at(r.activity_type_id)?.name ?? "—", filter: true, width: 150 },
        { key: "from", label: "From", value: (r) => String(r.period_start), width: 120 },
        { key: "rate", label: "₱ per hour", value: (r) => Number(r.rate), align: "right", width: 120 },
      ]} />
  );
}

export function CostingSheetTab({ reload, readOnly }: Props) {
  return (
    <SimpleMaster table="mfg_costing_sheet" title="Overhead costing sheet" orderBy="name" readOnly={readOnly} onChanged={reload} addLabel="Add surcharge"
      hint="Overhead added on top of material or labor cost when product costs are worked out (used from Phase 3)."
      defaults={{ kind: "VARIABLE", base: "MATERIAL", oh_pct: "0", oh_rate_per_hour: "0", active: true }}
      schema={costingSheetSchema}
      fields={[
        { key: "name", label: "Name", type: "text" },
        { key: "kind", label: "Behaves as", type: "select", options: [{ value: "VARIABLE", label: "Variable overhead" }, { value: "FIXED", label: "Fixed overhead" }] },
        { key: "base", label: "Charged on", type: "select", options: [{ value: "MATERIAL", label: "Material cost" }, { value: "LABOR", label: "Labor cost" }, { value: "BOTH", label: "Material and labor" }] },
        { key: "oh_pct", label: "Percentage of the base", type: "number" },
        { key: "oh_rate_per_hour", label: "Plus ₱ per machine hour", type: "number" },
        { key: "active", label: "Active", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "Name", value: (r) => String(r.name), width: 200 },
        { key: "kind", label: "Behaves as", value: (r) => (r.kind === "FIXED" ? "Fixed" : "Variable"), filter: true, width: 110 },
        { key: "base", label: "Charged on", value: (r) => String(r.base).toLowerCase(), width: 110 },
        { key: "pct", label: "Percentage", value: (r) => pct(r.oh_pct), align: "right", width: 110 },
        { key: "rate", label: "₱ per hour", value: (r) => Number(r.oh_rate_per_hour), align: "right", width: 110 },
        { key: "active", label: "Status", value: (r) => (r.active ? "Active" : "Inactive"), filter: true, width: 100, render: (r) => <Chip label={r.active ? "Active" : "Inactive"} tone={r.active ? "good" : "muted"} /> },
      ]} />
  );
}

/** Works out the hours a work center can run between two dates (uses the database's calendar function). */
export function CapacityPanel({ lookups }: { lookups: Lookups }) {
  const [wc, setWc] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hours, setHours] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wc || !from || !to || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_wc_available_hours", { p_work_center: wc, p_from: from, p_to: to }));
    setBusy(false);
    if (ok(res)) setHours(Number(res.data));
  };

  return (
    <Panel title="Available hours">
      <form onSubmit={run} className="grid gap-x-3" style={{ gridTemplateColumns: "minmax(180px, 1.4fr) 1fr 1fr auto", alignItems: "end" }}>
        <div><Label>Work center</Label>
          <select className="input" value={wc} onChange={(e) => { setWc(e.target.value); setHours(null); }}>
            <option value="">Choose…</option>
            {lookups.workCenters.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
        </div>
        <div><Label>From</Label><input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setHours(null); }} /></div>
        <div><Label>To</Label><input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setHours(null); }} /></div>
        <GoldBtn type="submit" disabled={busy || !wc || !from || !to} style={{ marginBottom: 1 }}>Calculate</GoldBtn>
      </form>
      {hours !== null && <div className="mt-3 text-[13px]">Available: <b className="text-gold">{hours.toLocaleString("en-PH", { maximumFractionDigits: 2 })} hours</b> (working days only, holidays left out)</div>}
      <FormStyles />
    </Panel>
  );
}
