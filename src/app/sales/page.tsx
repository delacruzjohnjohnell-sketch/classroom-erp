"use client";

import { useEffect, useState } from "react";
import { Plus, Check, Loader2, Users, ShoppingCart, Receipt } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "@/components/ui";
import { PaymentStatusPill, RecordPaymentForm, computePaymentStatus } from "@/components/PaymentUI";
import Attachments from "@/components/Attachments";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/types";
import LineItemForm from "@/components/LineItemForm";

const TEAL = "#12524F";

export default function SalesPage() {
  return <AppShell><SalesBody /></AppShell>;
}

function SalesBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [modal, setModal] = useState<null | "customer" | "so">(null);
  const [openInvoice, setOpenInvoice] = useState<any | null>(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [c, o, it, p] = await Promise.all([
      supabase.from("customers").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("sales_orders").select("*, customers(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("items").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("invoice_payments").select("*").eq("tenant_id", effectiveTenantId),
    ]);
    setCustomers(c.data ?? []);
    setOrders(o.data ?? []);
    setItems(it.data ?? []);
    setPayments(p.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const paidFor = (soId: string) => payments.filter((p) => p.sales_order_id === soId).reduce((s, p) => s + p.amount, 0);

  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const totalOutstanding = orders.filter((o) => o.status === "fulfilled").reduce((s, o) => s + Math.max(0, o.total - paidFor(o.id)), 0);
  const openOrders = orders.filter((o) => o.status !== "fulfilled").length;

  const fulfill = async (id: string) => { await supabase.rpc("fulfill_sales_order", { so_id: id }); load(); };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <GoldBtn onClick={() => setModal("customer")}><Plus size={14} /> New customer</GoldBtn>
        <OutlineBtn onClick={() => setModal("so")} disabled={customers.length === 0}><Plus size={14} /> New invoice</OutlineBtn>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Users size={16} />} label="Customers" value={customers.length} />
        <KpiCard icon={<ShoppingCart size={16} />} label="Total invoiced" value={money(totalSales)} accent={TEAL} />
        <KpiCard icon={<Receipt size={16} />} label="Outstanding (A/R)" value={money(totalOutstanding)} accent={totalOutstanding > 0 ? "#A6402F" : TEAL} />
        <KpiCard icon={<Receipt size={16} />} label="Draft invoices" value={openOrders} />
      </div>

      <Panel title="Customers">
        {customers.length === 0 ? <Empty>No customers yet.</Empty> : (
          <table><thead><tr><th>Name</th><th>Email</th></tr></thead>
            <tbody>{customers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td></tr>)}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Invoices">
        {orders.length === 0 ? <Empty>No invoices yet.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Due</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const paid = paidFor(o.id);
                const status = computePaymentStatus(o.status, o.total, paid, o.due_date);
                return (
                  <tr key={o.id}>
                    <td>{o.order_date}</td><td>{o.due_date || "—"}</td><td>{o.customers?.name}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.total)}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(Math.max(0, o.total - paid))}</td>
                    <td><PaymentStatusPill status={status} /></td>
                    <td className="flex gap-1.5">
                      {o.status === "draft" && <TinyBtn onClick={() => fulfill(o.id)}><Check size={12} /> Send invoice</TinyBtn>}
                      {o.status === "fulfilled" && <TinyBtn onClick={() => setOpenInvoice(o)}>Details</TinyBtn>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {modal === "customer" && (
        <Modal title="New customer" onClose={() => setModal(null)}>
          <CustomerForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "so" && (
        <Modal title="New invoice" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Customer" parties={customers} priceLabel="Unit price" itemOptions={items} dueDate
            onClose={() => setModal(null)}
            onSubmit={async (customerId, date, lines, total, dueDate) => {
              const { data: so } = await supabase.from("sales_orders").insert({ tenant_id: effectiveTenantId, customer_id: customerId, order_date: date, due_date: dueDate, total, status: "draft" }).select().single();
              if (so) await supabase.from("sales_order_lines").insert(lines.map((l) => ({ sales_order_id: so.id, item_id: l.item_id ?? null, description: l.desc, qty: l.qty, unit_price: l.price })));
              setModal(null); load();
            }}
          />
        </Modal>
      )}
      {openInvoice && (
        <Modal title={`Invoice — ${openInvoice.customers?.name}`} onClose={() => setOpenInvoice(null)} wide>
          <InvoiceDetail invoice={openInvoice} paid={paidFor(openInvoice.id)} onPaid={() => { load(); setOpenInvoice(null); }} />
        </Modal>
      )}
    </>
  );
}

function InvoiceDetail({ invoice, paid, onPaid }: { invoice: any; paid: number; onPaid: () => void }) {
  const balance = Math.max(0, invoice.total - paid);
  return (
    <div>
      <div className="text-[13px] text-[#6b6357] mb-3">
        Total {money(invoice.total)} · Paid {money(paid)} · Due {invoice.due_date || "on receipt"}
      </div>
      {balance > 0 ? (
        <RecordPaymentForm balance={balance} onSubmit={async (amount, date, method) => {
          await supabase.rpc("record_invoice_payment", { so_id: invoice.id, pay_amount: amount, pay_date: date, pay_method: method });
          onPaid();
        }} />
      ) : (
        <div className="text-[13px] font-semibold" style={{ color: "#12524F" }}>Paid in full ✓</div>
      )}
      <Attachments relatedTable="sales_orders" relatedId={invoice.id} />
      <FormStyles />
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await supabase.from("customers").insert({ tenant_id: effectiveTenantId, name, email }); onClose(); onSaved(); }}>
      <Label>Customer name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Email</Label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
