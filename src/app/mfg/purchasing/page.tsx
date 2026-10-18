"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, ConfirmDialog, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import VendorInvoicePanel from "@/components/mfg/VendorInvoicePanel";
import LandedCostPanel from "@/components/mfg/LandedCostPanel";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { firstIssue, outstanding, poSchema, qtyText, receiptSchema } from "@/lib/mfgOps";

type PoLine = { id: string; description: string; qty: number; unit_cost: number; mfg_po_line_items: PoItem[] | PoItem | null };
type PoItem = { item_id: string; pur_qty: number | null; pur_uom: string | null; pur_price: number | null };
type Po = {
  id: string; document_number: string | null; order_date: string; expected_date: string | null; status: string; total: number;
  vendors: { name: string } | null; purchase_order_lines: PoLine[];
};
type Draft = { item_id: string; qty: string; unit_price: string; uom: string };

const today = () => new Date().toISOString().slice(0, 10);
const lineInfo = (l: PoLine): PoItem | undefined => (Array.isArray(l.mfg_po_line_items) ? l.mfg_po_line_items[0] : l.mfg_po_line_items) ?? undefined;
const lineItem = (l: PoLine) => lineInfo(l)?.item_id ?? "";

export default function PurchasingPage() {
  return <AppShell><PurchasingBody /></AppShell>;
}

function PurchasingBody() {
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const [pos, setPos] = useState<Po[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const [newPo, setNewPo] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expected, setExpected] = useState("");
  const [lines, setLines] = useState<Draft[]>([{ item_id: "", qty: "1", unit_price: "0", uom: "" }]);

  const [rcv, setRcv] = useState<Po | null>(null);
  const [rcvDate, setRcvDate] = useState(today());
  const [rcvLines, setRcvLines] = useState<Record<string, { qty: string; location_id: string; batch_no: string; expiry: string }>>({});
  const [deleting, setDeleting] = useState<Po | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [p, v, d] = await Promise.all([
      supabase.from("purchase_orders").select("*, vendors(name), purchase_order_lines(id, description, qty, unit_cost, mfg_po_line_items(item_id, pur_qty, pur_uom, pur_price))")
        .eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, name").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("mfg_material_doc_lines").select("po_line_id, qty_change").eq("tenant_id", effectiveTenantId).not("po_line_id", "is", null),
    ]);
    // only purchase orders raised through the Manufacturing screens carry an item link
    setPos(((p.data as unknown as Po[]) ?? []).filter((po) => po.purchase_order_lines?.some((l) => lineItem(l))));
    setVendors((v.data as { id: string; name: string }[]) ?? []);
    const sums: Record<string, number> = {};
    for (const r of (d.data as { po_line_id: string; qty_change: number }[]) ?? []) sums[r.po_line_id] = (sums[r.po_line_id] ?? 0) + Number(r.qty_change);
    setReceived(sums);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const stocked = useMemo(() => lk.items.filter((i) => i.active && i.item_type !== "SERVICE"), [lk.items]);
  const pct = (po: Po) => {
    const ordered = po.purchase_order_lines.reduce((s, l) => s + Number(l.qty), 0);
    const got = po.purchase_order_lines.reduce((s, l) => s + (received[l.id] ?? 0), 0);
    return ordered ? Math.round((got / ordered) * 100) : 0;
  };

  const createPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !effectiveTenantId) return;
    let vid = vendorId;
    if (!vid && newVendor.trim()) {
      const v = await mutate(supabase.from("vendors").insert({ tenant_id: effectiveTenantId, name: newVendor.trim() }).select("id").single());
      if (!ok(v)) return;
      vid = (v.data as { id: string }).id;
    }
    const parsed = poSchema.safeParse({ vendor_id: vid, order_date: orderDate, expected_date: expected, lines });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_po", { p_vendor: parsed.data.vendor_id, p_date: parsed.data.order_date, p_expected: parsed.data.expected_date, p_lines: parsed.data.lines }),
      { successMessage: "Purchase order created." });
    setBusy(false);
    if (ok(res)) { setNewPo(false); setVendorId(""); setNewVendor(""); setLines([{ item_id: "", qty: "1", unit_price: "0", uom: "" }]); await load(); }
  };

  const openReceive = (po: Po) => {
    setRcv(po); setRcvDate(today());
    setRcvLines(Object.fromEntries(po.purchase_order_lines.map((l) => [l.id, { qty: String(outstanding(Number(l.qty), received[l.id] ?? 0)), location_id: lk.quality[lineItem(l) ?? ""]?.receipt ? lk.locations.find((x) => x.kind === "QUARANTINE")?.id ?? "" : "", batch_no: "", expiry: "" }])));
  };

  const receive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rcv || busy) return;
    const parsed = receiptSchema.safeParse({ receipt_date: rcvDate, lines: rcv.purchase_order_lines.map((l) => ({ po_line_id: l.id, ...rcvLines[l.id] })) });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const key = `gr-${rcv.id}-${Date.now()}`;
    const res = await mutate(supabase.rpc("mfg_post_goods_receipt", { p_po: rcv.id, p_date: parsed.data.receipt_date, p_lines: parsed.data.lines.filter((l) => l.qty > 0), p_key: key }),
      { successMessage: "Goods received into stock." });
    setBusy(false);
    if (ok(res)) { setRcv(null); await load(); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_delete_po", { p_po: deleting.id }), { successMessage: "Purchase order deleted." });
    setBusy(false);
    if (ok(res)) { setDeleting(null); await load(); }
  };

  const columns: ListColumn<Po>[] = [
    { key: "no", label: "PO", value: (p) => p.document_number ?? "", width: 100 },
    { key: "vendor", label: "Vendor", value: (p) => p.vendors?.name ?? "—", width: 190, filter: true },
    { key: "date", label: "Ordered", value: (p) => p.order_date, width: 110 },
    { key: "exp", label: "Expected", value: (p) => p.expected_date ?? "", width: 110 },
    { key: "total", label: "Total", value: (p) => Number(p.total), align: "right", width: 130, render: (p) => money(p.total) },
    { key: "got", label: "Received", value: (p) => pct(p), align: "right", width: 100, render: (p) => `${pct(p)}%` },
    { key: "status", label: "Status", value: (p) => (p.status === "closed" ? "Fully received" : "Open"), filter: true, width: 130,
      render: (p) => <Chip label={p.status === "closed" ? "Fully received" : "Open"} tone={p.status === "closed" ? "good" : "warn"} /> },
    ...(readOnly ? [] : [{
      key: "_a", label: "", width: 110, value: () => "",
      render: (p: Po) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          {p.status !== "closed" && <TinyBtn onClick={() => openReceive(p)} aria-label={`Receive goods for ${p.document_number}`}><PackagePlus size={11} /> Receive</TinyBtn>}
          {p.purchase_order_lines.every((l) => !(received[l.id] ?? 0)) && <TinyBtn onClick={() => setDeleting(p)} aria-label={`Delete ${p.document_number}`}><Trash2 size={11} /></TinyBtn>}
        </span>
      ),
    } as ListColumn<Po>]),
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Purchasing</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          Order materials from a vendor, then receive them into stock. A receipt puts the goods in the store, owes the vendor on the GR/IR (goods received, invoice not yet received) account,
          and under standard costing records the difference between the price you paid and the standard cost as Purchase Price Variance. When the vendor&rsquo;s invoice arrives, enter it below: it is matched with the order and the receipt before you owe anything.
        </div>
      </div>

      <Panel title="Purchase orders">
        <ListReport listKey="mfg-pos" rows={pos} columns={columns} rowKey={(p) => p.id} exportName="purchase-orders"
          emptyText="No purchase orders yet. Create one for the materials you need."
          onRowClick={readOnly ? undefined : (p) => p.status !== "closed" && openReceive(p)}
          toolbar={!readOnly ? <GoldBtn onClick={() => setNewPo(true)}><Plus size={13} /> New purchase order</GoldBtn> : undefined} />
      </Panel>

      <VendorInvoicePanel reloadKey={tick} onChanged={() => setTick((n) => n + 1)} />
      <LandedCostPanel reloadKey={tick} onChanged={() => setTick((n) => n + 1)} />

      {newPo && (
        <Modal title="New purchase order" onClose={() => setNewPo(false)} wide>
          <form onSubmit={createPo}>
            <Label>Vendor</Label>
            <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">{vendors.length ? "Choose…" : "No vendors yet — add one below"}</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {!vendorId && <input className="input mt-2" placeholder="…or type a new vendor's name" value={newVendor} onChange={(e) => setNewVendor(e.target.value)} />}
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Order date</Label><input className="input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
              <div><Label>Expected on (optional)</Label><input className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
            </div>
            <Label>Lines</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 90px 90px 110px 30px" }}>
                <select className="input" value={l.item_id} aria-label={`Item on line ${i + 1}`}
                  onChange={(e) => { const it = lk.items.find((x) => x.item_id === e.target.value); setLines(lines.map((x, j) => j === i ? { ...x, item_id: e.target.value, uom: it?.purchase_uom ?? "", unit_price: it && !it.purchase_uom ? String(Number(it.planned_price) / (it.price_unit || 1)) : it ? "0" : x.unit_price } : x)); }}>
                  <option value="">Choose an item…</option>
                  {stocked.map((it) => <option key={it.item_id} value={it.item_id}>{it.sku} — {it.name} ({it.base_uom})</option>)}
                </select>
                <input className="input" type="number" min={0} step="any" placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                <select className="input" aria-label={`Unit on line ${i + 1}`} value={l.uom} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, uom: e.target.value } : x))}>
                  {(() => { const it = lk.items.find((x) => x.item_id === l.item_id); return (<><option value="">{it?.base_uom ?? "unit"}</option>{it?.purchase_uom && <option value={it.purchase_uom}>{it.purchase_uom}</option>}</>); })()}
                </select>
                <input className="input" type="number" min={0} step="any" placeholder="Price each" value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} />
                <TinyBtn type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}><Trash2 size={11} /></TinyBtn>
              </div>
            ))}
            <OutlineBtn type="button" onClick={() => setLines([...lines, { item_id: "", qty: "1", unit_price: "0", uom: "" }])}><Plus size={13} /> Add line</OutlineBtn>
            <div className="text-[13px] mt-3">Total: <b>{money(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0))}</b></div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setNewPo(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Create order</GoldBtn>
            </div>
          </form>
        </Modal>
      )}

      {rcv && (
        <Modal title={`Receive goods — ${rcv.document_number}`} onClose={() => setRcv(null)} wide>
          <form onSubmit={receive}>
            <div className="text-[12px] text-[#7F8EA0] mt-1">{rcv.vendors?.name}. Enter what actually arrived; you can receive an order in several deliveries.</div>
            <Label>Receipt date</Label>
            <input className="input" type="date" style={{ maxWidth: 200 }} value={rcvDate} onChange={(e) => setRcvDate(e.target.value)} />
            <div className="overflow-x-auto mt-3">
              <table style={{ minWidth: 640 }}>
                <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Ordered</th><th style={{ textAlign: "right" }}>Received</th><th>Now</th><th>Into</th><th>Lot / expiry</th></tr></thead>
                <tbody>
                  {rcv.purchase_order_lines.map((l) => {
                    const item = lk.items.find((i) => i.item_id === lineItem(l));
                    const got = received[l.id] ?? 0;
                    const st = rcvLines[l.id] ?? { qty: "0", location_id: "", batch_no: "", expiry: "" };
                    const set = (patch: Partial<typeof st>) => setRcvLines({ ...rcvLines, [l.id]: { ...st, ...patch } });
                    return (
                      <tr key={l.id}>
                        <td>{l.description}<div className="text-[11px] text-[#7F8EA0]">{money(l.unit_cost)} each{lineInfo(l)?.pur_uom ? ` · ordered as ${qtyText(lineInfo(l)?.pur_qty ?? 0)} ${lineInfo(l)?.pur_uom} at ${money(lineInfo(l)?.pur_price ?? 0)}` : ""}</div></td>
                        <td style={{ textAlign: "right" }}>{qtyText(l.qty)}</td><td style={{ textAlign: "right" }}>{qtyText(got)}</td>
                        <td><input className="input" style={{ width: 90 }} type="number" min={0} step="any" disabled={outstanding(Number(l.qty), got) === 0} value={st.qty} onChange={(e) => set({ qty: e.target.value })} aria-label={`Quantity received of ${l.description}`} /></td>
                        <td>
                          <select className="input" style={{ minWidth: 120 }} value={st.location_id} onChange={(e) => set({ location_id: e.target.value })}>
                            <option value="">{lk.quality[item?.item_id ?? ""]?.receipt ? "Quarantine is required" : "Usual store"}</option>
                            {lk.locations.filter((x) => x.kind !== "WIP").map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
                          </select>
                        </td>
                        <td>
                          {item?.batch_tracked ? (
                            <div className="flex gap-1"><input className="input" style={{ width: 90 }} placeholder="Lot no." value={st.batch_no} onChange={(e) => set({ batch_no: e.target.value })} />
                              <input className="input" style={{ width: 140 }} type="date" value={st.expiry} onChange={(e) => set({ expiry: e.target.value })} aria-label="Expiry date" /></div>
                          ) : <span className="text-[#7F8EA0] text-[12px]">not lot-tracked</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setRcv(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Receive into stock</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      {deleting && <ConfirmDialog title="Delete purchase order" danger busy={busy} confirmLabel="Delete" onConfirm={remove} onCancel={() => setDeleting(null)}
        message={<>Are you sure you want to delete <b>{deleting.document_number}</b>? Nothing has been received against it.</>} />}
      <FormStyles />
    </>
  );
}
