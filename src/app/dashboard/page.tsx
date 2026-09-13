"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, Receipt, Package, Briefcase, Truck, ShoppingCart, AlertTriangle, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, round2 } from "@/lib/types";
import { computeMetrics, buildMonthlySeries, buildExpenseBreakdown, type EntryWithLines } from "@/lib/metrics";
import type { Account, Item, PurchaseOrder, SalesOrder, PayrollRun } from "@/lib/types";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F", LINE = "#DDD8CC", INK = "#1B2430";
const PIE_COLORS = ["#12524F", "#C08A2E", "#A6402F", "#5B7B93", "#8A8172", "#7A9E8E"];
const tooltipStyle = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 };

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [headcount, setHeadcount] = useState(0);
  const [openPOs, setOpenPOs] = useState(0);
  const [openSOs, setOpenSOs] = useState(0);
  const [customerRevenue, setCustomerRevenue] = useState<{ name: string; value: number }[]>([]);
  const [activity, setActivity] = useState<{ date: string; type: string; label: string }[]>([]);

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

      const accountsData = (acc.data as Account[]) ?? [];
      const entriesData = (ent.data as any as EntryWithLines[]) ?? [];
      const itemsData = (itemsRes.data as Item[]) ?? [];
      const pos = (poRes.data as any[]) ?? [];
      const sos = (soRes.data as any[]) ?? [];
      const prs = (prRes.data as PayrollRun[]) ?? [];

      setAccounts(accountsData);
      setEntries(entriesData);
      setItems(itemsData);
      setHeadcount(empRes.data?.length ?? 0);
      setOpenPOs(pos.filter((p) => p.status !== "received").length);
      setOpenSOs(sos.filter((s) => s.status !== "fulfilled").length);

      const revByCustomer: Record<string, number> = {};
      sos.filter((s) => s.status === "fulfilled").forEach((s) => {
        const name = s.customers?.name ?? "Unknown";
        revByCustomer[name] = (revByCustomer[name] || 0) + s.total;
      });
      setCustomerRevenue(Object.entries(revByCustomer).sort(([, a], [, b]) => b - a).slice(0, 6).map(([name, value]) => ({ name, value: round2(value) })));

      const feed = [
        ...entriesData.map((e) => ({ date: e.entry_date, type: "Journal", label: e.memo || "Journal entry" })),
        ...pos.map((p) => ({ date: p.order_date, type: "Purchase order", label: `${p.vendors?.name ?? "Vendor"} · ${money(p.total)} · ${p.status}` })),
        ...sos.map((s) => ({ date: s.order_date, type: "Sales order", label: `${s.customers?.name ?? "Customer"} · ${money(s.total)} · ${s.status}` })),
        ...prs.map((r) => ({ date: r.run_date, type: "Payroll", label: `${money(r.total)} · ${r.headcount} employees` })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
      setActivity(feed);

      setLoading(false);
    })();
  }, [effectiveTenantId]);

  const metrics = useMemo(() => {
    const inventoryValue = items.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
    return computeMetrics(accounts, entries, inventoryValue, headcount);
  }, [accounts, entries, items, headcount]);

  const revenueSeries = useMemo(() => buildMonthlySeries(accounts, entries, "4000"), [accounts, entries]);
  const expenseBreakdown = useMemo(() => buildExpenseBreakdown(accounts, entries), [accounts, entries]);
  const topInventory = useMemo(() => [...items].sort((a, b) => b.qty_on_hand * b.unit_cost - a.qty_on_hand * a.unit_cost).slice(0, 6)
    .map((i) => ({ name: i.name.length > 12 ? i.name.slice(0, 11) + "…" : i.name, Value: round2(i.qty_on_hand * i.unit_cost) })), [items]);
  const lowStockCount = items.filter((i) => i.qty_on_hand <= i.reorder_point).length;

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard badge={0} icon={<TrendingUp size={16} />} label="Total revenue" value={money(metrics.revenue)} accent={TEAL} />
        <KpiCard badge={1} icon={<TrendingDown size={16} />} label="Total expenses" value={money(metrics.expenses)} accent={RED} />
        <KpiCard badge={2} icon={<Wallet size={16} />} label="Net income" value={money(metrics.netIncome)} accent={metrics.netIncome >= 0 ? TEAL : RED} />
        <KpiCard badge={3} icon={<Receipt size={16} />} label="Cash balance" value={money(metrics.cash)} />
        <KpiCard icon={<Package size={16} />} label="Inventory value" value={money(metrics.inventoryValue)} />
        <KpiCard icon={<Briefcase size={16} />} label="Employees" value={metrics.headcount} />
        <KpiCard icon={<Truck size={16} />} label="Open POs" value={openPOs} />
        <KpiCard icon={<ShoppingCart size={16} />} label="Open sales orders" value={openSOs} />
        <KpiCard icon={<AlertTriangle size={16} />} label="Low stock items" value={lowStockCount} accent={lowStockCount > 0 ? RED : TEAL} />
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Panel title="Revenue over time">
          {revenueSeries.length === 0 ? <Empty>No sales recorded yet.</Empty> : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={revenueSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `₱${v}`} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="value" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3, fill: TEAL }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Expense breakdown">
          {expenseBreakdown.length === 0 ? <Empty>No expenses recorded yet.</Empty> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {expenseBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Panel title="Top customers by revenue">
          {customerRevenue.length === 0 ? <Empty>No fulfilled sales orders yet.</Empty> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={customerRevenue} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {customerRevenue.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Top inventory value">
          {topInventory.length === 0 ? <Empty>No inventory items yet.</Empty> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={topInventory} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `₱${v}`} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="Value" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Recent activity across all modules">
        {activity.length === 0 ? <Empty>Nothing recorded yet — activity from every module will show up here.</Empty> : (
          <div className="flex flex-col">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 py-2 border-b border-hairline text-[12.5px]">
                <span className="text-[10.5px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color: TEAL, borderColor: TEAL }}>{a.type}</span>
                <span className="flex-1">{a.label}</span>
                <span className="text-[#8a8172] text-xs whitespace-nowrap">{a.date}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
