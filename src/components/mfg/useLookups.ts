"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { useSession } from "@/lib/session";

export type Uom = { code: string; name: string };
export type Location = { id: string; code: string; name: string; kind: string };
export type MasterItem = {
  item_id: string; sku: string; name: string; item_type: string; make_or_buy: string; base_uom: string;
  procurement_lead_days: number; production_lead_days: number; lot_rule: string; lot_size: number; min_lot: number; max_lot: number;
  safety_stock: number; scrap_pct: number; batch_tracked: boolean; default_location_id: string | null; low_level_code: number;
  active: boolean; reorder_point: number;
  planned_price: number; price_unit: number; standard_cost: number; previous_standard_cost: number; future_cost: number | null;
  moving_avg_cost: number; cost_version: number; standard_cost_date: string | null;
};
export type WorkCenter = {
  id: string; document_number: string | null; code: string; name: string; cost_center_id: string | null; shifts: number;
  hours_per_shift: number; utilization_pct: number; efficiency_pct: number; working_days: number[]; active: boolean;
};
export type CostCenter = { id: string; code: string; name: string };
export type ActivityType = { id: string; code: string; name: string; kind: string };

/** Which items are inspected: goods bought (receipt) and/or goods made (production). Such goods must be received into quarantine. */
export type QualityFlags = Record<string, { receipt: boolean; production: boolean }>;

export type Lookups = {
  uoms: Uom[]; locations: Location[]; items: MasterItem[]; workCenters: WorkCenter[]; costCenters: CostCenter[]; activityTypes: ActivityType[]; quality: QualityFlags;
};
const EMPTY: Lookups = { uoms: [], locations: [], items: [], workCenters: [], costCenters: [], activityTypes: [], quality: {} };

/** The company's master data that other screens pick from (units, items, work centers…). */
export function useLookups(): { data: Lookups; loading: boolean; reload: () => Promise<void> } {
  const { effectiveTenantId } = useSession();
  const [data, setData] = useState<Lookups>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [u, l, i, w, c, a, q] = await Promise.all([
      supabase.from("mfg_uom").select("code, name").eq("tenant_id", t).order("code"),
      supabase.from("mfg_storage_locations").select("id, code, name, kind").eq("tenant_id", t).order("code"),
      supabase.from("mfg_item_master").select("*, items(sku, name, reorder_point)").eq("tenant_id", t),
      supabase.from("mfg_work_centers").select("*").eq("tenant_id", t).order("code"),
      supabase.from("mfg_cost_centers").select("id, code, name").eq("tenant_id", t).order("code"),
      supabase.from("mfg_activity_types").select("id, code, name, kind").eq("tenant_id", t).order("code"),
      supabase.from("mfg_item_quality").select("item_id, inspect_receipt, inspect_production").eq("tenant_id", t),
    ]);
    showQueryErrors(u, l, i, w, c, a, q);
    type Raw = Omit<MasterItem, "sku" | "name" | "reorder_point"> & { items: { sku: string; name: string; reorder_point: number } | null };
    const items = ((i.data as unknown as Raw[]) ?? [])
      .map(({ items: it, ...m }) => ({ ...m, sku: it?.sku ?? "", name: it?.name ?? "", reorder_point: Number(it?.reorder_point ?? 0) }) as MasterItem)
      .sort((x, y) => x.name.localeCompare(y.name));
    setData({
      uoms: (u.data as Uom[]) ?? [], locations: (l.data as Location[]) ?? [], items,
      workCenters: (w.data as WorkCenter[]) ?? [], costCenters: (c.data as CostCenter[]) ?? [], activityTypes: (a.data as ActivityType[]) ?? [],
      quality: Object.fromEntries(((q.data as { item_id: string; inspect_receipt: boolean; inspect_production: boolean }[]) ?? []).map((x) => [x.item_id, { receipt: x.inspect_receipt, production: x.inspect_production }])),
    });
    setLoading(false);
  }, [effectiveTenantId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}
