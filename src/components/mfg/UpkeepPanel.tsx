"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { mutate, ok } from "@/lib/mutate";
import { money } from "@/lib/costing";
import { qtyText } from "@/lib/mfgOps";

type Usage = {
  work_center_id: string; code: string | null; name: string; available_h: number; setup_h: number; machine_h: number; labor_h: number; utilization_pct: number;
  total_machine_h: number; hours_since_service: number; service_interval_h: number | null; last_service: string | null; service_status: string;
  asset_id: string | null; asset_name: string | null; asset_cost: number | null; accumulated_depreciation: number | null; book_value: number | null;
};
type Log = { id: string; work_center_id: string; done_on: string; kind: string; machine_h_at_service: number; note: string | null };
type Asset = { id: string; name: string };

const STATUS: Record<string, [string, "good" | "warn" | "bad" | "muted"]> = {
  OK: ["On schedule", "good"], DUE_SOON: ["Service due soon", "warn"], OVERDUE: ["Service overdue", "bad"], NO_PLAN: ["No service plan", "muted"],
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Machine hours, idle time and service status of each work centre, with the fixed asset behind it. */
export default function UpkeepPanel({ readOnly }: { readOnly: boolean }) {
  const { effectiveTenantId } = useSession();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Usage[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [plan, setPlan] = useState<Usage | null>(null);
  const [planForm, setPlanForm] = useState({ asset_id: "", interval: "" });
  const [svc, setSvc] = useState<Usage | null>(null);
  const [svcForm, setSvcForm] = useState({ date: today(), kind: "PREVENTIVE", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveTenantId || !from || !to || to < from) return;
    const [u, l, a] = await Promise.all([
      supabase.rpc("mfg_work_center_usage", { p_tenant: effectiveTenantId, p_from: from, p_to: to }),
      supabase.from("mfg_maintenance_log").select("id, work_center_id, done_on, kind, machine_h_at_service, note").eq("tenant_id", effectiveTenantId).order("done_on", { ascending: false }).limit(100),
      supabase.from("fixed_assets").select("id, name").eq("tenant_id", effectiveTenantId).order("name"),
    ]);
    showQueryErrors(u, l, a);
    setRows((u.data as Usage[]) ?? []);
    setLog((l.data as Log[]) ?? []);
    setAssets((a.data as Asset[]) ?? []);
  }, [effectiveTenantId, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const name = (id: string) => rows.find((r) => r.work_center_id === id)?.name ?? "—";
  const openPlan = (r: Usage) => { setPlan(r); setPlanForm({ asset_id: r.asset_id ?? "", interval: r.service_interval_h == null ? "" : String(r.service_interval_h) }); };

  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_set_work_center_upkeep", { p_wc: plan.work_center_id, p_asset: planForm.asset_id || null, p_interval: planForm.interval === "" ? null : Number(planForm.interval) }),
      { successMessage: "Service plan saved." });
    setBusy(false);
    if (ok(res)) { setPlan(null); await load(); }
  };
  const saveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svc || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_log_maintenance", { p_wc: svc.work_center_id, p_date: svcForm.date, p_kind: svcForm.kind, p_note: svcForm.note || null }),
      { successMessage: svcForm.kind === "PREVENTIVE" ? "Service recorded. The hours count starts again." : "Repair recorded." });
    setBusy(false);
    if (ok(res)) { setSvc(null); setSvcForm({ date: today(), kind: "PREVENTIVE", note: "" }); await load(); }
  };

  const cols: ListColumn<Usage>[] = [
    { key: "wc", label: "Work centre", value: (r) => r.name, width: 160 },
    { key: "avail", label: "Hours available", value: (r) => Number(r.available_h), align: "right", width: 120, render: (r) => qtyText(r.available_h) },
    { key: "used", label: "Hours used", value: (r) => Number(r.setup_h) + Number(r.machine_h), align: "right", width: 110, render: (r) => qtyText(Number(r.setup_h) + Number(r.machine_h)) },
    { key: "idle", label: "Idle", value: (r) => Math.max(0, Number(r.available_h) - Number(r.setup_h) - Number(r.machine_h)), align: "right", width: 90,
      render: (r) => qtyText(Math.max(0, Number(r.available_h) - Number(r.setup_h) - Number(r.machine_h))) },
    { key: "util", label: "Utilisation", value: (r) => Number(r.utilization_pct), align: "right", width: 100, render: (r) => `${r.utilization_pct}%` },
    { key: "since", label: "Since last service", value: (r) => Number(r.hours_since_service), align: "right", width: 130,
      render: (r) => `${qtyText(r.hours_since_service)} h${r.service_interval_h ? ` of ${qtyText(r.service_interval_h)}` : ""}` },
    { key: "status", label: "Upkeep", value: (r) => STATUS[r.service_status]?.[0] ?? r.service_status, filter: true, width: 150,
      render: (r) => <Chip label={STATUS[r.service_status]?.[0] ?? r.service_status} tone={STATUS[r.service_status]?.[1] ?? "muted"} /> },
    { key: "asset", label: "Fixed asset", value: (r) => r.asset_name ?? "", width: 170 },
    { key: "book", label: "Book value", value: (r) => Number(r.book_value ?? 0), align: "right", width: 120, render: (r) => (r.book_value == null ? "—" : money(r.book_value)) },
    ...(readOnly ? [] : [{
      key: "_a", label: "", width: 190, value: () => "",
      render: (r: Usage) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          <TinyBtn onClick={() => openPlan(r)} aria-label={`Set the service plan of ${r.name}`}>Plan</TinyBtn>
          <TinyBtn onClick={() => setSvc(r)} aria-label={`Record a service on ${r.name}`}><Wrench size={11} /> Service</TinyBtn>
        </span>
      ),
    } as ListColumn<Usage>]),
  ];
  const logCols: ListColumn<Log>[] = [
    { key: "date", label: "Date", value: (l) => l.done_on, width: 110 },
    { key: "wc", label: "Work centre", value: (l) => name(l.work_center_id), width: 160 },
    { key: "kind", label: "What", value: (l) => (l.kind === "PREVENTIVE" ? "Preventive service" : "Repair"), filter: true, width: 150 },
    { key: "hrs", label: "Machine hours at the time", value: (l) => Number(l.machine_h_at_service), align: "right", width: 170, render: (l) => qtyText(l.machine_h_at_service) },
    { key: "note", label: "Note", value: (l) => l.note ?? "", width: 280 },
  ];

  return (
    <>
      <Panel title="Machines: use, idle time and upkeep">
        <div className="text-[12px] text-[#7F8EA0] mb-3">
          Hours come from the confirmations you post on the shop floor. A <b>preventive service</b> starts the count of machine hours again; a <b>repair</b> is recorded but does not. Link a work centre to one of your
          fixed assets to see what the machine cost, what has been depreciated, and what it is worth in the books. Recording a service is a record only — pay the mechanic through Finance as usual.
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div><Label>From</Label><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <ListReport listKey="mfg-upkeep" rows={rows} columns={cols} rowKey={(r) => r.work_center_id} exportName="machine-upkeep" emptyText="No work centres yet. Add them under Master Data." />
      </Panel>

      <Panel title="Service history">
        <ListReport listKey="mfg-upkeep-log" rows={log} columns={logCols} rowKey={(l) => l.id} exportName="service-history" emptyText="No services recorded yet." />
      </Panel>

      {plan && (
        <Modal title={`Service plan — ${plan.name}`} onClose={() => setPlan(null)}>
          <form onSubmit={savePlan}>
            <Label>Fixed asset (optional)</Label>
            <select className="input" value={planForm.asset_id} onChange={(e) => setPlanForm({ ...planForm, asset_id: e.target.value })}>
              <option value="">None</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {assets.length === 0 && <div className="text-[11.5px] text-[#7F8EA0] mt-1">You have no fixed assets yet. Add the machine under Fixed Assets first.</div>}
            <Label>Service every (machine hours, optional)</Label>
            <input className="input" type="number" min={0} step="any" value={planForm.interval} onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })} placeholder="e.g. 200" />
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setPlan(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Save plan</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      {svc && (
        <Modal title={`Record a service — ${svc.name}`} onClose={() => setSvc(null)}>
          <form onSubmit={saveService}>
            <Label>What was done</Label>
            <select className="input" value={svcForm.kind} onChange={(e) => setSvcForm({ ...svcForm, kind: e.target.value })}>
              <option value="PREVENTIVE">Preventive service (starts the hours count again)</option>
              <option value="REPAIR">Repair (does not reset the count)</option>
            </select>
            <Label>Date</Label>
            <input className="input" type="date" max={today()} value={svcForm.date} onChange={(e) => setSvcForm({ ...svcForm, date: e.target.value })} />
            <Label>Note (optional)</Label>
            <input className="input" value={svcForm.note} onChange={(e) => setSvcForm({ ...svcForm, note: e.target.value })} placeholder="e.g. cleaned the nozzles" />
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setSvc(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Record</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
