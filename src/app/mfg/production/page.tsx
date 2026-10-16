"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { firstIssue, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, orderSchema, qtyText } from "@/lib/mfgOps";

type Order = {
  id: string; document_number: string | null; item_id: string; qty_planned: number; qty_good: number; qty_scrap: number; qty_received: number;
  status: string; planned_start: string; planned_end: string | null; planned_cost: number;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function ProductionPage() {
  return <AppShell><ProductionBody /></AppShell>;
}

function ProductionBody() {
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const [orders, setOrders] = useState<Order[]>([]);
  const [wip, setWip] = useState<Record<string, number>>({});
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ item_id: "", qty: "1", planned_start: today(), planned_end: "", backflush: false });

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [o, c] = await Promise.all([
      supabase.from("mfg_production_orders").select("id, document_number, item_id, qty_planned, qty_good, qty_scrap, qty_received, status, planned_start, planned_end, planned_cost")
        .eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }),
      supabase.from("mfg_order_costs").select("order_id, amount").eq("tenant_id", effectiveTenantId),
    ]);
    setOrders((o.data as Order[]) ?? []);
    const sums: Record<string, number> = {};
    for (const r of (c.data as { order_id: string; amount: number }[]) ?? []) sums[r.order_id] = (sums[r.order_id] ?? 0) + Number(r.amount);
    setWip(sums);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const makeItems = useMemo(() => lk.items.filter((i) => i.make_or_buy === "MAKE" && i.active), [lk.items]);
  const name = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = orderSchema.safeParse(form);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_order", {
      p_item: parsed.data.item_id, p_qty: parsed.data.qty, p_start: parsed.data.planned_start, p_end: parsed.data.planned_end, p_backflush: parsed.data.backflush,
    }), { successMessage: "Production order created." });
    setBusy(false);
    if (ok(res)) { setModal(false); router.push(`/mfg/production/${res.data as string}`); }
  };

  const columns: ListColumn<Order>[] = [
    { key: "no", label: "Order", value: (o) => o.document_number ?? "", width: 100 },
    { key: "item", label: "Item", value: (o) => name(o.item_id), width: 200 },
    { key: "plan", label: "Planned", value: (o) => Number(o.qty_planned), align: "right", width: 90, render: (o) => qtyText(o.qty_planned) },
    { key: "good", label: "Good", value: (o) => Number(o.qty_good), align: "right", width: 80, render: (o) => qtyText(o.qty_good) },
    { key: "scrap", label: "Scrap", value: (o) => Number(o.qty_scrap), align: "right", width: 80, render: (o) => qtyText(o.qty_scrap) },
    { key: "in", label: "In stock", value: (o) => Number(o.qty_received), align: "right", width: 90, render: (o) => qtyText(o.qty_received) },
    { key: "status", label: "Status", value: (o) => ORDER_STATUS_LABEL[o.status] ?? o.status, filter: true, width: 170, render: (o) => <Chip label={ORDER_STATUS_LABEL[o.status] ?? o.status} tone={ORDER_STATUS_TONE[o.status] ?? "muted"} /> },
    { key: "start", label: "Starts", value: (o) => o.planned_start, width: 110 },
    { key: "end", label: "Finishes", value: (o) => o.planned_end ?? "", width: 110, defaultHidden: true },
    { key: "target", label: "Target cost", value: (o) => Number(o.planned_cost), align: "right", width: 130, render: (o) => money(o.planned_cost), defaultHidden: true },
    { key: "wip", label: "In process now", value: (o) => wip[o.id] ?? 0, align: "right", width: 140, render: (o) => money(wip[o.id] ?? 0) },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Production</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          A production order turns materials into finished goods. Issue the materials, confirm the work and the hours, then receive the good units into stock; each step posts to work in process, and whatever is left over when it is done is the variance.
          {readOnly && " You are looking at a student’s orders."}
        </div>
      </div>
      <Panel title="Production orders">
        <ListReport listKey="mfg-orders" rows={orders} columns={columns} rowKey={(o) => o.id} exportName="production-orders"
          emptyText="No production orders yet. You need an active bill of materials and a released standard cost for the item."
          onRowClick={(o) => router.push(`/mfg/production/${o.id}`)}
          toolbar={!readOnly ? <GoldBtn onClick={() => setModal(true)}><Plus size={13} /> New production order</GoldBtn> : undefined} />
      </Panel>
      {modal && (
        <Modal title="New production order" onClose={() => setModal(false)} wide>
          <form onSubmit={create}>
            <Label>Item to make</Label>
            <select className="input" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Choose…</option>
              {makeItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-x-3">
              <div><Label>Quantity</Label><input className="input" type="number" min={0} step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></div>
              <div><Label>Starts</Label><input className="input" type="date" value={form.planned_start} onChange={(e) => setForm({ ...form, planned_start: e.target.value })} /></div>
              <div><Label>Finishes (optional)</Label><input className="input" type="date" value={form.planned_end} onChange={(e) => setForm({ ...form, planned_end: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-[13px] mt-3.5"><input type="checkbox" checked={form.backflush} onChange={(e) => setForm({ ...form, backflush: e.target.checked })} /> Backflush materials (take them out of stock automatically when the work is confirmed)</label>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">The order copies the active bill of materials and routing on the start date, and the item&rsquo;s standard cost, so later changes don&rsquo;t move an order that has started.</div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setModal(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Create order</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      <FormStyles />
    </>
  );
}
