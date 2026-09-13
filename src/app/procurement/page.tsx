"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Check, Loader2, Truck, Receipt, Package, ArrowRight, PackageCheck } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, TinyBtn, StatusPill, SearchBox, FormStyles } from "@/components/ui";
import { PaymentStatusPill, RecordPaymentForm, computePaymentStatus } from "@/components/PaymentUI";
import Attachments from "@/components/Attachments";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { money, todayStr } from "@/lib/types";
import LineItemForm from "@/components/LineItemForm";

const TEAL = "#12524F";
const TABS = [
  { key: "vendors", label: "Vendors" },
  { key: "orders", label: "Purchase Orders" },
  { key: "receipts", label: "Goods Receipts" },
  { key: "bills", label: "Bills" },
] as const;
type Tab = typeof TABS[number]["key"];

export default function ProcurementPage() {
  return <AppShell><Suspense><ProcurementBody /></Suspense></AppShell>;
}

function ProcurementBody() {
  const { effectiveTenantId, profile } = useSession();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "bills";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "bills");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);

  const [modal, setModal] = useState<null | "vendor" | "order" | "bill">(null);
  const [openBill, setOpenBill] = useState<any | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<any | null>(null);
  const [postingBill, setPostingBill] = useState<any | null>(null);
  const [posting, setPosting] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [v, o, r, b, bp, t] = await Promise.all([
      supabase.from("vendors").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("goods_receipts").select("*, purchase_orders(document_number, vendors(name))").eq("tenant_id", effectiveTenantId).order("receipt_date", { ascending: false }),
      supabase.from("bills").select("*, vendors(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("bill_payments").select("*").eq("tenant_id", effectiveTenantId),
      supabase.from("tenants").select("approval_threshold").eq("id", effectiveTenantId).single(),
    ]);
    setVendors(v.data ?? []);
    setOrders(o.data ?? []);
    setReceipts(r.data ?? []);
    setBills(b.data ?? []);
    setPayments(bp.data ?? []);
    setThreshold((t.data as any)?.approval_threshold ?? null);
    setLoading(false);
  };
  // load() sets state synchronously before its first await (fetch-on-mount) — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId]);

  const matches = (s: string | null | undefined) => (s ?? "").toLowerCase().includes(q.trim().toLowerCase());
  const vendorsF = vendors.filter((v) => !q || matches(v.name) || matches(v.contact));
  const ordersF = orders.filter((r) => !q || matches(r.document_number) || matches(r.vendors?.name));
  const receiptsF = receipts.filter((r) => !q || matches(r.document_number) || matches(r.purchase_orders?.document_number) || matches(r.purchase_orders?.vendors?.name));
  const billsF = bills.filter((r) => !q || matches(r.document_number) || matches(r.vendors?.name));

  const paidFor = (billId: string) => payments.filter((p) => p.bill_id === billId).reduce((s, p) => s + p.amount, 0);
  const totalOwed = bills.filter((b) => b.status === "received").reduce((s, b) => s + Math.max(0, b.total - paidFor(b.id)), 0);
  const pendingCount = bills.filter((b) => b.status === "pending_approval").length;

  const doPostBill = async (id: string) => {
    setPosting(true);
    const res = await mutate(supabase.rpc("post_bill", { target_bill_id: id }), { successMessage: "Bill posted." });
    setPosting(false);
    if (ok(res)) setPostingBill(null);
    load();
  };
  const sendOrder = async (id: string) => { await mutate(supabase.from("purchase_orders").update({ status: "sent" }).eq("id", id)); load(); };
  const createBillFromPO = async (poId: string) => {
    const res = await mutate(supabase.rpc("create_bill_from_po", { target_po_id: poId }), { successMessage: "Bill created from purchase order." });
    load();
    if (ok(res)) setTab("bills");
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setQ(""); }}
            className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === t.key ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Truck size={16} />} label="Vendors" value={vendors.length} />
        <KpiCard icon={<Receipt size={16} />} label="Owed (A/P)" value={money(totalOwed)} accent={totalOwed > 0 ? "#A6402F" : TEAL} />
        <KpiCard icon={<Package size={16} />} label="Bills" value={bills.length} />
        <KpiCard icon={<Receipt size={16} />} label="Pending approval" value={pendingCount} accent={pendingCount > 0 ? "#A6402F" : TEAL} />
      </div>

      {profile?.role === "teacher" && tab === "bills" && (
        <Panel title="Approval threshold">
          <div className="flex items-center gap-3 flex-wrap text-[12.5px] text-[#6b6357]">
            <span>Bills over this amount need your approval before they post. Leave blank for no limit.</span>
            <input className="input" type="number" style={{ width: 160 }} defaultValue={threshold ?? ""} placeholder="e.g. 50000"
              onBlur={async (e) => {
                const val = e.target.value ? parseFloat(e.target.value) : null;
                const res = await mutate(supabase.from("tenants").update({ approval_threshold: val }).eq("id", effectiveTenantId));
                if (ok(res)) setThreshold(val);
              }} />
          </div>
        </Panel>
      )}

      {tab === "vendors" && (
        <>
          <div className="flex gap-2 items-center justify-between flex-wrap">
            <GoldBtn onClick={() => setModal("vendor")}><Plus size={14} /> New vendor</GoldBtn>
            <SearchBox value={q} onChange={setQ} placeholder="Search vendors…" />
          </div>
          <Panel title="Vendors">
            {vendorsF.length === 0 ? <Empty>{vendors.length === 0 ? "No vendors yet." : "No vendors match your search."}</Empty> : (
              <table><thead><tr><th>Name</th><th>Contact</th></tr></thead>
                <tbody>{vendorsF.map((v) => <tr key={v.id}><td>{v.name}</td><td>{v.contact}</td></tr>)}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "orders" && (
        <>
          <div className="flex gap-2 items-center justify-between flex-wrap">
            <OutlineBtn onClick={() => setModal("order")} disabled={vendors.length === 0}><Plus size={14} /> New purchase order</OutlineBtn>
            <SearchBox value={q} onChange={setQ} placeholder="Search purchase orders…" />
          </div>
          <Panel title="Purchase orders">
            {ordersF.length === 0 ? <Empty>{orders.length === 0 ? "No purchase orders yet — no accounting impact until goods are received and billed." : "No purchase orders match your search."}</Empty> : (
              <table>
                <thead><tr><th>PO #</th><th>Date</th><th>Vendor</th><th className="text-right">Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {ordersF.map((o) => (
                    <tr key={o.id}>
                      <td style={{ color: "#C08A2E", fontWeight: 600 }}>{o.document_number}</td>
                      <td>{o.order_date}</td><td>{o.vendors?.name}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.total)}</td>
                      <td><StatusPill status={o.status} /></td>
                      <td className="flex gap-1.5">
                        {o.status === "draft" && <TinyBtn onClick={() => sendOrder(o.id)}><Check size={12} /> Send to vendor</TinyBtn>}
                        {o.status === "sent" && <>
                          <TinyBtn onClick={() => setReceivingOrder(o)}><PackageCheck size={12} /> Record receipt</TinyBtn>
                          <TinyBtn onClick={() => createBillFromPO(o.id)}><ArrowRight size={12} /> Create bill</TinyBtn>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "receipts" && (
        <>
          <div className="flex gap-2 items-center justify-end flex-wrap">
            <SearchBox value={q} onChange={setQ} placeholder="Search receipts…" />
          </div>
          <Panel title="Goods receipts">
          {receiptsF.length === 0 ? <Empty>{receipts.length === 0 ? "No goods receipts yet — record one from a sent Purchase Order to track partial deliveries." : "No receipts match your search."}</Empty> : (
            <table>
              <thead><tr><th>GR #</th><th>Date</th><th>Purchase order</th><th>Vendor</th><th>Notes</th></tr></thead>
              <tbody>
                {receiptsF.map((r) => (
                  <tr key={r.id}>
                    <td style={{ color: "#C08A2E", fontWeight: 600 }}>{r.document_number}</td>
                    <td>{r.receipt_date}</td><td>{r.purchase_orders?.document_number}</td>
                    <td>{r.purchase_orders?.vendors?.name}</td><td>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </Panel>
        </>
      )}

      {tab === "bills" && (
        <>
          <div className="flex gap-2 items-center justify-between flex-wrap">
            <OutlineBtn onClick={() => setModal("bill")} disabled={vendors.length === 0}><Plus size={14} /> New bill</OutlineBtn>
            <SearchBox value={q} onChange={setQ} placeholder="Search bills…" />
          </div>
          <Panel title="Bills">
            {billsF.length === 0 ? <Empty>{bills.length === 0 ? "No bills yet." : "No bills match your search."}</Empty> : (
              <table>
                <thead><tr><th>Bill #</th><th>Date</th><th>Due</th><th>Vendor</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {billsF.map((b) => {
                    const paid = paidFor(b.id);
                    const status = computePaymentStatus(b.status, b.total, paid, b.due_date);
                    return (
                      <tr key={b.id}>
                        <td style={{ color: "#C08A2E", fontWeight: 600 }}>{b.document_number}</td>
                        <td>{b.order_date}</td><td>{b.due_date || "—"}</td><td>{b.vendors?.name}</td>
                        <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.total)}</td>
                        <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(Math.max(0, b.total - paid))}</td>
                        <td><PaymentStatusPill status={status} /></td>
                        <td>
                          {b.status === "draft" && <TinyBtn onClick={() => setPostingBill(b)}><Check size={12} /> Mark received</TinyBtn>}
                          {b.status === "pending_approval" && profile?.role === "teacher" && <TinyBtn onClick={() => setPostingBill(b)}><Check size={12} /> Approve</TinyBtn>}
                          {b.status === "pending_approval" && profile?.role !== "teacher" && <span className="text-[11px] text-[#8a8172]">Awaiting teacher approval</span>}
                          {b.status === "received" && <TinyBtn onClick={() => setOpenBill(b)}>Details</TinyBtn>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {modal === "vendor" && (
        <Modal title="New vendor" onClose={() => setModal(null)}>
          <VendorForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}

      {modal === "order" && (
        <Modal title="New purchase order" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Vendor" parties={vendors} priceLabel="Unit cost"
            onClose={() => setModal(null)}
            onSubmit={async (vendorId, date, lines, total) => {
              const { data: po } = await mutate(supabase.from("purchase_orders").insert({ tenant_id: effectiveTenantId, vendor_id: vendorId, order_date: date, total, status: "draft" }).select().single());
              if (!po) return;
              const linesRes = await mutate(supabase.from("purchase_order_lines").insert(lines.map((l) => ({ purchase_order_id: po.id, description: l.desc, qty: l.qty, unit_cost: l.price }))), { successMessage: "Purchase order saved." });
              if (ok(linesRes)) setModal(null);
              load();
            }}
          />
        </Modal>
      )}

      {modal === "bill" && (
        <Modal title="New bill" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Vendor" parties={vendors} priceLabel="Unit cost" dueDate
            onClose={() => setModal(null)}
            onSubmit={async (vendorId, date, lines, total, dueDate) => {
              const { data: b } = await mutate(supabase.from("bills").insert({ tenant_id: effectiveTenantId, vendor_id: vendorId, order_date: date, due_date: dueDate, total, status: "draft" }).select().single());
              if (!b) return;
              const linesRes = await mutate(supabase.from("bill_lines").insert(lines.map((l) => ({ bill_id: b.id, description: l.desc, qty: l.qty, unit_cost: l.price }))), { successMessage: "Bill saved." });
              if (ok(linesRes)) setModal(null);
              load();
            }}
          />
        </Modal>
      )}

      {receivingOrder && (
        <Modal title={`Record receipt — ${receivingOrder.document_number}`} onClose={() => setReceivingOrder(null)} wide>
          <ReceiptForm order={receivingOrder} onClose={() => setReceivingOrder(null)} onSaved={load} />
        </Modal>
      )}

      {openBill && (
        <Modal title={`Bill ${openBill.document_number} — ${openBill.vendors?.name}`} onClose={() => setOpenBill(null)} wide>
          <BillDetail bill={openBill} paid={paidFor(openBill.id)} onPaid={() => { load(); setOpenBill(null); }} />
        </Modal>
      )}

      {postingBill && (
        <ConfirmDialog
          title={postingBill.status === "pending_approval" ? "Approve bill?" : "Mark bill received?"}
          message={
            <>
              This posts a journal entry (Dr Inventory or Expense / Cr Accounts Payable) for <strong>{money(postingBill.total)}</strong>.
              It can&rsquo;t be undone from here.
            </>
          }
          confirmLabel={postingBill.status === "pending_approval" ? "Approve" : "Mark received"}
          busy={posting}
          onCancel={() => setPostingBill(null)}
          onConfirm={() => doPostBill(postingBill.id)}
        />
      )}
    </>
  );
}

function ReceiptForm({ order, onClose, onSaved }: { order: any; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ description: string; qty_received: string }[]>([{ description: "", qty_received: "" }]);
  const [poLines, setPoLines] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await mutate(supabase.from("purchase_order_lines").select("*").eq("purchase_order_id", order.id));
      setPoLines(data ?? []);
      if (data && data.length > 0) setLines(data.map((l) => ({ description: l.description, qty_received: String(l.qty) })));
    })();
  }, [order.id]);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const { data: gr } = await mutate(supabase.from("goods_receipts").insert({ tenant_id: effectiveTenantId, purchase_order_id: order.id, receipt_date: todayStr(), notes }).select().single());
      if (!gr) { setSubmitting(false); return; }
      const validLines = lines.filter((l) => l.description && parseFloat(l.qty_received) > 0);
      const linesRes = await mutate(supabase.from("goods_receipt_lines").insert(validLines.map((l) => ({ goods_receipt_id: gr.id, description: l.description, qty_received: parseFloat(l.qty_received) }))), { successMessage: "Receipt recorded." });
      setSubmitting(false);
      if (ok(linesRes)) { onClose(); onSaved(); }
    }}>
      <div className="text-[12.5px] text-[#6b6357] mb-2">Confirm quantities actually received — edit if this is a partial delivery.</div>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 mb-2 items-center">
          <input className="input flex-[2]" value={l.description} onChange={(e) => setLines((prev) => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} placeholder="Item description" required />
          <input className="input flex-1" type="number" min="0" value={l.qty_received} onChange={(e) => setLines((prev) => prev.map((x, idx) => idx === i ? { ...x, qty_received: e.target.value } : x))} placeholder="Qty received" required />
        </div>
      ))}
      <Label>Notes (optional)</Label>
      <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivered by courier, 2 boxes damaged" />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save receipt"}</button>
      <FormStyles />
    </form>
  );
}

function BillDetail({ bill, paid, onPaid }: { bill: any; paid: number; onPaid: () => void }) {
  const balance = Math.max(0, bill.total - paid);
  return (
    <div>
      <div className="text-[13px] text-[#6b6357] mb-3">
        Total {money(bill.total)} · Paid {money(paid)} · Due {bill.due_date || "on receipt"}
      </div>
      {balance > 0 ? (
        <RecordPaymentForm balance={balance} onSubmit={async (amount, date, method) => {
          const res = await mutate(supabase.rpc("record_bill_payment", { po_id: bill.id, pay_amount: amount, pay_date: date, pay_method: method }), { successMessage: "Payment recorded." });
          if (ok(res)) onPaid();
        }} />
      ) : (
        <div className="text-[13px] font-semibold" style={{ color: "#12524F" }}>Paid in full ✓</div>
      )}
      <Attachments relatedTable="bills" relatedId={bill.id} />
      <FormStyles />
    </div>
  );
}

function VendorForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.from("vendors").insert({ tenant_id: effectiveTenantId, name, contact }), { successMessage: "Vendor added." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Vendor name</Label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Contact email</Label>
      <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
      <FormStyles />
    </form>
  );
}
