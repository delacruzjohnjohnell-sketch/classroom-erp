"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import VoucherBadge from "@/components/mfg/VoucherBadge";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";

type Inv = { id: string; document_number: string | null; order_date: string; due_date: string | null; total: number; status: string; customers: { name: string } | null };
const STATUS: Record<string, [string, "good" | "warn" | "muted" | "bad"]> = { draft: ["Draft", "warn"], fulfilled: ["Posted", "good"], void: ["Voided", "muted"] };

/**
 * The invoices raised from deliveries, each with the journal voucher the posting wrote (and the reversal voucher if it was voided).
 * The Sales page is the Standard screen, so the voucher link for a sale lives here.
 */
export default function SalesInvoicesPanel({ reloadKey }: { reloadKey?: unknown }) {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Inv[]>([]);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const l = await supabase.from("mfg_invoice_links").select("invoice_id").eq("tenant_id", effectiveTenantId);
    if (showQueryErrors(l)) return;
    const ids = [...new Set(((l.data as { invoice_id: string }[]) ?? []).map((x) => x.invoice_id))];
    if (!ids.length) { setRows([]); return; }
    const r = await supabase.from("invoices").select("id, document_number, order_date, due_date, total, status, customers(name)").in("id", ids).order("order_date", { ascending: false });
    showQueryErrors(r);
    setRows(((r.data as unknown as Inv[]) ?? []).map((x) => ({ ...x, total: Number(x.total) })));
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, reloadKey]);

  const columns: ListColumn<Inv>[] = [
    { key: "no", label: "Invoice", value: (r) => r.document_number ?? "", width: 110 },
    { key: "cust", label: "Customer", value: (r) => r.customers?.name ?? "—", filter: true, width: 190 },
    { key: "date", label: "Date", value: (r) => r.order_date, width: 105 },
    { key: "due", label: "Due", value: (r) => r.due_date ?? "", width: 105, defaultHidden: true },
    { key: "total", label: "Total", value: (r) => r.total, align: "right", width: 120, render: (r) => money(r.total) },
    { key: "status", label: "Status", value: (r) => STATUS[r.status]?.[0] ?? r.status, filter: true, width: 100, render: (r) => <Chip label={STATUS[r.status]?.[0] ?? r.status} tone={STATUS[r.status]?.[1] ?? "muted"} /> },
    { key: "jv", label: "Journal voucher", value: () => "", width: 220, render: (r) => r.status === "draft" ? <span className="text-[11.5px] text-[#7F8EA0]">Posts when you post the invoice</span> : <span className="inline-flex gap-1 flex-wrap"><VoucherBadge sourceId={r.id} reloadKey={r.status} /></span> },
  ];

  return (
    <Panel title="Sales invoices from deliveries">
      <div className="text-[12px] text-[#7F8EA0] mb-2">Post a draft invoice on the Sales page. Its journal voucher appears here once it is posted; click the voucher number to see the debits, credits and sign-off.</div>
      <ListReport listKey="mfg-sales-invoices" rows={rows} columns={columns} rowKey={(r) => r.id} exportName="sales-invoices" emptyText="No invoice has been raised from a delivery yet." />
    </Panel>
  );
}
