"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarRange, ClipboardList, Loader2, Layers, ShoppingCart } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, GoldBtn, KpiCard, Label, Modal, OutlineBtn, Panel, TinyBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import PlanGrid from "@/components/mfg/PlanGrid";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { firstIssue, qtyText } from "@/lib/mfgOps";
import { DEMAND_LABEL, EXCEPTION_HELP, EXCEPTION_LABEL, LOT_RULE_HELP, LOT_RULE_LABEL, SUPPLY_LABEL, addDays, type LotRule } from "@/lib/mrp";
import {
  BUCKET_OPTIONS, HORIZON_OPTIONS, bucketCount, convertRequisitionsSchema, forecastSchema, plannedOrderSchema, planRunSchema, runSummary, suggestedPrice,
  type GridRow,
} from "@/lib/mfgPlanning";

type Run = {
  id: string; document_number: string; status: string; start_date: string; horizon_days: number; bucket_days: number; bucket_count: number;
  include_forecast: boolean; items_planned: number; planned_orders: number; requisitions: number; exceptions: number; started_at: string;
};
type Planned = { id: string; document_number: string; item_id: string; qty: number; start_date: string; finish_date: string; source: string; firm: boolean; status: string; converted_to_id: string | null; late_days: number };
type Req = { id: string; document_number: string; item_id: string; qty: number; need_date: string; order_by_date: string; status: string; po_id: string | null; late_days: number };
type Exc = { id: string; item_id: string; kind: string; message: string; ref_date: string | null };
type Forecast = { id: string; item_id: string; period_start: string; qty: number };
type Demand = { id: string; kind: string; source_ref: string | null; need_date: string; qty: number };
type Peg = { id: string; demand_kind: string; demand_ref: string | null; demand_date: string | null; supply_kind: string; supply_ref: string | null; supply_date: string | null; qty: number };

const TABS = [["grid", "Planning grid"], ["exceptions", "Exceptions"], ["planned", "Planned orders"], ["reqs", "Purchase requisitions"], ["forecast", "Forecast"]] as const;
const today = () => new Date().toISOString().slice(0, 10);
const STATUS_TONE: Record<string, "good" | "warn" | "muted" | "bad"> = { OPEN: "warn", CONVERTED: "good", DELETED: "muted" };
const STATUS_TEXT: Record<string, string> = { OPEN: "Open", CONVERTED: "Converted", DELETED: "Deleted" };
const EXC_TONE: Record<string, "good" | "warn" | "muted" | "bad"> = { LATE_START: "bad", PAST_DUE_RECEIPT: "bad", NO_ACTIVE_BOM: "warn", RESCHEDULE_IN: "warn", NOT_NEEDED: "muted" };
const monthLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

export default function PlanningPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <PlanningBody />
      </Suspense>
    </AppShell>
  );
}

function PlanningBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "grid";

  const [run, setRun] = useState<Run | null>(null);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [excs, setExcs] = useState<Exc[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [itemId, setItemId] = useState("");
  const [view, setView] = useState<{ key: string; grid: GridRow[]; demand: Demand[]; pegs: Peg[] }>({ key: "", grid: [], demand: [], pegs: [] });
  const [busy, setBusy] = useState(false);

  const [start, setStart] = useState(today());
  const [horizon, setHorizon] = useState("84");
  const [bucket, setBucket] = useState("7");
  const [withForecast, setWithForecast] = useState(true);

  const [newOrder, setNewOrder] = useState<{ item_id: string; qty: string; start_date: string; finish_date: string } | null>(null);
  const [poFor, setPoFor] = useState<Req[] | null>(null);
  const [vendor, setVendor] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [fc, setFc] = useState({ item_id: "", month: today().slice(0, 7), qty: "" });

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [r, p, q, f, v] = await Promise.all([
      supabase.from("mfg_mrp_runs").select("*").eq("tenant_id", t).order("started_at", { ascending: false }).limit(1),
      supabase.from("mfg_planned_orders").select("id, document_number, item_id, qty, start_date, finish_date, source, firm, status, converted_to_id, late_days").eq("tenant_id", t).order("created_at", { ascending: false }).limit(500),
      supabase.from("mfg_purchase_reqs").select("id, document_number, item_id, qty, need_date, order_by_date, status, po_id, late_days").eq("tenant_id", t).order("created_at", { ascending: false }).limit(500),
      supabase.from("mfg_forecasts").select("id, item_id, period_start, qty").eq("tenant_id", t).order("period_start"),
      supabase.from("vendors").select("id, name").eq("tenant_id", t).order("name"),
    ]);
    const latest = ((r.data as Run[]) ?? [])[0] ?? null;
    setRun(latest);
    setPlanned((p.data as Planned[]) ?? []);
    setReqs((q.data as Req[]) ?? []);
    setForecasts((f.data as Forecast[]) ?? []);
    setVendors((v.data as { id: string; name: string }[]) ?? []);
    if (latest) {
      const e = await supabase.from("mfg_mrp_exceptions").select("id, item_id, kind, message, ref_date").eq("run_id", latest.id).limit(1000);
      setExcs((e.data as Exc[]) ?? []);
    } else setExcs([]);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const runId = run?.id ?? null;
  const planItems = useMemo(() => lk.items.filter((i) => i.active && i.item_type !== "SERVICE"), [lk.items]);
  const flagged = useMemo(() => {
    const s = new Set<string>();
    for (const x of planned) if (x.status === "OPEN") s.add(x.item_id);
    for (const x of reqs) if (x.status === "OPEN") s.add(x.item_id);
    for (const x of excs) s.add(x.item_id);
    return s;
  }, [planned, reqs, excs]);

  // the item on show: the one chosen, else the first that has something to act on
  const shownItemId = useMemo(
    () => (itemId && planItems.some((i) => i.item_id === itemId) ? itemId : (planItems.find((i) => flagged.has(i.item_id)) ?? planItems[0])?.item_id ?? ""),
    [itemId, planItems, flagged],
  );

  // the picture of that item in the latest run
  const viewKey = runId && shownItemId ? `${runId}:${shownItemId}` : "";
  useEffect(() => {
    if (!viewKey || !runId) return;
    let live = true;
    (async () => {
      const [g, d, p] = await Promise.all([
        supabase.from("mfg_mrp_grid").select("bucket_no, bucket_start, projected_start, gross, scheduled, net, planned_receipt, planned_release, projected_end").eq("run_id", runId).eq("item_id", shownItemId).order("bucket_no"),
        supabase.from("mfg_mrp_demand").select("id, kind, source_ref, need_date, qty").eq("run_id", runId).eq("item_id", shownItemId).order("need_date"),
        supabase.from("mfg_pegging").select("id, demand_kind, demand_ref, demand_date, supply_kind, supply_ref, supply_date, qty").eq("run_id", runId).eq("item_id", shownItemId).order("demand_date"),
      ]);
      if (!live) return;
      setView({ key: viewKey, grid: (g.data as GridRow[]) ?? [], demand: (d.data as Demand[]) ?? [], pegs: (p.data as Peg[]) ?? [] });
    })();
    return () => { live = false; };
  }, [viewKey, runId, shownItemId]);
  const fresh = view.key === viewKey;
  const grid = fresh ? view.grid : [];
  const demand = fresh ? view.demand : [];
  const pegs = fresh ? view.pegs : [];

  const item = (id: string) => lk.items.find((i) => i.item_id === id);
  const itemName = (id: string) => item(id)?.name ?? "—";
  const goTab = (id: string) => router.replace(`/mfg/planning?tab=${id}`);
  const openPlanned = planned.filter((x) => x.status === "OPEN").length;
  const openReqs = reqs.filter((x) => x.status === "OPEN").length;

  const runPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = planRunSchema.safeParse({ start, horizon_days: horizon, bucket_days: bucket, include_forecast: withForecast });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_run_mrp", {
      p_horizon_days: parsed.data.horizon_days, p_bucket_days: parsed.data.bucket_days, p_include_forecast: parsed.data.include_forecast, p_start: parsed.data.start,
    }), { successMessage: "Planning finished. Suggestions nobody had converted were replaced by the new ones." });
    setBusy(false);
    if (ok(res)) { setItemId(""); await load(); }
  };

  const convertPlanned = async (r: Planned) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_convert_planned_order", { p_id: r.id, p_backflush: false }), { successMessage: `${r.document_number} is now a production order.` });
    setBusy(false);
    if (ok(res)) await load();
  };
  const deletePlanned = async (r: Planned) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_delete_planned_order", { p_id: r.id }), { successMessage: `${r.document_number} deleted.` });
    setBusy(false);
    if (ok(res)) await load();
  };
  const deleteReq = async (r: Req) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_delete_requisition", { p_id: r.id }), { successMessage: `${r.document_number} deleted.` });
    setBusy(false);
    if (ok(res)) await load();
  };

  const createPlanned = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrder || busy) return;
    const parsed = plannedOrderSchema.safeParse(newOrder);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_planned_order", { p_item: parsed.data.item_id, p_qty: parsed.data.qty, p_start: parsed.data.start_date, p_finish: parsed.data.finish_date }),
      { successMessage: "Planned order created. It is firm: the next planning run keeps it and plans its components." });
    setBusy(false);
    if (ok(res)) { setNewOrder(null); await load(); }
  };

  const openPo = (rows: Req[]) => {
    const open = rows.filter((r) => r.status === "OPEN");
    if (open.length === 0) { toast.error("Choose at least one open requisition."); return; }
    setPrices(Object.fromEntries(open.map((r) => [r.id, suggestedPrice(item(r.item_id))])));
    setVendor("");
    setPoFor(open);
  };
  const createPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poFor || busy) return;
    const parsed = convertRequisitionsSchema.safeParse({ vendor_id: vendor, lines: poFor.map((r) => ({ req_id: r.id, unit_price: prices[r.id] ?? "" })) });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_convert_requisitions", { p_vendor: parsed.data.vendor_id, p_lines: parsed.data.lines }),
      { successMessage: "Purchase order created. Receive the goods on the Purchasing page." });
    setBusy(false);
    if (ok(res)) { setPoFor(null); await load(); }
  };

  const saveForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = forecastSchema.safeParse(fc);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_forecast", { p_item: parsed.data.item_id, p_month: parsed.data.month, p_qty: parsed.data.qty }),
      { successMessage: parsed.data.qty === 0 ? "Forecast cleared." : "Forecast saved. It is used the next time you run planning." });
    setBusy(false);
    if (ok(res)) { setFc({ ...fc, qty: "" }); await load(); }
  };
  const clearForecast = async (f: Forecast) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_forecast", { p_item: f.item_id, p_month: f.period_start, p_qty: 0 }), { successMessage: "Forecast cleared." });
    setBusy(false);
    if (ok(res)) await load();
  };

  const chosen = item(shownItemId);
  const actions = (node: React.ReactNode) => <span onClick={(e) => e.stopPropagation()} className="inline-flex gap-1.5">{node}</span>;

  const plannedCols: ListColumn<Planned>[] = [
    { key: "no", label: "Planned order", value: (r) => r.document_number, width: 120 },
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 200 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => qtyText(r.qty) },
    { key: "start", label: "Start", value: (r) => r.start_date, width: 110 },
    { key: "finish", label: "Finish", value: (r) => r.finish_date, width: 110 },
    { key: "src", label: "Made by", value: (r) => (r.source === "MRP" ? "Planning run" : "You (firm)"), filter: true, width: 120 },
    { key: "late", label: "Late by", value: (r) => r.late_days, align: "right", width: 90, render: (r) => (r.late_days > 0 ? <Chip label={`${r.late_days} days`} tone="bad" /> : "—") },
    { key: "status", label: "Status", value: (r) => STATUS_TEXT[r.status] ?? r.status, filter: true, width: 120, render: (r) => <Chip label={STATUS_TEXT[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? "muted"} /> },
    { key: "do", label: "", value: () => "", width: 190, render: (r) => r.status === "CONVERTED" && r.converted_to_id
        ? <Link href={`/mfg/production/${r.converted_to_id}`} onClick={(e) => e.stopPropagation()} className="text-[12px] font-semibold underline">Open production order</Link>
        : r.status === "OPEN" && !readOnly ? actions(<><TinyBtn type="button" disabled={busy} onClick={() => convertPlanned(r)}>Make it</TinyBtn><TinyBtn type="button" disabled={busy} onClick={() => deletePlanned(r)}>Delete</TinyBtn></>) : null },
  ];

  const reqCols: ListColumn<Req>[] = [
    { key: "no", label: "Requisition", value: (r) => r.document_number, width: 120 },
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 200 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => qtyText(r.qty) },
    { key: "order", label: "Order by", value: (r) => r.order_by_date, width: 110, render: (r) => <span style={{ color: r.status === "OPEN" && r.order_by_date < today() ? "#FF6B7A" : undefined }}>{r.order_by_date}</span> },
    { key: "need", label: "Needed on", value: (r) => r.need_date, width: 110 },
    { key: "late", label: "Late by", value: (r) => r.late_days, align: "right", width: 90, render: (r) => (r.late_days > 0 ? <Chip label={`${r.late_days} days`} tone="bad" /> : "—") },
    { key: "status", label: "Status", value: (r) => STATUS_TEXT[r.status] ?? r.status, filter: true, width: 120, render: (r) => <Chip label={STATUS_TEXT[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? "muted"} /> },
    { key: "do", label: "", value: () => "", width: 120, render: (r) => r.status === "OPEN" && !readOnly ? actions(<TinyBtn type="button" disabled={busy} onClick={() => deleteReq(r)}>Delete</TinyBtn>) : null },
  ];

  const excCols: ListColumn<Exc>[] = [
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 180 },
    { key: "kind", label: "What", value: (r) => EXCEPTION_LABEL[r.kind] ?? r.kind, filter: true, width: 190, render: (r) => <Chip label={EXCEPTION_LABEL[r.kind] ?? r.kind} tone={EXC_TONE[r.kind] ?? "muted"} /> },
    { key: "msg", label: "Message", value: (r) => r.message, width: 520, render: (r) => <span className="whitespace-normal">{r.message}</span> },
    { key: "date", label: "Date", value: (r) => r.ref_date ?? "", width: 110 },
  ];

  const demandCols: ListColumn<Demand>[] = [
    { key: "kind", label: "Comes from", value: (r) => DEMAND_LABEL[r.kind] ?? r.kind, filter: true, width: 190 },
    { key: "ref", label: "Document", value: (r) => r.source_ref ?? "", width: 150 },
    { key: "date", label: "Needed on", value: (r) => r.need_date, width: 110 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => qtyText(r.qty) },
  ];
  const pegCols: ListColumn<Peg>[] = [
    { key: "need", label: "Needed for", value: (r) => `${DEMAND_LABEL[r.demand_kind] ?? r.demand_kind} ${r.demand_ref ?? ""}`.trim(), width: 250 },
    { key: "ndate", label: "Needed on", value: (r) => r.demand_date ?? "", width: 110 },
    { key: "cover", label: "Covered by", value: (r) => `${SUPPLY_LABEL[r.supply_kind] ?? r.supply_kind} ${r.supply_ref && r.supply_kind !== "ONHAND" ? r.supply_ref : ""}`.trim(), width: 250 },
    { key: "sdate", label: "Arrives", value: (r) => (r.supply_kind === "ONHAND" ? "Already here" : r.supply_date ?? ""), width: 120 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => qtyText(r.qty) },
  ];
  const fcCols: ListColumn<Forecast>[] = [
    { key: "item", label: "Item", value: (r) => itemName(r.item_id), width: 220 },
    { key: "month", label: "Month", value: (r) => r.period_start, width: 160, render: (r) => monthLabel(r.period_start) },
    { key: "qty", label: "Forecast", value: (r) => Number(r.qty), align: "right", width: 110, render: (r) => qtyText(r.qty) },
    { key: "do", label: "", value: () => "", width: 100, render: (r) => !readOnly ? actions(<TinyBtn type="button" disabled={busy} onClick={() => clearForecast(r)}>Clear</TinyBtn>) : null },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  const makeItems = planItems.filter((i) => i.make_or_buy === "MAKE");
  const cols = bucketCount(Number(horizon) || 0, Number(bucket) || 7);

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Planning</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[780px]">
          Material requirements planning (MRP) looks at what customers have ordered, what you forecast, and what you already hold or have on order. It then tells you <b>what to make</b> (planned orders) and <b>what to buy</b> (purchase requisitions), and when to start so everything is ready on time.
          Nothing is ordered or started until you convert a suggestion.
          {readOnly && " You are looking at a student’s plan."}
        </div>
      </div>

      <Panel title="Run planning">
        {readOnly ? (
          <div className="text-[12.5px] text-[#A3B1C2]">Only the student runs planning. {run ? runSummary(run) : "No run yet."}</div>
        ) : (
          <form onSubmit={runPlan}>
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}>
              <div><Label>Plan from</Label><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label>Look ahead</Label>
                <select className="input" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                  {HORIZON_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
                </select></div>
              <div><Label>One column is</Label>
                <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
                  {BUCKET_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
                </select></div>
              <div className="pb-1"><label className="flex items-center gap-2 text-[12.5px] mt-3.5"><input type="checkbox" checked={withForecast} onChange={(e) => setWithForecast(e.target.checked)} /> Include the forecast</label></div>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-4">
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Run planning</GoldBtn>
              <span className="text-[12px] text-[#7F8EA0]">{cols} column{cols === 1 ? "" : "s"}. Suggestions nobody converted are replaced; orders you made by hand (firm) and everything already converted stay.</span>
            </div>
          </form>
        )}
        {run && <div className="text-[12px] text-[#A3B1C2] mt-3">Latest run <b>{run.document_number}</b> · {runSummary(run)}{run.include_forecast ? "" : " · forecast left out"}</div>}
      </Panel>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <KpiCard icon={<ClipboardList size={14} />} label="Planned orders to review" value={openPlanned} accent="#F2B13C" />
        <KpiCard icon={<ShoppingCart size={14} />} label="Requisitions to buy" value={openReqs} accent="#5AA9FF" />
        <KpiCard icon={<AlertTriangle size={14} />} label="Exceptions" value={excs.length} accent={excs.length ? "#FF6B7A" : "#22D3C5"} />
        <KpiCard icon={<CalendarRange size={14} />} label="Items planned" value={run?.items_planned ?? 0} />
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => goTab(id)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>
            {label}{id === "exceptions" && excs.length > 0 ? ` (${excs.length})` : id === "planned" && openPlanned > 0 ? ` (${openPlanned})` : id === "reqs" && openReqs > 0 ? ` (${openReqs})` : ""}
          </button>
        ))}
      </div>

      {tab === "grid" && (
        <>
          <Panel title="One item, week by week">
            {!run ? <Empty>No planning run yet. Choose how far ahead to look above and press “Run planning”.</Empty> : (
              <>
                <div className="grid gap-x-3" style={{ gridTemplateColumns: "minmax(220px, 360px) 1fr", alignItems: "end" }}>
                  <div><Label>Item</Label>
                    <select className="input" value={shownItemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item to look at">
                      {planItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}{flagged.has(i.item_id) ? "  ●" : ""}</option>)}
                    </select></div>
                  {chosen && (
                    <div className="text-[12px] text-[#A3B1C2] pb-2.5">
                      {chosen.make_or_buy === "MAKE" ? "Made in-house" : "Bought"} · lead time {chosen.make_or_buy === "MAKE" ? chosen.production_lead_days : chosen.procurement_lead_days} days · {LOT_RULE_LABEL[chosen.lot_rule as LotRule] ?? chosen.lot_rule}
                      {Number(chosen.safety_stock) > 0 ? ` · safety stock ${qtyText(chosen.safety_stock)}` : ""}{Number(chosen.scrap_pct) > 0 ? ` · scrap ${qtyText(chosen.scrap_pct)}%` : ""}
                      <div className="text-[11.5px] text-[#7F8EA0]">{LOT_RULE_HELP[chosen.lot_rule as LotRule] ?? ""} ● marks items with something to act on.</div>
                    </div>
                  )}
                </div>
                <div className="mt-4"><PlanGrid rows={grid} bucketDays={run.bucket_days} uom={chosen?.base_uom ?? ""} /></div>
              </>
            )}
          </Panel>
          {run && grid.length > 0 && (
            <>
              <Panel title="Where the need comes from">
                <ListReport listKey="mfg-plan-demand" rows={demand} columns={demandCols} rowKey={(r) => r.id} exportName="requirements" emptyText="Nothing is asking for this item. Only safety stock or orders already on the way are in play." />
              </Panel>
              <Panel title="Why is this being planned? What covers each need">
                <ListReport listKey="mfg-plan-pegging" rows={pegs} columns={pegCols} rowKey={(r) => r.id} exportName="pegging" emptyText="No need is matched to supply for this item." />
                <div className="text-[11.5px] text-[#7F8EA0] mt-2">Needs are matched to supply first come, first served: stock first, then orders already on the way, then the planned orders and requisitions.</div>
              </Panel>
            </>
          )}
        </>
      )}

      {tab === "exceptions" && (
        <Panel title="Exceptions — things that need a person to decide">
          <div className="text-[12px] text-[#A3B1C2] mb-3 flex flex-wrap gap-x-5 gap-y-1">
            {Object.keys(EXCEPTION_LABEL).map((k) => <span key={k}><b>{EXCEPTION_LABEL[k]}</b>: {EXCEPTION_HELP[k]}</span>)}
          </div>
          <ListReport listKey="mfg-plan-exceptions" rows={excs} columns={excCols} rowKey={(r) => r.id} exportName="planning-exceptions"
            onRowClick={(r) => { setItemId(r.item_id); goTab("grid"); }}
            emptyText={run ? "No exceptions. Every shortage can be covered in time." : "Run planning first."} />
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">Click a row to see that item’s planning grid.</div>
        </Panel>
      )}

      {tab === "planned" && (
        <Panel title="Planned orders — what to make">
          <ListReport listKey="mfg-planned-orders" rows={planned} columns={plannedCols} rowKey={(r) => r.id} exportName="planned-orders"
            toolbar={!readOnly ? <OutlineBtn type="button" onClick={() => setNewOrder({ item_id: makeItems[0]?.item_id ?? "", qty: "", start_date: today(), finish_date: addDays(today(), makeItems[0]?.production_lead_days ?? 0) })}>New planned order</OutlineBtn> : undefined}
            emptyText="No planned orders. Run planning; products that are short get a suggestion here." />
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">“Make it” turns a suggestion into a real production order with its components. A planned order you create yourself is <b>firm</b>: planning keeps it, counts it as supply and plans the components it needs.</div>
        </Panel>
      )}

      {tab === "reqs" && (
        <Panel title="Purchase requisitions — what to buy">
          <ListReport listKey="mfg-purchase-reqs" rows={reqs} columns={reqCols} rowKey={(r) => r.id} exportName="purchase-requisitions"
            bulkActions={!readOnly ? [{ label: "Create purchase order…", onRun: (rows) => openPo(rows) }] : undefined}
            emptyText="No requisitions. Run planning; bought items that are short get a suggestion here." />
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">Tick the requisitions for one vendor and choose “Create purchase order…”. The purchase order then appears on the Purchasing page, where you receive the goods.</div>
        </Panel>
      )}

      {tab === "forecast" && (
        <>
          {!readOnly && (
            <Panel title="Add or change a forecast">
              <form onSubmit={saveForecast}>
                <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" }}>
                  <div><Label>Item</Label>
                    <select className="input" value={fc.item_id} onChange={(e) => setFc({ ...fc, item_id: e.target.value })}>
                      <option value="">Choose…</option>
                      {planItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
                    </select></div>
                  <div><Label>Month</Label><input className="input" type="month" value={fc.month} onChange={(e) => setFc({ ...fc, month: e.target.value })} /></div>
                  <div><Label>Expected sales</Label><input className="input" type="number" min={0} step="any" value={fc.qty} onChange={(e) => setFc({ ...fc, qty: e.target.value })} placeholder="0 clears it" /></div>
                  <div><GoldBtn type="submit" disabled={busy} className="mt-3.5">{busy ? <Loader2 size={13} className="animate-spin" /> : null} Save forecast</GoldBtn></div>
                </div>
              </form>
              <div className="text-[11.5px] text-[#7F8EA0] mt-2">A forecast is what you expect to sell in a month before anyone has ordered it. Sales orders due that month use the forecast up, so the same demand is never planned twice.</div>
            </Panel>
          )}
          <Panel title="Forecasts">
            <ListReport listKey="mfg-forecasts" rows={forecasts} columns={fcCols} rowKey={(r) => r.id} exportName="forecasts" emptyText="No forecasts yet." />
          </Panel>
        </>
      )}

      {newOrder && (
        <Modal title="New planned order" onClose={() => setNewOrder(null)} wide>
          <form onSubmit={createPlanned}>
            <Label>Item to make</Label>
            <select className="input" value={newOrder.item_id} onChange={(e) => setNewOrder({ ...newOrder, item_id: e.target.value, finish_date: addDays(newOrder.start_date, item(e.target.value)?.production_lead_days ?? 0) })}>
              {makeItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
            </select>
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div><Label>Quantity</Label><input className="input" type="number" min={0} step="any" value={newOrder.qty} onChange={(e) => setNewOrder({ ...newOrder, qty: e.target.value })} /></div>
              <div><Label>Start</Label><input className="input" type="date" value={newOrder.start_date} onChange={(e) => setNewOrder({ ...newOrder, start_date: e.target.value, finish_date: addDays(e.target.value, item(newOrder.item_id)?.production_lead_days ?? 0) })} /></div>
              <div><Label>Finish</Label><input className="input" type="date" value={newOrder.finish_date} onChange={(e) => setNewOrder({ ...newOrder, finish_date: e.target.value })} /></div>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-3">The finish date is filled in from the item’s production lead time. The order is firm: the next planning run counts it as supply and plans its components.</div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setNewOrder(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Create</GoldBtn>
            </div>
          </form>
        </Modal>
      )}

      {poFor && (
        <Modal title="Create a purchase order" onClose={() => setPoFor(null)} wide>
          <form onSubmit={createPo}>
            <Label>Vendor</Label>
            <select className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}>
              <option value="">Choose a vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <div className="overflow-x-auto mt-3">
              <table style={{ minWidth: 420 }}>
                <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Quantity</th><th>Needed on</th><th>Price each</th></tr></thead>
                <tbody>
                  {poFor.map((r) => (
                    <tr key={r.id}>
                      <td>{itemName(r.item_id)}</td>
                      <td style={{ textAlign: "right" }}>{qtyText(r.qty)}</td>
                      <td>{r.need_date}</td>
                      <td><input className="input" style={{ width: 110 }} type="number" min={0} step="any" value={prices[r.id] ?? ""} onChange={(e) => setPrices({ ...prices, [r.id]: e.target.value })} aria-label={`Price of ${itemName(r.item_id)}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-3">Prices start from the item’s planned price or standard cost. Change them to what the vendor quoted. The purchase order is expected on the earliest date any line is needed.</div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setPoFor(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Create purchase order</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      <FormStyles />
    </>
  );
}
