"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import MfgDashboard, { type DashData } from "@/components/mfg/MfgDashboard";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { DOC_TYPE_LABEL, INVOICE_STATUS_LABEL } from "@/lib/mfgOps";
import { firstName, greeting, isoDay, lastDays, outputByDay, pctChange, shareOf, shortDay, stockState, whenLabel } from "@/lib/mfgDash";

const OPEN = ["CREATED", "PENDING_APPROVAL", "RELEASED", "PARTIALLY_CONFIRMED", "CONFIRMED", "DELIVERED"];
const DOC_KIND: Record<string, string> = { GR: "receipt", GI: "issue", FGR: "goods", ADJ: "stock", TRF: "stock", DLV: "ship", REV: "stock" };

// The Manufacturing home page: today's numbers, what is in progress, what needs attention.
export default function MfgHomePage() {
  return <AppShell><Body /></AppShell>;
}

function Body() {
  const { effectiveTenantId, profile, tenants } = useSession();
  const { data: lk, loading: lkLoading } = useLookups();
  const [data, setData] = useState<DashData | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId || !profile) return;
    const t = effectiveTenantId;
    const now = new Date();
    const today = isoDay(now);
    const days7 = lastDays(7, today);
    const from30 = lastDays(30, today)[0];
    const [o, c, st, set, po, hi, dc, cf, se, vi, rec] = await Promise.all([
      supabase.from("mfg_production_orders").select("id, document_number, item_id, qty_planned, qty_good, status, planned_end, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(500),
      supabase.from("mfg_confirmations").select("order_id, posting_date, yield_qty, scrap_qty").eq("tenant_id", t).gte("posting_date", from30),
      supabase.from("mfg_stock").select("item_id, qty").eq("tenant_id", t),
      supabase.from("mfg_company_settings").select("costing_method").eq("tenant_id", t).maybeSingle(),
      supabase.from("purchase_orders").select("id, status, purchase_order_lines(mfg_po_line_items(item_id))").eq("tenant_id", t),
      supabase.from("mfg_vendor_invoices").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("status", "HELD"),
      supabase.from("mfg_material_documents").select("id, document_number, doc_type, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(6),
      supabase.from("mfg_confirmations").select("id, document_number, order_id, yield_qty, reversal_of, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(6),
      supabase.from("mfg_settlements").select("id, document_number, order_id, reversal_of, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(4),
      supabase.from("mfg_vendor_invoices").select("id, document_number, status, vendor_ref, created_at").eq("tenant_id", t).order("created_at", { ascending: false }).limit(4),
      supabase.rpc("mfg_reconciliation", { p_tenant: t }),
    ]);

    const orders = (o.data as { id: string; document_number: string | null; item_id: string; qty_planned: number; qty_good: number; status: string; planned_end: string | null }[]) ?? [];
    const conf = (c.data as { order_id: string; posting_date: string; yield_qty: number; scrap_qty: number }[]) ?? [];
    const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
    const method = (set.data as { costing_method?: string } | null)?.costing_method ?? "STANDARD";

    // production
    const output = outputByDay(conf, days7);
    const todayUnits = outputByDay(conf, [today])[0].good;
    const yesterdayUnits = outputByDay(conf, [lastDays(2, today)[0]])[0].good;
    const orderItem = new Map(orders.map((x) => [x.id, x.item_id]));
    const perItem = new Map<string, number>();
    for (const r of conf) { const it = orderItem.get(r.order_id); if (it) perItem.set(it, (perItem.get(it) ?? 0) + Number(r.yield_qty)); }
    const lines = shareOf(Array.from(perItem, ([id, qty]) => ({ name: itemName(id), qty })), 4);
    const open = orders.filter((x) => OPEN.includes(x.status));

    // stock
    const onHand = new Map<string, number>();
    for (const r of (st.data as { item_id: string; qty: number }[]) ?? []) onHand.set(r.item_id, (onHand.get(r.item_id) ?? 0) + Number(r.qty));
    let value = 0;
    for (const [id, q] of onHand) {
      const m = lk.items.find((i) => i.item_id === id);
      value += q * Number(method === "STANDARD" ? m?.standard_cost ?? 0 : m?.moving_avg_cost ?? 0);
    }
    const sev = { OUT: 0, LOW: 1, OK: 2 } as const;
    const stock = lk.items
      .filter((i) => i.active && i.item_type !== "SERVICE" && ((onHand.get(i.item_id) ?? 0) !== 0 || Number(i.reorder_point) > 0))
      .map((i) => ({ id: i.item_id, sku: i.sku, name: i.name, onHand: onHand.get(i.item_id) ?? 0, reorder: Number(i.reorder_point), uom: i.base_uom, state: stockState(onHand.get(i.item_id) ?? 0, Number(i.reorder_point)) }))
      .sort((a, b) => sev[a.state] - sev[b.state] || a.name.localeCompare(b.name));
    const lowCount = stock.filter((s) => s.state !== "OK").length;

    // purchasing
    const pos = ((po.data as unknown as { status: string; purchase_order_lines: { mfg_po_line_items: unknown }[] }[]) ?? [])
      .filter((p) => p.purchase_order_lines?.some((l) => (Array.isArray(l.mfg_po_line_items) ? l.mfg_po_line_items.length : l.mfg_po_line_items)));
    const pendingPos = pos.filter((p) => p.status !== "closed").length;
    const held = hi.count ?? 0;
    const off = ((rec.data as { difference: number }[]) ?? []).filter((r) => Math.abs(Number(r.difference)) >= 0.05).length;

    // recent activity
    type Act = { id: string; kind: string; title: string; detail: string; at: string; href: string };
    const acts: Act[] = [
      ...((dc.data as { id: string; document_number: string; doc_type: string; created_at: string }[]) ?? []).map((x) => ({ id: x.id, kind: DOC_KIND[x.doc_type] ?? "stock", title: x.document_number, detail: DOC_TYPE_LABEL[x.doc_type] ?? x.doc_type, at: x.created_at, href: "/mfg/inventory?tab=documents" })),
      ...((cf.data as { id: string; document_number: string | null; order_id: string; yield_qty: number; reversal_of: string | null; created_at: string }[]) ?? []).map((x) => ({ id: x.id, kind: "order", title: x.document_number ?? "Confirmation", detail: x.reversal_of ? "Production confirmation reversed" : `Production confirmed: ${Number(x.yield_qty)} good units`, at: x.created_at, href: `/mfg/production/${x.order_id}` })),
      ...((se.data as { id: string; document_number: string | null; order_id: string; reversal_of: string | null; created_at: string }[]) ?? []).map((x) => ({ id: x.id, kind: "done", title: x.document_number ?? "Settlement", detail: x.reversal_of ? "Order settlement reversed" : "Order settled", at: x.created_at, href: `/mfg/production/${x.order_id}` })),
      ...((vi.data as { id: string; document_number: string | null; status: string; vendor_ref: string; created_at: string }[]) ?? []).map((x) => ({ id: x.id, kind: x.status === "HELD" ? "hold" : "invoice", title: x.document_number ?? "Vendor invoice", detail: `Vendor invoice ${x.vendor_ref}: ${(INVOICE_STATUS_LABEL[x.status] ?? x.status).toLowerCase()}`, at: x.created_at, href: "/mfg/purchasing" })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);

    setData({
      firstName: firstName(profile.full_name),
      greeting: greeting(now.getHours()),
      dateLabel: now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      timeLabel: now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
      viewingOther: profile.role === "teacher" ? tenants.find((x) => x.id === t)?.name ?? "this company" : null,
      kpis: { producedToday: todayUnits, producedChange: pctChange(todayUnits, yesterdayUnits), openOrders: open.length, ordersWaiting: open.filter((x) => x.status === "PENDING_APPROVAL").length, inventoryValue: Math.round(value * 100) / 100, costBasis: method === "STANDARD" ? "at standard cost" : "at average cost", pendingPos, heldInvoices: held },
      output: output.map((r) => ({ label: r.label, good: r.good, scrap: r.scrap })),
      lines,
      orders: open.slice(0, 6).map((x) => ({ id: x.id, no: x.document_number ?? "", product: itemName(x.item_id), planned: Number(x.qty_planned), produced: Number(x.qty_good), status: x.status, eta: x.planned_end ? shortDay(x.planned_end) : "" })),
      stock: stock.slice(0, 6),
      activity: acts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, detail: a.detail, when: whenLabel(a.at, now), href: a.href })),
      attention: [
        { label: "Production orders waiting for approval", count: open.filter((x) => x.status === "PENDING_APPROVAL").length, href: "/mfg/production", tone: "warn" },
        { label: "Vendor invoices on hold", count: held, href: "/mfg/purchasing", tone: "bad" },
        { label: "Orders finished and ready to settle", count: open.filter((x) => x.status === "CONFIRMED" || x.status === "DELIVERED").length, href: "/mfg/production", tone: "warn" },
        { label: "Items out of stock or below the reorder level", count: lowCount, href: "/mfg/inventory", tone: "warn" },
        { label: "Stock-versus-books differences", count: off, href: "/mfg/inventory?tab=reconcile", tone: "bad" },
      ],
    });
  }, [effectiveTenantId, profile, tenants, lk.items]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!lkLoading) load(); }, [load, lkLoading]);

  if (lkLoading || !data) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#2F6BFF" /></div>;
  return <MfgDashboard d={data} />;
}
