"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { ESTIMATE_STATUS_TONE, money, unitMoney } from "@/lib/costing";
import { estimateSchema, firstError } from "@/lib/mfgMaster";

type Estimate = {
  id: string; document_number: string | null; item_id: string; lot_size: number; costing_date: string; status: string;
  total_cost: number; unit_cost: number; costing_method: string; warnings: string[]; created_at: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function CostingPage() {
  return <AppShell><CostingBody /></AppShell>;
}

function CostingBody() {
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const [rows, setRows] = useState<Estimate[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ item_id: "", lot_size: "1", costing_date: today() });
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<string>("");

  useEffect(() => {
    if (!effectiveTenantId) return;
    supabase.from("mfg_cost_estimates").select("*").eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as Estimate[]) ?? []));
    supabase.from("mfg_company_settings").select("costing_method").eq("tenant_id", effectiveTenantId).maybeSingle()
      .then(({ data }) => setMethod((data as { costing_method?: string } | null)?.costing_method ?? ""));
  }, [effectiveTenantId]);

  const makeItems = useMemo(() => lk.items.filter((i) => i.make_or_buy === "MAKE" && i.active), [lk.items]);
  const name = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = estimateSchema.safeParse(form);
    if (!parsed.success) { toast.error(firstError(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_cost_estimate", {
      p_item: parsed.data.item_id, p_lot_size: parsed.data.lot_size, p_date: parsed.data.costing_date,
    }));
    setBusy(false);
    if (ok(res)) { setModal(false); router.push(`/mfg/costing/${res.data as string}`); }
  };

  const columns: ListColumn<Estimate>[] = [
    { key: "no", label: "Estimate", value: (r) => r.document_number ?? "", width: 100 },
    { key: "item", label: "Item", value: (r) => name(r.item_id), width: 220 },
    { key: "lot", label: "Lot size", value: (r) => Number(r.lot_size), align: "right", width: 90 },
    { key: "date", label: "Costing date", value: (r) => r.costing_date, width: 120 },
    { key: "unit", label: "Unit cost", value: (r) => Number(r.unit_cost), align: "right", width: 130, render: (r) => unitMoney(r.unit_cost) },
    { key: "total", label: "Lot cost", value: (r) => Number(r.total_cost), align: "right", width: 130, render: (r) => money(r.total_cost) },
    { key: "status", label: "Status", value: (r) => r.status, filter: true, width: 120, render: (r) => <Chip label={r.status} tone={ESTIMATE_STATUS_TONE[r.status] ?? "muted"} /> },
    { key: "warn", label: "Warnings", value: (r) => r.warnings?.length ?? 0, align: "right", width: 90, render: (r) => ((r.warnings?.length ?? 0) > 0 ? <Chip label={String(r.warnings.length)} tone="bad" /> : "—") },
    { key: "method", label: "Method", value: (r) => r.costing_method === "ACTUAL" ? "Actual" : "Standard", width: 100, defaultHidden: true },
    { key: "created", label: "Created", value: (r) => r.created_at.slice(0, 10), width: 110, defaultHidden: true },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Product costing</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          A cost estimate works out what it costs to make a lot of an item: materials from the bill of materials, then labor, machine time and overhead from the routing, all the way down through sub-assemblies.
          {method === "ACTUAL" && " Your company uses actual costing, so estimates here are for planning only."}
          {readOnly && " You are looking at a student’s estimates."}
        </div>
      </div>

      <Panel title="Cost estimates">
        <ListReport listKey="mfg-estimates" rows={rows} columns={columns} rowKey={(r) => r.id} exportName="cost-estimates"
          emptyText="No cost estimates yet. Build an item's bill of materials and routing first, then cost it here."
          onRowClick={(r) => router.push(`/mfg/costing/${r.id}`)}
          toolbar={!readOnly ? <GoldBtn onClick={() => setModal(true)}><Plus size={13} /> New estimate</GoldBtn> : undefined} />
      </Panel>

      {modal && (
        <Modal title="New cost estimate" onClose={() => setModal(false)} wide>
          <form onSubmit={create}>
            <Label>Item to cost</Label>
            <select className="input" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Choose…</option>
              {makeItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-x-3">
              <div><Label>Lot size</Label><input className="input" type="number" min={0} step="any" value={form.lot_size} onChange={(e) => setForm({ ...form, lot_size: e.target.value })} /></div>
              <div><Label>Costing date</Label><input className="input" type="date" value={form.costing_date} onChange={(e) => setForm({ ...form, costing_date: e.target.value })} /></div>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">
              Uses the bills of materials and routings that are <b>active on the costing date</b>, and the planned labor and machine rates for that month.
              Setup time is spread over the lot, so a bigger lot costs less per unit.
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setModal(false)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Work out the cost</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      <FormStyles />
    </>
  );
}
