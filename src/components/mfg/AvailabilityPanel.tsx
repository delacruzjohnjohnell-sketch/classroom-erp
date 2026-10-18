"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import type { MasterItem } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { qtyText } from "@/lib/mfgOps";

type Row = { item_id: string; usable: number; quarantine: number; reserved: number; available: number; on_order: number; projected: number };

/** Per item: usable stock, stock under inspection, what released orders have promised to themselves, what is free, and what is still on order. */
export default function AvailabilityPanel({ items }: { items: MasterItem[] }) {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.rpc("mfg_stock_availability", { p_tenant: effectiveTenantId });
    showQueryErrors(r);
    setRows((r.data as Row[]) ?? []);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const item = (id: string) => items.find((i) => i.item_id === id);
  const q = (k: keyof Row) => (r: Row) => Number(r[k]);
  const fmt = (k: keyof Row) => (r: Row) => `${qtyText(r[k])}`;
  const columns: ListColumn<Row>[] = [
    { key: "sku", label: "SKU", value: (r) => item(r.item_id)?.sku ?? "", width: 100 },
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 200 },
    { key: "uom", label: "Unit", value: (r) => item(r.item_id)?.base_uom ?? "", width: 70 },
    { key: "usable", label: "Usable", value: q("usable"), align: "right", width: 100, render: fmt("usable") },
    { key: "quarantine", label: "Under inspection", value: q("quarantine"), align: "right", width: 130, render: fmt("quarantine") },
    { key: "reserved", label: "Reserved", value: q("reserved"), align: "right", width: 100, render: fmt("reserved") },
    { key: "available", label: "Available", value: q("available"), align: "right", width: 110,
      render: (r) => <span style={{ color: Number(r.available) < 0 ? "#FF6B7A" : undefined, fontWeight: 600 }}>{qtyText(r.available)}</span> },
    { key: "on_order", label: "On order", value: q("on_order"), align: "right", width: 100, render: fmt("on_order") },
    { key: "projected", label: "Projected", value: q("projected"), align: "right", width: 110, render: fmt("projected") },
    { key: "flag", label: "", value: (r) => (Number(r.projected) < 0 ? "Short" : Number(r.available) < 0 ? "Over-promised" : ""), width: 120,
      render: (r) => Number(r.projected) < 0 ? <Chip label="Short" tone="bad" /> : Number(r.available) < 0 ? <Chip label="Over-promised" tone="warn" /> : null },
  ];

  return (
    <Panel title="What is really available">
      <div className="text-[12px] text-[#7F8EA0] mb-3">
        <b>Usable</b> is stock in the stores (not on the shop floor, not under inspection). <b>Reserved</b> is what released production orders still need to take from it.
        <b> Available</b> = usable − reserved, so two orders can&rsquo;t both count on the same material. <b>Projected</b> adds what is still to arrive on open purchase orders.
      </div>
      <ListReport listKey="mfg-availability" rows={rows} columns={columns} rowKey={(r) => r.item_id} exportName="stock-availability"
        emptyText="No stock, reservations or open purchase orders yet." />
    </Panel>
  );
}
