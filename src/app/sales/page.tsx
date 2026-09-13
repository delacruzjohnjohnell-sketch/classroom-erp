"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Plus, Check, Loader2, Users, ShoppingCart, Receipt, ArrowRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, TinyBtn, StatusPill, FormStyles } from "@/components/ui";
import { PaymentStatusPill, RecordPaymentForm, computePaymentStatus } from "@/components/PaymentUI";
import Attachments from "@/components/Attachments";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { money } from "@/lib/types";
import LineItemForm from "@/components/LineItemForm";

const TEAL = "#12524F";
const TABS = [
  { key: "customers", label: "Customers" },
  { key: "quotes", label: "Quotes" },
  { key: "orders", label: "Sales Orders" },
  { key: "invoices", label: "Invoices" },
] as const;
type Tab = typeof TABS[number]["key"];

export default function SalesPage() {
  return <AppShell><Suspense><SalesBody /></Suspense></AppShell>;
}

function SalesBody() {
  const { effectiveTenantId, profile } = useSession();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "invoices";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "invoices");
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);

  const [modal, setModal] = useState<null | "customer" | "quote" | "order" | "invoice">(null);
  const [openInvoice, setOpenInvoice] = useState<any | null>(null);
  const [convertingQuote, setConvertingQuote] = useState<any | null>(null);
  const [convertingOrder, setConvertingOrder] = useState<any | null>(null);
  const [postingInvoice, setPostingInvoice] = useState<any | null>(null);
  const [posting, setPosting] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [c, q, o, inv, it, p, t] = await Promise.all([
      supabase.from("customers").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("quotes").select("*, customers(name)").eq("tenant_id", effectiveTenantId).order("quote_date", { ascending: false }),
      supabase.from("sales_orders").select("*, customers(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("invoices").select("*, customers(name)").eq("tenant_id", effectiveTenantId).order("order_date", { ascending: false }),
      supabase.from("items").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("invoice_payments").select("*").eq("tenant_id", effectiveTenantId),
      supabase.from("tenants").select("approval_threshold").eq("id", effectiveTenantId).single(),
    ]);
    setCustomers(c.data ?? []);
    setQuotes(q.data ?? []);
    setOrders(o.data ?? []);
    setInvoices(inv.data ?? []);
    setItems(it.data ?? []);
    setPayments(p.data ?? []);
    setThreshold((t.data as any)?.approval_threshold ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const paidFor = (invId: string) => payments.filter((p) => p.invoice_id === invId).reduce((s, p) => s + p.amount, 0);
  const totalInvoiced = invoices.reduce((s, o) => s + o.total, 0);
  const totalOutstanding = invoices.filter((o) => o.status === "fulfilled").reduce((s, o) => s + Math.max(0, o.total - paidFor(o.id)), 0);
  const pendingCount = invoices.filter((o) => o.status === "pending_approval").length;

  const doPostInvoice = async (id: string) => {
    setPosting(true);
    const res = await mutate(supabase.rpc("post_invoice", { target_invoice_id: id }), { successMessage: "Invoice posted." });
    setPosting(false);
    if (ok(res)) setPostingInvoice(null);
    load();
  };
  const confirmOrder = async (id: string) => { await mutate(supabase.from("sales_orders").update({ status: "confirmed" }).eq("id", id)); load(); };
  const acceptQuote = async (id: string) => { await mutate(supabase.from("quotes").update({ status: "accepted" }).eq("id", id)); load(); };
  const declineQuote = async (id: string) => { await mutate(supabase.from("quotes").update({ status: "declined" }).eq("id", id)); load(); };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === t.key ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Users size={16} />} label="Customers" value={customers.length} />
        <KpiCard icon={<ShoppingCart size={16} />} label="Total invoiced" value={money(totalInvoiced)} accent={TEAL} />
        <KpiCard icon={<Receipt size={16} />} label="Outstanding (A/R)" value={money(totalOutstanding)} accent={totalOutstanding > 0 ? "#A6402F" : TEAL} />
        <KpiCard icon={<Receipt size={16} />} label="Pending approval" value={pendingCount} accent={pendingCount > 0 ? "#A6402F" : TEAL} />
      </div>

      {profile?.role === "teacher" && tab === "invoices" && (
        <Panel title="Approval threshold">
          <div className="flex items-center gap-3 flex-wrap text-[12.5px] text-[#6b6357]">
            <span>Invoices over this amount need your approval before they post. Leave blank for no limit.</span>
            <input className="input" type="number" style={{ width: 160 }} defaultValue={threshold ?? ""} placeholder="e.g. 50000"
              onBlur={async (e) => {
                const val = e.target.value ? parseFloat(e.target.value) : null;
                const res = await mutate(supabase.from("tenants").update({ approval_threshold: val }).eq("id", effectiveTenantId));
                if (ok(res)) setThreshold(val);
              }} />
          </div>
        </Panel>
      )}

      {tab === "customers" && (
        <>
          <div className="flex gap-2"><GoldBtn onClick={() => setModal("customer")}><Plus size={14} /> New customer</GoldBtn></div>
          <Panel title="Customers">
            {customers.length === 0 ? <Empty>No customers yet.</Empty> : (
              <table><thead><tr><th>Name</th><th>Email</th></tr></thead>
                <tbody>{customers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td></tr>)}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "quotes" && (
        <>
          <div className="flex gap-2"><OutlineBtn onClick={() => setModal("quote")} disabled={customers.length === 0}><Plus size={14} /> New quote</OutlineBtn></div>
          <Panel title="Quotes">
            {quotes.length === 0 ? <Empty>No quotes yet — informal, no accounting impact until converted.</Empty> : (
              <table>
                <thead><tr><th>Quote #</th><th>Date</th><th>Customer</th><th className="text-right">Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td style={{ color: "#C08A2E", fontWeight: 600 }}>{q.document_number}</td>
                      <td>{q.quote_date}</td><td>{q.customers?.name}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(q.total)}</td>
                      <td><StatusPill status={q.status} /></td>
                      <td className="flex gap-1.5">
                        {q.status === "draft" && <>
                          <TinyBtn onClick={() => acceptQuote(q.id)}><Check size={12} /> Accept</TinyBtn>
                          <button onClick={() => declineQuote(q.id)} className="text-[11px] text-[#8a8172]">Decline</button>
                        </>}
                        {q.status === "accepted" && <TinyBtn onClick={() => setConvertingQuote(q)}><ArrowRight size={12} /> Convert to Sales Order</TinyBtn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "orders" && (
        <>
          <div className="flex gap-2"><OutlineBtn onClick={() => setModal("order")} disabled={customers.length === 0}><Plus size={14} /> New sales order</OutlineBtn></div>
          <Panel title="Sales orders">
            {orders.length === 0 ? <Empty>No sales orders yet — a confirmed commitment, still no accounting impact until invoiced.</Empty> : (
              <table>
                <thead><tr><th>SO #</th><th>Date</th><th>Customer</th><th className="text-right">Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ color: "#C08A2E", fontWeight: 600 }}>{o.document_number}</td>
                      <td>{o.order_date}</td><td>{o.customers?.name}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.total)}</td>
                      <td><StatusPill status={o.status} /></td>
                      <td className="flex gap-1.5">
                        {o.status === "draft" && <TinyBtn onClick={() => confirmOrder(o.id)}><Check size={12} /> Confirm</TinyBtn>}
                        {o.status === "confirmed" && <TinyBtn onClick={() => setConvertingOrder(o)}><ArrowRight size={12} /> Convert to Invoice</TinyBtn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "invoices" && (
        <>
          <div className="flex gap-2"><OutlineBtn onClick={() => setModal("invoice")} disabled={customers.length === 0}><Plus size={14} /> New invoice</OutlineBtn></div>
          <Panel title="Invoices">
            {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
              <table>
                <thead><tr><th>Invoice #</th><th>Date</th><th>Due</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map((o) => {
                    const paid = paidFor(o.id);
                    const status = computePaymentStatus(o.status, o.total, paid, o.due_date);
                    return (
                      <tr key={o.id}>
                        <td style={{ color: "#C08A2E", fontWeight: 600 }}>{o.document_number}</td>
                        <td>{o.order_date}</td><td>{o.due_date || "—"}</td><td>{o.customers?.name}</td>
                        <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(o.total)}</td>
                        <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(Math.max(0, o.total - paid))}</td>
                        <td><PaymentStatusPill status={status} /></td>
                        <td className="flex gap-1.5">
                          {o.status === "draft" && <TinyBtn onClick={() => setPostingInvoice(o)}><Check size={12} /> Send invoice</TinyBtn>}
                          {o.status === "pending_approval" && profile?.role === "teacher" && <TinyBtn onClick={() => setPostingInvoice(o)}><Check size={12} /> Approve</TinyBtn>}
                          {o.status === "pending_approval" && profile?.role !== "teacher" && <span className="text-[11px] text-[#8a8172]">Awaiting teacher approval</span>}
                          {o.status === "fulfilled" && <TinyBtn onClick={() => setOpenInvoice(o)}>Details</TinyBtn>}
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

      {modal === "customer" && (
        <Modal title="New customer" onClose={() => setModal(null)}>
          <CustomerForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}

      {modal === "quote" && (
        <Modal title="New quote" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Customer" parties={customers} priceLabel="Unit price" itemOptions={items}
            onClose={() => setModal(null)}
            onSubmit={async (customerId, date, lines, total) => {
              const { data: q } = await mutate(supabase.from("quotes").insert({ tenant_id: effectiveTenantId, customer_id: customerId, quote_date: date, total, status: "draft" }).select().single());
              if (!q) return;
              const linesRes = await mutate(supabase.from("quote_lines").insert(lines.map((l) => ({ quote_id: q.id, item_id: l.item_id ?? null, description: l.desc, qty: l.qty, unit_price: l.price }))), { successMessage: "Quote saved." });
              if (ok(linesRes)) setModal(null);
              load();
            }}
          />
        </Modal>
      )}

      {modal === "order" && (
        <Modal title="New sales order" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Customer" parties={customers} priceLabel="Unit price" itemOptions={items}
            onClose={() => setModal(null)}
            onSubmit={async (customerId, date, lines, total) => {
              const { data: o } = await mutate(supabase.from("sales_orders").insert({ tenant_id: effectiveTenantId, customer_id: customerId, order_date: date, total, status: "draft" }).select().single());
              if (!o) return;
              const linesRes = await mutate(supabase.from("sales_order_lines").insert(lines.map((l) => ({ sales_order_id: o.id, item_id: l.item_id ?? null, description: l.desc, qty: l.qty, unit_price: l.price }))), { successMessage: "Sales order saved." });
              if (ok(linesRes)) setModal(null);
              load();
            }}
          />
        </Modal>
      )}

      {modal === "invoice" && (
        <Modal title="New invoice" onClose={() => setModal(null)} wide>
          <LineItemForm
            partyLabel="Customer" parties={customers} priceLabel="Unit price" itemOptions={items} dueDate
            onClose={() => setModal(null)}
            onSubmit={async (customerId, date, lines, total, dueDate) => {
              const { data: inv } = await mutate(supabase.from("invoices").insert({ tenant_id: effectiveTenantId, customer_id: customerId, order_date: date, due_date: dueDate, total, status: "draft" }).select().single());
              if (!inv) return;
              const linesRes = await mutate(supabase.from("invoice_lines").insert(lines.map((l) => ({ invoice_id: inv.id, item_id: l.item_id ?? null, description: l.desc, qty: l.qty, unit_price: l.price }))), { successMessage: "Invoice saved." });
              if (ok(linesRes)) setModal(null);
              load();
            }}
          />
        </Modal>
      )}

      {convertingQuote && (
        <Modal title={`Convert ${convertingQuote.document_number} to Sales Order`} onClose={() => setConvertingQuote(null)}>
          <ConvertForm label="Expected date (optional)" onClose={() => setConvertingQuote(null)}
            onSubmit={async (date) => {
              const res = await mutate(supabase.rpc("convert_quote_to_sales_order", { target_quote_id: convertingQuote.id, expected_date: date || null }), { successMessage: "Converted to sales order." });
              load();
              if (ok(res)) { setConvertingQuote(null); setTab("orders"); }
            }} />
        </Modal>
      )}

      {convertingOrder && (
        <Modal title={`Convert ${convertingOrder.document_number} to Invoice`} onClose={() => setConvertingOrder(null)}>
          <ConvertForm label="Invoice due date (optional)" onClose={() => setConvertingOrder(null)}
            onSubmit={async (date) => {
              const res = await mutate(supabase.rpc("convert_sales_order_to_invoice", { so_id: convertingOrder.id, due_date: date || null }), { successMessage: "Converted to invoice." });
              load();
              if (ok(res)) { setConvertingOrder(null); setTab("invoices"); }
            }} />
        </Modal>
      )}

      {openInvoice && (
        <Modal title={`Invoice ${openInvoice.document_number} — ${openInvoice.customers?.name}`} onClose={() => setOpenInvoice(null)} wide>
          <InvoiceDetail invoice={openInvoice} paid={paidFor(openInvoice.id)} onPaid={() => { load(); setOpenInvoice(null); }} />
        </Modal>
      )}

      {postingInvoice && (
        <ConfirmDialog
          title={postingInvoice.status === "pending_approval" ? "Approve invoice?" : "Send invoice?"}
          message={
            <>
              This posts a journal entry (Dr Accounts Receivable / Cr Revenue) for <strong>{money(postingInvoice.total)}</strong> and
              decrements inventory for the line items. It can&rsquo;t be undone from here.
            </>
          }
          confirmLabel={postingInvoice.status === "pending_approval" ? "Approve" : "Send invoice"}
          busy={posting}
          onCancel={() => setPostingInvoice(null)}
          onConfirm={() => doPostInvoice(postingInvoice.id)}
        />
      )}
    </>
  );
}

function ConvertForm({ label, onClose, onSubmit }: { label: string; onClose: () => void; onSubmit: (date: string) => void | Promise<void> }) {
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      try { await onSubmit(date); } finally { setSubmitting(false); }
    }}>
      <Label>{label}</Label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Converting…" : "Convert"}</button>
      <FormStyles />
    </form>
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
          const res = await mutate(supabase.rpc("record_invoice_payment", { so_id: invoice.id, pay_amount: amount, pay_date: date, pay_method: method }), { successMessage: "Payment recorded." });
          if (ok(res)) onPaid();
        }} />
      ) : (
        <div className="text-[13px] font-semibold" style={{ color: "#12524F" }}>Paid in full ✓</div>
      )}
      <Attachments relatedTable="invoices" relatedId={invoice.id} />
      <FormStyles />
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.from("customers").insert({ tenant_id: effectiveTenantId, name, email }), { successMessage: "Customer added." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Customer name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Email</Label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
      <FormStyles />
    </form>
  );
}
