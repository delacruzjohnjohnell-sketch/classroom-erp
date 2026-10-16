"use client";

import Link from "next/link";
import {
  ArrowDown, ArrowRight, ArrowUp, Boxes, ClipboardList, Cog, Factory, FilePlus2, Package, PackageCheck, ReceiptText, ShoppingCart, Truck, Wallet, AlertTriangle, CheckCircle2, Layers,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "../ListReport";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, qtyText } from "@/lib/mfgOps";
import { STOCK_STATE_LABEL, type StockState } from "@/lib/mfgDash";

export type DashData = {
  firstName: string;
  greeting: string;
  dateLabel: string;
  timeLabel: string;
  viewingOther: string | null;
  kpis: {
    producedToday: number; producedChange: number | null;
    openOrders: number; ordersWaiting: number;
    inventoryValue: number; costBasis: string;
    pendingPos: number; heldInvoices: number;
  };
  output: { label: string; good: number; scrap: number }[];
  lines: { name: string; qty: number; pct: number }[];
  orders: { id: string; no: string; product: string; planned: number; produced: number; status: string; eta: string }[];
  stock: { id: string; sku: string; name: string; onHand: number; reorder: number; uom: string; state: StockState }[];
  activity: { id: string; kind: string; title: string; detail: string; when: string; href: string }[];
  attention: { label: string; count: number; href: string; tone: "bad" | "warn" | "good" }[];
};

const pesos = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const BLUE = "#2F6BFF", GREEN = "#14A56B", ORANGE = "#F5A524", PURPLE = "#7C5CFC", GREY = "#9AA8BF";
const DONUT = [BLUE, GREEN, ORANGE, PURPLE, GREY];

function Card({ title, link, children, className = "" }: { title: string; link?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-[#E4EAF3] rounded-[14px] p-5 shadow-[0_1px_3px_rgba(23,33,59,0.05)] ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-bold text-[#17213B]">{title}</h2>
        {link && <Link href={link.href} className="text-[12.5px] font-semibold text-[#2F6BFF] hover:underline flex items-center gap-1">{link.label} <ArrowRight size={13} /></Link>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ icon, tint, tile, label, value, unit, sub, delta }: {
  icon: React.ReactNode; tint: string; tile: string; label: string; value: string; unit?: string; sub: string; delta?: number | null;
}) {
  return (
    <div className="rounded-[14px] border border-[#E4EAF3] p-4 flex gap-3.5 items-start" style={{ background: tint }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: tile }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-[#4B5B75] leading-snug">{label}</div>
        <div className="text-[25px] leading-tight font-bold text-[#17213B] mt-0.5 whitespace-nowrap">{value}{unit && <span className="text-[13px] font-medium text-[#6B7A92] ml-1.5">{unit}</span>}</div>
        <div className="text-[12px] mt-1 flex items-center gap-1" style={{ color: delta == null ? "#6B7A92" : delta >= 0 ? GREEN : "#E5484D" }}>
          {delta != null && (delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          {delta != null && <b>{Math.abs(delta)}%</b>} <span className="text-[#6B7A92]">{sub}</span>
        </div>
      </div>
    </div>
  );
}

const ACTIONS = [
  { label: "Create Production Order", href: "/mfg/production", icon: Factory, tint: "#EEF3FF", color: BLUE },
  { label: "Add Purchase Order", href: "/mfg/purchasing", icon: ShoppingCart, tint: "#EAF8F1", color: GREEN },
  { label: "Adjust Inventory", href: "/mfg/inventory?tab=move", icon: Package, tint: "#F3EFFF", color: PURPLE },
  { label: "Enter Vendor Invoice", href: "/mfg/purchasing", icon: ReceiptText, tint: "#FFF4E5", color: "#E08A00" },
  { label: "Ship an Order", href: "/mfg/shipping", icon: Truck, tint: "#EAF6FB", color: "#1688B8" },
  { label: "Manage BOM", href: "/mfg/master", icon: Layers, tint: "#F1F4F9", color: "#5B6B85" },
];

const KIND_ICON: Record<string, { icon: React.ReactNode; tint: string }> = {
  receipt: { icon: <Truck size={18} color={GREEN} />, tint: "#EAF8F1" },
  issue: { icon: <Cog size={18} color={BLUE} />, tint: "#EEF3FF" },
  goods: { icon: <PackageCheck size={18} color={PURPLE} />, tint: "#F3EFFF" },
  stock: { icon: <Boxes size={18} color="#E08A00" />, tint: "#FFF4E5" },
  ship: { icon: <Truck size={18} color="#1688B8" />, tint: "#EAF6FB" },
  invoice: { icon: <Wallet size={18} color={GREEN} />, tint: "#EAF8F1" },
  hold: { icon: <AlertTriangle size={18} color="#E5484D" />, tint: "#FDECEC" },
  done: { icon: <CheckCircle2 size={18} color={GREEN} />, tint: "#EAF8F1" },
  order: { icon: <ClipboardList size={18} color={BLUE} />, tint: "#EEF3FF" },
};

const STATE_TONE: Record<StockState, "good" | "warn" | "bad"> = { OK: "good", LOW: "warn", OUT: "bad" };

/** The Manufacturing home page. It only draws the numbers it is given. */
export default function MfgDashboard({ d }: { d: DashData }) {
  const totalOutput = d.output.reduce((s, r) => s + r.good, 0);
  const lineTotal = d.lines.reduce((s, r) => s + r.qty, 0);
  const noOutput = d.output.every((r) => r.good === 0 && r.scrap === 0);

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213B]">{d.greeting}, {d.firstName}!</h1>
          <div className="text-[14.5px] text-[#6B7A92] mt-1">Here&rsquo;s what&rsquo;s happening in your manufacturing operations today.</div>
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
            <Kpi icon={<Factory size={24} color={BLUE} />} tint="#F2F6FF" tile="#DCE7FF" label="Good units made today" value={qtyText(d.kpis.producedToday)} unit="pcs" delta={d.kpis.producedChange} sub="vs. yesterday" />
            <Kpi icon={<ClipboardList size={24} color={GREEN} />} tint="#F0FAF5" tile="#D6F1E3" label="Open Production Orders" value={String(d.kpis.openOrders)} sub={d.kpis.ordersWaiting ? `${d.kpis.ordersWaiting} waiting for approval` : "none waiting for approval"} />
            <Kpi icon={<Package size={24} color="#E08A00" />} tint="#FFF8EE" tile="#FFE8C7" label="Inventory Value" value={pesos(d.kpis.inventoryValue)} sub={d.kpis.costBasis} />
            <Kpi icon={<FilePlus2 size={24} color={PURPLE} />} tint="#F7F4FF" tile="#E7DFFF" label="Pending Purchase Orders" value={String(d.kpis.pendingPos)} sub={d.kpis.heldInvoices ? `${d.kpis.heldInvoices} invoice${d.kpis.heldInvoices === 1 ? "" : "s"} on hold` : "no invoices on hold"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card title="Production Output" link={{ href: "/mfg/production", label: "Orders" }}>
              {noOutput ? <div className="h-[230px] flex items-center justify-center text-[13px] text-[#6B7A92] text-center px-6">Nothing has been confirmed in the last 7 days. Confirm production on an order and it appears here.</div> : (
                <div className="h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.output} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#EEF2F8" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7A92" }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6B7A92" }} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "rgba(47,107,255,0.06)" }} contentStyle={{ borderRadius: 10, border: "1px solid #E4EAF3", fontSize: 12.5 }} />
                      <Bar dataKey="good" name="Good units" stackId="a" fill={BLUE} radius={[0, 0, 0, 0]} maxBarSize={34} />
                      <Bar dataKey="scrap" name="Scrap" stackId="a" fill={ORANGE} radius={[5, 5, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex items-center gap-4 text-[12px] text-[#6B7A92] mt-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: BLUE }} /> Good units ({qtyText(totalOutput)} in 7 days)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ORANGE }} /> Scrap</span>
              </div>
            </Card>

            <Card title="Production by Product" link={undefined}>
              {d.lines.length === 0 ? <div className="h-[230px] flex items-center justify-center text-[13px] text-[#6B7A92] text-center px-6">No production in the last 30 days yet.</div> : (
                <div className="flex items-center gap-3">
                  <div className="relative w-[170px] h-[170px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={d.lines} dataKey="qty" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
                          {d.lines.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E4EAF3", fontSize: 12.5 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-[19px] font-bold text-[#17213B]">{qtyText(lineTotal)}</div>
                      <div className="text-[11.5px] text-[#6B7A92]">pcs, 30 days</div>
                    </div>
                  </div>
                  <ul className="flex-1 min-w-0 flex flex-col gap-2">
                    {d.lines.map((l, i) => (
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

          <Card title="Ongoing Production Orders" link={{ href: "/mfg/production", label: "View all" }}>
            {d.orders.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">No production orders are open. Create one from Quick Actions.</div> : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 640 }}>
                  <thead><tr><th>Order #</th><th>Product</th><th style={{ textAlign: "right" }}>Qty planned</th><th style={{ textAlign: "right" }}>Qty produced</th><th>Status</th><th>Finish by</th></tr></thead>
                  <tbody>
                    {d.orders.map((o) => (
                      <tr key={o.id}>
                        <td><Link href={`/mfg/production/${o.id}`} className="font-semibold text-[#2F6BFF] hover:underline">{o.no}</Link></td>
                        <td>{o.product}</td>
                        <td style={{ textAlign: "right" }}>{qtyText(o.planned)}</td>
                        <td style={{ textAlign: "right" }}>{qtyText(o.produced)}</td>
                        <td><Chip label={ORDER_STATUS_LABEL[o.status] ?? o.status} tone={ORDER_STATUS_TONE[o.status] ?? "muted"} /></td>
                        <td className="text-[#4B5B75]">{o.eta || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Inventory Status" link={{ href: "/mfg/inventory", label: "View all" }}>
              {d.stock.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">No stock yet. Receive goods or enter an opening balance.</div> : (
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 380 }}>
                    <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>On hand</th><th style={{ textAlign: "right" }}>Reorder at</th><th>Status</th></tr></thead>
                    <tbody>
                      {d.stock.map((s) => (
                        <tr key={s.id}>
                          <td><div className="font-medium text-[#17213B]">{s.name}</div><div className="text-[11.5px] text-[#6B7A92]">{s.sku}</div></td>
                          <td style={{ textAlign: "right" }}>{qtyText(s.onHand)} {s.uom}</td>
                          <td style={{ textAlign: "right" }}>{s.reorder ? `${qtyText(s.reorder)} ${s.uom}` : "—"}</td>
                          <td><Chip label={STOCK_STATE_LABEL[s.state]} tone={STATE_TONE[s.state]} /></td>
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

          <Card title="Recent Activity" link={{ href: "/mfg/inventory?tab=documents", label: "View all" }}>
            {d.activity.length === 0 ? <div className="text-[13px] text-[#6B7A92] py-6 text-center">Nothing has been posted yet.</div> : (
              <ul className="flex flex-col">
                {d.activity.map((a) => {
                  const k = KIND_ICON[a.kind] ?? KIND_ICON.order;
                  return (
                    <li key={a.id}>
                      <Link href={a.href} className="flex items-center gap-3 py-2.5 hover:bg-[#F8FAFD] -mx-2 px-2 rounded-lg">
                        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: k.tint }}>{k.icon}</span>
                        <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold text-[#17213B] truncate">{a.title}</span><span className="block text-[12px] text-[#6B7A92] truncate">{a.detail}</span></span>
                        <span className="text-[12px] text-[#6B7A92] shrink-0">{a.when}</span>
                      </Link>
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
