"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Boxes } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, TinyBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, round2, todayStr } from "@/lib/types";

const TEAL = "#12524F";

export default function FixedAssetsPage() {
  return <AppShell><FixedAssetsBody /></AppShell>;
}

function FixedAssetsBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<any[]>([]);
  const [modal, setModal] = useState<null | "new" | any>(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const { data } = await supabase.from("fixed_assets").select("*").eq("tenant_id", effectiveTenantId).order("purchase_date", { ascending: false });
    setAssets(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalAccumDep = assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  const totalBookValue = totalCost - totalAccumDep;

  const monthlyDep = (a: any) => round2((a.cost - a.salvage_value) / a.useful_life_months);
  const bookValue = (a: any) => a.cost - a.accumulated_depreciation;
  const fullyDepreciated = (a: any) => a.accumulated_depreciation >= a.cost - a.salvage_value - 0.01;

  const recordDepreciation = async (asset: any) => {
    const amount = Math.min(monthlyDep(asset), asset.cost - asset.salvage_value - asset.accumulated_depreciation);
    if (amount <= 0) return;
    await supabase.rpc("record_depreciation", { asset_id: asset.id, dep_amount: amount, dep_date: todayStr() });
    load();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2"><GoldBtn onClick={() => setModal("new")}><Plus size={14} /> New fixed asset</GoldBtn></div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiCard icon={<Boxes size={16} />} label="Assets" value={assets.length} />
        <KpiCard icon={<Boxes size={16} />} label="Total cost" value={money(totalCost)} />
        <KpiCard icon={<Boxes size={16} />} label="Accumulated depreciation" value={money(totalAccumDep)} />
        <KpiCard icon={<Boxes size={16} />} label="Net book value" value={money(totalBookValue)} accent={TEAL} />
      </div>

      <Panel title="Fixed asset register">
        {assets.length === 0 ? <Empty>No fixed assets yet — add equipment, vehicles, furniture, etc.</Empty> : (
          <table>
            <thead>
              <tr><th>Asset</th><th>Purchased</th><th className="text-right">Cost</th><th className="text-right">Monthly dep.</th>
                <th className="text-right">Accum. dep.</th><th className="text-right">Book value</th><th></th></tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.purchase_date}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(a.cost)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(monthlyDep(a))}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(a.accumulated_depreciation)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(bookValue(a))}</td>
                  <td>
                    {fullyDepreciated(a) ? (
                      <span className="text-[11px] text-[#8a8172]">Fully depreciated</span>
                    ) : (
                      <TinyBtn onClick={() => recordDepreciation(a)}>Record 1 month dep.</TinyBtn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {modal === "new" && (
        <Modal title="New fixed asset" onClose={() => setModal(null)}>
          <AssetForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
    </>
  );
}

function AssetForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("0");
  const [usefulLife, setUsefulLife] = useState("36");

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await supabase.from("fixed_assets").insert({
        tenant_id: effectiveTenantId, name, purchase_date: purchaseDate,
        cost: parseFloat(cost) || 0, salvage_value: parseFloat(salvage) || 0, useful_life_months: parseInt(usefulLife) || 36,
      });
      onClose(); onSaved();
    }}>
      <Label>Asset name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delivery van" required />
      <Label>Purchase date</Label><input className="input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Cost</Label><input className="input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required /></div>
        <div><Label>Salvage value</Label><input className="input" type="number" step="0.01" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></div>
      </div>
      <Label>Useful life (months)</Label>
      <input className="input" type="number" value={usefulLife} onChange={(e) => setUsefulLife(e.target.value)} required />
      <div className="text-[12px] text-[#8a8172] mt-1">Straight-line: (cost − salvage) ÷ useful life months</div>
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
