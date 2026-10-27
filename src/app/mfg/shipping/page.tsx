"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import PostingsPanel from "@/components/mfg/PostingsPanel";
import SalesInvoicesPanel from "@/components/mfg/SalesInvoicesPanel";
import ReverseModal from "@/components/mfg/ReverseModal";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { canReverse, deliverySchema, firstIssue, qtyText, remaining, reversedIds } from "@/lib/mfgOps";

type SO = { id: string; document_number: string | null; customer_id: string | null; order_date: string; status: string; total: number };
type Line = { id: string; sales_order_id: string; item_id: string | null; description: string; qty: number; unit_price: number };
type DocRow = { id: string; document_number: string; doc_type: string; posting_date: string; memo: string | null; reversal_of: string | null; reference_id: string | null };

const today = () => new Date().toISOString().slice(0, 10);
const newKey = (prefix: string) => `${prefix}-${Date.now()}`;
const plusDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export default function ShippingPage() {
  return <AppShell><ShippingBody /></AppShell>;
}

function ShippingBody() {
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const [orders, setOrders] = useState<SO[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const [invoiced, setInvoiced] = useState<Record<string, number>>({});
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState("");
  const [due, setDue] = useState(plusDays(today(), 30));
  const [invDate, setInvDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [revDoc, setRevDoc] = useState<DocRow | null>(null);
  const [showDoc, setShowDoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [o, c, d, i, m] = await Promise.all([
      supabase.from("sales_orders").select("id, document_number, customer_id, order_date, status, total").eq("tenant_id", t).in("status", ["confirmed", "invoiced"]).order("order_date", { ascending: false }),
      supabase.from("customers").select("id, name").eq("tenant_id", t),
      supabase.from("mfg_material_doc_lines").select("so_line_id, qty_change").eq("tenant_id", t).not("so_line_id", "is", null),
      supabase.from("mfg_invoice_links").select("so_line_id, qty, invoices(status)").eq("tenant_id", t),
      supabase.from("mfg_material_documents").select("id, document_number, doc_type, posting_date, memo, reversal_of, reference_id").eq("tenant_id", t).eq("reference_type", "sales_orders").order("created_at", { ascending: false }),
    ]);
    const so = (o.data as SO[]) ?? [];
    setOrders(so);
    setCustomers(Object.fromEntries(((c.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])));
    const dl: Record<string, number> = {};
    for (const r of (d.data as { so_line_id: string; qty_change: number }[]) ?? []) dl[r.so_line_id] = (dl[r.so_line_id] ?? 0) - Number(r.qty_change);
    setDelivered(dl);
    const iv: Record<string, number> = {};
    for (const r of (i.data as unknown as { so_line_id: string; qty: number; invoices: { status: string } | null }[]) ?? []) {
      if (r.invoices?.status !== "void") iv[r.so_line_id] = (iv[r.so_line_id] ?? 0) + Number(r.qty);
    }
    setInvoiced(iv);
    setDocs((m.data as DocRow[]) ?? []);
    if (so.length) {
      const l = await supabase.from("sales_order_lines").select("id, sales_order_id, item_id, description, qty, unit_price").in("sales_order_id", so.map((x) => x.id));
      setLines((l.data as Line[]) ?? []);
    } else setLines([]);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const reversedSet = useMemo(() => reversedIds(docs), [docs]);
  const linesOf = (soId: string) => lines.filter((l) => l.sales_order_id === soId);
  const totals = (soId: string) => {
    const ls = linesOf(soId).filter((l) => l.item_id);
    return {
      ordered: ls.reduce((s, l) => s + Number(l.qty), 0),
      sent: ls.reduce((s, l) => s + (delivered[l.id] ?? 0), 0),
      billed: ls.reduce((s, l) => s + (invoiced[l.id] ?? 0), 0),
    };
  };
  const so = orders.find((x) => x.id === open) ?? null;
  const itemName = (l: Line) => lk.items.find((i) => i.item_id === l.item_id)?.name ?? l.description;
  const soNumber = (id: string | null) => orders.find((x) => x.id === id)?.document_number ?? "";

  const openOrder = (id: string) => {
    setOpen(id);
    setQty(Object.fromEntries(linesOf(id).map((l) => [l.id, String(remaining(Number(l.qty), delivered[l.id] ?? 0))])));
  };

  const deliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!so || busy) return;
    const parsed = deliverySchema.safeParse({
      so_id: so.id, posting_date: date,
      lines: linesOf(so.id).filter((l) => l.item_id).map((l) => ({ so_line_id: l.id, qty: qty[l.id] ?? "0", location_id: from })),
    });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_post_delivery", {
      p_so: so.id, p_date: parsed.data.posting_date, p_lines: parsed.data.lines.filter((l) => l.qty > 0), p_key: newKey(`dlv-${so.id}`),
    }), { successMessage: "Delivery posted: stock out, cost of goods sold in." });
    setBusy(false);
    if (ok(res)) { await load(); setOpen(null); }
  };

  const invoice = async () => {
    if (!so || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_invoice_from_so", { p_so: so.id, p_due: due, p_date: invDate }), { successMessage: "Invoice created as a draft. Post it on the Sales page." });
    setBusy(false);
    if (ok(res)) { await load(); setOpen(null); }
  };

  const reverse = async (reason: string, d: string) => {
    if (!revDoc || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_reverse_document", { p_doc: revDoc.id, p_date: d, p_reason: reason }), { successMessage: "Delivery reversed. The original stays on the record." });
    setBusy(false);
    if (ok(res)) { setRevDoc(null); await load(); }
  };

  const orderCols: ListColumn<SO>[] = [
    { key: "no", label: "Sales order", value: (r) => r.document_number ?? "", width: 120 },
    { key: "cust", label: "Customer", value: (r) => (r.customer_id ? customers[r.customer_id] ?? "—" : "—"), width: 200 },
    { key: "date", label: "Date", value: (r) => r.order_date, width: 110 },
    { key: "ordered", label: "Ordered", value: (r) => totals(r.id).ordered, align: "right", width: 90, render: (r) => qtyText(totals(r.id).ordered) },
    { key: "sent", label: "Delivered", value: (r) => totals(r.id).sent, align: "right", width: 100, render: (r) => qtyText(totals(r.id).sent) },
    { key: "billed", label: "Invoiced", value: (r) => totals(r.id).billed, align: "right", width: 100, render: (r) => qtyText(totals(r.id).billed) },
    { key: "total", label: "Total", value: (r) => Number(r.total), align: "right", width: 120, render: (r) => money(r.total) },
    { key: "status", label: "Status", value: (r) => (r.status === "invoiced" ? "Fully invoiced" : "Open"), filter: true, width: 130,
      render: (r) => <Chip label={r.status === "invoiced" ? "Fully invoiced" : "Open"} tone={r.status === "invoiced" ? "good" : "warn"} /> },
  ];
  const docCols: ListColumn<DocRow>[] = [
    { key: "no", label: "Document", value: (r) => r.document_number, width: 110 },
    { key: "so", label: "Sales order", value: (r) => soNumber(r.reference_id), width: 120 },
    { key: "type", label: "Type", value: (r) => (r.doc_type === "REV" ? "Reversal" : "Delivery"), filter: true, width: 110 },
    { key: "date", label: "Date", value: (r) => r.posting_date, width: 110 },
    { key: "memo", label: "What", value: (r) => r.memo ?? "", width: 260 },
    { key: "rev", label: "", value: (r) => (reversedSet.has(r.id) ? "Reversed" : ""), width: 110,
      render: (r) => reversedSet.has(r.id) ? <span className="text-[#7F8EA0]">Reversed</span>
        : canReverse(r, reversedSet) && !readOnly ? <TinyBtn type="button" onClick={(e) => { e.stopPropagation(); setRevDoc(r); }}>Reverse</TinyBtn> : null },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  const canShip = !readOnly && so?.status === "confirmed";
  const sums = so ? totals(so.id) : { ordered: 0, sent: 0, billed: 0 };

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Shipping</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          Finished goods leave stock when you <b>deliver</b> them. The delivery posts the cost of goods sold. The <b>invoice</b> posts the sale, the amount the customer owes and the VAT. They are separate steps, so the cost is recorded once, when the goods move.
          {readOnly && " You are looking at a student’s orders."}
        </div>
      </div>

      <Panel title="Sales orders">
        <ListReport listKey="mfg-ship-orders" rows={orders} columns={orderCols} rowKey={(r) => r.id} exportName="sales-orders-to-ship" onRowClick={(r) => openOrder(r.id)}
          emptyText="No confirmed sales orders. Create a sales order on the Sales page and confirm it; it then appears here." />
      </Panel>

      <Panel title="Deliveries">
        <ListReport listKey="mfg-deliveries" rows={docs} columns={docCols} rowKey={(r) => r.id} exportName="deliveries" emptyText="Nothing has been delivered yet."
          onRowClick={(r) => setShowDoc(showDoc === r.id ? null : r.id)} />
        {showDoc && <div className="mt-4"><div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1.5">What this document posted to the books</div><PostingsPanel sourceIds={[showDoc]} /></div>}
      </Panel>

      <SalesInvoicesPanel reloadKey={orders.length + delivered.length} />

      {so && (
        <Modal title={`${so.document_number ?? "Sales order"} · ${so.customer_id ? customers[so.customer_id] ?? "" : ""}`} onClose={() => setOpen(null)} wide>
          <form onSubmit={deliver}>
            <div className="overflow-x-auto">
              <table style={{ minWidth: 640 }}>
                <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Ordered</th><th style={{ textAlign: "right" }}>Delivered</th><th style={{ textAlign: "right" }}>Invoiced</th>{canShip && <th>Deliver now</th>}</tr></thead>
                <tbody>
                  {linesOf(so.id).map((l) => {
                    const left = remaining(Number(l.qty), delivered[l.id] ?? 0);
                    return (
                      <tr key={l.id}>
                        <td>{itemName(l)}{!l.item_id && <div className="text-[11px] text-[#7F8EA0]">A service: nothing to ship, invoiced in full.</div>}</td>
                        <td style={{ textAlign: "right" }}>{money(l.unit_price)}</td>
                        <td style={{ textAlign: "right" }}>{qtyText(l.qty)}</td>
                        <td style={{ textAlign: "right" }}>{l.item_id ? qtyText(delivered[l.id] ?? 0) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{qtyText(invoiced[l.id] ?? 0)}</td>
                        {canShip && <td>{l.item_id && left > 0 ? <input className="input" style={{ width: 100 }} type="number" min={0} step="any" value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} aria-label={`Quantity of ${itemName(l)} to deliver`} /> : (l.item_id ? "All delivered" : "")}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canShip && (
              <div className="grid gap-x-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" }}>
                <div><Label>From</Label>
                  <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                    <option value="">Usual finished-goods store</option>
                    {lk.locations.filter((x) => x.kind !== "WIP").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select></div>
                <div><Label>Delivery date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><Label>Invoice date</Label><input className="input" type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} /></div>
                <div><Label>Invoice due</Label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              </div>
            )}
            <div className="text-[11.5px] text-[#7F8EA0] mt-3">Goods are taken from the store at the item&rsquo;s cost, earliest-expiry lot first. The invoice covers what has been delivered and not yet invoiced; post the draft invoice on the Sales page.</div>
            <div className="flex gap-2 justify-end mt-5 flex-wrap">
              <OutlineBtn type="button" onClick={() => setOpen(null)} disabled={busy}>Close</OutlineBtn>
              {canShip && sums.sent > sums.billed + 0.000001 && <OutlineBtn type="button" onClick={invoice} disabled={busy}>Create invoice for what was delivered</OutlineBtn>}
              {canShip && sums.sent < sums.ordered - 0.000001 && <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post delivery</GoldBtn>}
            </div>
          </form>
        </Modal>
      )}
      {revDoc && <ReverseModal title="Reverse a delivery" what={`You are reversing ${revDoc.document_number}${revDoc.memo ? ` (${revDoc.memo})` : ""}. The goods go back into stock and the cost of goods sold is reversed.`} busy={busy} onCancel={() => setRevDoc(null)} onSubmit={reverse} />}
      <FormStyles />
    </>
  );
}
