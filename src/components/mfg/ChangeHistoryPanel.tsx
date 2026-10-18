"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, Label } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";

type Row = {
  id: string; changed_at: string; changed_by_name: string | null; table_name: string; record_label: string | null; action: "CREATE" | "CHANGE" | "DELETE";
  field: string | null; old_value: string | null; new_value: string | null;
};

const KIND: Record<string, string> = {
  mfg_item_master: "Item", mfg_item_quality: "Quality flags", mfg_boms: "Bill of materials", mfg_routings: "Routing", mfg_work_centers: "Work centre",
  mfg_activity_rates: "Activity rate", mfg_costing_sheet: "Overhead rate", mfg_uom_conversions: "Unit conversion", mfg_company_settings: "Company settings",
};
const FIELD: Record<string, string> = {
  standard_cost: "Standard cost", future_cost: "Future cost", standard_cost_date: "Standard cost date", planned_price: "Planned price", price_unit: "Price per",
  lot_rule: "Lot-size rule", lot_size: "Lot size", min_lot: "Minimum lot", max_lot: "Maximum lot", safety_stock: "Safety stock", scrap_pct: "Scrap %",
  procurement_lead_days: "Purchase lead time", production_lead_days: "Production lead time", make_or_buy: "Make or buy", batch_tracked: "Lot-tracked",
  active: "Active", status: "Status", rate: "Rate", shifts: "Shifts", hours_per_shift: "Hours per shift", utilization_pct: "Utilisation %", efficiency_pct: "Efficiency %",
  maint_interval_hours: "Service interval (hours)", asset_id: "Linked fixed asset", factor: "Factor", costing_method: "Costing method",
  variance_close_method: "Variance close method", oh_close_method: "Overhead close method", allow_negative_stock: "Allow negative stock", match_tolerance_pct: "Invoice match tolerance %",
  inspect_receipt: "Inspect on receipt", inspect_production: "Inspect in production", purchase_uom: "Purchasing unit",
};
const nice = (f: string | null) => (f ? FIELD[f] ?? f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** Who changed which master record, when, from what to what. Written by the database itself; nobody can edit or delete it. */
export default function ChangeHistoryPanel() {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState("");

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.from("mfg_change_log").select("id, changed_at, changed_by_name, table_name, record_label, action, field, old_value, new_value")
      .eq("tenant_id", effectiveTenantId).order("changed_at", { ascending: false }).limit(1000);
    showQueryErrors(r);
    setRows((r.data as Row[]) ?? []);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (kind ? rows.filter((r) => r.table_name === kind) : rows), [rows, kind]);
  const columns: ListColumn<Row>[] = [
    { key: "when", label: "When", value: (r) => r.changed_at, width: 160, render: (r) => when(r.changed_at) },
    { key: "who", label: "Who", value: (r) => r.changed_by_name ?? "System", filter: true, width: 140 },
    { key: "kind", label: "Kind", value: (r) => KIND[r.table_name] ?? r.table_name, filter: true, width: 150 },
    { key: "rec", label: "Record", value: (r) => r.record_label ?? "—", width: 230 },
    { key: "act", label: "Action", value: (r) => r.action, filter: true, width: 100,
      render: (r) => <Chip label={r.action === "CREATE" ? "Created" : r.action === "DELETE" ? "Deleted" : "Changed"} tone={r.action === "DELETE" ? "bad" : r.action === "CREATE" ? "good" : "warn"} /> },
    { key: "field", label: "Field", value: (r) => nice(r.field), width: 180 },
    { key: "old", label: "From", value: (r) => r.old_value ?? "", width: 140 },
    { key: "new", label: "To", value: (r) => r.new_value ?? "", width: 140 },
  ];

  return (
    <Panel title="Change history">
      <div className="text-[12px] text-[#7F8EA0] mb-3">
        Every time a master record is created, changed or deleted, the database writes a line here with who did it and the old and new value. This is the audit trail an auditor asks for when a cost or a rate has moved.
        It cannot be edited or deleted. Cost estimates, bills and routings keep their own versions; this trail shows the moment each one changed.
      </div>
      <div className="mb-3" style={{ maxWidth: 260 }}>
        <Label>Show</Label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Everything</option>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ListReport listKey="mfg-changes" rows={shown} columns={columns} rowKey={(r) => r.id} exportName="change-history" emptyText="Nothing has changed yet." />
      {rows.length >= 1000 && <div className="text-[11.5px] text-[#7F8EA0] mt-2">Showing the latest 1,000 lines.</div>}
    </Panel>
  );
}
