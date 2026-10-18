"use client";

import { useState } from "react";
import { Panel, GoldBtn } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import type { MasterItem } from "@/components/mfg/useLookups";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { unitMoney } from "@/lib/costing";

type Row = { item_id: string; kind: string; standard_cost: number; current_basis: number | null; difference: number | null; difference_pct: number | null; basis_note: string | null };

/** Is the standard cost still right? Re-runs the roll-up (without saving anything) and compares it with the standard in force. */
export default function CostDriftPanel({ items }: { items: MasterItem[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(5);

  const run = async () => {
    setBusy(true);
    const r = await supabase.rpc("mfg_cost_drift");
    setBusy(false);
    if (showQueryErrors(r)) return;
    setRows((r.data as Row[]) ?? []);
  };
  const item = (id: string) => items.find((i) => i.item_id === id);
  const stale = (r: Row) => r.difference_pct != null && Math.abs(Number(r.difference_pct)) >= limit;

  const columns: ListColumn<Row>[] = [
    { key: "sku", label: "SKU", value: (r) => item(r.item_id)?.sku ?? "", width: 100 },
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 190 },
    { key: "kind", label: "Made or bought", value: (r) => (r.kind === "MAKE" ? "Made" : "Bought"), filter: true, width: 120 },
    { key: "std", label: "Standard cost", value: (r) => Number(r.standard_cost), align: "right", width: 120, render: (r) => unitMoney(r.standard_cost) },
    { key: "now", label: "Cost today", value: (r) => Number(r.current_basis ?? 0), align: "right", width: 120, render: (r) => (r.current_basis == null ? "—" : unitMoney(r.current_basis)) },
    { key: "diff", label: "Difference", value: (r) => Number(r.difference ?? 0), align: "right", width: 120, render: (r) => (r.difference == null ? "—" : unitMoney(r.difference)) },
    { key: "pct", label: "%", value: (r) => Number(r.difference_pct ?? 0), align: "right", width: 80, render: (r) => (r.difference_pct == null ? "—" : `${r.difference_pct}%`) },
    { key: "flag", label: "", value: (r) => (stale(r) ? "Review" : ""), width: 110, render: (r) => (stale(r) ? <Chip label="Review" tone={Number(r.difference) > 0 ? "bad" : "warn"} /> : null) },
    { key: "note", label: "Basis", value: (r) => r.basis_note ?? "", width: 330 },
  ];

  return (
    <Panel title="Is the standard cost still right?">
      <div className="text-[12px] text-[#7F8EA0] mb-3">
        A standard cost is a promise made on the day the estimate was released. Prices, rates and bills change afterwards. This check re-runs the cost roll-up of every item you make, and compares the price of what you
        buy with the latest price you paid. <b>Nothing is saved.</b> If the difference is large, create a new estimate and release it to reset the standard; until then the gap shows up as variance.
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <GoldBtn type="button" onClick={run} disabled={busy}>{busy ? "Checking…" : rows ? "Check again" : "Check the standard costs"}</GoldBtn>
        <label className="text-[12.5px] text-[#A3B1C2] flex items-center gap-2">Flag a difference of at least
          <input className="input" style={{ width: 70 }} type="number" min={0} step="any" value={limit} onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))} aria-label="Flag a difference of at least this percent" /> %</label>
      </div>
      {rows && <ListReport listKey="mfg-drift" rows={rows} columns={columns} rowKey={(r) => r.item_id} exportName="standard-cost-drift" emptyText="No items with a standard cost yet." />}
      {rows && <div className="text-[13px] mt-3">{rows.filter(stale).length === 0 ? "Every standard is within the limit." : `${rows.filter(stale).length} item${rows.filter(stale).length > 1 ? "s" : ""} to review.`}</div>}
    </Panel>
  );
}
