"use client";

import { useEffect, useState } from "react";
import { Plus, Check, Loader2, Truck, Receipt, Package } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "@/components/ui";
import { PaymentStatusPill, RecordPaymentForm, computePaymentStatus } from "@/components/PaymentUI";
import Attachments from "@/components/Attachments";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/types";
import LineItemForm from "@/components/LineItemForm";

const TEAL = "#12524F";

export default function ProcurementPage() {
  return <AppShell><ProcurementBody /></AppShell>;
}

function ProcurementBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [modal, setModal] = useState<null | "vendor" | "po">(null);
  const [openBill, setOpenBill] = useState<any | null>(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [v, p, bp] = await Promise.all([
      supabase.from("vendors").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("bill_payments").select("*").eq("tenant_id", effectiveTenantId),
    ]);
    setVendors(v.data ?? []);
    setPOs(p.data ?? []);
    setPayments(bp.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const paidFor = (poId: string) => payments.filter((p) => p.purchase_order_id === poId).reduce((s, p) => s + p.amount, 0);
  const totalOwed = pos.filter((p) => p.status === "received").reduce((s, p) => s + Math.max(0, p.total - paidFor(p.id)), 0);

  const receive = async (poId: string) => { await supabase.rpc("receive_purchase_order", { po_id: poId }); load(); };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <GoldBtn onClick={() => setModal("vendor")}><Plus size={14} /> New vendor</GoldBtn>
        <OutlineBtn onClick={() => setModal("po")} disabled={vendors.length === 0}><Plus size={14} /> New bill</OutlineBtn>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Truck size={16} />} label="Vendors" value={vendors.length} />
        <KpiCard icon={<Receipt size={16} />} label="Owed (A/P)" value={money(totalOwed)} accent={totalOwed > 0 ? "#A6402F" : TEAL} />
        <KpiCard icon={<Package size={16} />} label="Bills" value={pos.length} />
      </div>

      <Panel title="Vendors">
        {vendors.length === 0 ? <Empty>No vendors yet.</Empty> : (
          <table><thead><tr><th>Name</th><th>Contact</th></tr></thead>
            <tbody>{vendors.map((v) => <tr key={v.id}><td>{v.name}</td><td>{v.contact}</td></tr>)}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Bills">
        {pos.length === 0 ? <Empty>No bills yet.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Due</th><th>Vendor</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pos.map((p) => {
                const paid = paidFor(p.id);
                const status = computePaymentStatus(p.status, p.total, paid, p.due_date);
                return (
                  <tr key={p.id}>
                    <td>{p.order_date}</td><td>{p.due_date || "—"}</td><td>{p.vendors?.name}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(p.total)}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(Math.max(0, p.total - paid))}</td>
                    <td><PaymentStatusPill status={status} /></td>
                    <td>
                      {p.status === "draft" && <TinyBtn onClick={() => receive(p.id)}><Check size={12} /> Mark received</TinyBtn>}
                      {p.status === "received" && <TinyBtn onClick={() => setOpenBill(p)}>Details</TinyBtn>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {modal === "vendor" && (
        <Modal title="New vendor" onClose={() => setModal(null)}>
          <VendorForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "po" && (
        <Modal title="New bill" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Vendor" parties={vendors} priceLabel="Unit cost" dueDate
            onClose={() => setModal(null)}
            onSubmit={async (vendorId, date, lines, total, dueDate) => {
              const { data: po } = await supabase.from("purchase_orders").insert({ tenant_id: effectiveTenantId, vendor_id: vendorId, order_date: date, due_date: dueDate, total, status: "draft" }).select().single();
              if (po) await supabase.from("purchase_order_lines").insert(lines.map((l) => ({ purchase_order_id: po.id, description: l.desc, qty: l.qty, unit_cost: l.price })));
              setModal(null); load();
            }}
          />
        </Modal>
      )}
      {openBill && (
        <Modal title={`Bill — ${openBill.vendors?.name}`} onClose={() => setOpenBill(null)} wide>
          <BillDetail bill={openBill} paid={paidFor(openBill.id)} onPaid={() => { load(); setOpenBill(null); }} />
        </Modal>
      )}
    </>
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
          await supabase.rpc("record_bill_payment", { po_id: bill.id, pay_amount: amount, pay_date: date, pay_method: method });
          onPaid();
        }} />
      ) : (
        <div className="text-[13px] font-semibold" style={{ color: "#12524F" }}>Paid in full ✓</div>
      )}
      <Attachments relatedTable="purchase_orders" relatedId={bill.id} />
      <FormStyles />
    </div>
  );
}

function VendorForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [contact, setContact] = useState("");
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await supabase.from("vendors").insert({ tenant_id: effectiveTenantId, name, contact }); onClose(); onSaved(); }}>
      <Label>Vendor name</Label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Contact email</Label>
      <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
