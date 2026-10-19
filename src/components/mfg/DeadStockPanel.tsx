"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Label } from "@/components/ui";
import ListReport, { type ListColumn } from "@/components/ListReport";
import type { MasterItem } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";
import { qtyText } from "@/lib/mfgOps";

type Dead = { item_id: string; qty: number; value: number; last_movement: string | null; idle_days: number };

/** Items held that have not been issued or delivered for a number of days: the money tied up in stock that does not move. Lives under Analytics → Inventory. */
export default function DeadStockPanel({ items }: { items: MasterItem[] }) {
  const { effectiveTenantId } = useSession();
  const [dead, setDead] = useState<Dead[]>([]);
  const [days, setDays] = useState("90");
  const item = (id: string | null) => items.find((i) => i.item_id === id);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.rpc("mfg_dead_stock", { p_tenant: effectiveTenantId, p_days: Math.max(0, Math.floor(Number(days) || 0)) });
    showQueryErrors(r);
    setDead((r.data as Dead[]) ?? []);
  }, [effectiveTenantId, days]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const deadCols: ListColumn<Dead>[] = [
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 200 },
    { key: "qty", label: "On hand", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => `${qtyText(r.qty)} ${item(r.item_id)?.base_uom ?? ""}` },
    { key: "value", label: "Value tied up", value: (r) => Number(r.value), align: "right", width: 130, render: (r) => money(r.value) },
    { key: "last", label: "Last used or sold", value: (r) => r.last_movement ?? "", width: 140 },
    { key: "idle", label: "Idle days", value: (r) => Number(r.idle_days), align: "right", width: 90 },
  ];

  return (
    <Panel title="Slow-moving and dead stock">
      <div className="text-[12px] text-[#7F8EA0] mb-2">Items you hold that have not been issued to production or delivered to a customer for the number of days below. Money sitting in stock that does not move is a cost of its own.</div>
      <div className="flex items-end gap-2 mb-3">
        <div><Label>Idle for at least (days)</Label><input className="input" style={{ width: 120 }} type="number" min={0} step={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
      </div>
      <ListReport listKey="mfg-dead" rows={dead} columns={deadCols} rowKey={(r) => r.item_id} exportName="slow-moving-stock" emptyText="Nothing has been idle that long." />
      <div className="text-[13px] mt-3">Value tied up: <b className="text-gold">{money(dead.reduce((s, r) => s + Number(r.value), 0))}</b></div>
    </Panel>
  );
}
