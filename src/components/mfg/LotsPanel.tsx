"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Label, GoldBtn } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import type { MasterItem } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";
import { qtyText } from "@/lib/mfgOps";

type Expiry = { item_id: string; batch_id: string; batch_no: string; qty: number; value: number; expiry_date: string | null; days_left: number | null; bucket: string };
type Dead = { item_id: string; qty: number; value: number; last_movement: string | null; idle_days: number };
type Batch = { id: string; batch_no: string; item_id: string; expiry_date: string | null };
type Trace = { level: number; kind: string; ref_no: string | null; ref_date: string | null; item_id: string | null; batch_no: string | null; qty: number | null; party: string | null; note: string | null };

const BUCKET: Record<string, [string, "bad" | "warn" | "good" | "muted"]> = {
  EXPIRED: ["Expired", "bad"], DUE_30: ["Within 30 days", "bad"], DUE_60: ["Within 60 days", "warn"], DUE_90: ["Within 90 days", "warn"], LATER: ["Later", "good"], NO_EXPIRY: ["No expiry", "muted"],
};
const KIND: Record<string, string> = {
  LOT: "This lot", PRODUCED: "Produced", RECEIVED: "Received", ORDER: "Production order", INPUT: "Material used", SUPPLIER: "Supplier lot",
  USED_IN: "Used in order", OUTPUT: "Produced", DELIVERED: "Delivered to customer",
};

/** Lots in stock by expiry, slow-moving stock, and a two-way trace of any lot (where it came from, where it went). */
export default function LotsPanel({ items }: { items: MasterItem[] }) {
  const { effectiveTenantId } = useSession();
  const [expiry, setExpiry] = useState<Expiry[]>([]);
  const [dead, setDead] = useState<Dead[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [days, setDays] = useState("90");
  const [batchId, setBatchId] = useState("");
  const [dir, setDir] = useState<"BACKWARD" | "FORWARD">("BACKWARD");
  const [trace, setTrace] = useState<Trace[] | null>(null);
  const [busy, setBusy] = useState(false);

  const item = (id: string | null) => items.find((i) => i.item_id === id);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [e, b] = await Promise.all([
      supabase.rpc("mfg_expiry_report", { p_tenant: effectiveTenantId }),
      supabase.from("mfg_batches").select("id, batch_no, item_id, expiry_date").eq("tenant_id", effectiveTenantId).order("batch_no"),
    ]);
    showQueryErrors(e, b);
    setExpiry((e.data as Expiry[]) ?? []);
    setBatches((b.data as Batch[]) ?? []);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const loadDead = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.rpc("mfg_dead_stock", { p_tenant: effectiveTenantId, p_days: Math.max(0, Math.floor(Number(days) || 0)) });
    showQueryErrors(r);
    setDead((r.data as Dead[]) ?? []);
  }, [effectiveTenantId, days]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDead(); }, [loadDead]);

  const runTrace = async () => {
    if (!effectiveTenantId || !batchId || busy) return;
    setBusy(true);
    const r = await supabase.rpc("mfg_lot_trace", { p_tenant: effectiveTenantId, p_batch: batchId, p_direction: dir });
    setBusy(false);
    if (showQueryErrors(r)) return;
    setTrace((r.data as Trace[]) ?? []);
  };

  const expCols: ListColumn<Expiry>[] = [
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 190 },
    { key: "lot", label: "Lot", value: (r) => r.batch_no, width: 110 },
    { key: "qty", label: "Quantity", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => `${qtyText(r.qty)} ${item(r.item_id)?.base_uom ?? ""}` },
    { key: "value", label: "Value", value: (r) => Number(r.value), align: "right", width: 120, render: (r) => money(r.value) },
    { key: "exp", label: "Expires", value: (r) => r.expiry_date ?? "", width: 110 },
    { key: "left", label: "Days left", value: (r) => r.days_left ?? 99999, align: "right", width: 90, render: (r) => (r.days_left == null ? "—" : r.days_left) },
    { key: "bucket", label: "Status", value: (r) => BUCKET[r.bucket]?.[0] ?? r.bucket, filter: true, width: 140, render: (r) => <Chip label={BUCKET[r.bucket]?.[0] ?? r.bucket} tone={BUCKET[r.bucket]?.[1] ?? "muted"} /> },
  ];
  const deadCols: ListColumn<Dead>[] = [
    { key: "item", label: "Item", value: (r) => item(r.item_id)?.name ?? "—", width: 200 },
    { key: "qty", label: "On hand", value: (r) => Number(r.qty), align: "right", width: 100, render: (r) => `${qtyText(r.qty)} ${item(r.item_id)?.base_uom ?? ""}` },
    { key: "value", label: "Value tied up", value: (r) => Number(r.value), align: "right", width: 130, render: (r) => money(r.value) },
    { key: "last", label: "Last used or sold", value: (r) => r.last_movement ?? "", width: 140 },
    { key: "idle", label: "Idle days", value: (r) => Number(r.idle_days), align: "right", width: 90 },
  ];

  return (
    <>
      <Panel title="Lots in stock, by expiry">
        <ListReport listKey="mfg-expiry" rows={expiry} columns={expCols} rowKey={(r) => `${r.batch_id}`} exportName="lots-by-expiry"
          emptyText="No lot-tracked stock yet. Turn on “Track batches / lots” for an item and give its receipts a lot number." />
      </Panel>

      <Panel title="Slow-moving and dead stock">
        <div className="text-[12px] text-[#7F8EA0] mb-2">Items you hold that have not been issued to production or delivered to a customer for the number of days below. Money sitting in stock that does not move is a cost of its own.</div>
        <div className="flex items-end gap-2 mb-3">
          <div><Label>Idle for at least (days)</Label><input className="input" style={{ width: 120 }} type="number" min={0} step={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
        </div>
        <ListReport listKey="mfg-dead" rows={dead} columns={deadCols} rowKey={(r) => r.item_id} exportName="slow-moving-stock" emptyText="Nothing has been idle that long." />
        <div className="text-[13px] mt-3">Value tied up: <b className="text-gold">{money(dead.reduce((s, r) => s + Number(r.value), 0))}</b></div>
      </Panel>

      <Panel title="Trace a lot">
        <div className="text-[12px] text-[#7F8EA0] mb-2">
          <b>Backward</b> answers “where did this lot come from?” — the order that made it, the material lots that went into it and their suppliers.
          <b> Forward</b> answers “where did it go?” — the orders that used it, what they made, and the customers who received it. If an order used several lots, every lot it made is linked to every lot it used.
        </div>
        <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div><Label>Lot</Label>
            <select className="input" value={batchId} onChange={(e) => { setBatchId(e.target.value); setTrace(null); }}>
              <option value="">Choose a lot…</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_no} — {item(b.item_id)?.name ?? ""}</option>)}
            </select></div>
          <div><Label>Direction</Label>
            <select className="input" value={dir} onChange={(e) => { setDir(e.target.value as "BACKWARD" | "FORWARD"); setTrace(null); }}>
              <option value="BACKWARD">Backward — where it came from</option><option value="FORWARD">Forward — where it went</option>
            </select></div>
        </div>
        <div className="mt-3"><GoldBtn type="button" onClick={runTrace} disabled={!batchId || busy}>Trace</GoldBtn></div>
        {trace && (
          <div className="overflow-x-auto mt-4">
            <table style={{ minWidth: 640 }}>
              <thead><tr><th>Step</th><th>Document</th><th>Date</th><th>Item</th><th>Lot</th><th style={{ textAlign: "right" }}>Quantity</th><th>Who</th><th>Note</th></tr></thead>
              <tbody>
                {trace.map((t, i) => (
                  <tr key={i}>
                    <td style={{ paddingLeft: 8 + t.level * 14 }}>{KIND[t.kind] ?? t.kind}</td>
                    <td>{t.kind === "LOT" ? "" : t.ref_no ?? ""}</td><td>{t.ref_date ?? ""}</td>
                    <td>{item(t.item_id)?.name ?? ""}</td><td>{t.batch_no ?? ""}</td>
                    <td style={{ textAlign: "right" }}>{t.qty == null ? "" : qtyText(t.qty)}</td><td>{t.party ?? ""}</td><td className="text-[#7F8EA0]">{t.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trace.length <= 1 && <div className="text-[12.5px] text-[#7F8EA0] mt-2">Nothing further is recorded for this lot in that direction.</div>}
          </div>
        )}
      </Panel>
    </>
  );
}
