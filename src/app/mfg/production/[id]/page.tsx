"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, Modal, GoldBtn, OutlineBtn, ConfirmDialog, KpiCard, FormStyles } from "@/components/ui";
import { Chip } from "@/components/ListReport";
import PostingsPanel from "@/components/mfg/PostingsPanel";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { ELEMENT_LABEL, money, percentOf, unitMoney, type Element } from "@/lib/costing";
import { confirmationSchema, fgReceiptSchema, firstIssue, issueSchema, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, qtyText } from "@/lib/mfgOps";

type Order = {
  id: string; document_number: string | null; item_id: string; qty_planned: number; qty_good: number; qty_scrap: number; qty_received: number; status: string;
  planned_start: string; planned_end: string | null; costing_method: string; std_unit_cost: number; planned_cost: number; bom_snapshot: { bom?: string; version?: number; yield_pct?: number };
};
type Comp = { id: string; line_no: number; item_id: string; qty_required: number; qty_issued: number; backflush: boolean };
type Op = {
  id: string; op_no: number; description: string | null; work_center_id: string; setup_min: number; run_min_per_unit: number; labor_min_per_unit: number | null;
  machine_min_per_unit: number | null; teardown_min: number; qty_confirmed: number; setup_h_actual: number; labor_h_actual: number; machine_h_actual: number;
};
type Avail = { component_id: string; on_hand: number; short: number };
type Cost = { element: string; amount: number };

const today = () => new Date().toISOString().slice(0, 10);

export default function OrderPage() {
  return <AppShell><OrderBody /></AppShell>;
}

function OrderBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const { data: lk, loading: lkLoading } = useLookups();

  const [loading, setLoading] = useState(true);
  const [o, setO] = useState<Order | null>(null);
  const [comps, setComps] = useState<Comp[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [avail, setAvail] = useState<Record<string, Avail>>({});
  const [costs, setCosts] = useState<Cost[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [issueDate, setIssueDate] = useState(today());
  const [confirmModal, setConfirmModal] = useState(false);
  const [cf, setCf] = useState({ op_no: "", yield_qty: "", scrap_qty: "0", scrap_reason: "", setup_h: "0", labor_h: "0", machine_h: "0", is_final: false, posting_date: today() });
  const [fg, setFg] = useState({ qty: "", location_id: "", batch_no: "", expiry: "", posting_date: today() });
  const [dialog, setDialog] = useState<null | "release" | "cancel" | "approve">(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [h, c, p, a, k, d, f] = await Promise.all([
      supabase.from("mfg_production_orders").select("*").eq("id", id).maybeSingle(),
      supabase.from("mfg_prod_components").select("id, line_no, item_id, qty_required, qty_issued, backflush").eq("order_id", id).order("line_no"),
      supabase.from("mfg_prod_operations").select("*").eq("order_id", id).order("op_no"),
      supabase.rpc("mfg_order_availability", { p_order: id }),
      supabase.from("mfg_order_costs").select("element, amount").eq("order_id", id),
      supabase.from("mfg_material_documents").select("id").eq("reference_id", id),
      supabase.from("mfg_confirmations").select("id").eq("order_id", id),
    ]);
    const order = (h.data as Order | null) ?? null;
    setO(order);
    const cs = (c.data as Comp[]) ?? [];
    setComps(cs);
    setOps((p.data as Op[]) ?? []);
    setAvail(Object.fromEntries(((a.data as Avail[]) ?? []).map((x) => [x.component_id, x])));
    setCosts((k.data as Cost[]) ?? []);
    setSources([...((d.data as { id: string }[]) ?? []), ...((f.data as { id: string }[]) ?? [])].map((x) => x.id));
    setIssueQty((prev) => Object.fromEntries(cs.map((x) => [x.id, prev[x.id] ?? String(Math.max(Number(x.qty_required) - Number(x.qty_issued), 0))])));
    setLoading(false);
    setTick((n) => n + 1);
  }, [id, effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const name = (itemId: string) => lk.items.find((i) => i.item_id === itemId)?.name ?? "—";
  const uom = (itemId: string) => lk.items.find((i) => i.item_id === itemId)?.base_uom ?? "";
  const wcName = (wid: string) => lk.workCenters.find((w) => w.id === wid)?.name ?? "—";
  const byElement = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of costs) m.set(c.element, (m.get(c.element) ?? 0) + Number(c.amount));
    return m;
  }, [costs]);
  const wip = costs.reduce((s, c) => s + Number(c.amount), 0);
  const lastOp = ops.length ? Math.max(...ops.map((x) => x.op_no)) : null;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, success: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(fn(), { successMessage: success });
    setBusy(false);
    if (ok(res)) { after?.(); await load(); }
  };

  const issue = () => {
    const parsed = issueSchema.safeParse({ posting_date: issueDate, lines: comps.map((c) => ({ component_id: c.id, qty: issueQty[c.id] ?? "0" })) });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    run(() => supabase.rpc("mfg_post_material_issue", { p_order: id, p_lines: parsed.data.lines.filter((l) => l.qty > 0), p_date: parsed.data.posting_date, p_key: `iss-${id}-${Date.now()}` }), "Material issued to the order.");
  };

  const planHours = () => {
    const op = ops.find((x) => String(x.op_no) === cf.op_no);
    if (!op) return;
    const units = (Number(cf.yield_qty) || 0) + (Number(cf.scrap_qty) || 0);
    const labor = (op.labor_min_per_unit ?? (op.machine_min_per_unit === null ? op.run_min_per_unit : 0)) * units / 60;
    const machine = (op.machine_min_per_unit ?? 0) * units / 60;
    const setup = Number(op.qty_confirmed) === 0 && Number(op.setup_h_actual) === 0 ? (Number(op.setup_min) + Number(op.teardown_min)) / 60 : 0;
    setCf({ ...cf, labor_h: String(Math.round(labor * 1e4) / 1e4), machine_h: String(Math.round(machine * 1e4) / 1e4), setup_h: String(Math.round(setup * 1e4) / 1e4) });
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = confirmationSchema.safeParse(cf);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    const d = parsed.data;
    run(() => supabase.rpc("mfg_post_confirmation", {
      p_order: id, p_op_no: d.op_no, p_yield: d.yield_qty, p_scrap: d.scrap_qty, p_scrap_reason: d.scrap_reason, p_setup_h: d.setup_h, p_labor_h: d.labor_h,
      p_machine_h: d.machine_h, p_final: d.is_final, p_date: d.posting_date, p_employee: null, p_key: `cnf-${id}-${Date.now()}`,
    }), "Production confirmed and posted.", () => setConfirmModal(false));
  };

  const receive = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = fgReceiptSchema.safeParse(fg);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    const d = parsed.data;
    run(() => supabase.rpc("mfg_post_fg_receipt", { p_order: id, p_qty: d.qty, p_location: d.location_id, p_batch_no: d.batch_no, p_expiry: d.expiry, p_date: d.posting_date, p_key: `fgr-${id}-${Date.now()}` }),
      "Finished goods received into stock.", () => setFg({ ...fg, qty: "" }));
  };

  if (loading || lkLoading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  if (!o) return <Panel title="Production order"><Empty>That production order was not found.</Empty></Panel>;

  const running = o.status === "RELEASED" || o.status === "PARTIALLY_CONFIRMED";
  const waiting = Number(o.qty_good) - Number(o.qty_received);
  const itemMaster = lk.items.find((i) => i.item_id === o.item_id);
  const canEdit = !isTeacher;
  const planned = Number(o.planned_cost);

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <OutlineBtn onClick={() => router.push("/mfg/production")}><ArrowLeft size={13} /> All orders</OutlineBtn>
        <h1 className="text-[20px] font-semibold">{o.document_number} · {name(o.item_id)}</h1>
        <Chip label={ORDER_STATUS_LABEL[o.status] ?? o.status} tone={ORDER_STATUS_TONE[o.status] ?? "muted"} />
        <div className="ml-auto flex gap-2 flex-wrap">
          {canEdit && o.status === "CREATED" && <GoldBtn onClick={() => setDialog("release")} disabled={busy}>Release</GoldBtn>}
          {isTeacher && o.status === "PENDING_APPROVAL" && <GoldBtn onClick={() => setDialog("approve")} disabled={busy}>Approve and release</GoldBtn>}
          {canEdit && ["CREATED", "PENDING_APPROVAL", "RELEASED"].includes(o.status) && wip === 0 && <OutlineBtn onClick={() => setDialog("cancel")} disabled={busy} style={{ color: "#FF6B7A", borderColor: "rgba(255,107,122,0.5)" }}>Cancel order</OutlineBtn>}
        </div>
      </div>
      {o.status === "PENDING_APPROVAL" && <div className="text-[12.5px] px-3 py-2 rounded-md border border-[rgba(242,177,60,0.4)] bg-[rgba(242,177,60,0.08)]">This order costs more than your company&rsquo;s approval limit, so your teacher must approve it before material can be issued.</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<span>#</span>} label="Planned" value={`${qtyText(o.qty_planned)} ${itemMaster?.base_uom ?? ""}`} />
        <KpiCard icon={<span>✓</span>} label="Good so far" value={qtyText(o.qty_good)} accent="#22D3C5" />
        <KpiCard icon={<span>✗</span>} label="Scrap" value={qtyText(o.qty_scrap)} accent={Number(o.qty_scrap) > 0 ? "#FF6B7A" : undefined} />
        <KpiCard icon={<span>▣</span>} label="In stock" value={qtyText(o.qty_received)} />
        <KpiCard icon={<span>₱</span>} label="In process now" value={money(wip)} accent="#F2B13C" />
      </div>
      <div className="text-[12px] text-[#7F8EA0]">
        {o.costing_method === "STANDARD" ? `Standard costing: finished goods go into stock at ${unitMoney(o.std_unit_cost)} each (target for the order ${money(planned)}).` : "Actual costing: finished goods go into stock at what the order really cost."}
        {o.bom_snapshot?.bom ? ` Bill of materials ${o.bom_snapshot.bom}${o.bom_snapshot.version ? ` v${o.bom_snapshot.version}` : ""}.` : ""}
      </div>

      <Panel title="Materials">
        <div className="overflow-x-auto">
          <table style={{ minWidth: 760 }}>
            <thead><tr><th>Component</th><th style={{ textAlign: "right" }}>Needed</th><th style={{ textAlign: "right" }}>Issued</th><th style={{ textAlign: "right" }}>In stock</th><th>Backflush</th>{running && canEdit && <th>Issue now</th>}</tr></thead>
            <tbody>
              {comps.map((c) => {
                const a = avail[c.id];
                const short = a && Number(a.short) > 0;
                return (
                  <tr key={c.id}>
                    <td>{name(c.item_id)} <span className="text-[#7F8EA0]">({uom(c.item_id)})</span></td>
                    <td style={{ textAlign: "right" }}>{qtyText(c.qty_required)}</td>
                    <td style={{ textAlign: "right" }}>{qtyText(c.qty_issued)}</td>
                    <td style={{ textAlign: "right", color: short ? "#FF6B7A" : undefined }}>{qtyText(a?.on_hand ?? 0)}{short ? ` (short ${qtyText(a.short)})` : ""}</td>
                    <td>
                      <input type="checkbox" checked={c.backflush} disabled={!canEdit || !["CREATED", "PENDING_APPROVAL", "RELEASED"].includes(o.status) || busy} aria-label={`Backflush ${name(c.item_id)}`}
                        onChange={(e) => run(() => supabase.rpc("mfg_set_component_backflush", { p_order: id, p_component: c.id, p_flag: e.target.checked }), "Saved.")} />
                    </td>
                    {running && canEdit && <td><input className="input" style={{ width: 110 }} type="number" min={0} step="any" value={issueQty[c.id] ?? ""} onChange={(e) => setIssueQty({ ...issueQty, [c.id]: e.target.value })} aria-label={`Quantity to issue of ${name(c.item_id)}`} disabled={c.backflush} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {running && canEdit && (
          <div className="flex items-end gap-3 mt-3 flex-wrap">
            <div><Label>Date</Label><input className="input" type="date" style={{ width: 160 }} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <GoldBtn onClick={issue} disabled={busy}>Issue material to the order</GoldBtn>
          </div>
        )}
        <div className="text-[11.5px] text-[#7F8EA0] mt-3">Material is taken from the store at the item&rsquo;s {o.costing_method === "STANDARD" ? "standard" : "average"} cost, earliest-expiry lot first. You may issue more than the bill of materials calls for; the extra shows up as a variance. Backflushed components are issued automatically when the last operation is confirmed.</div>
      </Panel>

      <Panel title="Operations">
        {ops.length === 0 ? <Empty>This item has no routing, so there are no operations. You can still confirm the units made.</Empty> : (
          <table>
            <thead><tr><th>Op</th><th>Work center</th><th style={{ textAlign: "right" }}>Planned hours / unit</th><th style={{ textAlign: "right" }}>Confirmed units</th><th style={{ textAlign: "right" }}>Labor h</th><th style={{ textAlign: "right" }}>Machine h</th><th style={{ textAlign: "right" }}>Setup h</th></tr></thead>
            <tbody>
              {ops.map((p) => (
                <tr key={p.id}>
                  <td>{p.op_no} {p.description}</td><td>{wcName(p.work_center_id)}</td>
                  <td style={{ textAlign: "right" }}>{qtyText((p.labor_min_per_unit ?? (p.machine_min_per_unit === null ? p.run_min_per_unit : 0)) / 60)} labor · {qtyText((p.machine_min_per_unit ?? 0) / 60)} machine</td>
                  <td style={{ textAlign: "right" }}>{qtyText(p.qty_confirmed)}</td>
                  <td style={{ textAlign: "right" }}>{qtyText(p.labor_h_actual)}</td><td style={{ textAlign: "right" }}>{qtyText(p.machine_h_actual)}</td><td style={{ textAlign: "right" }}>{qtyText(p.setup_h_actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {running && canEdit && <div className="mt-3"><GoldBtn onClick={() => { setCf({ ...cf, op_no: lastOp === null ? "" : String(ops[0]?.op_no ?? ""), yield_qty: "", is_final: false }); setConfirmModal(true); }}>Confirm production</GoldBtn></div>}
      </Panel>

      {(Number(o.qty_good) > 0 || Number(o.qty_received) > 0) && ["PARTIALLY_CONFIRMED", "CONFIRMED", "DELIVERED"].includes(o.status) && (
        <Panel title="Finished goods into stock">
          <div className="text-[13px]">{qtyText(waiting)} good unit{Number(waiting) === 1 ? "" : "s"} waiting to be received.</div>
          {waiting > 0 && canEdit && (
            <form onSubmit={receive} className="grid gap-x-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
              <div><Label>Quantity</Label><input className="input" type="number" min={0} step="any" value={fg.qty} onChange={(e) => setFg({ ...fg, qty: e.target.value })} placeholder={String(waiting)} /></div>
              <div><Label>Into</Label>
                <select className="input" value={fg.location_id} onChange={(e) => setFg({ ...fg, location_id: e.target.value })}>
                  <option value="">Usual finished-goods store</option>
                  {lk.locations.filter((l) => l.kind !== "WIP").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></div>
              {itemMaster?.batch_tracked && <><div><Label>Lot number</Label><input className="input" value={fg.batch_no} onChange={(e) => setFg({ ...fg, batch_no: e.target.value })} /></div>
                <div><Label>Expires</Label><input className="input" type="date" value={fg.expiry} onChange={(e) => setFg({ ...fg, expiry: e.target.value })} /></div></>}
              <div><Label>Date</Label><input className="input" type="date" value={fg.posting_date} onChange={(e) => setFg({ ...fg, posting_date: e.target.value })} /></div>
              <GoldBtn type="submit" disabled={busy} style={{ marginBottom: 1 }}>Receive into stock</GoldBtn>
            </form>
          )}
        </Panel>
      )}

      <Panel title="What this order has cost so far">
        {costs.length === 0 ? <Empty>Nothing has been posted to this order yet.</Empty> : (
          <div className="flex flex-col gap-2.5">
            {(["MATERIAL", "LABOR", "MACHINE", "VAR_OH", "FIX_OH"] as Element[]).filter((e) => Math.abs(byElement.get(e) ?? 0) > 0).map((e) => {
              const total = Array.from(byElement.entries()).filter(([k]) => k !== "RELIEF").reduce((s, [, v]) => s + v, 0);
              return (
                <div key={e} className="grid items-center gap-3" style={{ gridTemplateColumns: "150px 1fr 130px 60px" }}>
                  <div className="text-[13px]">{ELEMENT_LABEL[e]}</div>
                  <div className="h-2.5 rounded-full bg-[#1B2634] overflow-hidden"><div className="h-full rounded-full bg-teal" style={{ width: `${percentOf(byElement.get(e) ?? 0, total)}%` }} /></div>
                  <div className="text-right text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>{money(byElement.get(e))}</div>
                  <div className="text-right text-[12px] text-[#A3B1C2]">{percentOf(byElement.get(e) ?? 0, total)}%</div>
                </div>
              );
            })}
            <div className="text-[13px] border-t border-hairline pt-2 mt-1">Put into work in process: <b>{money(Array.from(byElement.entries()).filter(([k]) => k !== "RELIEF").reduce((s, [, v]) => s + v, 0))}</b>
              {byElement.get("RELIEF") ? <> · moved to finished goods: <b>{money(-(byElement.get("RELIEF") ?? 0))}</b></> : null} · still in process: <b className="text-gold">{money(wip)}</b></div>
            {(o.status === "DELIVERED" || o.status === "CONFIRMED") && Math.abs(wip) >= 0.01 && o.costing_method === "STANDARD" && (
              <div className="text-[12px] text-[#A3B1C2]">The {money(wip)} left in process is the difference between what the order really cost and the standard cost of the good units made. Settling it into variance accounts is the next step of production accounting.</div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="What was posted to the books">
        <PostingsPanel sourceIds={sources} reloadKey={tick} />
      </Panel>

      {confirmModal && (
        <Modal title="Confirm production" onClose={() => setConfirmModal(false)} wide>
          <form onSubmit={confirm}>
            {ops.length > 0 && (
              <><Label>Operation</Label>
                <select className="input" value={cf.op_no} onChange={(e) => setCf({ ...cf, op_no: e.target.value, is_final: Number(e.target.value) === lastOp ? cf.is_final : false })}>
                  {ops.map((p) => <option key={p.id} value={p.op_no}>{p.op_no} {p.description ?? wcName(p.work_center_id)}</option>)}
                </select></>
            )}
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Good units</Label><input className="input" type="number" min={0} step="any" value={cf.yield_qty} onChange={(e) => setCf({ ...cf, yield_qty: e.target.value })} /></div>
              <div><Label>Scrapped units</Label><input className="input" type="number" min={0} step="any" value={cf.scrap_qty} onChange={(e) => setCf({ ...cf, scrap_qty: e.target.value })} /></div>
            </div>
            {Number(cf.scrap_qty) > 0 && <><Label>Why were they scrapped?</Label><input className="input" value={cf.scrap_reason} onChange={(e) => setCf({ ...cf, scrap_reason: e.target.value })} /></>}
            <div className="grid grid-cols-3 gap-x-3">
              <div><Label>Labor hours</Label><input className="input" type="number" min={0} step="any" value={cf.labor_h} onChange={(e) => setCf({ ...cf, labor_h: e.target.value })} /></div>
              <div><Label>Machine hours</Label><input className="input" type="number" min={0} step="any" value={cf.machine_h} onChange={(e) => setCf({ ...cf, machine_h: e.target.value })} /></div>
              <div><Label>Setup hours</Label><input className="input" type="number" min={0} step="any" value={cf.setup_h} onChange={(e) => setCf({ ...cf, setup_h: e.target.value })} /></div>
            </div>
            {ops.length > 0 && <div className="mt-2"><OutlineBtn type="button" onClick={planHours}>Use the planned hours for these units</OutlineBtn></div>}
            <div className="grid grid-cols-2 gap-x-3 items-end">
              <div><Label>Date</Label><input className="input" type="date" value={cf.posting_date} onChange={(e) => setCf({ ...cf, posting_date: e.target.value })} /></div>
              {(ops.length === 0 || Number(cf.op_no) === lastOp) && <label className="flex items-center gap-2 text-[13px] pb-2.5"><input type="checkbox" checked={cf.is_final} onChange={(e) => setCf({ ...cf, is_final: e.target.checked })} /> This is the final confirmation</label>}
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">Hours are charged at the work center&rsquo;s planned rates, and overhead is added from the costing sheet. Good units are counted at the last operation. After the final confirmation no more production can be confirmed.</div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setConfirmModal(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post confirmation</GoldBtn>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "release" && <ConfirmDialog title="Release this order" confirmLabel="Release" busy={busy} onCancel={() => setDialog(null)}
        message="Releasing lets you issue material and confirm production. If the order costs more than your company's approval limit it will wait for your teacher."
        onConfirm={() => { setDialog(null); run(() => supabase.rpc("mfg_release_order", { p_order: id }), "Order sent for release."); }} />}
      {dialog === "approve" && <ConfirmDialog title="Approve and release" confirmLabel="Approve" busy={busy} onCancel={() => setDialog(null)}
        message={<>Approve <b>{o.document_number}</b> (target cost {money(planned)}) so the student can start production?</>}
        onConfirm={() => { setDialog(null); run(() => supabase.rpc("mfg_approve_order", { p_order: id }), "Order approved and released."); }} />}
      {dialog === "cancel" && <ConfirmDialog title="Cancel this order" danger confirmLabel="Cancel order" busy={busy} onCancel={() => setDialog(null)}
        message="Are you sure you want to cancel this order? Nothing has been posted to it yet."
        onConfirm={() => { setDialog(null); run(() => supabase.rpc("mfg_cancel_order", { p_order: id }), "Order cancelled."); }} />}
      <FormStyles />
    </>
  );
}
