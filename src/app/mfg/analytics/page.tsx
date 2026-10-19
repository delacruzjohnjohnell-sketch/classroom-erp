"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Loader2, Percent, TrendingUp, Wallet } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, GoldBtn, KpiCard, Label, Panel } from "@/components/ui";
import { Chip } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import DeadStockPanel from "@/components/mfg/DeadStockPanel";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { qtyText } from "@/lib/mfgOps";
import { acct } from "@/lib/mfgPeriod";
import {
  ABC_COLOR, ABC_HELP, barShare, BUCKET_COLOR, BUCKET_HELP, BUCKET_LABEL, CURVE_PARTS, curveSaving, monthShort, onTimePct, parseLots, pctText, pivotTrend, rangeOf,
  RANGE_LABEL, rateTone, type CurveRow, type RangeKey, type TrendRow,
} from "@/lib/mfgAnalytics";

type Profit = { item_id: string; delivered_qty: number; revenue: number; cost: number; margin: number; margin_pct: number | null };
type Inv = { item_id: string; item_type: string; qty: number; unit_cost: number; value: number; used_qty: number; days_cover: number | null; abc: "A" | "B" | "C"; cum_pct: number | null };
type Supplier = { vendor_id: string; vendor_name: string; po_count: number; qty_ordered: number; qty_received: number; lines_on_time: number; lines_late: number; avg_days_late: number | null; ppv: number; rejected_qty: number };
type Kpi = { item_id: string; orders: number; qty_good: number; qty_scrap: number; scrap_pct: number | null; on_time: number; late: number; avg_lead_days: number | null; std_unit_cost: number | null; actual_unit_cost: number | null };

const TABS = [["profit", "Profitability"], ["variance", "Variances"], ["inventory", "Inventory"], ["suppliers", "Suppliers"], ["production", "Production"], ["lot", "Cost by lot size"]] as const;
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const today = () => new Date().toISOString().slice(0, 10);
const Spin = () => <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} color="#F2B13C" /></div>;
const R = (n: number | string) => Number(n);

export default function AnalyticsPage() {
  return (
    <AppShell>
      <Suspense fallback={<Spin />}>
        <AnalyticsBody />
      </Suspense>
    </AppShell>
  );
}

function AnalyticsBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const { data: lk, loading } = useLookups();
  const isTeacher = profile?.role === "teacher";
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "profit";
  const [range, setRange] = useState<RangeKey>("last_month");
  const [months, setMonths] = useState("6");
  const [days, setDays] = useState("90");
  const dates = useMemo(() => rangeOf(range, today()), [range]);

  const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const itemSku = (id: string) => lk.items.find((i) => i.item_id === id)?.sku ?? "";

  const [profit, setProfit] = useState<Profit[] | null>(null);
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  const [inv, setInv] = useState<Inv[] | null>(null);
  const [sup, setSup] = useState<Supplier[] | null>(null);
  const [kpi, setKpi] = useState<Kpi[] | null>(null);

  const call = useCallback(async <T,>(fn: string, args: Record<string, unknown>, set: (v: T[]) => void) => {
    const res = await supabase.rpc(fn, args);
    if (res.error) { toast.error(res.error.message); set([]); return; }
    set((res.data as T[]) ?? []);
  }, []);

  useEffect(() => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tab === "profit") { setProfit(null); call<Profit>("mfg_profitability", { p_tenant: t, p_from: dates.from, p_to: dates.to }, setProfit); }
    if (tab === "suppliers") { setSup(null); call<Supplier>("mfg_supplier_performance", { p_tenant: t, p_from: dates.from, p_to: dates.to }, setSup); }
    if (tab === "production") { setKpi(null); call<Kpi>("mfg_production_kpis", { p_tenant: t, p_from: dates.from, p_to: dates.to }, setKpi); }
    if (tab === "variance") { setTrend(null); call<TrendRow>("mfg_variance_trend", { p_tenant: t, p_end: today(), p_months: Number(months) }, setTrend); }
    if (tab === "inventory") { setInv(null); call<Inv>("mfg_inventory_analysis", { p_tenant: t, p_days: Number(days) }, setInv); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [effectiveTenantId, tab, dates, months, days, call]);

  if (loading) return <Spin />;
  const rangePicker = (
    <div className="grid gap-x-3 mb-3" style={{ gridTemplateColumns: "minmax(200px, 280px) 1fr", alignItems: "end" }}>
      <div><Label>Period</Label>
        <select className="input" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => <option key={k} value={k}>{RANGE_LABEL[k]}</option>)}
        </select></div>
      <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">{dates.from} to {dates.to}</div>
    </div>
  );

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Analytics</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[800px]">
          Where the money is made and lost: which products earn a margin, which variances keep recurring, what is tied up in stock, which suppliers deliver, how production performs, and how the cost of a product changes with the size of the batch.
          {isTeacher && " You are looking at a student’s company."}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/analytics?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "profit" && (
        <Panel title="Profitability by product">
          {rangePicker}
          {profit === null ? <Spin /> : profit.length === 0 ? <Empty>Nothing was delivered in this period. Deliver goods against a sales order (Shipping) and the margin appears here.</Empty> : (() => {
            const rev = profit.reduce((s, r) => s + R(r.revenue), 0), cost = profit.reduce((s, r) => s + R(r.cost), 0), mg = rev - cost;
            const max = Math.max(...profit.map((r) => R(r.revenue)));
            return (
              <>
                <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                  <KpiCard icon={<Wallet size={14} />} label="Sales delivered" value={money(rev)} accent="#5AA9FF" />
                  <KpiCard icon={<Boxes size={14} />} label="Cost of those goods" value={money(cost)} accent="#F2B13C" />
                  <KpiCard icon={<TrendingUp size={14} />} label="Margin" value={money(mg)} accent="#22D3C5" />
                  <KpiCard icon={<Percent size={14} />} label="Margin %" value={pctText(rev ? (mg / rev) * 100 : null)} accent="#22D3C5" />
                </div>
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 760 }}>
                    <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Units</th><th style={{ textAlign: "right" }}>Sales</th><th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Margin</th><th style={{ textAlign: "right" }}>Margin %</th><th style={{ width: 200 }}>Sales and cost</th></tr></thead>
                    <tbody>
                      {profit.map((r) => (
                        <tr key={r.item_id}>
                          <td><b>{itemName(r.item_id)}</b> <span className="text-[11px] text-[#7F8EA0]">{itemSku(r.item_id)}</span></td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.delivered_qty)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.revenue)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.cost)}</td>
                          <td style={{ textAlign: "right" }}><b>{money(r.margin)}</b></td>
                          <td style={{ textAlign: "right" }}><Chip label={pctText(r.margin_pct)} tone={r.margin_pct === null ? "muted" : R(r.margin_pct) >= 30 ? "good" : R(r.margin_pct) >= 10 ? "warn" : "bad"} /></td>
                          <td>
                            <div style={{ height: 8, background: "#5AA9FF", width: `${barShare(R(r.revenue), max, 0.02) * 100}%`, borderRadius: 2 }} title={`Sales ${money(r.revenue)}`} />
                            <div style={{ height: 8, background: "#F2B13C", width: `${barShare(R(r.cost), max, 0.02) * 100}%`, borderRadius: 2, marginTop: 3 }} title={`Cost ${money(r.cost)}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">Sales is the delivered units at the price on the sales order, before VAT. Cost is what the delivery took out of finished goods at the product’s cost. Month-end variances that were closed to cost of goods sold are not spread over products here; see the Variances tab.</div>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === "variance" && (
        <Panel title="Variances that arose, by month">
          <div className="grid gap-x-3 mb-3" style={{ gridTemplateColumns: "minmax(200px, 280px) 1fr", alignItems: "end" }}>
            <div><Label>Months</Label>
              <select className="input" value={months} onChange={(e) => setMonths(e.target.value)}>
                <option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last 12 months</option>
              </select></div>
            <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">A positive figure cost money (unfavourable); a negative one saved money.</div>
          </div>
          {trend === null ? <Spin /> : (() => {
            const g = pivotTrend(trend);
            if (g.buckets.length === 0) return <Empty>No variances in these months. They arise when purchases cost more than standard, orders use more than the recipe, or hours run over the routing.</Empty>;
            const colW = 64, h = 190, base = 140;
            const pos = g.months.map((m) => g.buckets.reduce((s, b) => s + Math.max(g.cell(m, b), 0), 0));
            const neg = g.months.map((m) => g.buckets.reduce((s, b) => s + Math.min(g.cell(m, b), 0), 0));
            const maxPos = Math.max(...pos, 1), maxNeg = Math.max(...neg.map((x) => -x), 0);
            const scale = (base - 14) / Math.max(maxPos, maxNeg * 0.6, 1);
            return (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#A3B1C2] mb-2">
                  {g.buckets.map((b) => <span key={b} title={BUCKET_HELP[b]}><span style={{ display: "inline-block", width: 10, height: 10, background: BUCKET_COLOR[b], marginRight: 5, borderRadius: 2 }} />{BUCKET_LABEL[b]}</span>)}
                </div>
                <div className="overflow-x-auto" role="img" aria-label="Variances by month, stacked by kind">
                  <svg width={Math.max(g.months.length * colW + 20, 240)} height={h} style={{ fontFamily: MONO, fontSize: 10.5, display: "block" }}>
                    <line x1={0} x2={g.months.length * colW + 10} y1={base} y2={base} stroke="#C5D0E2" />
                    {g.months.map((m, i) => {
                      let up = 0, down = 0;
                      return (
                        <g key={m} transform={`translate(${10 + i * colW}, 0)`}>
                          {g.buckets.map((b) => {
                            const v = g.cell(m, b);
                            if (Math.abs(v) < 0.005) return null;
                            const hh = Math.max(Math.abs(v) * scale, 1.5);
                            const y = v > 0 ? base - up - hh : base + down;
                            if (v > 0) up += hh; else down += hh;
                            return <rect key={b} x={8} y={y} width={colW - 20} height={hh} fill={BUCKET_COLOR[b]}><title>{`${monthShort(m)} · ${BUCKET_LABEL[b]}: ${acct(v)}`}</title></rect>;
                          })}
                          <text x={colW / 2 - 2} y={h - 8} textAnchor="middle" fill="#7F8EA0">{monthShort(m).slice(0, 3)}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="overflow-x-auto mt-2">
                  <table style={{ minWidth: 560, fontFamily: MONO, fontSize: 12 }}>
                    <thead><tr><th>Kind</th>{g.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{monthShort(m)}</th>)}</tr></thead>
                    <tbody>
                      {g.buckets.map((b) => (
                        <tr key={b} title={BUCKET_HELP[b]}>
                          <td><span style={{ display: "inline-block", width: 9, height: 9, background: BUCKET_COLOR[b], marginRight: 6, borderRadius: 2 }} />{BUCKET_LABEL[b]}</td>
                          {g.months.map((m) => <td key={m} style={{ textAlign: "right" }}>{Math.abs(g.cell(m, b)) < 0.005 ? "—" : acct(g.cell(m, b))}</td>)}
                        </tr>
                      ))}
                      <tr><td><b>Total</b></td>{g.months.map((m) => <td key={m} style={{ textAlign: "right" }}><b>{acct(g.total(m))}</b></td>)}</tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">These are the variances as they arose. Closing a month moves them into cost of goods sold or inventory, but they stay in this view.</div>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === "inventory" && (
        <Panel title="Inventory value, cover and ABC class">
          <div className="grid gap-x-3 mb-3" style={{ gridTemplateColumns: "minmax(200px, 280px) 1fr", alignItems: "end" }}>
            <div><Label>Measure use over</Label>
              <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">The last 30 days</option><option value="90">The last 90 days</option><option value="180">The last 180 days</option>
              </select></div>
            <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">Use is what was issued to production or delivered to customers. Days of cover is how long the stock would last at that pace.</div>
          </div>
          {inv === null ? <Spin /> : inv.length === 0 ? <Empty>No stock yet.</Empty> : (() => {
            const total = inv.reduce((s, r) => s + R(r.value), 0);
            const max = Math.max(...inv.map((r) => R(r.value)), 1);
            const by = (c: string) => inv.filter((r) => r.abc === c);
            return (
              <>
                <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {(["A", "B", "C"] as const).map((c) => (
                    <div key={c} className="border border-hairline rounded-md p-3" title={ABC_HELP[c]}>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>Class {c}</div>
                      <div className="text-[20px] font-semibold" style={{ color: ABC_COLOR[c], fontFamily: MONO }}>{by(c).length} item{by(c).length === 1 ? "" : "s"}</div>
                      <div className="text-[12px] text-[#A3B1C2]">{money(by(c).reduce((s, r) => s + R(r.value), 0))} · {pctText(total ? (by(c).reduce((s, r) => s + R(r.value), 0) / total) * 100 : null)} of the value</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 780 }}>
                    <thead><tr><th>Item</th><th>Class</th><th style={{ textAlign: "right" }}>On hand</th><th style={{ textAlign: "right" }}>Cost each</th><th style={{ textAlign: "right" }}>Value</th><th style={{ width: 160 }} /><th style={{ textAlign: "right" }}>Used</th><th style={{ textAlign: "right" }}>Days of cover</th></tr></thead>
                    <tbody>
                      {inv.map((r) => (
                        <tr key={r.item_id}>
                          <td><b>{itemName(r.item_id)}</b> <span className="text-[11px] text-[#7F8EA0]">{itemSku(r.item_id)}</span></td>
                          <td><Chip label={r.abc} tone={r.abc === "A" ? "bad" : r.abc === "B" ? "warn" : "good"} /></td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.qty)}</td>
                          <td style={{ textAlign: "right" }}>{money(r.unit_cost)}</td>
                          <td style={{ textAlign: "right" }}><b>{money(r.value)}</b></td>
                          <td><div style={{ height: 8, background: ABC_COLOR[r.abc], width: `${barShare(R(r.value), max, 0.02) * 100}%`, borderRadius: 2 }} /></td>
                          <td style={{ textAlign: "right" }}>{R(r.used_qty) ? qtyText(r.used_qty) : "—"}</td>
                          <td style={{ textAlign: "right" }}>{r.days_cover === null ? "no use" : R(r.days_cover) > 180 ? <span style={{ color: "#F2B13C" }}>{r.days_cover}</span> : r.days_cover}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">Stock is valued at the standard cost (standard costing) or the moving average (actual costing), the same as the books check. Over 180 days of cover is shown in amber: money sitting still.</div>
              </>
            );
          })()}
        </Panel>
      )}
      {tab === "inventory" && <DeadStockPanel items={lk.items} />}

      {tab === "suppliers" && (
        <Panel title="Supplier performance">
          {rangePicker}
          {sup === null ? <Spin /> : sup.length === 0 ? <Empty>No purchase orders or receipts in this period.</Empty> : (
            <>
              <div className="overflow-x-auto">
                <table style={{ minWidth: 820 }}>
                  <thead><tr><th>Supplier</th><th style={{ textAlign: "right" }}>Orders</th><th style={{ textAlign: "right" }}>Ordered</th><th style={{ textAlign: "right" }}>Received</th><th>On time</th><th style={{ textAlign: "right" }}>Days late</th><th style={{ textAlign: "right" }}>Price variance</th><th style={{ textAlign: "right" }}>Rejected</th></tr></thead>
                  <tbody>
                    {sup.map((s) => {
                      const p = onTimePct(s.lines_on_time, s.lines_late);
                      return (
                        <tr key={s.vendor_id}>
                          <td><b>{s.vendor_name}</b></td>
                          <td style={{ textAlign: "right" }}>{s.po_count}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(s.qty_ordered)}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(s.qty_received)}</td>
                          <td><Chip label={p === null ? "No receipts" : `${pctText(p)} (${s.lines_on_time}/${s.lines_on_time + s.lines_late})`} tone={rateTone(p, 90, 70)} /></td>
                          <td style={{ textAlign: "right" }}>{s.avg_days_late === null ? "—" : s.avg_days_late}</td>
                          <td style={{ textAlign: "right", color: R(s.ppv) > 0 ? "#FF6B7A" : undefined }}>{acct(s.ppv)}</td>
                          <td style={{ textAlign: "right" }}>{R(s.rejected_qty) ? qtyText(s.rejected_qty) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">On time counts goods-receipt lines received on or before the purchase order’s expected date. Price variance is units received × (price on the purchase order − cost booked); positive means dearer than standard. Rejected is the units scrapped or returned after inspection.</div>
            </>
          )}
        </Panel>
      )}

      {tab === "production" && (
        <Panel title="Production performance">
          {rangePicker}
          {kpi === null ? <Spin /> : kpi.length === 0 ? <Empty>No production order was finished in this period. An order counts once its final confirmation is posted.</Empty> : (
            <>
              <div className="overflow-x-auto">
                <table style={{ minWidth: 860 }}>
                  <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Orders</th><th style={{ textAlign: "right" }}>Good</th><th style={{ textAlign: "right" }}>Scrap</th><th style={{ textAlign: "right" }}>Scrap %</th><th>On time</th><th style={{ textAlign: "right" }}>Lead days</th><th style={{ textAlign: "right" }}>Standard each</th><th style={{ textAlign: "right" }}>Actual each</th></tr></thead>
                  <tbody>
                    {kpi.map((k) => {
                      const p = onTimePct(k.on_time, k.late);
                      const over = k.std_unit_cost && k.actual_unit_cost ? R(k.actual_unit_cost) - R(k.std_unit_cost) : null;
                      return (
                        <tr key={k.item_id}>
                          <td><b>{itemName(k.item_id)}</b></td>
                          <td style={{ textAlign: "right" }}>{k.orders}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(k.qty_good)}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(k.qty_scrap)}</td>
                          <td style={{ textAlign: "right" }}><Chip label={pctText(k.scrap_pct)} tone={k.scrap_pct === null ? "muted" : R(k.scrap_pct) <= 2 ? "good" : R(k.scrap_pct) <= 5 ? "warn" : "bad"} /></td>
                          <td><Chip label={p === null ? "—" : `${pctText(p)} (${k.on_time}/${k.on_time + k.late})`} tone={rateTone(p, 90, 70)} /></td>
                          <td style={{ textAlign: "right" }}>{k.avg_lead_days ?? "—"}</td>
                          <td style={{ textAlign: "right" }}>{k.std_unit_cost === null ? "—" : money(k.std_unit_cost)}</td>
                          <td style={{ textAlign: "right" }}>
                            {k.actual_unit_cost === null ? "—" : money(k.actual_unit_cost)}
                            {over !== null && Math.abs(over) >= 0.005 && <div className="text-[11px]" style={{ color: over > 0 ? "#FF6B7A" : "#22D3C5" }}>{over > 0 ? "+" : ""}{money(over)}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">An order is counted in the period of its final confirmation. On time compares that date with the order’s planned end. Lead days run from the planned start. Actual each is what the order cost per good unit (materials, labor and overhead put into it), so scrap raises it.</div>
            </>
          )}
        </Panel>
      )}

      {tab === "lot" && <LotCurve effectiveTenantId={effectiveTenantId} isTeacher={isTeacher} />}
    </>
  );
}

function LotCurve({ effectiveTenantId, isTeacher }: { effectiveTenantId: string | null; isTeacher: boolean }) {
  const { data: lk } = useLookups();
  const made = lk.items.filter((i) => i.active && i.make_or_buy === "MAKE");
  const [item, setItem] = useState("");
  const [lots, setLots] = useState("1, 10, 50, 100, 500");
  const [rows, setRows] = useState<CurveRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = item || made[0]?.item_id || "";

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !effectiveTenantId) return;
    const list = parseLots(lots);
    if (!chosen) { toast.error("Choose a product you make."); return; }
    if (list.length === 0) { toast.error("Enter at least one lot size, for example 1, 10, 100."); return; }
    setBusy(true);
    const res = await supabase.rpc("mfg_lot_size_curve", { p_item: chosen, p_lots: list, p_date: today() });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    setRows(((res.data as CurveRow[]) ?? []).map((r) => ({ ...r, lot_size: R(r.lot_size), material: R(r.material), labor: R(r.labor), machine: R(r.machine), var_oh: R(r.var_oh), fix_oh: R(r.fix_oh), unit_cost: R(r.unit_cost) })));
  };

  const max = rows ? Math.max(...rows.map((r) => r.unit_cost), 1) : 1;
  const saving = rows ? curveSaving(rows) : null;
  return (
    <Panel title="What one unit costs at different lot sizes">
      {isTeacher ? <Empty>The lot-size curve is worked out inside a student’s own company. Ask the student to run it, or look at the cost estimates on the Costing screen.</Empty> : (
        <>
          <form onSubmit={run}>
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
              <div><Label>Product</Label>
                <select className="input" value={chosen} onChange={(e) => setItem(e.target.value)}>
                  {made.length === 0 && <option value="">No product marked “Make”</option>}
                  {made.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
                </select></div>
              <div><Label>Lot sizes (units)</Label><input className="input" value={lots} onChange={(e) => setLots(e.target.value)} placeholder="1, 10, 100" /></div>
            </div>
            <div className="flex gap-3 items-center mt-3 flex-wrap">
              <GoldBtn type="submit" disabled={busy || !chosen}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Work it out</GoldBtn>
              <span className="text-[11.5px] text-[#7F8EA0]">Uses the active recipe and routing and today’s rates. Nothing is saved.</span>
            </div>
          </form>
          {rows && rows.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#A3B1C2] mb-2">
                {CURVE_PARTS.map(([, label, color]) => <span key={label}><span style={{ display: "inline-block", width: 10, height: 10, background: color, marginRight: 5, borderRadius: 2 }} />{label}</span>)}
              </div>
              <div className="flex flex-col gap-2" role="img" aria-label="Cost per unit at each lot size, stacked by cost element">
                {rows.map((r) => (
                  <div key={r.lot_size} className="flex items-center gap-3">
                    <div className="text-[12px] text-right" style={{ width: 70, fontFamily: MONO }}>{qtyText(r.lot_size)}</div>
                    <div className="flex" style={{ width: `${Math.max((r.unit_cost / max) * 70, 4)}%`, height: 18 }}>
                      {CURVE_PARTS.map(([key, label, color]) => {
                        const v = r[key];
                        return v > 0 ? <div key={key} style={{ width: `${(v / r.unit_cost) * 100}%`, background: color }} title={`${label}: ${money(v)}`} /> : null;
                      })}
                    </div>
                    <div className="text-[12px]" style={{ fontFamily: MONO }}>{money(r.unit_cost)}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto mt-4">
                <table style={{ minWidth: 640, fontFamily: MONO, fontSize: 12 }}>
                  <thead><tr><th>Lot size</th>{CURVE_PARTS.map(([, label]) => <th key={label} style={{ textAlign: "right" }}>{label}</th>)}<th style={{ textAlign: "right" }}>Per unit</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.lot_size}>
                        <td>{qtyText(r.lot_size)}</td>
                        {CURVE_PARTS.map(([key]) => <td key={key} style={{ textAlign: "right" }}>{money(r[key])}</td>)}
                        <td style={{ textAlign: "right" }}><b>{money(r.unit_cost)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-3 max-w-[820px]">
                {saving !== null && saving > 0
                  ? <>A unit made in the biggest lot costs <b>{pctText(saving)}</b> less than one made in the smallest. Materials cost the same per unit at any size; what falls is the labor and machine time spent on set-up, shared by more units.</>
                  : "The cost per unit does not change with the lot size here: there is no set-up time on the routing to spread."}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
