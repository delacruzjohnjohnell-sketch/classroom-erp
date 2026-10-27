"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowRight, BookOpen, Briefcase, CheckCircle2, ClipboardList, FileBarChart, Package, ReceiptText, ShoppingCart, Truck, Wallet, TrendingUp, Banknote,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "./ListReport";
import { Card, Kpi } from "./mfg/MfgDashboard";

export type StdDashData = {
  firstName: string;
  greeting: string;
  dateLabel: string;
  timeLabel: string;
  viewingOther: string | null;
  kpis: { revenue: number; revenueChange: number | null; netIncome: number; cash: number; openSales: number; openPurchases: number; };
  revenueSeries: { label: string; value: number }[];
  expenses: { name: string; value: number; pct: number }[];
  openOrders: { id: string; customer: string; total: number; due: string; status: string; overdue: boolean }[];
  stock: { id: string; name: string; onHand: number; reorder: number; state: "OUT" | "LOW" }[];
  activity: { key: string; kind: string; title: string; detail: string; when: string }[];
  attention: { label: string; count: number; href: string; tone: "bad" | "warn" }[];
};

const pesos = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const BLUE = "#2F6BFF", GREEN = "#14A56B", ORANGE = "#F5A524", PURPLE = "#7C5CFC", GREY = "#9AA8BF";
const DONUT = [BLUE, GREEN, ORANGE, PURPLE, GREY];

const ACTIONS = [
  { label: "Create Invoice", href: "/sales", icon: ShoppingCart, tint: "#EEF3FF", color: BLUE },
  { label: "Enter a Bill", href: "/procurement", icon: Truck, tint: "#EAF8F1", color: GREEN },
  { label: "Adjust Inventory", href: "/inventory", icon: Package, tint: "#F3EFFF", color: PURPLE },
  { label: "Journal Entry", href: "/financials", icon: BookOpen, tint: "#FFF4E5", color: "#E08A00" },
  { label: "Run Payroll", href: "/hr", icon: Briefcase, tint: "#EAF6FB", color: "#1688B8" },
  { label: "View Reports", href: "/reports", icon: FileBarChart, tint: "#F1F4F9", color: "#5B6B85" },
];

const KIND_ICON: Record<string, { icon: React.ReactNode; tint: string }> = {
  Journal: { icon: <BookOpen size={18} color={BLUE} />, tint: "#EEF3FF" },
  "Purchase order": { icon: <Truck size={18} color={GREEN} />, tint: "#EAF8F1" },
  "Sales order": { icon: <ReceiptText size={18} color="#E08A00" />, tint: "#FFF4E5" },
  Payroll: { icon: <Briefcase size={18} color={PURPLE} />, tint: "#F3EFFF" },
};

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "muted"> = { draft: "muted", sent: "warn", partial: "warn", overdue: "bad", fulfilled: "good" };

/** The Standard ERP home page. It only draws the numbers it is given. */
export default function StdDashboard({ d }: { d: StdDashData }) {
  const noRevenue = d.revenueSeries.length === 0;
  const expenseTotal = d.expenses.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213B]">{d.greeting}, {d.firstName}!</h1>
          <div className="text-[14.5px] text-[#6B7A92] mt-1">Here&rsquo;s what&rsquo;s happening in your business today.</div>
          {d.viewingOther && <div className="text-[12.5px] mt-2 inline-block rounded-md px-2.5 py-1 bg-[#FFF4E5] text-[#B26A00]">You are viewing {d.viewingOther} (read-only).</div>}
        </div>
        <div className="flex items-center gap-2.5 text-right">
          <div className="w-10 h-10 rounded-lg border border-[#E4EAF3] bg-white flex items-center justify-center text-[#6B7A92]"><ClipboardList size={18} /></div>
          <div className="leading-tight"><div className="text-[14px] font-semibold text-[#17213B]">{d.dateLabel}</div><div className="text-[12.5px] text-[#6B7A92]">{d.timeLabel}</div></div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Kpi icon={<TrendingUp size={24} color={BLUE} />} tint="#F2F6FF" tile="#DCE7FF" label="Total Revenue" value={pesos(d.kpis.revenue)} delta={d.kpis.revenueChange} sub="vs. previous month" />
            <Kpi icon={<Wallet size={24} color={d.kpis.netIncome >= 0 ? GREEN : "#E5484D"} />} tint={d.kpis.netIncome >= 0 ? "#F0FAF5" : "#FDF1F1"} tile={d.kpis.netIncome >= 0 ? "#D6F1E3" : "#F9D9D9"} label="Net Income" value={pesos(d.kpis.netIncome)} sub={d.kpis.netIncome >= 0 ? "profit so far" : "loss so far"} />
            <Kpi icon={<Banknote size={24} color="#E08A00" />} tint="#FFF8EE" tile="#FFE8C7" label="Cash Balance" value={pesos(d.kpis.cash)} sub="in the books" />
            <Kpi icon={<ShoppingCart size={24} color={PURPLE} />} tint="#F7F4FF" tile="#E7DFFF" label="Open Sales Orders" value={String(d.kpis.openSales)} sub={`${d.kpis.openPurchases} open purchase order${d.kpis.openPurchases === 1 ? "" : "s"}`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card title="Revenue Over Time" link={{ href: "/reports", label: "Reports" }}>
              {noRevenue ? <div className="h-[230px] flex items-center justify-center text-[13px] text-[#6B7A92] text-center px-6">No sales recorded yet. Post an invoice and it appears here.</div> : (
                <div className="h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.revenueSeries} margin={{ top: 8, right: 6, left: -4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#EEF2F8" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7A92" }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7A92" }} tickFormatter={(v) => `₱${Number(v).toLocaleString("en-PH")}`} />
                      <Tooltip formatter={(v: number) => pesos(v)} cursor={{ fill: "rgba(47,107,255,0.06)" }} contentStyle={{ borderRadius: 10, border: "1px solid #E4EAF3", fontSize: 12.5 }} />
                      <Bar dataKey="value" name="Revenue" fill={BLUE} radius={[5, 5, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Expenses by Account">
              {d.expenses.length === 0 ? <div className="h-[230px] flex items-center justify-center text-[13px] text-[#6B7A92] text-center px-6">No expenses recorded yet.</div> : (
                <div className="flex items-center gap-3">
                  <div className="relative w-[170px] h-[170px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={d.expenses} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
                          {d.expenses.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => pesos(v)} contentStyle={{ borderRadius: 10, border: "1px solid #E4EAF3", fontSize: 12.5 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-[17px] font-bold text-[#17213B]">{pesos(expenseTotal)}</div>
                      <div className="text-[11.5px] text-[#6B7A92]">total</div>
                    </div>
                  </div>
                  <ul className="flex-1 min-w-0 flex flex-col gap-2">
                    {d.expenses.map((l, i) => (
                      <li key={l.name} className="flex items-center gap-2 text-[13px]">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT[i % DONUT.length] }} />
                        <span className="truncate flex-1 text-[#17213B]">{l.name}</span>
                        <b className="text-[#4B5B75]">{l.pct}%</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <Card title="Open Sales Orders" link={{ href: "/sales", label: "View all" }}>
            {d.openOrders.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">No sales orders are open. Create one from Quick Actions.</div> : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 520 }}>
                  <thead><tr><th>Customer</th><th style={{ textAlign: "right" }}>Total</th><th>Status</th><th>Due</th></tr></thead>
                  <tbody>
                    {d.openOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-medium text-[#17213B]">{o.customer}</td>
                        <td style={{ textAlign: "right" }}>{pesos(o.total)}</td>
                        <td><Chip label={o.overdue ? "Overdue" : o.status} tone={o.overdue ? "bad" : STATUS_TONE[o.status] ?? "muted"} /></td>
                        <td className="text-[#4B5B75]">{o.due || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Stock to Reorder" link={{ href: "/inventory", label: "View all" }}>
              {d.stock.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">Every item is above its reorder level.</div> : (
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 340 }}>
                    <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>On hand</th><th style={{ textAlign: "right" }}>Reorder at</th><th>Status</th></tr></thead>
                    <tbody>
                      {d.stock.map((s) => (
                        <tr key={s.id}>
                          <td className="font-medium text-[#17213B]">{s.name}</td>
                          <td style={{ textAlign: "right" }}>{s.onHand}</td>
                          <td style={{ textAlign: "right" }}>{s.reorder}</td>
                          <td><Chip label={s.state === "OUT" ? "Out of stock" : "Low stock"} tone={s.state === "OUT" ? "bad" : "warn"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Needs Your Attention">
              <ul className="flex flex-col divide-y divide-[#EEF2F8]">
                {d.attention.map((a) => (
                  <li key={a.label}>
                    <Link href={a.href} className="flex items-center gap-3 py-3 hover:bg-[#F8FAFD] -mx-2 px-2 rounded-lg">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.count ? (a.tone === "bad" ? "#FDECEC" : "#FFF4E5") : "#EAF8F1" }}>
                        {a.count ? <AlertTriangle size={17} color={a.tone === "bad" ? "#E5484D" : "#E08A00"} /> : <CheckCircle2 size={17} color={GREEN} />}
                      </span>
                      <span className="flex-1 text-[13.5px] text-[#17213B]">{a.label}</span>
                      <b className="text-[15px]" style={{ color: a.count ? (a.tone === "bad" ? "#E5484D" : "#B26A00") : GREEN }}>{a.count}</b>
                      <ArrowRight size={14} className="text-[#9AA8BF]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          <Card title="Quick Actions">
            <div className="grid grid-cols-3 gap-3">
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.label} href={a.href} className="rounded-xl p-3 flex flex-col items-center justify-start text-center gap-2 hover:shadow-[0_6px_16px_rgba(23,33,59,0.10)] transition-shadow min-h-[104px]" style={{ background: a.tint }}>
                    <span className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center"><Icon size={20} color={a.color} /></span>
                    <span className="text-[12px] font-semibold text-[#17213B] leading-tight">{a.label}</span>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card title="Recent Activity" link={{ href: "/financials", label: "View all" }}>
            {d.activity.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">Nothing has been posted yet. Activity from every module will show up here.</div> : (
              <ul className="flex flex-col">
                {d.activity.map((a) => {
                  const k = KIND_ICON[a.kind] ?? KIND_ICON.Journal;
                  return (
                    <li key={a.key} className="flex items-center gap-3 py-2.5">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: k.tint }}>{k.icon}</span>
                      <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold text-[#17213B] truncate">{a.title}</span><span className="block text-[12px] text-[#6B7A92] truncate">{a.detail}</span></span>
                      <span className="text-[12px] text-[#6B7A92] shrink-0">{a.when}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
