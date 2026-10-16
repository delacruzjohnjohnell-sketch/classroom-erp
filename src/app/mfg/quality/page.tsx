"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Loader2, PackageX, SearchCheck } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, GoldBtn, KpiCard, Label, Modal, OutlineBtn, Panel, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { firstIssue, qtyText } from "@/lib/mfgOps";
import {
  checkDecision, decisionSummary, DECISION_LABEL, inSpec, LOT_STATUS_LABEL, LOT_STATUS_TONE, planRowsSchema, resultsSchema, ROOT_CAUSE_LABEL, ROOT_CAUSES,
  SOURCE_LABEL, specText,
} from "@/lib/mfgQuality";

type Lot = {
  id: string; document_number: string; item_id: string; source: string; source_doc_id: string | null; parent_lot_id: string | null; qty: number; status: string;
  decision: string | null; qty_accept: number; qty_scrap: number; qty_return: number; qty_rework: number; note: string | null; created_at: string; decided_at: string | null;
};
type Result = { id: string; lot_id: string; characteristic: string; unit: string | null; spec_min: number | null; spec_max: number | null; value: number; in_spec: boolean };
type Plan = { id: string; item_id: string; line_no: number; characteristic: string; unit: string | null; spec_min: number | null; spec_max: number | null };
type Flag = { item_id: string; inspect_receipt: boolean; inspect_production: boolean };
type Ncr = { id: string; document_number: string; lot_id: string; item_id: string; root_cause: string; note: string | null; disposition: string; qty: number; cost: number; status: string; corrective_action: string | null; created_at: string };
type PlanRow = { characteristic: string; unit: string; spec_min: string; spec_max: string };

const TABS = [["lots", "Inspection lots"], ["ncr", "Non-conformances"], ["plans", "Plans and settings"]] as const;
const today = () => new Date().toISOString().slice(0, 10);
const OPEN = ["CREATED", "IN_INSPECTION"];

export default function QualityPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <QualityBody />
      </Suspense>
    </AppShell>
  );
}

function QualityBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "lots";

  const [lots, setLots] = useState<Lot[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [ncrs, setNcrs] = useState<Ncr[]>([]);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [openLot, setOpenLot] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [dec, setDec] = useState({ accept: "", scrap: "", ret: "", rework: "", cause: "", note: "", date: today() });
  const [openNcr, setOpenNcr] = useState<string | null>(null);
  const [action, setAction] = useState("");

  const [planItem, setPlanItem] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [fReceipt, setFReceipt] = useState(false);
  const [fProd, setFProd] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [l, p, f, n] = await Promise.all([
      supabase.from("mfg_inspection_lots").select("id, document_number, item_id, source, source_doc_id, parent_lot_id, qty, status, decision, qty_accept, qty_scrap, qty_return, qty_rework, note, created_at, decided_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(500),
      supabase.from("mfg_inspection_plans").select("id, item_id, line_no, characteristic, unit, spec_min, spec_max").eq("tenant_id", t).order("line_no"),
      supabase.from("mfg_item_quality").select("item_id, inspect_receipt, inspect_production").eq("tenant_id", t),
      supabase.from("mfg_ncr").select("id, document_number, lot_id, item_id, root_cause, note, disposition, qty, cost, status, corrective_action, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(500),
    ]);
    const ls = (l.data as Lot[]) ?? [];
    setLots(ls); setPlans((p.data as Plan[]) ?? []); setFlags((f.data as Flag[]) ?? []); setNcrs((n.data as Ncr[]) ?? []);
    const ids = Array.from(new Set(ls.map((x) => x.source_doc_id).filter((x): x is string => !!x)));
    if (ids.length) {
      const d = await supabase.from("mfg_material_documents").select("id, document_number").in("id", ids);
      setDocs(Object.fromEntries(((d.data as { id: string; document_number: string }[]) ?? []).map((x) => [x.id, x.document_number])));
    } else setDocs({});
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const uom = (id: string) => lk.items.find((i) => i.item_id === id)?.base_uom ?? "";
  const stocked = useMemo(() => lk.items.filter((i) => i.active && i.item_type !== "SERVICE"), [lk.items]);
  const lot = lots.find((x) => x.id === openLot) ?? null;
  const lotPlan = lot ? plans.filter((p) => p.item_id === lot.item_id) : [];
  const ncr = ncrs.find((x) => x.id === openNcr) ?? null;
  const quarantine = lk.locations.find((x) => x.kind === "QUARANTINE");

  const openLots = lots.filter((x) => OPEN.includes(x.status));
  const waiting = openLots.filter((x) => x.status === "CREATED").length;
  const measuring = openLots.filter((x) => x.status === "IN_INSPECTION").length;
  const openNcrs = ncrs.filter((x) => x.status === "OPEN").length;
  const loss = ncrs.reduce((s, x) => s + Number(x.cost), 0);

  // open a lot: load its results
  const showLot = async (id: string) => {
    const l = lots.find((x) => x.id === id);
    if (!l) return;
    const r = await supabase.from("mfg_inspection_results").select("id, lot_id, characteristic, unit, spec_min, spec_max, value, in_spec").eq("lot_id", id);
    const rs = (r.data as Result[]) ?? [];
    setResults(rs);
    setVals(Object.fromEntries(rs.map((x) => [x.characteristic.toLowerCase(), String(Number(x.value))])));
    setDec({ accept: String(Number(l.qty)), scrap: "", ret: "", rework: "", cause: "", note: "", date: today() });
    setOpenLot(id);
  };
  const reloadResults = async (id: string) => {
    const r = await supabase.from("mfg_inspection_results").select("id, lot_id, characteristic, unit, spec_min, spec_max, value, in_spec").eq("lot_id", id);
    setResults((r.data as Result[]) ?? []);
  };

  const saveMeasurements = async () => {
    if (!lot || busy) return;
    const entered = lotPlan.filter((p) => (vals[p.characteristic.toLowerCase()] ?? "") !== "").map((p) => ({ characteristic: p.characteristic, value: vals[p.characteristic.toLowerCase()] }));
    const parsed = resultsSchema.safeParse(entered);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_record_inspection", { p_lot: lot.id, p_results: parsed.data }), { successMessage: "Measurements saved." });
    setBusy(false);
    if (ok(res)) { await load(); await reloadResults(lot.id); }
  };

  const outOfSpec = results.filter((r) => !r.in_spec).length;
  const missing = lotPlan.filter((p) => !results.some((r) => r.characteristic.toLowerCase() === p.characteristic.toLowerCase())).length;

  const decide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot || busy) return;
    const problem = checkDecision({ lotQty: Number(lot.qty), accept: dec.accept, scrap: dec.scrap, ret: dec.ret, rework: dec.rework, cause: dec.cause, note: dec.note, outOfSpec, missing, canReturn: lot.source === "GR" });
    if (problem) { toast.error(problem); return; }
    const n = (x: string) => (x === "" ? 0 : Number(x));
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_decide_inspection_lot", {
      p_lot: lot.id, p_accept: n(dec.accept), p_scrap: n(dec.scrap), p_return: n(dec.ret), p_rework: n(dec.rework), p_cause: dec.cause || null, p_note: dec.note || null, p_date: dec.date,
    }), { successMessage: "Decision recorded. Stock and the books are updated." });
    setBusy(false);
    if (ok(res)) { setOpenLot(null); await load(); }
  };

  const closeNcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ncr || busy) return;
    if (action.trim().length < 3) { toast.error("Write down what you did to stop it happening again."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_close_ncr", { p_ncr: ncr.id, p_action: action }), { successMessage: "Report closed." });
    setBusy(false);
    if (ok(res)) { setOpenNcr(null); setAction(""); await load(); }
  };

  // plans tab: choose an item
  const pickPlanItem = (id: string) => {
    setPlanItem(id);
    const f = flags.find((x) => x.item_id === id);
    setFReceipt(!!f?.inspect_receipt); setFProd(!!f?.inspect_production);
    setRows(plans.filter((p) => p.item_id === id).map((p) => ({ characteristic: p.characteristic, unit: p.unit ?? "", spec_min: p.spec_min == null ? "" : String(Number(p.spec_min)), spec_max: p.spec_max == null ? "" : String(Number(p.spec_max)) })));
  };
  const saveFlags = async () => {
    if (!planItem || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_item_quality", { p_item: planItem, p_receipt: fReceipt, p_production: fProd }),
      { successMessage: "Saved. Goods like this must now be received into the quarantine store." });
    setBusy(false);
    if (ok(res)) await load();
  };
  const savePlan = async () => {
    if (!planItem || busy) return;
    const parsed = planRowsSchema.safeParse(rows);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_inspection_plan", { p_item: planItem, p_rows: parsed.data }), { successMessage: "Inspection plan saved." });
    setBusy(false);
    if (ok(res)) await load();
  };

  const lotCols: ListColumn<Lot>[] = [
    { key: "no", label: "Lot", value: (r) => r.document_number, width: 100 },
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 190 },
    { key: "src", label: "Where from", value: (r) => SOURCE_LABEL[r.source] ?? r.source, filter: true, width: 150 },
    { key: "doc", label: "Receipt", value: (r) => (r.source_doc_id ? docs[r.source_doc_id] ?? "" : ""), width: 110 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 90, render: (r) => qtyText(r.qty) },
    { key: "status", label: "Status", value: (r) => LOT_STATUS_LABEL[r.status] ?? r.status, filter: true, width: 140, render: (r) => <Chip label={LOT_STATUS_LABEL[r.status] ?? r.status} tone={LOT_STATUS_TONE[r.status] ?? "muted"} /> },
    { key: "dec", label: "Decision", value: (r) => (r.status === "DECIDED" ? decisionSummary(r) : ""), width: 260 },
    { key: "date", label: "Created", value: (r) => r.created_at.slice(0, 10), width: 100 },
  ];
  const ncrCols: ListColumn<Ncr>[] = [
    { key: "no", label: "Report", value: (r) => r.document_number, width: 100 },
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 190 },
    { key: "cause", label: "Root cause", value: (r) => ROOT_CAUSE_LABEL[r.root_cause] ?? r.root_cause, filter: true, width: 130 },
    { key: "disp", label: "What happened to the goods", value: (r) => r.disposition, width: 240 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 90, render: (r) => qtyText(r.qty) },
    { key: "cost", label: "Loss", value: (r) => Number(r.cost), align: "right", width: 110, render: (r) => money(r.cost) },
    { key: "status", label: "Status", value: (r) => (r.status === "OPEN" ? "Open" : "Closed"), filter: true, width: 100, render: (r) => <Chip label={r.status === "OPEN" ? "Open" : "Closed"} tone={r.status === "OPEN" ? "warn" : "good"} /> },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Quality</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[800px]">
          Goods you mark for inspection are received into the <b>quarantine store</b>, where nothing can use them. You measure them against the specification, then <b>decide</b> what happens to each piece:
          accept it into stock, scrap it (the loss is booked), send it back to the vendor, or rework it and inspect again. Anything not accepted becomes a non-conformance report with its root cause.
          {readOnly && " You are looking at a student’s quality records."}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <KpiCard icon={<SearchCheck size={14} />} label="Lots waiting" value={waiting} accent="#F2B13C" />
        <KpiCard icon={<ClipboardCheck size={14} />} label="Being inspected" value={measuring} accent="#5AA9FF" />
        <KpiCard icon={<AlertTriangle size={14} />} label="Open reports" value={openNcrs} accent={openNcrs ? "#FF6B7A" : "#22D3C5"} />
        <KpiCard icon={<PackageX size={14} />} label="Scrap loss booked" value={money(loss)} />
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/quality?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>
            {label}{id === "lots" && openLots.length > 0 ? ` (${openLots.length})` : id === "ncr" && openNcrs > 0 ? ` (${openNcrs})` : ""}
          </button>
        ))}
      </div>

      {tab === "lots" && (
        <Panel title="Inspection lots">
          <ListReport listKey="mfg-inspection-lots" rows={lots} columns={lotCols} rowKey={(r) => r.id} exportName="inspection-lots" onRowClick={(r) => showLot(r.id)}
            emptyText="No inspection lots yet. Mark an item for inspection under “Plans and settings”, then receive it into the quarantine store." />
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">Click a lot to measure it and decide. A lot is made automatically when marked goods are received; receiving them anywhere but quarantine is refused.</div>
        </Panel>
      )}

      {tab === "ncr" && (
        <Panel title="Non-conformance reports">
          <ListReport listKey="mfg-ncr" rows={ncrs} columns={ncrCols} rowKey={(r) => r.id} exportName="non-conformance-reports" onRowClick={(r) => { setOpenNcr(r.id); setAction(r.corrective_action ?? ""); }}
            emptyText="No reports. One is made whenever an inspection decision scraps, returns or reworks goods." />
        </Panel>
      )}

      {tab === "plans" && (
        <Panel title="What is inspected, and how">
          <div className="grid gap-x-3" style={{ gridTemplateColumns: "minmax(220px, 380px) 1fr", alignItems: "end" }}>
            <div><Label>Item</Label>
              <select className="input" value={planItem} onChange={(e) => pickPlanItem(e.target.value)}>
                <option value="">Choose an item…</option>
                {stocked.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}{flags.some((f) => f.item_id === i.item_id && (f.inspect_receipt || f.inspect_production)) ? "  ●" : ""}</option>)}
              </select></div>
            <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">● marks items that are inspected. Quarantine store: <b>{quarantine?.name ?? "none found"}</b>.</div>
          </div>
          {!planItem ? <div className="mt-4"><Empty>Choose an item to set up its inspection.</Empty></div> : (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[13px]">
                <label className="flex items-center gap-2"><input type="checkbox" disabled={readOnly} checked={fReceipt} onChange={(e) => setFReceipt(e.target.checked)} /> Inspect when it is <b>bought</b> (goods receipt)</label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={readOnly} checked={fProd} onChange={(e) => setFProd(e.target.checked)} /> Inspect when it is <b>made</b> (finished-goods receipt)</label>
                {!readOnly && <OutlineBtn type="button" disabled={busy} onClick={saveFlags}>Save these settings</OutlineBtn>}
              </div>
              <div className="text-[11.5px] text-[#7F8EA0] mt-1">Marked goods must be received into the quarantine store. The Purchasing and Production receipt forms choose it for you.</div>

              <div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mt-5 mb-1.5">Characteristics to measure</div>
              <div className="overflow-x-auto">
                <table style={{ minWidth: 560 }}>
                  <thead><tr><th>Characteristic</th><th>Unit</th><th>Minimum</th><th>Maximum</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const set = (patch: Partial<PlanRow>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      return (
                        <tr key={i}>
                          <td><input className="input" disabled={readOnly} value={r.characteristic} onChange={(e) => set({ characteristic: e.target.value })} placeholder="e.g. Moisture" aria-label="Characteristic" /></td>
                          <td><input className="input" style={{ width: 90 }} disabled={readOnly} value={r.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="%" aria-label="Unit" /></td>
                          <td><input className="input" style={{ width: 110 }} disabled={readOnly} type="number" step="any" value={r.spec_min} onChange={(e) => set({ spec_min: e.target.value })} aria-label="Minimum" /></td>
                          <td><input className="input" style={{ width: 110 }} disabled={readOnly} type="number" step="any" value={r.spec_max} onChange={(e) => set({ spec_max: e.target.value })} aria-label="Maximum" /></td>
                          <td>{!readOnly && <button type="button" className="text-[12px] underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <div className="text-[12px] text-[#7F8EA0] py-2">No characteristics. Without any, a lot can be decided straight away.</div>}
              </div>
              {!readOnly && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <OutlineBtn type="button" onClick={() => setRows([...rows, { characteristic: "", unit: "", spec_min: "", spec_max: "" }])}>Add a characteristic</OutlineBtn>
                  <GoldBtn type="button" disabled={busy} onClick={savePlan}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Save the plan</GoldBtn>
                </div>
              )}
              <div className="text-[11.5px] text-[#7F8EA0] mt-2">Give a minimum, a maximum, or both. A measurement outside them is flagged, and accepting such goods needs a written reason.</div>
            </>
          )}
        </Panel>
      )}

      {lot && (
        <Modal title={`${lot.document_number} · ${itemName(lot.item_id)}`} onClose={() => setOpenLot(null)} wide>
          <div className="text-[12.5px] text-[#A3B1C2]">
            {qtyText(lot.qty)} {uom(lot.item_id)} · {SOURCE_LABEL[lot.source] ?? lot.source}{lot.source_doc_id && docs[lot.source_doc_id] ? ` (${docs[lot.source_doc_id]})` : ""} · <Chip label={LOT_STATUS_LABEL[lot.status] ?? lot.status} tone={LOT_STATUS_TONE[lot.status] ?? "muted"} />
          </div>

          <div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mt-4 mb-1.5">Measurements</div>
          {lotPlan.length === 0 ? <div className="text-[12.5px] text-[#7F8EA0]">This item has no characteristics to measure. {OPEN.includes(lot.status) ? "You can decide straight away." : ""}</div> : (
            <table style={{ minWidth: 420 }}>
              <thead><tr><th>Characteristic</th><th>Specification</th><th>Measured</th><th>Result</th></tr></thead>
              <tbody>
                {lotPlan.map((p) => {
                  const rec = results.find((r) => r.characteristic.toLowerCase() === p.characteristic.toLowerCase());
                  const typed = vals[p.characteristic.toLowerCase()] ?? "";
                  const live = typed !== "" && !Number.isNaN(Number(typed)) ? inSpec(Number(typed), p.spec_min, p.spec_max) : null;
                  return (
                    <tr key={p.id}>
                      <td>{p.characteristic}</td>
                      <td>{specText(p.spec_min, p.spec_max, p.unit)}</td>
                      <td>{OPEN.includes(lot.status) && !readOnly
                        ? <input className="input" style={{ width: 110 }} type="number" step="any" value={typed} onChange={(e) => setVals({ ...vals, [p.characteristic.toLowerCase()]: e.target.value })} aria-label={`Measured ${p.characteristic}`} />
                        : rec ? qtyText(rec.value) : "—"}</td>
                      <td>{!OPEN.includes(lot.status) && rec
                        ? <Chip label={rec.in_spec ? "In specification" : "Outside"} tone={rec.in_spec ? "good" : "bad"} />
                        : live === null ? "" : <Chip label={live ? "In specification" : "Outside"} tone={live ? "good" : "bad"} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {OPEN.includes(lot.status) && !readOnly && lotPlan.length > 0 && (
            <div className="mt-2"><OutlineBtn type="button" disabled={busy} onClick={saveMeasurements}>Save measurements</OutlineBtn></div>
          )}

          {OPEN.includes(lot.status) && !readOnly && (
            <form onSubmit={decide} className="mt-5">
              <div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1">Decision — split the {qtyText(lot.qty)} however it deserves</div>
              <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                <div><Label>Accept into stock</Label><input className="input" type="number" min={0} step="any" value={dec.accept} onChange={(e) => setDec({ ...dec, accept: e.target.value })} /></div>
                <div><Label>Scrap</Label><input className="input" type="number" min={0} step="any" value={dec.scrap} onChange={(e) => setDec({ ...dec, scrap: e.target.value })} /></div>
                <div><Label>Return to vendor</Label><input className="input" type="number" min={0} step="any" disabled={lot.source !== "GR"} value={dec.ret} onChange={(e) => setDec({ ...dec, ret: e.target.value })} title={lot.source !== "GR" ? "Only goods bought from a vendor can be returned" : ""} /></div>
                <div><Label>Rework</Label><input className="input" type="number" min={0} step="any" value={dec.rework} onChange={(e) => setDec({ ...dec, rework: e.target.value })} /></div>
              </div>
              <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div><Label>Root cause (if anything is rejected)</Label>
                  <select className="input" value={dec.cause} onChange={(e) => setDec({ ...dec, cause: e.target.value })}>
                    <option value="">—</option>
                    {ROOT_CAUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><Label>Date</Label><input className="input" type="date" value={dec.date} onChange={(e) => setDec({ ...dec, date: e.target.value })} /></div>
              </div>
              <Label>Note {outOfSpec > 0 ? "(required to accept goods outside the specification)" : "(optional)"}</Label>
              <input className="input" value={dec.note} onChange={(e) => setDec({ ...dec, note: e.target.value })} placeholder="What you saw, and why" />
              <div className="text-[11.5px] text-[#7F8EA0] mt-2">
                Accepted goods move to the usual store. Scrapped goods leave stock and the loss is booked at cost. Returned goods leave stock and the purchase order is reopened for them (not possible once the vendor&rsquo;s invoice has been posted). Rework stays in quarantine as a new lot to inspect again.
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <OutlineBtn type="button" onClick={() => setOpenLot(null)} disabled={busy}>Close</OutlineBtn>
                <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Record decision</GoldBtn>
              </div>
            </form>
          )}

          {lot.status === "DECIDED" && (
            <div className="mt-4 text-[12.5px]">
              <div><b>{decisionSummary(lot) || DECISION_LABEL[lot.decision ?? ""] || "Decided"}</b>{lot.decided_at ? ` · ${lot.decided_at.slice(0, 10)}` : ""}</div>
              {lot.note && <div className="text-[#A3B1C2] mt-1">Note: {lot.note}</div>}
              {ncrs.filter((n) => n.lot_id === lot.id).map((n) => <div key={n.id} className="mt-1">Report <b>{n.document_number}</b>: {n.disposition}, loss {money(n.cost)}</div>)}
            </div>
          )}
          {lot.status === "CANCELLED" && <div className="mt-4 text-[12.5px] text-[#7F8EA0]">This lot was cancelled because the receipt it came from was reversed.</div>}
          {!OPEN.includes(lot.status) && <div className="flex justify-end mt-4"><OutlineBtn type="button" onClick={() => setOpenLot(null)}>Close</OutlineBtn></div>}
        </Modal>
      )}

      {ncr && (
        <Modal title={`${ncr.document_number} · ${itemName(ncr.item_id)}`} onClose={() => setOpenNcr(null)} wide>
          <div className="text-[12.5px]">
            <div><b>{ncr.disposition}</b> · {qtyText(ncr.qty)} {uom(ncr.item_id)} · loss {money(ncr.cost)}</div>
            <div className="text-[#A3B1C2] mt-1">Root cause: {ROOT_CAUSE_LABEL[ncr.root_cause] ?? ncr.root_cause}{ncr.note ? ` — ${ncr.note}` : ""}</div>
          </div>
          {ncr.status === "OPEN" && !readOnly ? (
            <form onSubmit={closeNcr} className="mt-4">
              <Label>What was done to stop it happening again?</Label>
              <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Corrective action" />
              <div className="flex gap-2 justify-end mt-4">
                <OutlineBtn type="button" onClick={() => setOpenNcr(null)} disabled={busy}>Close window</OutlineBtn>
                <GoldBtn type="submit" disabled={busy}>Close the report</GoldBtn>
              </div>
            </form>
          ) : (
            <div className="mt-4 text-[12.5px]">{ncr.status === "CLOSED" ? <>Closed. Corrective action: {ncr.corrective_action}</> : "Open."}
              <div className="flex justify-end mt-3"><OutlineBtn type="button" onClick={() => setOpenNcr(null)}>Close window</OutlineBtn></div></div>
          )}
        </Modal>
      )}
      <FormStyles />
    </>
  );
}
