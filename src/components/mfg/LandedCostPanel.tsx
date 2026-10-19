"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "../ui";
import ListReport, { Chip, type ListColumn } from "../ListReport";
import { RecordPaymentForm } from "../PaymentUI";
import ReverseModal from "./ReverseModal";
import { useLookups } from "./useLookups";
import VoucherBadge from "@/components/mfg/VoucherBadge";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { BASIS_LABEL, firstIssue, landedCostSchema, qtyText, reversedIds, spreadAmount } from "@/lib/mfgOps";

type Voucher = {
  id: string; document_number: string | null; vendor_ref: string; description: string | null; voucher_date: string; basis: string; amount: number; total: number;
  status: string; note: string | null; bill_id: string | null; vendors: { name: string } | null;
};
type Cand = {
  id: string; doc_id: string; item_id: string; qty_change: number; total_cost: number;
  mfg_material_documents: { document_number: string; doc_type: string; posting_date: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const newKey = (prefix: string) => `${prefix}-${Date.now()}`;

/** Landed cost: freight, customs and handling spread over the goods that arrived. */
export default function LandedCostPanel({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const { data: lk } = useLookups();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [paid, setPaid] = useState<Record<string, number>>({});
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [cands, setCands] = useState<Cand[]>([]);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("Freight");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState(plusDays(today(), 30));
  const [basis, setBasis] = useState("VALUE");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("12");
  const [picked, setPicked] = useState<Record<string, { weight: string; volume: string }>>({});

  const [paying, setPaying] = useState<Voucher | null>(null);
  const [voiding, setVoiding] = useState<Voucher | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [v, p, vd, dl, rv] = await Promise.all([
      supabase.from("mfg_landed_cost_vouchers").select("id, document_number, vendor_ref, description, voucher_date, basis, amount, total, status, note, bill_id, vendors(name)").eq("tenant_id", t).order("created_at", { ascending: false }),
      supabase.from("bill_payments").select("bill_id, amount").eq("tenant_id", t),
      supabase.from("vendors").select("id, name").eq("tenant_id", t).order("name"),
      supabase.from("mfg_material_doc_lines").select("id, doc_id, item_id, qty_change, total_cost, mfg_material_documents(document_number, doc_type, posting_date)").eq("tenant_id", t).gt("qty_change", 0).limit(400),
      supabase.from("mfg_material_documents").select("id, reversal_of").eq("tenant_id", t).eq("doc_type", "REV"),
    ]);
    const failed = [v, p, vd, dl, rv].find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);          // a failed query must never look like "nothing here"
    setVouchers((v.data as unknown as Voucher[]) ?? []);
    const sums: Record<string, number> = {};
    for (const r of (p.data as { bill_id: string; amount: number }[]) ?? []) sums[r.bill_id] = (sums[r.bill_id] ?? 0) + Number(r.amount);
    setPaid(sums);
    setVendors((vd.data as { id: string; name: string }[]) ?? []);
    const reversed = reversedIds(((rv.data as { id: string; reversal_of: string | null }[]) ?? []));
    setCands(((dl.data as unknown as Cand[]) ?? []).filter((c) => c.mfg_material_documents?.doc_type === "GR" && !reversed.has(c.doc_id))
      .sort((a, b) => (b.mfg_material_documents?.posting_date ?? "").localeCompare(a.mfg_material_documents?.posting_date ?? "")));       // newest receipts first
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, reloadKey]);

  const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const chosen = cands.filter((c) => picked[c.id]);
  const baseOf = useCallback((c: Cand) => {
    const p = picked[c.id];
    return basis === "VALUE" ? Number(c.total_cost) : basis === "QTY" ? Number(c.qty_change) : basis === "WEIGHT" ? Number(p?.weight) || 0 : Number(p?.volume) || 0;
  }, [basis, picked]);
  const shares = useMemo(() => spreadAmount(Number(amount) || 0, chosen.map(baseOf)), [amount, chosen, baseOf]);
  const tax = Math.round((Number(amount) || 0) * (Number(vat) || 0)) / 100;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = landedCostSchema.safeParse({
      vendor_id: vendorId, vendor_ref: ref, voucher_date: date, due_date: due, basis, amount, tax_rate: vat, description: desc,
      lines: chosen.map((c) => ({ doc_line_id: c.id, weight: picked[c.id]?.weight || "0", volume: picked[c.id]?.volume || "0" })),
    });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    const d = parsed.data;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_post_landed_cost", {
      p_vendor: d.vendor_id, p_ref: d.vendor_ref, p_date: d.voucher_date, p_due: d.due_date, p_basis: d.basis, p_amount: d.amount, p_tax_rate: d.tax_rate,
      p_description: d.description, p_lines: d.lines, p_key: newKey("lc"),
    }), { successMessage: "Landed cost posted and spread over the goods." });
    setBusy(false);
    if (ok(res)) { setOpen(false); setPicked({}); setRef(""); setAmount(""); await load(); onChanged(); }
  };

  const voidIt = async (reason: string, d: string) => {
    if (!voiding) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_void_landed_cost", { p_voucher: voiding.id, p_date: d, p_reason: reason }), { successMessage: "Landed cost voided." });
    setBusy(false);
    if (ok(res)) { setVoiding(null); await load(); onChanged(); }
  };

  const balance = (v: Voucher) => (v.status === "POSTED" ? Number(v.total) - (paid[v.bill_id ?? ""] ?? 0) : 0);
  const columns: ListColumn<Voucher>[] = [
    { key: "no", label: "Landed cost", value: (v) => v.document_number ?? "", width: 100 },
    { key: "ref", label: "Vendor's number", value: (v) => v.vendor_ref, width: 130 },
    { key: "vendor", label: "Vendor", value: (v) => v.vendors?.name ?? "—", filter: true, width: 150 },
    { key: "what", label: "What", value: (v) => v.description ?? "", width: 160 },
    { key: "date", label: "Date", value: (v) => v.voucher_date, width: 105 },
    { key: "basis", label: "Spread by", value: (v) => BASIS_LABEL[v.basis] ?? v.basis, width: 130 },
    { key: "amount", label: "Amount", value: (v) => Number(v.amount), align: "right", width: 120, render: (v) => money(v.amount) },
    { key: "bal", label: "Still owed", value: (v) => balance(v), align: "right", width: 120, render: (v) => (v.status === "POSTED" ? money(balance(v)) : "—") },
    { key: "status", label: "Status", value: (v) => (v.status === "VOID" ? "Voided" : "Posted"), filter: true, width: 100, render: (v) => <Chip label={v.status === "VOID" ? "Voided" : "Posted"} tone={v.status === "VOID" ? "muted" : "good"} /> },
    {
      key: "_a", label: "", width: 230, value: () => "",
      render: (v: Voucher) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          <VoucherBadge sourceId={v.id} />
          {!isTeacher && <>
          {v.status === "POSTED" && balance(v) > 0.004 && <TinyBtn onClick={() => setPaying(v)} disabled={busy}>Pay</TinyBtn>}
          {v.status === "POSTED" && (paid[v.bill_id ?? ""] ?? 0) === 0 && <TinyBtn onClick={() => setVoiding(v)} disabled={busy}>Void</TinyBtn>}
          </>}
        </span>
      ),
    } as ListColumn<Voucher>,
  ];

  return (
    <>
      <Panel title="Freight, customs and other landed cost">
        <div className="text-[12.5px] text-[#A3B1C2] mb-3 max-w-[760px]">
          Freight and customs are part of what the goods really cost. Enter the vendor&rsquo;s bill and choose the receipts it belongs to: the amount is spread over those lines by value, quantity, weight or volume.
          Under standard costing the stock stays at standard and the freight goes to Purchase Price Variance; under actual costing it raises the average cost of the stock still on hand.
        </div>
        <ListReport listKey="mfg-landed-costs" rows={vouchers} columns={columns} rowKey={(v) => v.id} exportName="landed-costs"
          emptyText="No landed costs yet."
          toolbar={!isTeacher ? <GoldBtn onClick={() => setOpen(true)}><Plus size={13} /> Add landed cost</GoldBtn> : undefined} />
      </Panel>

      {open && (
        <Modal title="Add landed cost" onClose={() => setOpen(false)} wide>
          <form onSubmit={post}>
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <div><Label>Vendor who billed it</Label>
                <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">Choose…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><Label>Vendor&rsquo;s invoice number</Label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
              <div><Label>What is it</Label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div><Label>Invoice date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Due</Label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><Label>Amount before VAT</Label><input className="input" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>VAT %</Label><input className="input" type="number" min={0} max={100} step="any" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
              <div><Label>Spread it by</Label>
                <select className="input" value={basis} onChange={(e) => setBasis(e.target.value)}>
                  {Object.entries(BASIS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
            </div>
            <Label>Which receipts is it for?</Label>
            <div className="overflow-x-auto" style={{ maxHeight: 280 }}>
              <table style={{ minWidth: 700 }}>
                <thead><tr><th /><th>Receipt</th><th>Item</th><th style={{ textAlign: "right" }}>Quantity</th><th style={{ textAlign: "right" }}>Value</th>{basis === "WEIGHT" && <th>Weight (kg)</th>}{basis === "VOLUME" && <th>Volume (m³)</th>}<th style={{ textAlign: "right" }}>Its share</th></tr></thead>
                <tbody>
                  {cands.length === 0 && <tr><td colSpan={7} className="text-[#7F8EA0]">No goods have been received yet.</td></tr>}
                  {cands.map((c) => {
                    const p = picked[c.id];
                    const idx = chosen.findIndex((x) => x.id === c.id);
                    return (
                      <tr key={c.id}>
                        <td><input type="checkbox" checked={!!p} aria-label={`Include ${itemName(c.item_id)} on ${c.mfg_material_documents?.document_number}`}
                          onChange={(e) => { const n = { ...picked }; if (e.target.checked) n[c.id] = { weight: "", volume: "" }; else delete n[c.id]; setPicked(n); }} /></td>
                        <td>{c.mfg_material_documents?.document_number} <span className="text-[#7F8EA0] text-[11.5px]">{c.mfg_material_documents?.posting_date}</span></td>
                        <td>{itemName(c.item_id)}</td>
                        <td style={{ textAlign: "right" }}>{qtyText(c.qty_change)}</td>
                        <td style={{ textAlign: "right" }}>{money(c.total_cost)}</td>
                        {basis === "WEIGHT" && <td>{p ? <input className="input" style={{ width: 90 }} type="number" min={0} step="any" value={p.weight} onChange={(e) => setPicked({ ...picked, [c.id]: { ...p, weight: e.target.value } })} aria-label="Weight" /> : ""}</td>}
                        {basis === "VOLUME" && <td>{p ? <input className="input" style={{ width: 90 }} type="number" min={0} step="any" value={p.volume} onChange={(e) => setPicked({ ...picked, [c.id]: { ...p, volume: e.target.value } })} aria-label="Volume" /> : ""}</td>}
                        <td style={{ textAlign: "right" }}>{p && idx >= 0 ? money(shares[idx] ?? 0) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[13px] mt-3">Amount {money(Number(amount) || 0)} + VAT {money(tax)} = <b>{money((Number(amount) || 0) + tax)}</b> owed to the vendor.</div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post landed cost</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      {paying && (
        <Modal title={`Pay ${paying.vendors?.name ?? "vendor"} — ${paying.document_number}`} onClose={() => setPaying(null)}>
          <RecordPaymentForm balance={balance(paying)} onSubmit={async (amt, d, method) => {
            const res = await mutate(supabase.rpc("record_bill_payment", { po_id: paying.bill_id, pay_amount: amt, pay_date: d, pay_method: method }), { successMessage: "Payment recorded." });
            if (ok(res)) { setPaying(null); await load(); onChanged(); }
          }} />
        </Modal>
      )}
      {voiding && (
        <ReverseModal title="Void this landed cost" verb="voiding" what={`${voiding.document_number} from ${voiding.vendors?.name ?? "the vendor"} (${voiding.vendor_ref}), ${money(voiding.total)}.`}
          explain="The landed cost stays on the record; an opposite entry takes it off payables and off the cost of the goods. Only an unpaid one can be voided."
          submitLabel="Void landed cost" busy={busy} onCancel={() => setVoiding(null)} onSubmit={voidIt} />
      )}
      <FormStyles />
    </>
  );
}
