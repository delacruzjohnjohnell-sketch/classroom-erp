"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "../ui";
import ListReport, { Chip, type ListColumn } from "../ListReport";
import { RecordPaymentForm } from "../PaymentUI";
import ReverseModal from "./ReverseModal";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { firstIssue, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, matchLine, qtyText, vendorInvoiceSchema } from "@/lib/mfgOps";

type Invoice = {
  id: string; document_number: string | null; vendor_ref: string; invoice_date: string; due_date: string | null; status: string; total: number;
  tolerance_pct: number; hold_reason: string | null; note: string | null; bill_id: string | null; po_id: string;
  vendors: { name: string } | null; purchase_orders: { document_number: string | null } | null;
};
type PoOption = { id: string; document_number: string | null; vendors: { name: string } | null; purchase_order_lines: { id: string; mfg_po_line_items: unknown }[] };
type MatchRow = { po_line_id: string; description: string; ordered: number; received: number; invoiced: number; open_to_invoice: number; po_price: number };

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const newKey = (prefix: string) => `${prefix}-${Date.now()}`;

/** Vendor invoices: entered against a purchase order, matched with what was ordered and received, then posted to payables or held. */
export default function VendorInvoicePanel({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paid, setPaid] = useState<Record<string, number>>({});
  const [pos, setPos] = useState<PoOption[]>([]);
  const [tolerance, setTolerance] = useState(2);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [match, setMatch] = useState<MatchRow[]>([]);
  const [vals, setVals] = useState<Record<string, { qty: string; price: string }>>({});
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState(plusDays(today(), 30));
  const [vat, setVat] = useState("12");

  const [paying, setPaying] = useState<Invoice | null>(null);
  const [acting, setActing] = useState<null | { kind: "reject" | "void"; inv: Invoice }>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [i, p, o, s] = await Promise.all([
      supabase.from("mfg_vendor_invoices").select("id, document_number, vendor_ref, invoice_date, due_date, status, total, tolerance_pct, hold_reason, note, bill_id, po_id, vendors(name), purchase_orders(document_number)")
        .eq("tenant_id", t).order("created_at", { ascending: false }),
      supabase.from("bill_payments").select("bill_id, amount").eq("tenant_id", t),
      supabase.from("purchase_orders").select("id, document_number, vendors(name), purchase_order_lines(id, mfg_po_line_items(item_id))").eq("tenant_id", t).order("created_at", { ascending: false }),
      supabase.from("mfg_company_settings").select("match_tolerance_pct").eq("tenant_id", t).maybeSingle(),
    ]);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    const sums: Record<string, number> = {};
    for (const r of (p.data as { bill_id: string; amount: number }[]) ?? []) sums[r.bill_id] = (sums[r.bill_id] ?? 0) + Number(r.amount);
    setPaid(sums);
    const all = (o.data as unknown as PoOption[]) ?? [];
    setPos(all.filter((x) => x.purchase_order_lines?.some((l) => (Array.isArray(l.mfg_po_line_items) ? l.mfg_po_line_items.length : l.mfg_po_line_items) )));
    setTolerance(Number((s.data as { match_tolerance_pct?: number } | null)?.match_tolerance_pct ?? 2));
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, reloadKey]);

  const choosePo = async (id: string) => {
    setPoId(id);
    setMatch([]);
    if (!id) return;
    const res = await supabase.rpc("mfg_po_match", { p_po: id });
    const rows = (res.data as MatchRow[]) ?? [];
    setMatch(rows);
    setVals(Object.fromEntries(rows.map((r) => [r.po_line_id, { qty: String(Number(r.open_to_invoice)), price: String(Number(r.po_price)) }])));
  };

  const lineCalc = (r: MatchRow) => {
    const v = vals[r.po_line_id] ?? { qty: "0", price: "0" };
    const qty = Number(v.qty) || 0, price = Number(v.price) || 0;
    return { qty, price, amount: Math.round(qty * price * 100) / 100, m: matchLine(Number(r.open_to_invoice), qty, Number(r.po_price), price, tolerance) };
  };
  const subtotal = match.reduce((s, r) => s + lineCalc(r).amount, 0);
  const tax = Math.round(subtotal * (Number(vat) || 0)) / 100;
  const anyOut = match.some((r) => lineCalc(r).qty > 0 && !lineCalc(r).m.ok);

  const enter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = vendorInvoiceSchema.safeParse({
      po_id: poId, vendor_ref: ref, invoice_date: date, due_date: due, tax_rate: vat,
      lines: match.map((r) => ({ po_line_id: r.po_line_id, qty: vals[r.po_line_id]?.qty ?? "0", unit_price: vals[r.po_line_id]?.price ?? "0" })),
    });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    const d = parsed.data;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_post_vendor_invoice", {
      p_po: d.po_id, p_vendor_ref: d.vendor_ref, p_date: d.invoice_date, p_due: d.due_date, p_tax_rate: d.tax_rate,
      p_lines: d.lines.filter((l) => l.qty > 0), p_key: newKey(`vi-${d.po_id}`),
    }));
    setBusy(false);
    if (!ok(res)) return;
    const check = await supabase.from("mfg_vendor_invoices").select("status, hold_reason").eq("id", res.data as string).maybeSingle();
    const row = check.data as { status: string; hold_reason: string | null } | null;
    if (row?.status === "HELD") toast.error(`The invoice is on hold: ${row.hold_reason ?? "it does not match"}. Your teacher can release it, or you can reject it.`);
    else toast.success("Invoice matched and posted: what you owe the vendor is now in payables.");
    setOpen(false); setPoId(""); setMatch([]); setRef("");
    await load(); onChanged();
  };

  const act = async (reason: string, d: string) => {
    if (!acting) return;
    setBusy(true);
    const res = acting.kind === "reject"
      ? await mutate(supabase.rpc("mfg_reject_held_invoice", { p_inv: acting.inv.id, p_reason: reason }), { successMessage: "Invoice rejected." })
      : await mutate(supabase.rpc("mfg_void_vendor_invoice", { p_inv: acting.inv.id, p_date: d, p_reason: reason }), { successMessage: "Invoice voided. The books are back as they were." });
    setBusy(false);
    if (ok(res)) { setActing(null); await load(); onChanged(); }
  };
  const release = async (inv: Invoice) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_approve_held_invoice", { p_inv: inv.id }), { successMessage: "Invoice released and posted." });
    setBusy(false);
    if (ok(res)) { await load(); onChanged(); }
  };

  const balance = (v: Invoice) => (v.status === "POSTED" ? Number(v.total) - (paid[v.bill_id ?? ""] ?? 0) : 0);
  const columns: ListColumn<Invoice>[] = useMemo(() => [
    { key: "no", label: "Invoice", value: (v) => v.document_number ?? "", width: 90 },
    { key: "ref", label: "Vendor's number", value: (v) => v.vendor_ref, width: 130 },
    { key: "vendor", label: "Vendor", value: (v) => v.vendors?.name ?? "—", filter: true, width: 160 },
    { key: "po", label: "Order", value: (v) => v.purchase_orders?.document_number ?? "", width: 90 },
    { key: "date", label: "Date", value: (v) => v.invoice_date, width: 105 },
    { key: "due", label: "Due", value: (v) => v.due_date ?? "", width: 105, defaultHidden: true },
    { key: "total", label: "Total", value: (v) => Number(v.total), align: "right", width: 120, render: (v) => money(v.total) },
    { key: "bal", label: "Still owed", value: (v) => balance(v), align: "right", width: 120, render: (v) => (v.status === "POSTED" ? money(balance(v)) : "—") },
    { key: "status", label: "Status", value: (v) => INVOICE_STATUS_LABEL[v.status] ?? v.status, filter: true, width: 110,
      render: (v) => <Chip label={INVOICE_STATUS_LABEL[v.status] ?? v.status} tone={INVOICE_STATUS_TONE[v.status] ?? "muted"} /> },
    { key: "why", label: "Why", value: (v) => (v.status === "HELD" ? v.hold_reason ?? "" : v.note ?? ""), width: 340 },
    { key: "_a", label: "", width: 190, value: () => "",
      render: (v) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          {v.status === "HELD" && isTeacher && <TinyBtn onClick={() => release(v)} disabled={busy}>Release</TinyBtn>}
          {v.status === "HELD" && !isTeacher && <TinyBtn onClick={() => setActing({ kind: "reject", inv: v })} disabled={busy}>Reject</TinyBtn>}
          {v.status === "POSTED" && !isTeacher && balance(v) > 0.004 && <TinyBtn onClick={() => setPaying(v)} disabled={busy}>Pay</TinyBtn>}
          {v.status === "POSTED" && !isTeacher && (paid[v.bill_id ?? ""] ?? 0) === 0 && <TinyBtn onClick={() => setActing({ kind: "void", inv: v })} disabled={busy}>Void</TinyBtn>}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [paid, isTeacher, busy]);

  return (
    <>
      <Panel title="Vendor invoices">
        <div className="text-[12.5px] text-[#A3B1C2] mb-3 max-w-[760px]">
          The vendor&rsquo;s bill is matched three ways: what you <b>ordered</b>, what <b>arrived</b>, and what the invoice <b>charges</b>. If it agrees within {tolerance}%, it clears GR/IR and you owe the vendor. If not, it is put on hold for your teacher. Pay it from here once posted.
        </div>
        <ListReport listKey="mfg-vendor-invoices" rows={invoices} columns={columns} rowKey={(v) => v.id} exportName="vendor-invoices"
          emptyText="No vendor invoices yet. Receive goods, then enter the invoice the vendor sends."
          toolbar={!isTeacher ? <GoldBtn onClick={() => { setOpen(true); setPoId(""); setMatch([]); }}><Plus size={13} /> Enter vendor invoice</GoldBtn> : undefined} />
      </Panel>

      {open && (
        <Modal title="Enter a vendor invoice" onClose={() => setOpen(false)} wide>
          <form onSubmit={enter}>
            <Label>Purchase order</Label>
            <select className="input" value={poId} onChange={(e) => choosePo(e.target.value)}>
              <option value="">Choose…</option>
              {pos.map((p) => <option key={p.id} value={p.id}>{p.document_number} — {p.vendors?.name ?? ""}</option>)}
            </select>
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div><Label>Vendor&rsquo;s invoice number</Label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
              <div><Label>Invoice date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Due</Label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><Label>VAT %</Label><input className="input" type="number" min={0} max={100} step="any" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
            </div>
            {match.length > 0 && (
              <div className="overflow-x-auto mt-3">
                <table style={{ minWidth: 760 }}>
                  <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Ordered</th><th style={{ textAlign: "right" }}>Received</th><th style={{ textAlign: "right" }}>Already invoiced</th><th style={{ textAlign: "right" }}>Order price</th><th>Billed qty</th><th>Billed price</th><th>Match</th></tr></thead>
                  <tbody>
                    {match.map((r) => {
                      const c = lineCalc(r);
                      const v = vals[r.po_line_id] ?? { qty: "0", price: "0" };
                      return (
                        <tr key={r.po_line_id}>
                          <td>{r.description}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.ordered)}</td><td style={{ textAlign: "right" }}>{qtyText(r.received)}</td><td style={{ textAlign: "right" }}>{qtyText(r.invoiced)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.po_price)}</td>
                          <td><input className="input" style={{ width: 90 }} type="number" min={0} step="any" value={v.qty} onChange={(e) => setVals({ ...vals, [r.po_line_id]: { ...v, qty: e.target.value } })} aria-label={`Quantity billed of ${r.description}`} /></td>
                          <td><input className="input" style={{ width: 100 }} type="number" min={0} step="any" value={v.price} onChange={(e) => setVals({ ...vals, [r.po_line_id]: { ...v, price: e.target.value } })} aria-label={`Price billed of ${r.description}`} /></td>
                          <td>
                            {c.qty <= 0 ? <span className="text-[#7F8EA0] text-[12px]">not billed</span>
                              : c.m.ok ? <Chip label="Matches" tone="good" />
                              : <span title={`Quantity ${c.m.qtyPct}% over what is open; price ${c.m.pricePct}% from the order`}><Chip label={c.m.qtyPct > tolerance ? `Qty +${c.m.qtyPct}%` : `Price ${c.m.pricePct > 0 ? "+" : ""}${c.m.pricePct}%`} tone="bad" /></span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {poId && match.length === 0 && <div className="text-[12.5px] text-[#7F8EA0] mt-3">Loading the order…</div>}
            {match.length > 0 && (
              <div className="text-[13px] mt-3">
                Subtotal {money(subtotal)} + VAT {money(tax)} = <b>{money(subtotal + tax)}</b>
                {anyOut && <div className="text-[12px] mt-1" style={{ color: "#FF6B7A" }}>Something is outside the {tolerance}% tolerance, so this invoice will be put on hold for your teacher.</div>}
              </div>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy || match.length === 0}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Match and post</GoldBtn>
            </div>
          </form>
        </Modal>
      )}

      {paying && (
        <Modal title={`Pay ${paying.vendors?.name ?? "vendor"} — ${paying.document_number}`} onClose={() => setPaying(null)}>
          <RecordPaymentForm balance={balance(paying)} onSubmit={async (amount, d, method) => {
            const res = await mutate(supabase.rpc("record_bill_payment", { po_id: paying.bill_id, pay_amount: amount, pay_date: d, pay_method: method }), { successMessage: "Payment recorded." });
            if (ok(res)) { setPaying(null); await load(); onChanged(); }
          }} />
        </Modal>
      )}
      {acting && (
        <ReverseModal
          title={acting.kind === "reject" ? "Reject this invoice" : "Void this invoice"}
          verb={acting.kind === "reject" ? "rejecting" : "voiding"}
          what={`${acting.inv.document_number} from ${acting.inv.vendors?.name ?? "the vendor"} (${acting.inv.vendor_ref}), ${money(acting.inv.total)}.`}
          explain={acting.kind === "reject" ? "Nothing was posted for an invoice on hold, so nothing is reversed. It stays on record as rejected." : "The invoice and its entry stay on the record; an opposite entry takes what you owe off payables and puts the goods back to received-not-invoiced. Only an unpaid invoice can be voided."}
          submitLabel={acting.kind === "reject" ? "Reject invoice" : "Void invoice"}
          busy={busy} onCancel={() => setActing(null)} onSubmit={act} />
      )}
      <FormStyles />
    </>
  );
}
