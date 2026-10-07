"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Loader2, Package, Wallet, AlertTriangle, Upload, Pencil, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, SearchBox, FormStyles } from "@/components/ui";
import { toast } from "@/lib/toast";
import { countReferences } from "@/lib/references";
import { CsvImportModal } from "@/components/CsvImport";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { money, round2 } from "@/lib/types";

const TEAL = "#22D3C5", GOLD = "#F2B13C", RED = "#FF6B7A", LINE = "#243140", INK = "#E6EDF3";
const tooltipStyle = { background: "#111922", color: "#E6EDF3", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 };

export default function InventoryPage() {
  return <AppShell><InventoryBody /></AppShell>;
}

function InventoryBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const { data } = await supabase.from("items").select("*").eq("tenant_id", effectiveTenantId).order("name");
    setItems(data ?? []);
    setLoading(false);
  };
  // load() sets state synchronously before its first await (fetch-on-mount) — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId]);

  // An item that appears on any quote, sales order, or invoice line is part of a document
  // history that can only be voided/reversed, never rewritten — so it can't be deleted.
  const requestDelete = async (item: any) => {
    const { count: used, error } = await countReferences(
      [["quote_lines", "item_id"], ["sales_order_lines", "item_id"], ["invoice_lines", "item_id"]], item.id
    );
    if (error) { toast.error(error); return; }
    if (used > 0) {
      toast.error(`"${item.name}" is on ${used} quote/order/invoice line${used === 1 ? "" : "s"}. Documents can only be voided or reversed, not rewritten, so this item can't be deleted — edit it instead.`);
      return;
    }
    setDeleting(item);
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDelBusy(true);
    const res = await mutate(supabase.from("items").delete().eq("id", deleting.id), { successMessage: "Item deleted." });
    setDelBusy(false);
    if (ok(res)) { setDeleting(null); load(); }
  };

  const totalValue = items.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
  const lowStock = items.filter((i) => i.qty_on_hand <= i.reorder_point);
  const chartData = items.slice(0, 8).map((i) => ({ name: i.name.length > 12 ? i.name.slice(0, 11) + "…" : i.name, Value: round2(i.qty_on_hand * i.unit_cost) }));
  const itemsF = items.filter((i) => !q || i.name.toLowerCase().includes(q.trim().toLowerCase()) || (i.sku ?? "").toLowerCase().includes(q.trim().toLowerCase()));

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2">
          <GoldBtn onClick={() => setModal(true)}><Plus size={14} /> New item</GoldBtn>
          <OutlineBtn onClick={() => setCsvModal(true)}><Upload size={14} /> Import CSV</OutlineBtn>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search items…" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Package size={16} />} label="SKUs" value={items.length} />
        <KpiCard icon={<Wallet size={16} />} label="Inventory value" value={money(totalValue)} />
        <KpiCard icon={<AlertTriangle size={16} />} label="Low stock items" value={lowStock.length} accent={lowStock.length > 0 ? RED : TEAL} />
      </div>

      {items.length > 0 && (
        <Panel title="Stock value by item">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `₱${v}`} />
              <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
              <Bar dataKey="Value" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel title="Items">
        {itemsF.length === 0 ? <Empty>{items.length === 0 ? "No inventory items yet — add one, or receive a purchase order." : "No items match your search."}</Empty> : (
          <table>
            <thead><tr><th>SKU</th><th>Name</th><th className="text-right">Qty on hand</th><th className="text-right">Unit cost</th><th className="text-right">Value</th><th></th><th></th></tr></thead>
            <tbody>
              {itemsF.map((i) => (
                <tr key={i.id}>
                  <td style={{ color: GOLD, fontWeight: 600 }}>{i.sku}</td>
                  <td>{i.name}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: i.qty_on_hand <= i.reorder_point ? RED : INK }}>{i.qty_on_hand}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.unit_cost)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.qty_on_hand * i.unit_cost)}</td>
                  <td>{i.qty_on_hand <= i.reorder_point && <span className="text-[10.5px] font-bold text-red bg-[rgba(255,107,122,0.12)] rounded-full px-2 py-0.5">Reorder</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => setEditing(i)} className="text-[#7F8EA0] mr-2" title="Edit item"><Pencil size={13} /></button>
                    <button onClick={() => requestDelete(i)} style={{ color: RED }} title="Delete item"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {modal && (
        <Modal title="New inventory item" onClose={() => setModal(false)}>
          <ItemForm onClose={() => setModal(false)} onSaved={load} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit item — ${editing.name}`} onClose={() => setEditing(null)}>
          <ItemForm item={editing} onClose={() => setEditing(null)} onSaved={load} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this item?"
          danger
          busy={delBusy}
          confirmLabel="Delete item"
          message={
            <>
              <strong>{deleting.name}</strong> ({deleting.sku}) will be removed from inventory. This can&apos;t be undone.
              {deleting.qty_on_hand * deleting.unit_cost > 0 && (
                <> It currently holds <strong>{money(deleting.qty_on_hand * deleting.unit_cost)}</strong> of stock; deleting it does not write that value off in the ledger.</>
              )}
            </>
          }
          onConfirm={doDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {csvModal && effectiveTenantId && (
        <CsvImportModal
          title="Import items from CSV"
          table="items"
          tenantId={effectiveTenantId}
          columns={[
            { key: "sku", label: "SKU" },
            { key: "name", label: "Name", required: true },
            { key: "qty_on_hand", label: "Qty on hand", type: "number" },
            { key: "unit_cost", label: "Unit cost", type: "number" },
            { key: "reorder_point", label: "Reorder point", type: "number" },
          ]}
          onClose={() => setCsvModal(false)}
          onImported={load}
        />
      )}
    </>
  );
}

function ItemForm({ item, onClose, onSaved }: { item?: any; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(item?.name ?? ""); const [sku, setSku] = useState(item?.sku ?? "");
  const [qty, setQty] = useState(item ? String(item.qty_on_hand) : ""); const [cost, setCost] = useState(item ? String(item.unit_cost) : "");
  const [reorder, setReorder] = useState(item ? String(item.reorder_point) : "5");
  const [submitting, setSubmitting] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const fields = { name, sku, qty_on_hand: parseFloat(qty) || 0, unit_cost: parseFloat(cost) || 0, reorder_point: parseFloat(reorder) || 5 };
      const res = item
        ? await mutate(supabase.from("items").update(fields).eq("id", item.id), { successMessage: "Item updated." })
        : await mutate(supabase.from("items").insert({ tenant_id: effectiveTenantId, ...fields }), { successMessage: "Item added." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Item name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>SKU</Label><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} required />
      <Label>{item ? "Quantity on hand" : "Starting quantity"}</Label><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
      <Label>Unit cost</Label><input className="input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
      <Label>Reorder point</Label><input className="input" type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} />
      {item && (
        <div className="text-[12px] text-[#7F8EA0] mt-2">
          Changing quantity or cost updates the Inventory report only — it does not post a journal entry. Bills match their lines to items by <strong>name</strong>, so renaming an item changes how future bills restock it.
        </div>
      )}
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
      <FormStyles />
    </form>
  );
}
