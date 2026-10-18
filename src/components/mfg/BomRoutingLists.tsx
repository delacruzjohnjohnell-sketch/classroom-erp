"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Panel, GoldBtn } from "../ui";
import ListReport, { Chip, statusTone, type ListColumn } from "../ListReport";
import type { Lookups } from "./useLookups";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { useSession } from "@/lib/session";

type BomRow = {
  id: string; document_number: string | null; item_id: string; version: number; alt_no: number; base_qty: number; valid_from: string;
  valid_to: string | null; status: string; description: string | null; mfg_bom_items: { count: number }[];
};
type RoutingRow = {
  id: string; document_number: string | null; item_id: string; version: number; alt_no: number; status: string; description: string | null;
  mfg_routing_ops: { count: number }[];
};

export function BomsTab({ lookups, readOnly }: { lookups: Lookups; readOnly: boolean }) {
  const { effectiveTenantId } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<BomRow[]>([]);
  useEffect(() => {
    if (!effectiveTenantId) return;
    supabase.from("mfg_boms").select("*, mfg_bom_items(count)").eq("tenant_id", effectiveTenantId).order("document_number")
      .then((r) => { showQueryErrors(r); setRows((r.data as unknown as BomRow[]) ?? []); });
  }, [effectiveTenantId]);

  const item = (id: string) => lookups.items.find((i) => i.item_id === id);
  const columns: ListColumn<BomRow>[] = [
    { key: "no", label: "BOM", value: (b) => b.document_number ?? "", width: 100 },
    { key: "item", label: "Item", value: (b) => item(b.item_id)?.name ?? "—", width: 220 },
    { key: "ver", label: "Version", value: (b) => b.version, align: "right", width: 80 },
    { key: "alt", label: "Alt.", value: (b) => b.alt_no, align: "right", width: 60 },
    { key: "status", label: "Status", value: (b) => b.status, filter: true, width: 110, render: (b) => <Chip label={b.status} tone={statusTone(b.status)} /> },
    { key: "from", label: "Valid from", value: (b) => b.valid_from, width: 110 },
    { key: "to", label: "Valid to", value: (b) => b.valid_to ?? "", width: 110 },
    { key: "base", label: "Per", value: (b) => `${Number(b.base_qty)} ${item(b.item_id)?.base_uom ?? ""}`, width: 90, defaultHidden: true },
    { key: "lines", label: "Lines", value: (b) => b.mfg_bom_items?.[0]?.count ?? 0, align: "right", width: 70 },
    { key: "desc", label: "Note", value: (b) => b.description ?? "", width: 200, defaultHidden: true },
  ];

  return (
    <Panel title="Bills of materials">
      <div className="text-[12px] text-[#7F8EA0] mb-3">What goes into one finished or semi-finished item. Each change is a new version; only an active version can be used for production.</div>
      <ListReport listKey="mfg-boms" rows={rows} columns={columns} rowKey={(b) => b.id} exportName="bills-of-materials"
        emptyText="No bills of materials yet. Add your items first, then build the first structure."
        onRowClick={(b) => router.push(`/mfg/master/bom/${b.id}`)}
        toolbar={!readOnly ? <GoldBtn onClick={() => router.push("/mfg/master/bom/new")}><Plus size={13} /> New BOM</GoldBtn> : undefined} />
    </Panel>
  );
}

export function RoutingsTab({ lookups, readOnly }: { lookups: Lookups; readOnly: boolean }) {
  const { effectiveTenantId } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<RoutingRow[]>([]);
  useEffect(() => {
    if (!effectiveTenantId) return;
    supabase.from("mfg_routings").select("*, mfg_routing_ops(count)").eq("tenant_id", effectiveTenantId).order("document_number")
      .then((r) => { showQueryErrors(r); setRows((r.data as unknown as RoutingRow[]) ?? []); });
  }, [effectiveTenantId]);

  const columns: ListColumn<RoutingRow>[] = [
    { key: "no", label: "Routing", value: (r) => r.document_number ?? "", width: 100 },
    { key: "item", label: "Item", value: (r) => lookups.items.find((i) => i.item_id === r.item_id)?.name ?? "—", width: 220 },
    { key: "ver", label: "Version", value: (r) => r.version, align: "right", width: 80 },
    { key: "alt", label: "Alt.", value: (r) => r.alt_no, align: "right", width: 60 },
    { key: "status", label: "Status", value: (r) => r.status, filter: true, width: 110, render: (r) => <Chip label={r.status} tone={statusTone(r.status)} /> },
    { key: "ops", label: "Operations", value: (r) => r.mfg_routing_ops?.[0]?.count ?? 0, align: "right", width: 100 },
    { key: "desc", label: "Note", value: (r) => r.description ?? "", width: 220 },
  ];

  return (
    <Panel title="Routings">
      <div className="text-[12px] text-[#7F8EA0] mb-3">The steps to make an item: which work center, and how long setup, running and teardown take. Only one routing per item and alternative is active.</div>
      <ListReport listKey="mfg-routings" rows={rows} columns={columns} rowKey={(r) => r.id} exportName="routings"
        emptyText="No routings yet. Add work centers first, then describe how an item is made."
        onRowClick={(r) => router.push(`/mfg/master/routing/${r.id}`)}
        toolbar={!readOnly ? <GoldBtn onClick={() => router.push("/mfg/master/routing/new")}><Plus size={13} /> New routing</GoldBtn> : undefined} />
    </Panel>
  );
}
