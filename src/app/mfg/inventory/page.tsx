"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, GoldBtn, TinyBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import PostingsPanel from "@/components/mfg/PostingsPanel";
import AvailabilityPanel from "@/components/mfg/AvailabilityPanel";
import LotsPanel from "@/components/mfg/LotsPanel";
import ReverseModal from "@/components/mfg/ReverseModal";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { money, unitMoney } from "@/lib/costing";
import { adjustmentSchema, canReverse, DOC_TYPE_LABEL, expiresSoon, firstIssue, qtyText, reversedIds, stockValue, transferSchema } from "@/lib/mfgOps";

type StockRow = { id: string; item_id: string; location_id: string; batch_id: string | null; qty: number; mfg_batches: { batch_no: string; expiry_date: string | null; received_on: string } | null };
type Doc = { id: string; document_number: string; doc_type: string; posting_date: string; memo: string | null; journal_entry_id: string | null; reference_type: string | null; reversal_of: string | null };

const TABS = [["stock", "Stock on hand"], ["position", "Availability"], ["lots", "Lots & expiry"], ["documents", "Stock documents"], ["move", "Adjust and transfer"]] as const;
const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <InventoryBody />
      </Suspense>
    </AppShell>
  );
}

function InventoryBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading, reload } = useLookups();
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "stock";

  const [stock, setStock] = useState<StockRow[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [method, setMethod] = useState("STANDARD");
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revDoc, setRevDoc] = useState<Doc | null>(null);
  const [adj, setAdj] = useState({ item_id: "", location_id: "", reason: "OPENING", qty_change: "", unit_cost: "", posting_date: today(), batch_no: "", expiry: "" });
  const [trf, setTrf] = useState({ item_id: "", from_id: "", to_id: "", qty: "", posting_date: today() });

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [s, d, m] = await Promise.all([
      supabase.from("mfg_stock").select("id, item_id, location_id, batch_id, qty, mfg_batches(batch_no, expiry_date, received_on)").eq("tenant_id", effectiveTenantId),
      supabase.from("mfg_material_documents").select("id, document_number, doc_type, posting_date, memo, journal_entry_id, reference_type, reversal_of").eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }).limit(200),
      supabase.from("mfg_company_settings").select("costing_method").eq("tenant_id", effectiveTenantId).maybeSingle(),
    ]);
    setStock((s.data as unknown as StockRow[]) ?? []);
    setDocs((d.data as Doc[]) ?? []);
    setMethod((m.data as { costing_method?: string } | null)?.costing_method ?? "STANDARD");
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const item = (id: string) => lk.items.find((i) => i.item_id === id);
  const loc = (id: string) => lk.locations.find((l) => l.id === id);
  const unit = (id: string) => Number(method === "STANDARD" ? item(id)?.standard_cost ?? 0 : item(id)?.moving_avg_cost ?? 0);
  const rows = stock;
  const reversedSet = useMemo(() => reversedIds(docs), [docs]);
  const stocked = useMemo(() => lk.items.filter((i) => i.active && i.item_type !== "SERVICE"), [lk.items]);
  const total = rows.reduce((s, r) => s + stockValue(Number(r.qty), unit(r.item_id)), 0);
  const selectedItem = item(adj.item_id);

  const columns: ListColumn<StockRow>[] = [
    { key: "sku", label: "SKU", value: (r) => item(r.item_id)?.sku ?? "", width: 100 },
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 190 },
    { key: "loc", label: "Location", value: (r) => loc(r.location_id)?.name ?? "—", filter: true, width: 170 },
    { key: "lot", label: "Lot", value: (r) => r.mfg_batches?.batch_no ?? "", width: 100 },
    { key: "exp", label: "Expires", value: (r) => r.mfg_batches?.expiry_date ?? "", width: 120,
      render: (r) => r.mfg_batches?.expiry_date ? (expiresSoon(r.mfg_batches.expiry_date, today()) ? <Chip label={r.mfg_batches.expiry_date} tone="bad" /> : r.mfg_batches.expiry_date) : "—" },
    { key: "qty", label: "On hand", value: (r) => Number(r.qty), align: "right", width: 110, render: (r) => `${qtyText(r.qty)} ${item(r.item_id)?.base_uom ?? ""}` },
    { key: "cost", label: method === "STANDARD" ? "Standard cost" : "Average cost", value: (r) => unit(r.item_id), align: "right", width: 130, render: (r) => unitMoney(unit(r.item_id)) },
    { key: "value", label: "Value", value: (r) => stockValue(Number(r.qty), unit(r.item_id)), align: "right", width: 130, render: (r) => money(stockValue(Number(r.qty), unit(r.item_id))) },
  ];
  const docCols: ListColumn<Doc>[] = [
    { key: "no", label: "Document", value: (d) => d.document_number, width: 110 },
    { key: "type", label: "Type", value: (d) => DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type, filter: true, width: 170 },
    { key: "date", label: "Date", value: (d) => d.posting_date, width: 110 },
    { key: "memo", label: "What", value: (d) => d.memo ?? "", width: 280 },
    { key: "books", label: "Books", value: (d) => (d.journal_entry_id ? "Posted" : "No entry"), width: 100 },
    { key: "rev", label: "", value: (d) => (reversedSet.has(d.id) ? "Reversed" : d.reversal_of ? "Reversal" : ""), width: 110,
      render: (d) => reversedSet.has(d.id) ? <span className="text-[#7F8EA0]">Reversed</span>
        : canReverse(d, reversedSet) && !readOnly ? <TinyBtn type="button" onClick={(e) => { e.stopPropagation(); setRevDoc(d); }}>Reverse</TinyBtn> : null },
  ];

  const doReverse = async (reason: string, date: string) => {
    if (!revDoc || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_reverse_document", { p_doc: revDoc.id, p_date: date, p_reason: reason }), { successMessage: "Reversed. The original stays on the record." });
    setBusy(false);
    if (ok(res)) { setRevDoc(null); await Promise.all([load(), reload()]); }
  };

  const doAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = adjustmentSchema.safeParse(adj);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_post_stock_adjustment", {
      p_item: parsed.data.item_id, p_location: parsed.data.location_id, p_qty_change: parsed.data.qty_change, p_unit_cost: parsed.data.unit_cost,
      p_reason: parsed.data.reason, p_date: parsed.data.posting_date, p_batch_no: parsed.data.batch_no, p_expiry: parsed.data.expiry, p_key: `adj-${Date.now()}`,
    }), { successMessage: "Stock adjusted and posted to the books." });
    setBusy(false);
    if (ok(res)) { setAdj({ ...adj, qty_change: "", unit_cost: "", batch_no: "", expiry: "" }); await Promise.all([load(), reload()]); }
  };
  const doTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = transferSchema.safeParse(trf);
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_transfer_stock", { p_item: parsed.data.item_id, p_from: parsed.data.from_id, p_to: parsed.data.to_id, p_qty: parsed.data.qty, p_date: parsed.data.posting_date, p_key: `trf-${Date.now()}` }),
      { successMessage: "Stock moved." });
    setBusy(false);
    if (ok(res)) { setTrf({ ...trf, qty: "" }); await load(); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Inventory</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          Every movement of stock is a document, and every document that changes what you own is posted to the books at the same moment. Documents can&rsquo;t be edited afterwards — a mistake is corrected with a new document.
        </div>
      </div>
      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/inventory?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "stock" && (
        <Panel title="Stock on hand">
          <ListReport listKey="mfg-stock" rows={rows} columns={columns} rowKey={(r) => r.id} exportName="stock" emptyText="No stock yet. Receive goods against a purchase order, or enter an opening balance under “Adjust and transfer”." />
          <div className="text-[13px] mt-3">Total value: <b className="text-gold">{money(total)}</b> <span className="text-[#7F8EA0]">({method === "STANDARD" ? "at standard cost" : "at moving average cost"})</span></div>
        </Panel>
      )}

      {tab === "position" && <AvailabilityPanel items={lk.items} />}
      {tab === "lots" && <LotsPanel items={lk.items} />}

      {tab === "documents" && (
        <Panel title="Stock documents">
          <ListReport listKey="mfg-docs" rows={docs} columns={docCols} rowKey={(d) => d.id} exportName="stock-documents" emptyText="No stock documents yet."
            onRowClick={(d) => setOpenDoc(openDoc === d.id ? null : d.id)} />
          {openDoc && <div className="mt-4"><div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1.5">What this document posted to the books</div><PostingsPanel sourceIds={[openDoc]} /></div>}
        </Panel>
      )}

      {revDoc && <ReverseModal title="Reverse a stock document" what={`You are reversing ${revDoc.document_number} (${DOC_TYPE_LABEL[revDoc.doc_type] ?? revDoc.doc_type}${revDoc.memo ? `: ${revDoc.memo}` : ""}).`} busy={busy} onCancel={() => setRevDoc(null)} onSubmit={doReverse} />}

      {tab === "move" && (readOnly ? <Panel title="Adjust and transfer"><Empty>Only the student can post stock documents.</Empty></Panel> : (
        <>
          <Panel title="Opening balance or stock count">
            <form onSubmit={doAdjust}>
              <div className="text-[12px] text-[#7F8EA0] mb-1">An <b>opening balance</b> brings stock you already had into the books (the other side goes to Owner&rsquo;s Equity). A <b>stock count</b> corrects the book quantity to what you counted; the difference goes to Inventory Count Differences.</div>
              <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                <div><Label>What</Label><select className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}><option value="OPENING">Opening balance</option><option value="COUNT">Stock count difference</option></select></div>
                <div><Label>Item</Label><select className="input" value={adj.item_id} onChange={(e) => setAdj({ ...adj, item_id: e.target.value })}><option value="">Choose…</option>{stocked.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}</select></div>
                <div><Label>Where</Label><select className="input" value={adj.location_id} onChange={(e) => setAdj({ ...adj, location_id: e.target.value })}><option value="">Choose…</option>{lk.locations.filter((l) => l.kind !== "WIP").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div><Label>Change in quantity {selectedItem ? `(${selectedItem.base_uom})` : ""}</Label><input className="input" type="number" step="any" placeholder={adj.reason === "COUNT" ? "e.g. -2 for two missing" : "e.g. 150"} value={adj.qty_change} onChange={(e) => setAdj({ ...adj, qty_change: e.target.value })} /></div>
                {method === "ACTUAL" && adj.reason === "OPENING" && <div><Label>Cost of one unit (₱)</Label><input className="input" type="number" min={0} step="any" value={adj.unit_cost} onChange={(e) => setAdj({ ...adj, unit_cost: e.target.value })} /></div>}
                <div><Label>Date</Label><input className="input" type="date" value={adj.posting_date} onChange={(e) => setAdj({ ...adj, posting_date: e.target.value })} /></div>
                {selectedItem?.batch_tracked && Number(adj.qty_change) > 0 && <><div><Label>Lot number</Label><input className="input" value={adj.batch_no} onChange={(e) => setAdj({ ...adj, batch_no: e.target.value })} /></div>
                  <div><Label>Expires</Label><input className="input" type="date" value={adj.expiry} onChange={(e) => setAdj({ ...adj, expiry: e.target.value })} /></div></>}
              </div>
              <div className="mt-3"><GoldBtn type="submit" disabled={busy}>Post adjustment</GoldBtn></div>
            </form>
          </Panel>
          <Panel title="Move stock between locations">
            <form onSubmit={doTransfer}>
              <div className="text-[12px] text-[#7F8EA0] mb-1">Moving stock changes where it is, not what you own, so nothing is posted to the books.</div>
              <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                <div><Label>Item</Label><select className="input" value={trf.item_id} onChange={(e) => setTrf({ ...trf, item_id: e.target.value })}><option value="">Choose…</option>{stocked.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}</select></div>
                <div><Label>From</Label><select className="input" value={trf.from_id} onChange={(e) => setTrf({ ...trf, from_id: e.target.value })}><option value="">Choose…</option>{lk.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div><Label>To</Label><select className="input" value={trf.to_id} onChange={(e) => setTrf({ ...trf, to_id: e.target.value })}><option value="">Choose…</option>{lk.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div><Label>Quantity</Label><input className="input" type="number" min={0} step="any" value={trf.qty} onChange={(e) => setTrf({ ...trf, qty: e.target.value })} /></div>
                <div><Label>Date</Label><input className="input" type="date" value={trf.posting_date} onChange={(e) => setTrf({ ...trf, posting_date: e.target.value })} /></div>
              </div>
              <div className="mt-3"><GoldBtn type="submit" disabled={busy}>Move stock</GoldBtn></div>
            </form>
          </Panel>
        </>
      ))}

      <FormStyles />
    </>
  );
}
