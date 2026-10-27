"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import StdDashboard, { type StdDashData } from "@/components/StdDashboard";
import PracticeReportPanel from "@/components/PracticeReportPanel";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, round2 } from "@/lib/types";
import { computeMetrics, buildMonthlySeries, buildExpenseBreakdown, type EntryWithLines } from "@/lib/metrics";
import { firstName, greeting, isoDay, pctChange, shareOf, shortDay } from "@/lib/mfgDash";
import type { Account, Item, PayrollRun } from "@/lib/types";

const TEAL = "#22D3C5";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { effectiveTenantId, profile, tenants } = useSession();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [headcount, setHeadcount] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);       // the "invoices" table holds the sales orders of the Standard ERP
  const [bills, setBills] = useState<any[]>([]);          // and "bills" holds its purchase orders
  const [payroll, setPayroll] = useState<PayrollRun[]>([]);

  useEffect(() => {
    if (!effectiveTenantId) return;
    (async () => {
      setLoading(true);
      const [acc, ent, itemsRes, empRes, poRes, soRes, prRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("journal_entries").select("id, entry_date, memo, journal_lines(*)").eq("tenant_id", effectiveTenantId),
        supabase.from("items").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("employees").select("id").eq("tenant_id", effectiveTenantId),
        supabase.from("bills").select("*, vendors(name)").eq("tenant_id", effectiveTenantId),
        supabase.from("invoices").select("*, customers(name)").eq("tenant_id", effectiveTenantId),
        supabase.from("payroll_runs").select("*").eq("tenant_id", effectiveTenantId),
      ]);
      setAccounts((acc.data as Account[]) ?? []);
      setEntries((ent.data as any as EntryWithLines[]) ?? []);
      setItems((itemsRes.data as Item[]) ?? []);
      setHeadcount(empRes.data?.length ?? 0);
      setBills((poRes.data as any[]) ?? []);
      setOrders((soRes.data as any[]) ?? []);
      setPayroll((prRes.data as PayrollRun[]) ?? []);
      setLoading(false);
    })();
  }, [effectiveTenantId]);

  const data = useMemo<StdDashData>(() => {
    const now = new Date();
    const today = isoDay(now);
    const inventoryValue = items.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
    const metrics = computeMetrics(accounts, entries, inventoryValue, headcount);
    const series = buildMonthlySeries(accounts, entries, "4000").map((r) => ({ ...r, label: r.label.replace(/ (\d\d)$/, " \u2019$1") }));   // "Oct 26" reads like a day, so show "Oct \u201926"
    const last = series[series.length - 1], before = series[series.length - 2];
    const expenses = shareOf(buildExpenseBreakdown(accounts, entries).map((e) => ({ name: e.name, qty: e.value })), 4).map((e) => ({ name: e.name, value: round2(e.qty), pct: e.pct }));

    const openSales = orders.filter((s) => s.status !== "fulfilled");
    const openBills = bills.filter((p) => p.status !== "received");
    const overdueSales = openSales.filter((s) => s.due_date && s.due_date < today && s.status !== "draft").length;
    const overdueBills = openBills.filter((p) => p.due_date && p.due_date < today).length;
    const low = items.filter((i) => i.qty_on_hand <= i.reorder_point);
    const stock = [...low].sort((a, b) => a.qty_on_hand - b.qty_on_hand).slice(0, 6)
      .map((i) => ({ id: i.id, name: i.name, onHand: i.qty_on_hand, reorder: i.reorder_point, state: (i.qty_on_hand <= 0 ? "OUT" : "LOW") as "OUT" | "LOW" }));

    const feed = [
      ...entries.map((e) => ({ date: e.entry_date, kind: "Journal", title: e.memo || "Journal entry", detail: "Journal entry" })),
      ...bills.map((p) => ({ date: p.order_date, kind: "Purchase order", title: p.vendors?.name ?? "Vendor", detail: `Purchase order · ${money(p.total)} · ${p.status}` })),
      ...orders.map((s) => ({ date: s.order_date, kind: "Sales order", title: s.customers?.name ?? "Customer", detail: `Sales order · ${money(s.total)} · ${s.status}` })),
      ...payroll.map((r) => ({ date: r.run_date, kind: "Payroll", title: `Payroll · ${money(r.total)}`, detail: `${r.headcount} employees` })),
    ].filter((a) => a.date).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6)
      .map((a, i) => ({ key: `${i}-${a.date}`, kind: a.kind, title: a.title, detail: a.detail, when: shortDay(a.date) }));

    return {
      firstName: firstName(profile?.full_name),
      greeting: greeting(now.getHours()),
      dateLabel: now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      timeLabel: now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
      viewingOther: profile?.role === "teacher" ? tenants.find((x) => x.id === effectiveTenantId)?.name ?? "this company" : null,
      kpis: { revenue: metrics.revenue, revenueChange: last && before ? pctChange(last.value, before.value) : null, netIncome: metrics.netIncome, cash: metrics.cash, openSales: openSales.length, openPurchases: openBills.length },
      revenueSeries: series,
      expenses,
      openOrders: [...openSales].sort((a, b) => ((a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1)).slice(0, 6)
        .map((s) => ({ id: s.id, customer: s.customers?.name ?? "Customer", total: Number(s.total), due: s.due_date ?? "", status: s.status, overdue: !!s.due_date && s.due_date < today && s.status !== "draft" })),
      stock,
      activity: feed,
      attention: [
        { label: "Invoices past their due date", count: overdueSales, href: "/sales", tone: "bad" },
        { label: "Bills past their due date", count: overdueBills, href: "/procurement", tone: "bad" },
        { label: "Items out of stock or below the reorder level", count: low.length, href: "/inventory", tone: "warn" },
        { label: "Sales orders not yet fulfilled", count: openSales.length, href: "/sales", tone: "warn" },
        { label: "Purchase orders not yet received", count: openBills.length, href: "/procurement", tone: "warn" },
      ],
    };
  }, [accounts, entries, items, headcount, orders, bills, payroll, profile, tenants, effectiveTenantId]);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <PracticeReportPanel />
      <StdDashboard d={data} />
    </>
  );
}
