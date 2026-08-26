"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Loader2, Package, Wallet, AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, round2 } from "@/lib/types";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F", LINE = "#DDD8CC", INK = "#1B2430";
const tooltipStyle = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 };

export default function InventoryPage() {
  return <AppShell><InventoryBody /></AppShell>;
}

function InventoryBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const { data } = await supabase.from("items").select("*").eq("tenant_id", effectiveTenantId).order("name");
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const totalValue = items.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
  const lowStock = items.filter((i) => i.qty_on_hand <= i.reorder_point);
  const chartData = items.slice(0, 8).map((i) => ({ name: i.name.length > 12 ? i.name.slice(0, 11) + "…" : i.name, Value: round2(i.qty_on_hand * i.unit_cost) }));

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2"><GoldBtn onClick={() => setModal(true)}><Plus size={14} /> New item</GoldBtn></div>

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
              <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
              <Bar dataKey="Value" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel title="Items">
        {items.length === 0 ? <Empty>No inventory items yet — add one, or receive a purchase order.</Empty> : (
          <table>
            <thead><tr><th>SKU</th><th>Name</th><th className="text-right">Qty on hand</th><th className="text-right">Unit cost</th><th className="text-right">Value</th><th></th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td style={{ color: GOLD, fontWeight: 600 }}>{i.sku}</td>
                  <td>{i.name}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: i.qty_on_hand <= i.reorder_point ? RED : INK }}>{i.qty_on_hand}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.unit_cost)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.qty_on_hand * i.unit_cost)}</td>
                  <td>{i.qty_on_hand <= i.reorder_point && <span className="text-[10.5px] font-bold text-red bg-[#F6E7E3] rounded-full px-2 py-0.5">Reorder</span>}</td>
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
    </>
  );
}

function ItemForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [sku, setSku] = useState("");
  const [qty, setQty] = useState(""); const [cost, setCost] = useState(""); const [reorder, setReorder] = useState("5");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await supabase.from("items").insert({
        tenant_id: effectiveTenantId, name, sku, qty_on_hand: parseFloat(qty) || 0, unit_cost: parseFloat(cost) || 0, reorder_point: parseFloat(reorder) || 5,
      });
      onClose(); onSaved();
    }}>
      <Label>Item name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>SKU</Label><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} required />
      <Label>Starting quantity</Label><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
      <Label>Unit cost</Label><input className="input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
      <Label>Reorder point</Label><input className="input" type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
