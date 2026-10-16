"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Panel, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "../ui";
import ListReport, { Chip, type ListColumn } from "../ListReport";
import type { Lookups, MasterItem } from "./useLookups";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { unitMoney } from "@/lib/costing";
import { firstError, itemSchema, ITEM_TYPES, LOT_RULES, MAKE_OR_BUY, type ItemForm } from "@/lib/mfgMaster";

const BLANK: ItemForm = {
  sku: "", name: "", item_type: "RAW", make_or_buy: "BUY", base_uom: "PC", procurement_lead_days: "0", production_lead_days: "0",
  lot_rule: "LOT_FOR_LOT", lot_size: "0", min_lot: "0", max_lot: "0", safety_stock: "0", scrap_pct: "0", batch_tracked: false,
  default_location_id: "", planned_price: "0", price_unit: "1", active: true,
} as unknown as ItemForm;

const toForm = (m: MasterItem): ItemForm => ({
  sku: m.sku, name: m.name, item_type: m.item_type, make_or_buy: m.make_or_buy, base_uom: m.base_uom,
  procurement_lead_days: String(m.procurement_lead_days), production_lead_days: String(m.production_lead_days),
  lot_rule: m.lot_rule, lot_size: String(m.lot_size), min_lot: String(m.min_lot), max_lot: String(m.max_lot),
  safety_stock: String(m.safety_stock), scrap_pct: String(m.scrap_pct), batch_tracked: m.batch_tracked,
  default_location_id: m.default_location_id ?? "", planned_price: String(Number(m.planned_price)), price_unit: String(m.price_unit), active: m.active,
} as unknown as ItemForm);

const label = <T extends Record<string, string>>(map: T, k: string) => (map as Record<string, string>)[k] ?? k;

export default function ItemsTab({ lookups, reload, readOnly }: { lookups: Lookups; reload: () => Promise<void>; readOnly: boolean }) {
  const [modal, setModal] = useState<{ item: MasterItem | null } | null>(null);
  const [form, setForm] = useState<ItemForm>(BLANK);
  const [deleting, setDeleting] = useState<MasterItem | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (item: MasterItem | null) => { setForm(item ? toForm(item) : BLANK); setModal({ item }); };
  const set = (patch: Partial<Record<keyof ItemForm, string | boolean>>) => setForm({ ...form, ...patch } as ItemForm);
  const f = form as unknown as Record<string, string | boolean>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !modal) return;
    const parsed = itemSchema.safeParse(form);
    if (!parsed.success) { toast.error(firstError(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_item", { p_item_id: modal.item?.item_id ?? null, p_data: parsed.data }), { successMessage: "Item saved." });
    setBusy(false);
    if (ok(res)) { setModal(null); await reload(); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_delete_item", { p_item_id: deleting.item_id }), { successMessage: "Item deleted." });
    setBusy(false);
    if (ok(res)) { setDeleting(null); await reload(); }
  };

  const markActive = async (rows: MasterItem[], active: boolean) => {
    for (const m of rows) {
      const parsed = itemSchema.safeParse({ ...toForm(m), active });
      if (!parsed.success) { toast.error(`${m.name}: ${firstError(parsed.error)}`); return; }
      const res = await mutate(supabase.rpc("mfg_save_item", { p_item_id: m.item_id, p_data: parsed.data }));
      if (!ok(res)) return;
    }
    toast.success(active ? "Marked active." : "Marked inactive.");
    await reload();
  };

  const columns: ListColumn<MasterItem>[] = [
    { key: "sku", label: "SKU", value: (m) => m.sku, width: 110 },
    { key: "name", label: "Name", value: (m) => m.name, width: 220 },
    { key: "type", label: "Type", value: (m) => label(ITEM_TYPES, m.item_type), filter: true, width: 140 },
    { key: "mob", label: "Make / buy", value: (m) => label(MAKE_OR_BUY, m.make_or_buy), filter: true, width: 100 },
    { key: "uom", label: "Unit", value: (m) => m.base_uom, width: 70 },
    { key: "lot", label: "Lot rule", value: (m) => label(LOT_RULES, m.lot_rule), width: 200, defaultHidden: true },
    { key: "lotsize", label: "Lot size", value: (m) => Number(m.lot_size), align: "right", width: 90, defaultHidden: true },
    { key: "safety", label: "Safety stock", value: (m) => Number(m.safety_stock), align: "right", width: 110 },
    { key: "pl", label: "Purchase lead (days)", value: (m) => m.procurement_lead_days, align: "right", width: 150, defaultHidden: true },
    { key: "prl", label: "Production lead (days)", value: (m) => m.production_lead_days, align: "right", width: 160, defaultHidden: true },
    { key: "batch", label: "Batches", value: (m) => (m.batch_tracked ? "Tracked" : "—"), width: 90, defaultHidden: true },
    { key: "plan", label: "Planned price", value: (m) => Number(m.planned_price) / (m.price_unit || 1), align: "right", width: 120, render: (m) => (Number(m.planned_price) ? unitMoney(Number(m.planned_price) / (m.price_unit || 1)) : "—") },
    { key: "std", label: "Standard cost", value: (m) => Number(m.standard_cost), align: "right", width: 130, render: (m) => (Number(m.standard_cost) ? unitMoney(m.standard_cost) : "—") },
    { key: "mavg", label: "Moving average", value: (m) => Number(m.moving_avg_cost), align: "right", width: 130, defaultHidden: true, render: (m) => (Number(m.moving_avg_cost) ? unitMoney(m.moving_avg_cost) : "—") },
    { key: "llc", label: "Low level", value: (m) => m.low_level_code, align: "right", width: 90 },
    { key: "status", label: "Status", value: (m) => (m.active ? "Active" : "Inactive"), filter: true, width: 100, render: (m) => <Chip label={m.active ? "Active" : "Inactive"} tone={m.active ? "good" : "muted"} /> },
    ...(readOnly ? [] : [{
      key: "_a", label: "", width: 80, value: () => "",
      render: (m: MasterItem) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          <TinyBtn onClick={() => open(m)} aria-label={`Edit ${m.name}`}><Pencil size={11} /></TinyBtn>
          <TinyBtn onClick={() => setDeleting(m)} aria-label={`Delete ${m.name}`}><Trash2 size={11} /></TinyBtn>
        </span>
      ),
    } as ListColumn<MasterItem>]),
  ];

  const sel = (k: string, opts: Record<string, string>) => (
    <select className="input" value={String(f[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as never)}>
      {Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const numIn = (k: string, step = "any") => (
    <input className="input" type="number" step={step} min={0} value={String(f[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as never)} />
  );

  return (
    <Panel title="Items">
      <div className="text-[12px] text-[#7F8EA0] mb-3">Every raw material, part and finished good you make or buy. Stock quantities and costs arrive in later phases; here you describe how each item is planned.</div>
      <ListReport
        listKey="mfg-items" rows={lookups.items} columns={columns} rowKey={(m) => m.item_id} exportName="items"
        emptyText="No items yet. Add your first raw material or product."
        onRowClick={readOnly ? undefined : open}
        bulkActions={readOnly ? undefined : [
          { label: "Mark inactive", onRun: (rows) => markActive(rows, false) },
          { label: "Mark active", onRun: (rows) => markActive(rows, true) },
        ]}
        toolbar={!readOnly ? <GoldBtn onClick={() => open(null)}><Plus size={13} /> Add item</GoldBtn> : undefined}
      />

      {modal && (
        <Modal title={modal.item ? "Edit item" : "Add item"} onClose={() => setModal(null)} wide>
          <form onSubmit={save}>
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>SKU / code</Label><input className="input" value={String(f.sku)} onChange={(e) => set({ sku: e.target.value })} /></div>
              <div><Label>Unit of measure</Label>
                <select className="input" value={String(f.base_uom)} onChange={(e) => set({ base_uom: e.target.value })}>
                  {lookups.uoms.map((u) => <option key={u.code} value={u.code}>{u.code} — {u.name}</option>)}
                </select>
              </div>
            </div>
            <Label>Name</Label>
            <input className="input" value={String(f.name)} onChange={(e) => set({ name: e.target.value })} />
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Item type</Label>{sel("item_type", ITEM_TYPES)}</div>
              <div><Label>Make or buy</Label>{sel("make_or_buy", MAKE_OR_BUY)}</div>
              <div><Label>Purchase lead time (days)</Label>{numIn("procurement_lead_days", "1")}</div>
              <div><Label>Production lead time (days)</Label>{numIn("production_lead_days", "1")}</div>
            </div>
            <Label>Lot-size rule</Label>
            {sel("lot_rule", LOT_RULES)}
            {(f.lot_rule === "FIXED" || f.lot_rule === "EOQ") && <><Label>Lot size</Label>{numIn("lot_size")}</>}
            {f.lot_rule === "MIN_MAX" && (
              <div className="grid grid-cols-2 gap-x-3">
                <div><Label>Minimum lot</Label>{numIn("min_lot")}</div>
                <div><Label>Maximum lot</Label>{numIn("max_lot")}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Safety stock</Label>{numIn("safety_stock")}</div>
              <div><Label>Scrap % (yield loss)</Label>{numIn("scrap_pct")}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Planned price (₱)</Label>{numIn("planned_price")}</div>
              <div><Label>…for this many units</Label>{numIn("price_unit", "1")}</div>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-1">What you expect to pay for a bought item, used in cost estimates (₱50 for 100 nails = price 50, units 100). The standard cost itself is set only when a cost estimate is released.</div>
            <Label>Usual storage location</Label>
            <select className="input" value={String(f.default_location_id ?? "")} onChange={(e) => set({ default_location_id: e.target.value })}>
              <option value="">None</option>
              {lookups.locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[13px] mt-3.5"><input type="checkbox" checked={!!f.batch_tracked} onChange={(e) => set({ batch_tracked: e.target.checked })} /> Track batches / lots</label>
            {modal.item && <label className="flex items-center gap-2 text-[13px] mt-2"><input type="checkbox" checked={!!f.active} onChange={(e) => set({ active: e.target.checked })} /> Active (inactive items can&rsquo;t be put on new bills of materials)</label>}
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setModal(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Save item</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title="Delete item" danger busy={busy} confirmLabel="Delete"
          message={<>Are you sure you want to delete <b>{deleting.name}</b>? If it is on a bill of materials, a routing or a sales document, the app will keep it and suggest marking it inactive instead.</>}
          onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
      <FormStyles />
    </Panel>
  );
}
